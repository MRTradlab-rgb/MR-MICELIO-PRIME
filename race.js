import { equity, validateMarket } from "./src/race-core.mjs";

const SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","LINKUSDT","ADAUSDT","DOGEUSDT","XRPUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const stamp=()=>new Date().toISOString();
const authorized=(request,env)=>Boolean(env.ENGINE_ADMIN_TOKEN)&&request.headers.get("Authorization")===`Bearer ${env.ENGINE_ADMIN_TOKEN}`;
const asJson=(value)=>JSON.stringify(value);

async function marketState(db) {
  const out={};
  for(const symbol of SYMBOLS) {
    const row=await db.prepare("SELECT close,close_time,received_at FROM engine_market_candles WHERE symbol=? ORDER BY close_time DESC LIMIT 1").bind(symbol).first();
    if(!row){out[symbol]={price:null,ts:null,ageMs:null,valid:false,reason:"NO_MARKET_DATA"};continue;}
    const ts=Number(row.close_time);
    const check=validateMarket({price:Number(row.close),ts});
    out[symbol]={price:Number(row.close),ts,ageMs:check.ageMs,valid:check.valid,reason:check.reason};
  }
  return out;
}

async function walletRows(db,prices) {
  const wallets=await db.prepare("SELECT competitor,cash_usd,initial_cash_usd,realized_pnl,fees_paid,updated_at FROM race_wallets ORDER BY competitor").all();
  const result=[];
  for(const wallet of wallets.results||[]) {
    const rows=await db.prepare("SELECT symbol,side,qty,avg_entry_price,realized_pnl,entry_fee_usd,opened_at FROM race_positions WHERE competitor=?").bind(wallet.competitor).all();
    const positions=rows.results||[];
    const value=equity(wallet,positions,prices);
    result.push({...wallet,positions,equity_usd:value.equity,unrealized_pnl:value.unrealized,drawdown_pct:null});
  }
  return result;
}

export async function handleRace(request,env,url,json) {
  if(!env.DB)return json({ok:false,error:"D1_BINDING_MISSING"},503,request);
  try {
    if(request.method==="GET"&&url.pathname==="/race/status") {
      const [state,prices,agents]=await Promise.all([
        env.DB.prepare("SELECT * FROM race_state WHERE id=1").first(),
        marketState(env.DB),
        env.DB.prepare("SELECT agent_id FROM engine_agents WHERE agent_id LIKE 'agent-%' ORDER BY agent_id").all()
      ]);
      const wallets=await walletRows(env.DB,prices);
      const validPrices=Object.values(prices).filter(p=>p.valid).length;
      return json({ok:true,status:state?.status||"NOT_STARTED",winner:state?.winner||null,target_usd:Number(state?.target_usd||1000),wallets,prices,agents:{total:(agents.results||[]).length,active:(agents.results||[]).length,ids:(agents.results||[]).map(a=>a.agent_id)},marketReady:validPrices===SYMBOLS.length,tradingEnabled:false,launchAllowed:false,blockers:["A execução de previsões ainda não está integrada ao ledger de carteiras; a largada permanece bloqueada.","Confirme a migration 0004 no D1 e o deploy do Worker."]},200,request);
    }
    if(request.method==="GET"&&url.pathname==="/race/leaderboard") {
      const prices=await marketState(env.DB), wallets=await walletRows(env.DB,prices);
      return json({ok:true,leaderboard:wallets.sort((a,b)=>b.equity_usd-a.equity_usd)},200,request);
    }
    if(request.method==="GET"&&url.pathname==="/race/portfolio") {
      const competitor=url.searchParams.get("competitor");
      if(!["gemma-prime","micelio-ensemble"].includes(competitor))return json({ok:false,error:"INVALID_COMPETITOR"},400,request);
      const prices=await marketState(env.DB), wallets=await walletRows(env.DB,prices);
      return json({ok:true,portfolio:wallets.find(w=>w.competitor===competitor)||null,prices},200,request);
    }
    if(request.method==="GET"&&url.pathname==="/race/history") {
      const competitor=url.searchParams.get("competitor"),symbol=url.searchParams.get("symbol");
      const from=url.searchParams.get("from"),to=url.searchParams.get("to");
      const limit=Math.max(1,Math.min(500,Number(url.searchParams.get("limit")||100)));
      let sql="SELECT * FROM race_trades WHERE 1=1",params=[];
      if(competitor){sql+=" AND competitor=?";params.push(competitor);}
      if(symbol){sql+=" AND symbol=?";params.push(symbol);}
      if(from){sql+=" AND created_at>=?";params.push(from);}
      if(to){sql+=" AND created_at<=?";params.push(to);}
      sql+=" ORDER BY created_at DESC LIMIT ?";
      params.push(limit);
      const rows=await env.DB.prepare(sql).bind(...params).all();
      let dsql="SELECT * FROM race_decisions WHERE 1=1",dparams=[];
      if(competitor){dsql+=" AND competitor=?";dparams.push(competitor);}
      if(symbol){dsql+=" AND symbol=?";dparams.push(symbol);}
      if(from){dsql+=" AND created_at>=?";dparams.push(from);}
      if(to){dsql+=" AND created_at<=?";dparams.push(to);}
      dsql+=" ORDER BY created_at DESC LIMIT ?";
      dparams.push(limit);
      const decisions=await env.DB.prepare(dsql).bind(...dparams).all();
      return json({ok:true,trades:rows.results||[],decisions:decisions.results||[],count:(rows.results||[]).length,decisionCount:(decisions.results||[]).length},200,request);
    }
    if(request.method==="GET"&&url.pathname==="/race/export") {
      const format=url.searchParams.get("format")||"json";
      if(!["json","csv"].includes(format))return json({ok:false,error:"INVALID_FORMAT"},400,request);
      const [trades,decisions,snapshots]=await Promise.all([
        env.DB.prepare("SELECT * FROM race_trades ORDER BY created_at").all(),
        env.DB.prepare("SELECT * FROM race_decisions ORDER BY created_at").all(),
        env.DB.prepare("SELECT * FROM race_snapshots ORDER BY created_at").all()
      ]);
      const data={trades:trades.results||[],decisions:decisions.results||[],snapshots:snapshots.results||[]};
      if(format==="json")return new Response(asJson(data),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=mr-tradlab-race.json"}});
      const rows=data.trades,headers=["id","competitor","exec_id","symbol","side","qty","price","fee_usd","slippage_usd","realized_pnl","market_ts","created_at","decision_id"];
      const csv=[headers.join(","),...rows.map(row=>headers.map(key=>JSON.stringify(row[key]??"")).join(","))].join("\n");
      return new Response(csv,{status:200,headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=mr-tradlab-race.csv"}});
    }
    if(request.method==="POST"&&url.pathname==="/race/start") {
      if(!authorized(request,env))return json({ok:false,error:"UNAUTHORIZED"},401,request);
      return json({ok:false,error:"RACE_EXECUTION_NOT_INTEGRATED",status:"NOT_STARTED",message:"Não é seguro iniciar: o ciclo do motor ainda não grava operações e posições no ledger da corrida."},409,request);
    }
    if(request.method==="POST"&&url.pathname==="/race/stop") {
      if(!authorized(request,env))return json({ok:false,error:"UNAUTHORIZED"},401,request);
      const result=await env.DB.prepare("UPDATE race_state SET status='STOPPED',stopped_at=?,updated_at=? WHERE id=1 AND status='RUNNING'").bind(stamp(),stamp()).run();
      return json({ok:true,stopped:Number(result.meta?.changes||0)===1,status:"STOPPED"},200,request);
    }
    return json({ok:false,error:"NOT_FOUND",endpoints:["GET /race/status","GET /race/leaderboard","GET /race/portfolio?competitor=...","GET /race/history","GET /race/export?format=json|csv","POST /race/start","POST /race/stop"]},404,request);
  } catch(error) {
    return json({ok:false,error:"RACE_QUERY_FAILED",detail:String(error?.message||error).slice(0,240)},503,request);
  }
}

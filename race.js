const START=10,FEE=.001,SLIP=.0005;
const QUOTE_MAX_AGE_MS=15000;
const QUOTE_TIMEOUT_MS=8000;
const ALLOWED=new Set(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"]);
const now=()=>new Date().toISOString();
async function seed(db){const t=now();for(const id of ["GEMMA","MICELIO"])await db.prepare("INSERT OR IGNORE INTO race_wallets(wallet_id,initial_balance,cash_balance,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,START,START,t,t).run();}
async function state(db){const [w,p,tr]=await Promise.all([db.prepare("SELECT * FROM race_wallets ORDER BY wallet_id").all(),db.prepare("SELECT * FROM race_positions ORDER BY wallet_id,symbol").all(),db.prepare("SELECT * FROM race_trades ORDER BY id DESC LIMIT 50").all()]);return{wallets:w.results||[],positions:p.results||[],recentTrades:tr.results||[],mode:"PAPER_ONLY",realOrdersEnabled:false};}
async function trade(db,wallet,symbol,action,price,reason){if(action==="HOLD")return{ok:true,action};const w=await db.prepare("SELECT cash_balance FROM race_wallets WHERE wallet_id=?").bind(wallet).first(),p=await db.prepare("SELECT * FROM race_positions WHERE wallet_id=? AND symbol=?").bind(wallet,symbol).first(),t=now();if(action==="BUY"){if(p)return{ok:true,action:"HOLD",reason:"POSITION_ALREADY_OPEN"};const n=Math.min(2,Number(w?.cash_balance||0));if(n<1)return{ok:false,error:"INSUFFICIENT_VIRTUAL_CASH"};const fill=price*(1+SLIP),fee=n*FEE,q=(n-fee)/fill;await db.batch([db.prepare("UPDATE race_wallets SET cash_balance=cash_balance-?,updated_at=? WHERE wallet_id=?").bind(n,t,wallet),db.prepare("INSERT INTO race_positions(wallet_id,symbol,quantity,entry_price,opened_at) VALUES(?,?,?,?,?)").bind(wallet,symbol,q,fill,t),db.prepare("INSERT INTO race_trades(wallet_id,symbol,side,quantity,price,fee,slippage,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(wallet,symbol,"BUY",q,fill,fee,q*(fill-price),String(reason||"paper signal").slice(0,240),t)]);return{ok:true,action,quantity:q,fillPrice:fill,fee};}if(!p)return{ok:true,action:"HOLD",reason:"NO_OPEN_POSITION"};const q=Number(p.quantity),fill=price*(1-SLIP),gross=(fill-Number(p.entry_price))*q,fee=fill*q*FEE,proceeds=fill*q-fee;await db.batch([db.prepare("UPDATE race_wallets SET cash_balance=cash_balance+?,updated_at=? WHERE wallet_id=?").bind(proceeds,t,wallet),db.prepare("DELETE FROM race_positions WHERE wallet_id=? AND symbol=?").bind(wallet,symbol),db.prepare("INSERT INTO race_trades(wallet_id,symbol,side,quantity,price,fee,slippage,net_pnl,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(wallet,symbol,"SELL",q,fill,fee,q*(price-fill),gross-fee,String(reason||"paper signal").slice(0,240),t)]);return{ok:true,action,quantity:q,fillPrice:fill,netPnl:gross-fee,fee};}
function parse(r){let s=typeof r==="string"?r:r?.response||r?.output_text||r?.text||"";s=String(s).replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"").trim();try{const x=JSON.parse(s);if(!Array.isArray(x.decisions))return null;const bySymbol=new Map();for(const d of x.decisions){if(!d||!ALLOWED.has(d.symbol)||!["BUY","SELL","HOLD"].includes(d.action))continue;const confidence=Math.max(0,Math.min(1,Number(d.confidence)||0));const old=bySymbol.get(d.symbol);if(!old||confidence>old.confidence)bySymbol.set(d.symbol,{...d,confidence});}return [...bySymbol.values()].slice(0,11);}catch{return null;}}
async function gemma(env,quotes,positions){if(!env.AI)throw Error("AI_BINDING_UNAVAILABLE");const prompt='Você é GEMMA PRIME, trader de SIMULAÇÃO em tempo real, não assistente de conversa. Para cada ativo decida BUY, SELL ou HOLD com base apenas nas cotações e posições fornecidas. Não invente dados. BUY somente com sinal claro; SELL apenas para fechar posição existente; caso contrário HOLD. Retorne somente JSON válido: {"decisions":[{"symbol":"BTCUSDT","action":"HOLD","confidence":0.0,"reason":"..."}]}. confidence 0..1. Cotações: '+JSON.stringify(quotes)+'. Posições: '+JSON.stringify(positions);const r=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{messages:[{role:"user",content:prompt}],max_tokens:700,temperature:.1});const d=parse(r);if(!d)throw Error("GEMMA_INVALID_DECISIONS");return d;}
async function micelio(db,quotes){const out=[];for(const s of Object.keys(quotes)){let x=null;try{x=await db.prepare("SELECT direction,COUNT(*) votes,AVG(confidence) confidence FROM engine_forecasts WHERE symbol=? AND status='PENDING' AND created_at>=datetime('now','-3 minutes') GROUP BY direction ORDER BY votes DESC LIMIT 1").bind(s).first();}catch{}out.push({symbol:s,action:Number(x?.votes||0)>=3?(x.direction==="BUY"?"BUY":"SELL"):"HOLD",confidence:Number(x?.confidence||0),reason:Number(x?.votes||0)>=3?"Consenso das previsões pendentes":"Sem consenso verificável"});}return out;}

async function fetchLiveQuotes(env){
  if(!env.MARKET_FEED) throw Error("MARKET_FEED_BINDING_MISSING");
  const id=env.MARKET_FEED.idFromName("binance-global");
  const stub=env.MARKET_FEED.get(id);
  const response=await stub.fetch("https://market-feed/snapshot");
  const payload=await response.json();
  if(!response.ok||!payload?.ok) throw Error("BINANCE_WEBSOCKET_NO_FRESH_QUOTES");
  return payload;
}
export async function runRaceCycle(env){
  if(!env?.DB) throw Error("D1_BINDING_MISSING");
  await seed(env.DB);
  const quotes={},errors=[];
  let feed;
  try{feed=await fetchLiveQuotes(env);}catch(e){return {ok:false,mode:"PAPER_ONLY",error:String(e?.message||e),quoteCount:0,errors};}
  for(const [symbol,q] of Object.entries(feed.quotes||{})) if(ALLOWED.has(symbol)) quotes[symbol]=q;
  for(const symbol of feed.staleSymbols||[]) errors.push({symbol,error:"NO_FRESH_WEBSOCKET_TICK"});
  const valid=Object.values(quotes).filter(q=>Number.isFinite(q.price)&&q.price>0&&Date.now()-q.timestamp<=QUOTE_MAX_AGE_MS);
  if(!valid.length) return {ok:false,mode:"PAPER_ONLY",error:"NO_FRESH_QUOTES",quoteCount:0,errors};
  const last=await env.DB.prepare("SELECT created_at FROM race_cycles ORDER BY id DESC LIMIT 1").first();
  if(last&&Date.now()-Date.parse(last.created_at)<20000) return {ok:true,skipped:true,reason:"CYCLE_THROTTLED",quoteCount:valid.length,errors};
  const t=now();
  await env.DB.prepare("INSERT INTO race_cycles(created_at,quote_count,quotes_json,status) VALUES(?,?,?,?)").bind(t,valid.length,JSON.stringify(quotes),"PROCESSING").run();
  const pos=await env.DB.prepare("SELECT symbol,quantity,entry_price FROM race_positions WHERE wallet_id='GEMMA'").all();
  let gd=[],ge=null;
  try{gd=await gemma(env,quotes,pos.results||[]);}catch(e){ge=String(e.message||e).slice(0,180);}
  const md=await micelio(env.DB,quotes),exec=[];
  for(const [wallet,list] of [["GEMMA",gd],["MICELIO",md]]) for(const d of list){
    const q=quotes[d.symbol];
    if(!q||!Number.isFinite(q.price)||q.price<=0||Date.now()-q.timestamp>QUOTE_MAX_AGE_MS) continue;
    if(Number(d.confidence||0)<.35||!["BUY","SELL","HOLD"].includes(d.action)) continue;
    exec.push({wallet,...d,quoteTimestamp:q.timestamp,execution:await trade(env.DB,wallet,d.symbol,d.action,q.price,d.reason)});
  }
  const status=ge?"PARTIAL":"COMPLETED";
  await env.DB.prepare("UPDATE race_cycles SET status=? WHERE id=(SELECT MAX(id) FROM race_cycles)").bind(status).run();
  return {ok:true,mode:"PAPER_ONLY",source:"BINANCE_WEBSOCKET",feedConnected:feed.connected,feedLastMessageAt:feed.lastMessageAt,quoteCount:valid.length,quoteErrors:errors,gemmaError:ge,decisions:{gemma:gd,micelio:md},executions:exec,wallets:await state(env.DB)};
}

export async function handleRace(request,env,url,json){if(!env.ENGINE_ADMIN_TOKEN||request.headers.get("Authorization")!==`Bearer ${env.ENGINE_ADMIN_TOKEN}`)return json({ok:false,error:"UNAUTHORIZED"},401,request);if(!env.DB)return json({ok:false,error:"D1_BINDING_MISSING"},503,request);await seed(env.DB);if(request.method==="GET"&&url.pathname==="/race/status")return json({ok:true,...await state(env.DB)},200,request);if(request.method==="POST"&&url.pathname==="/race/snapshot"){let b;try{b=await request.json();}catch{return json({ok:false,error:"INVALID_JSON"},400,request);}const q={};for(const [s,v] of Object.entries(b?.quotes||{})){const p=Number(v?.price),ts=Number(v?.timestamp);if(ALLOWED.has(s)&&p>0&&Number.isFinite(p)&&Number.isFinite(ts)&&Math.abs(Date.now()-ts)<=15000)q[s]={price:p,timestamp:ts};}if(!Object.keys(q).length)return json({ok:false,error:"NO_FRESH_QUOTES",maxAgeMs:15000},422,request);const last=await env.DB.prepare("SELECT created_at FROM race_cycles ORDER BY id DESC LIMIT 1").first();if(last&&Date.now()-Date.parse(last.created_at)<20000)return json({ok:true,skipped:true,reason:"CYCLE_THROTTLED",...await state(env.DB)},200,request);const t=now();await env.DB.prepare("INSERT INTO race_cycles(created_at,quote_count,quotes_json,status) VALUES(?,?,?,?)").bind(t,Object.keys(q).length,JSON.stringify(q),"PROCESSING").run();const pos=await env.DB.prepare("SELECT symbol,quantity,entry_price FROM race_positions WHERE wallet_id='GEMMA'").all();let gd=[],ge=null;try{gd=await gemma(env,q,pos.results||[]);}catch(e){ge=String(e.message||e).slice(0,180);}const md=await micelio(env.DB,q),exec=[];for(const [wallet,list] of [["GEMMA",gd],["MICELIO",md]])for(const d of list)if(Number(d.confidence||0)>=.35&&q[d.symbol])exec.push({wallet,...d,execution:await trade(env.DB,wallet,d.symbol,d.action,q[d.symbol].price,d.reason)});await env.DB.prepare("UPDATE race_cycles SET status=? WHERE id=(SELECT MAX(id) FROM race_cycles)").bind(ge?"PARTIAL":"COMPLETED").run();return json({ok:true,mode:"PAPER_ONLY",quoteCount:Object.keys(q).length,gemmaError:ge,decisions:{gemma:gd,micelio:md},executions:exec,wallets:await state(env.DB)},200,request);}return json({ok:false,error:"NOT_FOUND",endpoints:["GET /race/status","POST /race/snapshot"]},404,request);}

/**
 * MR TRADLAB ZERO — AUTONOMOUS PAPER ENGINE
 * 50 cooperative agents, public Binance market data, D1 persistence.
 * No exchange keys, no order endpoint, no real-money execution.
 */
const SYMBOLS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT"];
const STRATEGIES = ["MOMENTUM","MEAN_REVERSION","BREAKOUT","VOLATILITY","TREND","CONTRARIAN"];
const FEE_PER_SIDE = 0.001;
const SLIPPAGE_PER_SIDE = 0.0005;
const HORIZON_MINUTES = 3;
const GROUPS = new Set(["CONSERVADOR","EXPLORADOR"]);
const SYMBOL_SET = new Set(SYMBOLS);
const nowIso = () => new Date().toISOString();
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const std = a => { const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); };
const auth = (request,env) => Boolean(env.ENGINE_ADMIN_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.ENGINE_ADMIN_TOKEN}`;

const AGENTS = Array.from({length:50},(_,i)=>({
  id:`agent-${String(i+1).padStart(2,"0")}`,
  archetype:i<25?"CONSERVADOR":"EXPLORADOR",
  strategy:STRATEGIES[i%STRATEGIES.length],
  threshold:(i<25?0.00035:0.00018)+(i%7)*0.000055,
  horizon:HORIZON_MINUTES
}));

async function ensureAgents(db) {
  const stamp=nowIso();
  await db.batch(AGENTS.map(a=>db.prepare(
    "INSERT OR IGNORE INTO engine_agents (agent_id,archetype,strategy,threshold,total_forecasts,closed_forecasts,wins,losses,net_return_sum,updated_at) VALUES (?,?,?,?,0,0,0,0,0,?)"
  ).bind(a.id,a.archetype,a.strategy,a.threshold,stamp)));
}

async function fetchSharedMarketSnapshot(env) {
  if(!env.MARKET_FEED) throw new Error("MARKET_FEED_BINDING_MISSING");
  const id=env.MARKET_FEED.idFromName("dual-global");
  const response=await env.MARKET_FEED.get(id).fetch("https://market-feed/snapshot");
  const payload=await response.json();
  if(!response.ok||!payload?.ok) throw new Error("NO_FRESH_DUAL_WEBSOCKET_QUOTES");
  return payload;
}

function features(c) {
  const closes=c.map(x=>x.close), volumes=c.map(x=>x.volume);
  const last=closes.at(-1), prev=closes.at(-2);
  const returns=closes.slice(1).map((v,i)=>v/closes[i]-1);
  const r1=last/prev-1, r3=last/closes.at(-4)-1, r6=last/closes.at(-7)-1, r12=last/closes.at(-13)-1;
  const recentReturns=returns.slice(-20), volatility=std(recentReturns);
  const recent=closes.slice(-20), avg=mean(recent);
  const high=Math.max(...c.slice(-20,-1).map(x=>x.high));
  const low=Math.min(...c.slice(-20,-1).map(x=>x.low));
  const volRatio=volumes.at(-1)/(mean(volumes.slice(-21,-1))||1);
  const ema=(arr,n)=>{const alpha=2/(n+1);return arr.slice(-n*3).reduce((acc,v,i)=>i===0?v:alpha*v+(1-alpha)*acc,arr[0]);};
  const trend=ema(closes,8)/ema(closes,21)-1;
  return {last,r1,r3,r6,r12,volatility,mean20:avg,zscore:volatility?((last/avg)-1)/volatility:0,breakout:last>high?1:last<low?-1:0,volRatio,trend,high,low};
}

function decide(agent,f) {
  let score=0;
  switch(agent.strategy) {
    case "MOMENTUM": score=.20*f.r1+.45*f.r3+.35*f.r6; break;
    case "MEAN_REVERSION": score=-.35*f.r1-.65*(f.last/f.mean20-1); break;
    case "BREAKOUT": score=f.breakout*.0015+.10*f.r3; break;
    case "VOLATILITY": score=Math.sign(f.r1)*f.volatility*clamp(f.volRatio,0.5,2); break;
    case "TREND": score=.65*f.trend+.35*f.r6; break;
    case "CONTRARIAN": score=-.30*f.r3-.70*f.r6; break;
  }
  const direction=score>agent.threshold?"BUY":score< -agent.threshold?"SELL":"HOLD";
  const confidence=clamp(Math.abs(score)/Math.max(agent.threshold*3,0.000001),0,1);
  return {direction,score,confidence};
}

async function saveCandle(db,symbol,candle) {
  await db.prepare("INSERT OR IGNORE INTO engine_market_candles(symbol,open_time,open,high,low,close,volume,close_time,received_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(symbol,candle.openTime,candle.open,candle.high,candle.low,candle.close,candle.volume,candle.closeTime,nowIso()).run();
}

async function evaluateDue(db,symbol,candles) {
  const latest=candles.at(-1);
  const due=await db.prepare("SELECT id,agent_id,direction,entry_price,strategy FROM engine_forecasts WHERE symbol=? AND status='PENDING' AND target_open_time<=? LIMIT 500")
    .bind(symbol,latest.openTime).all();
  let evaluated=0;
  const touchedAgents=new Set();
  for(const f of (due.results||[])) {
    const gross=(latest.close-Number(f.entry_price))/Number(f.entry_price)*(f.direction==="BUY"?1:-1);
    const net=gross-(2*FEE_PER_SIDE)-(2*SLIPPAGE_PER_SIDE);
    const outcome=net>0?"WIN":"LOSS";
    const updated=await db.prepare("UPDATE engine_forecasts SET status='CLOSED',exit_price=?,gross_return=?,net_return=?,outcome=?,evaluated_at=? WHERE id=? AND status='PENDING'")
      .bind(latest.close,gross,net,outcome,nowIso(),f.id).run();
    if(Number(updated.meta?.changes||0)===1) {
      await db.prepare("INSERT OR IGNORE INTO engine_evaluations(forecast_id,agent_id,symbol,strategy,net_return,outcome,evaluated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(f.id,f.agent_id,symbol,f.strategy,net,outcome,nowIso()).run();
      await db.prepare("UPDATE engine_agents SET closed_forecasts=closed_forecasts+1,wins=wins+?,losses=losses+?,net_return_sum=net_return_sum+?,updated_at=? WHERE agent_id=?")
        .bind(outcome==="WIN"?1:0,outcome==="LOSS"?1:0,net,nowIso(),f.agent_id).run();
      touchedAgents.add(f.agent_id);
      evaluated++;
    }
  }
  // Ajuste gradual de sensibilidade somente após amostra mínima; não troca a especialidade do agente.
  for (const agentId of touchedAgents) {
    const recent=await db.prepare("SELECT net_return FROM engine_evaluations WHERE agent_id=? ORDER BY id DESC LIMIT 20").bind(agentId).all();
    const values=(recent.results||[]).map(x=>Number(x.net_return)).filter(Number.isFinite);
    if(values.length<10) continue;
    const avg=mean(values);
    const row=await db.prepare("SELECT threshold FROM engine_agents WHERE agent_id=?").bind(agentId).first();
    const current=Number(row?.threshold||0.0005);
    const next=clamp(avg>0?current*0.98:current*1.05,0.0001,0.005);
    await db.prepare("UPDATE engine_agents SET threshold=?,last_adapted_at=?,updated_at=? WHERE agent_id=?")
      .bind(next,nowIso(),nowIso(),agentId).run();
  }
  return evaluated;
}

async function createForecasts(db,symbol,candles) {
  const f=features(candles), candle=candles.at(-1), target=candle.openTime+HORIZON_MINUTES*60000;
  const batch=[];
  const forecastAgents=[];
  let created=0;
  const active=await db.prepare("SELECT agent_id AS id,archetype,strategy,threshold,status FROM engine_agents WHERE status='ACTIVE'").all();
  for(const a of (active.results||[])) {
    const d=decide(a,f);
    if(d.direction==="HOLD"||d.confidence<0.18) continue;
    const forecastKey=`${symbol}:${a.id}:${candle.openTime}`;
    forecastAgents.push(a.id);
    batch.push(db.prepare("INSERT OR IGNORE INTO engine_forecasts(forecast_key,agent_id,symbol,candle_open_time,target_open_time,direction,entry_price,strategy,score,confidence,regime,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING',?)")
      .bind(forecastKey,a.id,symbol,candle.openTime,target,d.direction,f.last,a.strategy,d.score,d.confidence,f.volatility>0.002?"HIGH_VOL":f.trend>0.001?"UPTREND":f.trend< -0.001?"DOWNTREND":"RANGE",nowIso()));
  }
  if(batch.length) {
    const inserted=await db.batch(batch);
    for(let i=0;i<inserted.length;i++) {
      if(Number(inserted[i].meta?.changes||0)===1) {
        created++;
        const agentId=forecastAgents[i];
        await db.prepare("UPDATE engine_agents SET total_forecasts=total_forecasts+1,updated_at=? WHERE agent_id=?").bind(nowIso(),agentId).run();
      }
    }
  }
  return {created,features:{price:f.last,r1:f.r1,r3:f.r3,r6:f.r6,volatility:f.volatility,trend:f.trend,volumeRatio:f.volRatio}};
}

export async function runAutonomousTick(env) {
  if(!env.DB) throw new Error("D1_BINDING_MISSING");
  await ensureAgents(env.DB);
  const started=Date.now(), results=[], errors=[];
  let market;
  try { market=await fetchSharedMarketSnapshot(env); }
  catch(e) {
    const stamp=nowIso();
    await env.DB.prepare("INSERT INTO engine_runs(run_at,duration_ms,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated,details) VALUES (?,?,?,?,?,?,?)")
      .bind(stamp,Date.now()-started,0,SYMBOLS.length,0,0,JSON.stringify({error:String(e?.message||e),source:"DUAL_WEBSOCKET"})).run();
    return {ok:false,source:"DUAL_WEBSOCKET",error:String(e?.message||e),realOrdersEnabled:false};
  }
  const outcomes=await Promise.allSettled(SYMBOLS.map(async symbol=>{
    const quote=market.quotes?.[symbol];
    const candles=market.candles?.[symbol];
    if(!quote||!Number.isFinite(Number(quote.price))||Number(quote.price)<=0||Date.now()-Number(quote.receivedAt||quote.timestamp)>15000) throw new Error("STALE_OR_INVALID_SHARED_QUOTE");
    if(!Array.isArray(candles)||candles.length<25) throw new Error("INSUFFICIENT_SHARED_WEBSOCKET_HISTORY");
    await saveCandle(env.DB,symbol,candles.at(-1));
    const evaluated=await evaluateDue(env.DB,symbol,candles);
    const forecast=await createForecasts(env.DB,symbol,candles);
    return {symbol,price:Number(quote.price),source:quote.selectedSource,sourceQuotes:quote.sources,candleTime:new Date(candles.at(-1).openTime).toISOString(),evaluated,forecastsCreated:forecast.created,features:forecast.features};
  }));
  outcomes.forEach((item,i)=>{
    if(item.status==="fulfilled") results.push(item.value);
    else errors.push({symbol:SYMBOLS[i],error:String(item.reason?.message||item.reason)});
  });
  const stamp=nowIso();
  await env.DB.prepare("INSERT INTO engine_runs(run_at,duration_ms,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated,details) VALUES (?,?,?,?,?,?,?)")
    .bind(stamp,Date.now()-started,results.length,errors.length,results.reduce((s,x)=>s+x.forecastsCreated,0),results.reduce((s,x)=>s+x.evaluated,0),JSON.stringify({results,errors})).run();
  return {ok:errors.length===0,runAt:stamp,durationMs:Date.now()-started,results,errors,realOrdersEnabled:false};
}


// Contexto compacto e factual que o Prime entrega à Gemma antes de cada decisão.
export async function getPrimeContext(db) {
  if(!db) return {engineReady:false,reason:"D1_BINDING_MISSING"};
  try {
    const [summary,leaders,recent]=await Promise.all([
      db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='PAUSED' THEN 1 ELSE 0 END) AS paused FROM engine_agents").first(),
      db.prepare("SELECT agent_id,archetype,strategy,status,closed_forecasts,wins,losses,net_return_sum FROM engine_agents ORDER BY net_return_sum DESC LIMIT 5").all(),
      db.prepare("SELECT run_at,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated FROM engine_runs ORDER BY id DESC LIMIT 3").all()
    ]);
    return {engineReady:true,mode:"PAPER_ONLY",realOrdersEnabled:false,agents:summary||{},topAgents:leaders.results||[],recentRuns:recent.results||[],allowedActions:["pause_agent","resume_agent","pause_group","resume_group","assign_mission","analyze_health","start_sandbox_experiment"]};
  } catch(e) { return {engineReady:false,reason:"ENGINE_SCHEMA_NOT_READY",detail:String(e?.message||e).slice(0,180)}; }
}

// Executa somente comandos estruturados e permitidos. Nunca recebe código livre nem habilita ordens reais.
export async function executePrimeActions(db, actions) {
  if(!db || !Array.isArray(actions) || !actions.length) return [];
  const results=[];
  for(const a of actions.slice(0,8)) {
    const type=a?.type;
    let target="", details={};
    if(type==="pause_agent" || type==="resume_agent") {
      if(!/^agent-(0[1-9]|[1-4][0-9]|50)$/.test(a.agentId||"")) {results.push({type,ok:false,error:"INVALID_AGENT"});continue;}
      target=a.agentId;
      const status=type==="pause_agent"?"PAUSED":"ACTIVE";
      const r=await db.prepare("UPDATE engine_agents SET status=?,updated_at=? WHERE agent_id=?").bind(status,nowIso(),target).run();
      details={status,changed:Number(r.meta?.changes||0)};
    } else if(type==="pause_group" || type==="resume_group") {
      const group=String(a.group||"").toUpperCase();
      if(!GROUPS.has(group)) {results.push({type,ok:false,error:"INVALID_GROUP"});continue;}
      target=group;
      const status=type==="pause_group"?"PAUSED":"ACTIVE";
      const r=await db.prepare("UPDATE engine_agents SET status=?,updated_at=? WHERE archetype=?").bind(status,nowIso(),group).run();
      details={status,changed:Number(r.meta?.changes||0)};
    } else if(type==="assign_mission") {
      const group=String(a.group||"").toUpperCase(), mission=String(a.mission||"").trim().slice(0,240);
      if(!GROUPS.has(group)||!mission) {results.push({type,ok:false,error:"INVALID_MISSION"});continue;}
      target=group; details={mission};
      await db.prepare("UPDATE engine_agents SET mission=?,updated_at=? WHERE archetype=?").bind(mission,nowIso(),group).run();
    } else if(type==="analyze_health") {
      const health=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='PAUSED' THEN 1 ELSE 0 END) AS paused,SUM(closed_forecasts) AS closed,SUM(wins) AS wins,SUM(losses) AS losses FROM engine_agents").first();
      target="COLONY"; details={health};
    } else if(type==="start_sandbox_experiment") {
      const symbol=String(a.symbol||"").toUpperCase(), strategy=String(a.strategy||"").toUpperCase(), reason=String(a.reason||"").slice(0,240);
      if(!SYMBOL_SET.has(symbol)||!STRATEGIES.includes(strategy)) {results.push({type,ok:false,error:"INVALID_EXPERIMENT"});continue;}
      target=symbol; details={strategy,reason,mode:"PAPER_ONLY"};
      await db.prepare("INSERT INTO engine_experiments(symbol,strategy,reason,status,created_at) VALUES (?,?,?,'PROPOSED',?)").bind(symbol,strategy,reason,nowIso()).run();
    } else {results.push({type:type||"unknown",ok:false,error:"ACTION_NOT_ALLOWED"});continue;}
    await db.prepare("INSERT INTO engine_prime_actions(action_type,target,details,created_at) VALUES (?,?,?,?)").bind(type,target,JSON.stringify(details),nowIso()).run();
    results.push({type,ok:true,target,...details});
  }
  return results;
}

export async function handleEngine(request,env,url,json) {
  if(!env.DB) return json({ok:false,error:"D1_BINDING_MISSING"},503,request);
  if(request.method==="GET"&&url.pathname==="/engine/status") {
    await ensureAgents(env.DB);
    const [agents,forecasts,runs,pending,last,paused]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total, SUM(closed_forecasts) AS closed, SUM(wins) AS wins, SUM(losses) AS losses, SUM(net_return_sum) AS net FROM engine_agents").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM engine_forecasts").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM engine_runs").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM engine_forecasts WHERE status='PENDING'").first(),
      env.DB.prepare("SELECT run_at,duration_ms,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated FROM engine_runs ORDER BY id DESC LIMIT 1").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM engine_agents WHERE status='PAUSED'").first()
    ]);
    const closed=Number(agents?.closed||0), wins=Number(agents?.wins||0);
    return json({ok:true,service:"MR TRADLAB ZERO AUTONOMOUS ENGINE",mode:"PAPER_ONLY",agents:Number(agents?.total||0),activeAgents:Number(agents?.total||0)-Number(paused?.total||0),pausedAgents:Number(paused?.total||0),forecasts:Number(forecasts?.total||0),closedForecasts:closed,pendingForecasts:Number(pending?.total||0),wins,losses:Number(agents?.losses||0),netWinRate:closed?Number((wins/closed*100).toFixed(2)):null,aggregateNetReturn:Number(agents?.net||0),runs:Number(runs?.total||0),lastRun:last||null,symbols:SYMBOLS,interval:"1m candles aggregated from shared Binance + Coinbase WebSockets",horizonMinutes:HORIZON_MINUTES,feesPerSide:FEE_PER_SIDE,slippagePerSide:SLIPPAGE_PER_SIDE,realOrdersEnabled:false},200,request);
  }
  if(request.method==="GET"&&url.pathname==="/engine/agents") {
    await ensureAgents(env.DB);
    const rows=await env.DB.prepare("SELECT agent_id,archetype,strategy,threshold,status,mission,total_forecasts,closed_forecasts,wins,losses,net_return_sum,CASE WHEN closed_forecasts>0 THEN ROUND(wins*100.0/closed_forecasts,2) ELSE NULL END AS net_win_rate,CASE WHEN closed_forecasts>0 THEN net_return_sum/closed_forecasts ELSE NULL END AS average_net_return,updated_at FROM engine_agents ORDER BY CASE WHEN closed_forecasts>=20 THEN 0 ELSE 1 END, net_return_sum DESC, net_win_rate DESC").all();
    return json({ok:true,agents:rows.results||[],note:"Ranking exploratório; amostras pequenas não são evidência de vantagem estatística."},200,request);
  }
  if(request.method==="POST"&&url.pathname==="/engine/seed") {
    if(!auth(request,env)) return json({ok:false,error:"UNAUTHORIZED"},401,request);
    await ensureAgents(env.DB);
    return json({ok:true,agentsSeeded:50,mode:"PAPER_ONLY"},200,request);
  }
  if(request.method==="POST"&&url.pathname==="/engine/tick") {
    if(!auth(request,env)) return json({ok:false,error:"UNAUTHORIZED"},401,request);
    try{return json(await runAutonomousTick(env),200,request);}catch(e){return json({ok:false,error:"ENGINE_TICK_FAILED",detail:String(e.message||e)},500,request);}
  }
  return json({ok:false,error:"NOT_FOUND",endpoints:["GET /engine/status","POST /engine/seed","POST /engine/tick"]},404,request);
}

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
  const existing=await db.prepare("SELECT COUNT(*) AS total FROM engine_agents").first();
  if(Number(existing?.total||0)>=AGENTS.length) return;
  const stamp=nowIso();
  await db.batch(AGENTS.map(a=>db.prepare(
    "INSERT OR IGNORE INTO engine_agents (agent_id,archetype,strategy,threshold,total_forecasts,closed_forecasts,wins,losses,net_return_sum,updated_at) VALUES (?,?,?,?,0,0,0,0,0,?)"
  ).bind(a.id,a.archetype,a.strategy,a.threshold,stamp)));
}

function getWebSocketCandles(symbol, suppliedCandles) {
  const rows=Array.isArray(suppliedCandles?.[symbol])?suppliedCandles[symbol]:[];
  const closed=rows.filter(r=>r&&Number.isFinite(Number(r.openTime))&&Number.isFinite(Number(r.closeTime))&&Number(r.open)>0&&Number(r.close)>0&&Number(r.high)>0&&Number(r.low)>0&&Number(r.volume)>=0&&Number(r.closeTime)<Date.now()-1000)
    .map(r=>({openTime:Number(r.openTime),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume),closeTime:Number(r.closeTime)}))
    .sort((a,b)=>a.openTime-b.openTime);
  if(closed.length<25) throw new Error(`INSUFFICIENT_WEBSOCKET_CANDLES_${symbol}_${closed.length}`);
  if(Date.now()-closed.at(-1).closeTime>180000) throw new Error(`STALE_WEBSOCKET_CANDLES_${symbol}`);
  return closed.slice(-80);
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
  const due=await db.prepare("SELECT id,agent_id,direction,entry_price,strategy FROM engine_forecasts WHERE symbol=? AND status='PENDING' AND target_open_time<=? LIMIT 500").bind(symbol,latest.openTime).all();
  const forecasts=(due.results||[]).filter(f=>Number.isFinite(Number(f.entry_price))&&Number(f.entry_price)>0);
  if(!forecasts.length) return 0;
  const chunkSize=80,closed=[];
  for(let i=0;i<forecasts.length;i+=chunkSize) {
    const chunk=forecasts.slice(i,i+chunkSize);
    const statements=chunk.map(f=>{
      const gross=(latest.close-Number(f.entry_price))/Number(f.entry_price)*(f.direction==="BUY"?1:-1);
      const net=gross-(2*FEE_PER_SIDE)-(2*SLIPPAGE_PER_SIDE),outcome=net>0?"WIN":"LOSS";
      return {forecast:f,gross,net,outcome,statement:db.prepare("UPDATE engine_forecasts SET status='CLOSED',exit_price=?,gross_return=?,net_return=?,outcome=?,evaluated_at=? WHERE id=? AND status='PENDING'").bind(latest.close,gross,net,outcome,nowIso(),f.id)};
    });
    const results=await db.batch(statements.map(x=>x.statement));
    for(let j=0;j<statements.length;j++) if(Number(results[j]?.meta?.changes||0)===1) closed.push(statements[j]);
  }
  if(!closed.length) return 0;
  const evalStatements=closed.map(x=>db.prepare("INSERT OR IGNORE INTO engine_evaluations(forecast_id,agent_id,symbol,strategy,net_return,outcome,evaluated_at) VALUES (?,?,?,?,?,?,?)").bind(x.forecast.id,x.forecast.agent_id,symbol,x.forecast.strategy,x.net,x.outcome,nowIso()));
  const insertedEvaluations=[];
  for(let i=0;i<evalStatements.length;i+=chunkSize) {
    const results=await db.batch(evalStatements.slice(i,i+chunkSize));
    for(let j=0;j<results.length;j++) if(Number(results[j]?.meta?.changes||0)===1) insertedEvaluations.push(closed[i+j]);
  }
  if(!insertedEvaluations.length) return 0;
  const byAgent=new Map();
  for(const x of insertedEvaluations) {
    const id=x.forecast.agent_id,agg=byAgent.get(id)||{wins:0,losses:0,net:0};
    agg.wins+=x.outcome==="WIN"?1:0; agg.losses+=x.outcome==="LOSS"?1:0; agg.net+=x.net; byAgent.set(id,agg);
  }
  const agentUpdates=[...byAgent].map(([agentId,agg])=>db.prepare("UPDATE engine_agents SET closed_forecasts=closed_forecasts+?,wins=wins+?,losses=losses+?,net_return_sum=net_return_sum+?,updated_at=? WHERE agent_id=?").bind(agg.wins+agg.losses,agg.wins,agg.losses,agg.net,nowIso(),agentId));
  for(let i=0;i<agentUpdates.length;i+=chunkSize) await db.batch(agentUpdates.slice(i,i+chunkSize));
  const agentIds=[...byAgent.keys()],placeholders=agentIds.map(()=>"?").join(",");
  const recent=await db.prepare(`SELECT agent_id,AVG(net_return) AS avg_net,COUNT(*) AS sample_count FROM (SELECT agent_id,net_return,ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY id DESC) AS rn FROM engine_evaluations WHERE agent_id IN (${placeholders})) WHERE rn<=20 GROUP BY agent_id`).bind(...agentIds).all();
  const current=await db.prepare(`SELECT agent_id,threshold FROM engine_agents WHERE agent_id IN (${placeholders})`).bind(...agentIds).all();
  const thresholdByAgent=new Map((current.results||[]).map(x=>[x.agent_id,Number(x.threshold||0.0005)]));
  const updates=(recent.results||[]).filter(x=>Number(x.sample_count)>=10&&thresholdByAgent.has(x.agent_id)).map(x=>{
    const avg=Number(x.avg_net||0),old=thresholdByAgent.get(x.agent_id),next=clamp(avg>0?old*0.98:old*1.05,0.0001,0.005);
    return db.prepare("UPDATE engine_agents SET threshold=?,last_adapted_at=?,updated_at=? WHERE agent_id=?").bind(next,nowIso(),nowIso(),x.agent_id);
  });
  for(let i=0;i<updates.length;i+=chunkSize) await db.batch(updates.slice(i,i+chunkSize));
  return insertedEvaluations.length;
}
async function createForecasts(db,symbol,candles,activeAgents) {
  const f=features(candles), candle=candles.at(-1), target=candle.openTime+HORIZON_MINUTES*60000;
  const batch=[];
  const forecastAgents=[];
  let created=0;
  for(const a of activeAgents) {
    const d=decide(a,f);
    if(d.direction==="HOLD"||d.confidence<0.18) continue;
    const forecastKey=`${symbol}:${a.id}:${candle.openTime}`;
    forecastAgents.push(a.id);
    batch.push(db.prepare("INSERT OR IGNORE INTO engine_forecasts(forecast_key,agent_id,symbol,candle_open_time,target_open_time,direction,entry_price,strategy,score,confidence,regime,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING',?)")
      .bind(forecastKey,a.id,symbol,candle.openTime,target,d.direction,f.last,a.strategy,d.score,d.confidence,f.volatility>0.002?"HIGH_VOL":f.trend>0.001?"UPTREND":f.trend< -0.001?"DOWNTREND":"RANGE",nowIso()));
  }
  if(batch.length) {
    const inserted=await db.batch(batch);
    const countsByAgent=new Map();
    for(let i=0;i<inserted.length;i++) {
      if(Number(inserted[i]?.meta?.changes||0)===1) {
        created++;
        const agentId=forecastAgents[i];
        countsByAgent.set(agentId,(countsByAgent.get(agentId)||0)+1);
      }
    }
    const updates=[...countsByAgent].map(([agentId,count])=>db.prepare("UPDATE engine_agents SET total_forecasts=total_forecasts+?,updated_at=? WHERE agent_id=?").bind(count,nowIso(),agentId));
    for(let i=0;i<updates.length;i+=80) await db.batch(updates.slice(i,i+80));
  }
  return {created,features:{price:f.last,r1:f.r1,r3:f.r3,r6:f.r6,volatility:f.volatility,trend:f.trend,volumeRatio:f.volRatio}};
}

async function runAutonomousTickUnlocked(env, suppliedCandles = {}) {
  if(!env.DB) throw new Error("D1_BINDING_MISSING");
  await ensureAgents(env.DB);
  const activeRows=await env.DB.prepare("SELECT agent_id AS id,archetype,strategy,threshold,status FROM engine_agents WHERE status='ACTIVE'").all();
  const activeAgents=activeRows.results||[];
  const started=Date.now(), results=[], errors=[];
  const work=async symbol=>{
    const candles=getWebSocketCandles(symbol,suppliedCandles);
    await saveCandle(env.DB,symbol,candles.at(-1));
    const evaluated=await evaluateDue(env.DB,symbol,candles);
    const forecast=await createForecasts(env.DB,symbol,candles,activeAgents);
    return {symbol,price:candles.at(-1).close,candleTime:new Date(candles.at(-1).openTime).toISOString(),evaluated,forecastsCreated:forecast.created,features:forecast.features};
  };
  const outcomes=[];
  for(let i=0;i<SYMBOLS.length;i+=3) outcomes.push(...await Promise.allSettled(SYMBOLS.slice(i,i+3).map(work)));
  outcomes.forEach((item,i)=>{
    if(item.status==="fulfilled") results.push(item.value);
    else errors.push({symbol:SYMBOLS[i],error:String(item.reason?.message||item.reason)});
  });
  const stamp=nowIso();
  await env.DB.prepare("INSERT INTO engine_runs(run_at,duration_ms,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated,details) VALUES (?,?,?,?,?,?,?)")
    .bind(stamp,Date.now()-started,results.length,errors.length,results.reduce((s,x)=>s+x.forecastsCreated,0),results.reduce((s,x)=>s+x.evaluated,0),JSON.stringify({results,errors})).run();
  return {ok:errors.length===0,runAt:stamp,durationMs:Date.now()-started,results,errors,realOrdersEnabled:false};
}

export async function runAutonomousTick(env,suppliedCandles={}) {
  if(!env?.DB) throw new Error("D1_BINDING_MISSING");
  const owner=crypto.randomUUID(),now=Date.now(),expires=now+10*60*1000;
  const lock=await env.DB.prepare("INSERT INTO engine_tick_lock(lock_id,owner_token,lock_until_ms) VALUES(1,?,?) ON CONFLICT(lock_id) DO UPDATE SET owner_token=excluded.owner_token,lock_until_ms=excluded.lock_until_ms WHERE engine_tick_lock.lock_until_ms<?").bind(owner,expires,now).run();
  if(Number(lock.meta?.changes||0)!==1) return {ok:true,skipped:true,reason:"ENGINE_TICK_LOCKED",realOrdersEnabled:false};
  try { return await runAutonomousTickUnlocked(env,suppliedCandles); }
  finally { await env.DB.prepare("UPDATE engine_tick_lock SET lock_until_ms=0 WHERE lock_id=1 AND owner_token=?").bind(owner).run(); }
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
      env.DB.prepare("SELECT run_at,duration_ms,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated,details FROM engine_runs ORDER BY id DESC LIMIT 1").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM engine_agents WHERE status='PAUSED'").first()
    ]);
    let lastRun=last||null;
    if(lastRun) {
      let diagnostic={};
      try { diagnostic=JSON.parse(lastRun.details||"{}"); } catch {}
      lastRun={run_at:lastRun.run_at,duration_ms:lastRun.duration_ms,symbols_ok:lastRun.symbols_ok,symbols_failed:lastRun.symbols_failed,forecasts_created:lastRun.forecasts_created,forecasts_evaluated:lastRun.forecasts_evaluated,errors:(diagnostic.errors||[]).slice(0,11).map(x=>({symbol:x.symbol,error:String(x.error||"UNKNOWN").slice(0,180)})),results:(diagnostic.results||[]).map(x=>({symbol:x.symbol,price:x.price,forecastsCreated:x.forecastsCreated,evaluated:x.evaluated}))};
    }
    const closed=Number(agents?.closed||0), wins=Number(agents?.wins||0);
    return json({ok:true,service:"MR TRADLAB ZERO AUTONOMOUS ENGINE",mode:"PAPER_ONLY",agents:Number(agents?.total||0),activeAgents:Number(agents?.total||0)-Number(paused?.total||0),pausedAgents:Number(paused?.total||0),forecasts:Number(forecasts?.total||0),closedForecasts:closed,pendingForecasts:Number(pending?.total||0),wins,losses:Number(agents?.losses||0),netWinRate:closed?Number((wins/closed*100).toFixed(2)):null,aggregateNetReturn:Number(agents?.net||0),runs:Number(runs?.total||0),lastRun,symbols:SYMBOLS,interval:"1m Binance public klines",horizonMinutes:HORIZON_MINUTES,feesPerSide:FEE_PER_SIDE,slippagePerSide:SLIPPAGE_PER_SIDE,realOrdersEnabled:false},200,request);
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

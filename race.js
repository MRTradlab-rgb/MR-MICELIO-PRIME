/**
 * MR TradLab ZERO — persistent race wallet bootstrap and status.
 * Trading remains locked until forecast execution, valuation and risk controls are integrated.
 */
const stamp=()=>new Date().toISOString();
const authorized=(request,env)=>Boolean(env.ENGINE_ADMIN_TOKEN)&&request.headers.get("Authorization")===`Bearer ${env.ENGINE_ADMIN_TOKEN}`;

export async function handleRace(request,env,url,json) {
  if(!env.DB) return json({ok:false,error:"D1_BINDING_MISSING"},503,request);
  if(request.method==="GET"&&url.pathname==="/race/status") {
    try {
      const [state,wallets,open,closed]=await Promise.all([
        env.DB.prepare("SELECT * FROM race_state WHERE race_id='mr-tradlab-zero'").first(),
        env.DB.prepare("SELECT contender_id,initial_cash,cash,realized_pnl,fees_paid,status,created_at,updated_at FROM race_wallets ORDER BY contender_id").all(),
        env.DB.prepare("SELECT COUNT(*) AS total FROM race_positions WHERE status='OPEN'").first(),
        env.DB.prepare("SELECT COUNT(*) AS total FROM race_positions WHERE status='CLOSED'").first()
      ]);
      return json({ok:true,race:state||null,wallets:wallets.results||[],openPositions:Number(open?.total||0),closedPositions:Number(closed?.total||0),status:state?.status||"NOT_INITIALIZED",tradingEnabled:false,launchAllowed:false,blockers:["Carteiras e posições ainda não estão integradas ao ciclo de previsões.","Valoração de patrimônio e fechamento por preço válido ainda precisam ser implementados.","Migration 0003 e testes de runtime precisam ser confirmados."]},200,request);
    } catch(error) {
      return json({ok:false,error:"RACE_SCHEMA_NOT_READY",detail:String(error?.message||error).slice(0,240),migration:"migrations/0003_race_portfolios.sql"},503,request);
    }
  }
  if(request.method==="POST"&&url.pathname==="/race/initialize") {
    if(!authorized(request,env)) return json({ok:false,error:"UNAUTHORIZED"},401,request);
    try {
      const now=stamp();
      await env.DB.prepare("INSERT OR IGNORE INTO race_state (race_id,status,target_equity,initial_cash,fee_per_side,slippage_per_side,max_position_fraction,max_total_exposure_fraction,created_at,updated_at) VALUES ('mr-tradlab-zero','LOCKED',1000,10,0.001,0.0005,0.10,0.50,?,?)").bind(now,now).run();
      for(const contender of ["gemma-prime","micelio-ensemble"]) {
        await env.DB.prepare("INSERT OR IGNORE INTO race_wallets (contender_id,initial_cash,cash,realized_pnl,fees_paid,status,created_at,updated_at) VALUES (?,10,10,0,0,'ACTIVE',?,?)").bind(contender,now,now).run();
      }
      await env.DB.prepare("INSERT OR IGNORE INTO race_ledger (contender_id,event_key,event_type,amount,cash_after,reference_key,details,created_at) VALUES ('gemma-prime','mr-tradlab-zero:funding:gemma-prime','INITIAL_FUNDING',10,10,'mr-tradlab-zero','{}',?)").bind(now).run();
      await env.DB.prepare("INSERT OR IGNORE INTO race_ledger (contender_id,event_key,event_type,amount,cash_after,reference_key,details,created_at) VALUES ('micelio-ensemble','mr-tradlab-zero:funding:micelio-ensemble','INITIAL_FUNDING',10,10,'mr-tradlab-zero','{}',?)").bind(now).run();
      return json({ok:true,initialized:true,status:"LOCKED",tradingEnabled:false,message:"Carteiras iniciais persistidas. A corrida permanece bloqueada até a integração e validação do motor de posições."},200,request);
    } catch(error) {
      return json({ok:false,error:"RACE_INITIALIZATION_FAILED",detail:String(error?.message||error).slice(0,240)},503,request);
    }
  }
  return json({ok:false,error:"NOT_FOUND",endpoints:["GET /race/status","POST /race/initialize"]},404,request);
}

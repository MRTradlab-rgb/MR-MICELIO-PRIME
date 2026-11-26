const ARCHETYPES = [
  ...Array.from({length:25},(_,i)=>({id:`agent-${String(i+1).padStart(2,"0")}`,archetype:"CONSERVADOR",specialty:["tendencia","volatilidade","suporte_resistencia","momentum","risco"][i%5]})),
  ...Array.from({length:25},(_,i)=>({id:`agent-${String(i+26).padStart(2,"0")}`,archetype:"EXPLORADOR",specialty:["reversao","rompimento","anomalias","correlacao","microtendencia"][i%5]}))
];
const now = () => new Date().toISOString();
function safeInt(v,min=0,max=1000000){const n=Number(v);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):null;}
async function ensureAgents(db){
  const existing=await db.prepare("SELECT COUNT(*) AS total FROM evolution_agents").first();
  if(Number(existing?.total||0)>=ARCHETYPES.length) return;
  const stamp=now();
  await db.batch(ARCHETYPES.map(a=>db.prepare(
    "INSERT OR IGNORE INTO evolution_agents (agent_id, archetype, specialty, level, xp, cox_balance, total_predictions, correct_predictions, repeated_errors, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0, 0, 0, 0, ?, ?)"
  ).bind(a.id,a.archetype,a.specialty,stamp,stamp)));
}
function jsonError(json,request,code,message,status=400){return json({ok:false,error:code,message},status,request);}
async function readJsonBounded(request,maxBytes=16384){
  const length=Number(request.headers.get("Content-Length")||0);
  if(length>maxBytes)throw new Error("BODY_TOO_LARGE");
  if(!request.body)return {};
  const reader=request.body.getReader(),chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error("BODY_TOO_LARGE");}chunks.push(value);}
  const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(data));
}
export async function handleEvolution(request,env,url,corsHeaders,json){
  if(!env.DB) return json({ok:false,service:"MICELIO_EVOLUTION",status:"D1_NOT_CONFIGURED",message:"O módulo está no Worker, mas a persistência D1 ainda não está conectada."},503,request);
  if(request.method==="GET" && (url.pathname==="/evolution"||url.pathname==="/evolution/")){
    await ensureAgents(env.DB);
    const [agents,summary,missions,rewards]=await Promise.all([
      env.DB.prepare("SELECT agent_id, archetype, specialty, level, xp, cox_balance, total_predictions, correct_predictions, repeated_errors, updated_at FROM evolution_agents ORDER BY level DESC, xp DESC, cox_balance DESC").all(),
      env.DB.prepare("SELECT COUNT(*) AS total_agents, COALESCE(SUM(cox_balance),0) AS total_cox, COALESCE(SUM(total_predictions),0) AS predictions, COALESCE(SUM(correct_predictions),0) AS correct FROM evolution_agents").first(),
      env.DB.prepare("SELECT COUNT(*) AS active FROM evolution_missions WHERE status='ACTIVE'").first(),
      env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS amount FROM evolution_rewards").first()
    ]);
    const total=Number(summary?.predictions||0), correct=Number(summary?.correct||0);
    return json({ok:true,service:"MICELIO_EVOLUTION",mode:"HYBRID",currency:"COX_VIRTUAL",summary:{...summary,accuracy:total?Number((correct/total*100).toFixed(2)):null,active_missions:Number(missions?.active||0),reward_events:Number(rewards?.total||0),rewarded_cox:Number(rewards?.amount||0)},agents:agents.results||[],rules:{individual:true,collective:true,real_money:false}},200,request,{"Cache-Control":"public, max-age=3"});
  }
  if(request.method==="POST" && url.pathname==="/evolution/seed"){
    const token=env.EVOLUTION_ADMIN_TOKEN;
    if(!token || request.headers.get("Authorization")!==`Bearer ${token}`) return jsonError(json,request,"UNAUTHORIZED","Autorização administrativa necessária.",401);
    await ensureAgents(env.DB);
    return json({ok:true,created_or_preserved:50,message:"50 agentes preparados; registros existentes foram preservados."},200,request);
  }
  if(request.method==="POST" && url.pathname==="/evolution/evaluate"){
    const token=env.EVOLUTION_ADMIN_TOKEN;
    if(!token || request.headers.get("Authorization")!==`Bearer ${token}`) return jsonError(json,request,"UNAUTHORIZED","Autorização administrativa necessária.",401);
    let body;try{body=await readJsonBounded(request,16384);}catch(e){return jsonError(json,request,e.message==="BODY_TOO_LARGE"?"BODY_TOO_LARGE":"INVALID_JSON",e.message==="BODY_TOO_LARGE"?"Payload acima de 16 KiB.":"Envie JSON válido.",e.message==="BODY_TOO_LARGE"?413:400);}
    const agentId=typeof body.agentId==="string"?body.agentId:"";
    const eventId=typeof body.eventId==="string"?body.eventId.trim().slice(0,100):"";
    const riskPassed=body.riskPassed===true;
    const outOfSample=body.outOfSample===true;
    const predictions=safeInt(body.predictions,1,100000);
    const correct=safeInt(body.correct,0,100000);
    const repeatedErrors=safeInt(body.repeatedErrors,0,100000);
    if(!/^agent-(0[1-9]|[1-4][0-9]|50)$/.test(agentId)||!eventId||predictions===null||correct===null||correct>predictions||repeatedErrors===null) return jsonError(json,request,"INVALID_METRICS","Informe agente, eventId único e métricas inteiras válidas.");
    await ensureAgents(env.DB);
    const existing=await env.DB.prepare("SELECT * FROM evolution_agents WHERE agent_id=?").bind(agentId).first();
    if(!existing) return jsonError(json,request,"AGENT_NOT_FOUND","Agente não encontrado.",404);
    const accuracy=correct/predictions;
    const improvement=existing.total_predictions>0 ? accuracy-(existing.correct_predictions/Math.max(1,existing.total_predictions)) : 0;
    const qualified=predictions>=20;
    const rewardsEnabled=env.EVOLUTION_REWARDS_ENABLED==="true";
    const individualReward=rewardsEnabled && qualified && accuracy>=0.70 && repeatedErrors===0 && riskPassed && outOfSample ? (improvement>=0.03?25:10) : 0;
    const stamp=now();
    const nextTotal=Number(existing.total_predictions)+predictions;
    const nextCorrect=Number(existing.correct_predictions)+correct;
    const xp=Math.round(correct*2 + (repeatedErrors===0?10:0) + (improvement>=0.03?20:0));
    const nextXp=Number(existing.xp)+xp;
    const level=1+Math.floor(nextXp/500);
    const claimToken=crypto.randomUUID();
    const eventDetails=JSON.stringify({predictions,correct,accuracy:Number((accuracy*100).toFixed(2)),repeatedErrors,improvement:Number((improvement*100).toFixed(2)),riskPassed,outOfSample,xp,individualReward});
    const ops=[
      env.DB.prepare("INSERT OR IGNORE INTO evolution_events (agent_id,event_type,source_event_id,details,created_at,claim_token) VALUES (?,?,?,?,?,?)").bind(agentId,"EVALUATION",eventId,eventDetails,stamp,claimToken),
      env.DB.prepare("UPDATE evolution_agents SET level=1+CAST((xp+?)/500 AS INTEGER), xp=xp+?, cox_balance=cox_balance+?, total_predictions=total_predictions+?, correct_predictions=correct_predictions+?, repeated_errors=?, updated_at=? WHERE agent_id=? AND EXISTS (SELECT 1 FROM evolution_events WHERE source_event_id=? AND claim_token=?)").bind(xp,xp,individualReward,predictions,correct,repeatedErrors,stamp,agentId,eventId,claimToken)
    ];
    if(individualReward>0) ops.push(env.DB.prepare("INSERT INTO evolution_rewards (agent_id,reward_type,amount,reason,created_at) SELECT ?, 'INDIVIDUAL', ?, ?, ? WHERE EXISTS (SELECT 1 FROM evolution_events WHERE source_event_id=? AND claim_token=?)").bind(agentId,individualReward,"Meta validada: mínimo 20 previsões, acurácia >=70% e zero erros repetidos.",stamp,eventId,claimToken));
    const batchResults=await env.DB.batch(ops);
    if(Number(batchResults[0]?.meta?.changes||0)!==1) return jsonError(json,request,"DUPLICATE_EVENT","Este lote já foi processado; nenhuma recompensa foi repetida.",409);
    const collective=await env.DB.prepare("SELECT SUM(total_predictions) AS predictions,SUM(correct_predictions) AS correct FROM evolution_agents").first();
    const teamAccuracy=Number(collective?.predictions||0)>0?Number(collective.correct)/Number(collective.predictions):0;
    let collectiveReward=0;
    if(rewardsEnabled && Number(collective?.predictions||0)>=500 && teamAccuracy>=0.70){
      const rewardDay=stamp.slice(0,10),claimToken=crypto.randomUUID();
      const claimOps=[
        env.DB.prepare("INSERT OR IGNORE INTO evolution_collective_claims(reward_day,claim_token,claimed_at) VALUES(?,?,?)").bind(rewardDay,claimToken,stamp),
        env.DB.prepare("UPDATE evolution_agents SET cox_balance=cox_balance+?,updated_at=? WHERE EXISTS (SELECT 1 FROM evolution_collective_claims WHERE reward_day=? AND claim_token=?)").bind(5,stamp,rewardDay,claimToken),
        env.DB.prepare("INSERT INTO evolution_rewards(agent_id,reward_type,amount,reason,created_at) SELECT NULL,'COLLECTIVE',?,'Meta coletiva: pelo menos 500 previsões e acurácia agregada >=70%.',? WHERE EXISTS (SELECT 1 FROM evolution_collective_claims WHERE reward_day=? AND claim_token=?)").bind(250,stamp,rewardDay,claimToken)
      ];
      const claimed=await env.DB.batch(claimOps);
      if(Number(claimed[0]?.meta?.changes||0)===1) collectiveReward=5;
    }
    return json({ok:true,agentId,accuracy:Number((accuracy*100).toFixed(2)),qualified,individualReward,xpGained:xp,newLevel:level,collectiveAccuracy:Number((teamAccuracy*100).toFixed(2)),collectiveRewardPerAgent:collectiveReward,warning:rewardsEnabled?"Recompensas exigem lote auditável, risco aprovado e validação fora da amostra. O servidor ainda depende de um produtor confiável de métricas.":"Recompensas COX estão desativadas por padrão até existir produtor de métricas confiável e validação independente."},200,request);
  }
  return json({ok:false,error:"NOT_FOUND",endpoints:["GET /evolution","POST /evolution/seed","POST /evolution/evaluate"]},404,request);
}

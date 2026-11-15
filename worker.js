/**
 * MR MICELIO PRIME — Cloudflare Worker
 * Chat endpoint for MR TradLab ZERO v0.6+
 * Required binding: AI (Workers AI)
 */
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const ALLOWED_ACTIONS = new Set(["pause_agent","resume_agent","pause_group","resume_group","assign_mission","analyze_health","start_sandbox_experiment"]);
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {"Access-Control-Allow-Origin":origin,"Vary":"Origin","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400"};
}
function json(data,status,request) {
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...corsHeaders(request)}});
}
function cleanActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.slice(0,8).filter(a=>a&&typeof a==="object"&&typeof a.type==="string"&&ALLOWED_ACTIONS.has(a.type)).map(a=>{
    const out={type:a.type};
    for(const k of ["agentId","group","mission","reason","symbol","strategy"]) if(typeof a[k]==="string") out[k]=a[k].slice(0,120);
    if(typeof a.enabled==="boolean") out.enabled=a.enabled;
    return out;
  });
}
function parseModelOutput(result) {
  let raw=typeof result==="string"?result:(result&&typeof result.response==="string"?result.response:JSON.stringify(result??{}));
  const stripped=raw.replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"").trim();
  try { const parsed=JSON.parse(stripped); return {reply:typeof parsed.reply==="string"?parsed.reply:raw,actions:cleanActions(parsed.actions)}; }
  catch { return {reply:raw,actions:[]}; }
}
export default {
 async fetch(request,env) {
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request)});
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/") return json({ok:true,service:"MR Micelio Prime",endpoints:["GET /health","POST /chat"],health:"/health"},200,request);
  if(request.method==="GET"&&url.pathname==="/health") return json({ok:true,service:"MR Micelio Prime",model:MODEL,aiBinding:Boolean(env.AI),status:env.AI?"READY":"MISSING_AI_BINDING"},env.AI?200:503,request);
  if(request.method!=="POST"||url.pathname!=="/chat") return json({ok:false,error:"Use GET /health or POST /chat"},404,request);
  if(!env.AI) return json({ok:false,error:"Workers AI binding 'AI' is not configured."},503,request);
  let body; try {body=await request.json();} catch {return json({ok:false,error:"Invalid JSON body."},400,request);}
  const sourceMessages=Array.isArray(body.messages)?body.messages:(Array.isArray(body.conversation)?body.conversation:[]);
  const messages=sourceMessages.slice(-12), userMessage=typeof body.message==="string"?body.message:"";
  const context=body.context&&typeof body.context==="object"?body.context:(body.lab&&typeof body.lab==="object"?body.lab:{});
  const safeMessages=messages.map(m=>({role:m&&m.role==="assistant"?"assistant":"user",content:String(m&&m.content||"").slice(0,4000)}));
  const system=`Você é o MR Micélio Prime, coordenador de um laboratório de pesquisa e desenvolvimento de IA.
Sua missão é dialogar, explicar, pesquisar conceitos, propor experimentos verificáveis e coordenar agentes.
O Micélio é um ambiente coletivo de pesquisa; os agentes são pesquisadores especializados.
O laboratório de trading é apenas um dos domínios, não a finalidade total do projeto.
REGRAS:
- Responda em português brasileiro, de forma clara e prática.
- Não invente dados, preços, resultados, memória ou acesso à internet.
- Diferencie fatos, hipóteses e propostas.
- Use o contexto do laboratório apenas como informação fornecida, não como prova de inteligência ou evolução.
- Não afirme que aprendeu permanentemente; proponha registros, testes e métricas verificáveis.
- Nunca solicite nem exponha chaves, senhas ou credenciais.
- Nunca autorize operações financeiras reais. Experimentos devem ser simulados.
- Só proponha ações da lista permitida abaixo. Ações são sugestões para o painel executar, não código livre.
- Retorne SOMENTE JSON válido no formato: {"reply":"resposta ao usuário","actions":[]}
Ações permitidas: pause_agent {agentId}, resume_agent {agentId}, pause_group {group}, resume_group {group}, assign_mission {group, mission}, analyze_health {}, start_sandbox_experiment {symbol, strategy, reason}.
Se não houver motivo claro para executar uma ação, retorne actions vazio.`;
  const contextText=JSON.stringify(context).slice(0,12000);
  const conversationText=safeMessages.map(m=>m.role.toUpperCase()+": "+m.content).join("\n");
  const prompt=system+"\n\nCONTEXTO ATUAL DO LABORATÓRIO:\n"+contextText+"\n\nCONVERSA RECENTE:\n"+conversationText+"\n\nMENSAGEM ATUAL:\n"+userMessage.slice(0,4000)+"\n\nResponda no JSON exigido.";
  try {
   const result=await env.AI.run(MODEL,{messages:[{role:"user",content:prompt}],max_completion_tokens:900,temperature:0.35});
   const parsed=parseModelOutput(result);
   return json({ok:true,model:MODEL,reply:parsed.reply,actions:parsed.actions},200,request);
  } catch(err) {return json({ok:false,error:"AI_INFERENCE_FAILED",detail:String(err&&err.message||err).slice(0,300)},502,request);}
 }
};

/**
 * MR MICELIO PRIME — Cloudflare Worker
 * Chat endpoint for MR TradLab ZERO v0.6+
 * Required binding: AI (Workers AI)
 */
import { handleEvolution } from "./evolution.js";
import { handleEngine, runAutonomousTick, getPrimeContext, executePrimeActions } from "./engine.js";
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const ALLOWED_ACTIONS = new Set(["pause_agent","resume_agent","pause_group","resume_group","assign_mission","analyze_health","start_sandbox_experiment"]);
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {"Access-Control-Allow-Origin":origin,"Vary":"Origin","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400"};
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
function extractText(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  if (typeof result.response === "string") return result.response;
  if (typeof result.reply === "string") return result.reply;
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  const message = choice && choice.message;
  if (message && typeof message.content === "string") return message.content;
  if (typeof result.output_text === "string") return result.output_text;
  if (typeof result.text === "string") return result.text;
  return "";
}
function parseModelOutput(result) {
  const raw = extractText(result).trim();
  if (!raw) return {reply:"Recebi uma resposta incompleta do modelo. Vou tentar novamente; nenhum comando foi executado.",actions:[]};
  const stripped=raw.replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"").trim();
  try {
    const parsed=JSON.parse(stripped);
    return {reply:typeof parsed.reply==="string"?parsed.reply:"Não consegui interpretar a resposta do modelo.",actions:cleanActions(parsed.actions)};
  } catch {
    return {reply:stripped.slice(0,5000),actions:[]};
  }
}
export default {
 async fetch(request,env) {
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request)});
  const url=new URL(request.url);
  if(url.pathname.startsWith("/engine")) return handleEngine(request,env,url,json);
  if(url.pathname.startsWith("/evolution")) return handleEvolution(request,env,url,corsHeaders,json);
  if(request.method==="GET"&&url.pathname==="/") return json({ok:true,service:"MR Micelio Prime",endpoints:["GET /health","POST /chat","GET /engine/status","GET /engine/agents","POST /engine/seed","POST /engine/tick"],health:"/health"},200,request);
  if(request.method==="GET"&&url.pathname==="/health") return json({ok:true,service:"MR Micelio Prime",model:MODEL,aiBinding:Boolean(env.AI),status:env.AI?"READY":"MISSING_AI_BINDING"},env.AI?200:503,request);
  if(request.method!=="POST"||url.pathname!=="/chat") return json({ok:false,error:"Use GET /health or POST /chat"},404,request);
  if(!env.AI) return json({ok:false,error:"Workers AI binding 'AI' is not configured."},503,request);
  let body; try {body=await request.json();} catch {return json({ok:false,error:"Invalid JSON body."},400,request);}
  const sourceMessages=Array.isArray(body.messages)?body.messages:(Array.isArray(body.conversation)?body.conversation:[]);
  const messages=sourceMessages.slice(-8), userMessage=typeof body.message==="string"?body.message:"";
  const context=body.context&&typeof body.context==="object"?body.context:(body.lab&&typeof body.lab==="object"?body.lab:{});
  const safeMessages=messages.map(m=>({role:m&&m.role==="assistant"?"assistant":"user",content:String(m&&m.content||"").slice(0,1800)}));
  const system=`Você é o MR Micélio Prime, coordenador de um laboratório de pesquisa e desenvolvimento de IA.
Sua missão é dialogar, explicar, pesquisar conceitos, propor experimentos verificáveis e coordenar os 50 agentes.
O Micélio é um ambiente coletivo de pesquisa; os agentes são pesquisadores especializados.
REGRAS:
- Responda em português brasileiro, de forma clara e prática.
- Analise o array completo "agents" recebido no CONTEXTO, não apenas os agentes com melhor resultado.
- Ao direcionar estratégias, compare agentes por especialidade, status, volume de amostras, taxa de acerto e retorno líquido; destaque amostras pequenas e dados ausentes.
- Diferencie taxa de acerto, retorno líquido e evidência estatística. Não declare um agente vencedor só por ranking ou poucas operações.
- Não invente dados, preços, resultados, memória ou acesso à internet.
- Diferencie fatos, hipóteses e propostas.
- Use o contexto do laboratório apenas como informação fornecida, não como prova de inteligência ou evolução.
- Não afirme que aprendeu permanentemente; proponha registros, testes e métricas verificáveis.
- Nunca solicite nem exponha chaves, senhas ou credenciais.
- Nunca autorize operações financeiras reais. Experimentos devem ser simulados.
- Você pode sugerir ações estruturadas permitidas quando houver justificativa clara. Nunca alegue ação concluída sem confirmação do executor.
- Preserve o motor original; experimente em sandbox e não altere pesos ou parâmetros ativos por conta própria.
- Retorne SOMENTE JSON válido no formato: {"reply":"resposta ao usuário","actions":[]}
Ações permitidas: pause_agent {agentId}, resume_agent {agentId}, pause_group {group}, resume_group {group}, assign_mission {group, mission}, analyze_health {}, start_sandbox_experiment {symbol, strategy, reason}.
Se não houver motivo claro para executar uma ação, retorne actions vazio.`;
  const primeContext=await getPrimeContext(env.DB);
  // Mantém os 50 agentes íntegros no prompt; corta apenas contexto auxiliar enviado pelo painel.
  const contextText=JSON.stringify({primeContext,userContext:context}).slice(0,24000);
  const conversationText=safeMessages.map(m=>m.role.toUpperCase()+": "+m.content).join("\n");
  const prompt=system+"\n\nCONTEXTO ATUAL DO LABORATÓRIO (inclui todos os agentes):\n"+contextText+"\n\nCONVERSA RECENTE:\n"+conversationText+"\n\nMENSAGEM ATUAL:\n"+userMessage.slice(0,4000)+"\n\nResponda no JSON exigido.";
  try {
   let result=await env.AI.run(MODEL,{messages:[{role:"user",content:prompt}],max_tokens:1200,temperature:0.2});
   let parsed=parseModelOutput(result);
   if(!extractText(result).trim()) {
     const compact="Você é MR Micélio Prime. Responda em português brasileiro, com clareza e em no máximo 5 frases. Não invente dados. Ações permitidas somente se necessárias: "+Array.from(ALLOWED_ACTIONS).join(", ")+". Retorne JSON válido: {\"reply\":\"texto\",\"actions\":[]}\nMensagem: "+userMessage.slice(0,1000)+"\nContexto completo do motor, incluindo todos os agentes: "+contextText.slice(0,24000);
    result=await env.AI.run(MODEL,{messages:[{role:"user",content:compact}],max_tokens:1200,temperature:0.1});
    parsed=parseModelOutput(result);
   }
   let executedActions=[]; let actionExecutionError=null;
   if(parsed.actions.length && env.DB) {
     try { executedActions=await executePrimeActions(env.DB,parsed.actions); }
     catch(actionErr) { actionExecutionError=String(actionErr&&actionErr.message||actionErr).slice(0,240); }
   }
   return json({ok:true,model:MODEL,role:"MICELIO_PRIME",reply:parsed.reply,actions:parsed.actions,executedActions,actionExecutionError,primeContext},200,request);
  } catch(err) {return json({ok:false,error:"AI_INFERENCE_FAILED",detail:String(err&&err.message||err).slice(0,300)},502,request);}
 },
 async scheduled(controller,env,ctx) {
  ctx.waitUntil(runAutonomousTick(env).catch(err=>console.error("MR_ZERO_ENGINE_TICK_FAILED",String(err&&err.message||err))));
 }
};
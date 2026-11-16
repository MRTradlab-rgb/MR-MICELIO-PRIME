/**
 * MICELIO PRIME -> MICELIO OPEN
 * Reports only facts read from PRIME D1. No code or strategy is imported from OPEN.
 */
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const now = () => new Date().toISOString();

async function signedPost(env, path, bodyText = "") {
  const base = String(env.MICELIO_OPEN_URL || "").replace(/\/$/, "");
  const agentId = env.MICELIO_OPEN_AGENT_ID || "";
  const token = env.MICELIO_OPEN_AGENT_TOKEN || "";
  const privateKeyB64 = env.MICELIO_OPEN_PRIVATE_KEY_PKCS8_B64 || "";
  if (!base || !agentId || !token || !privateKeyB64) {
    return {ok:false, skipped:true, reason:"MICELIO_OPEN_SECRETS_NOT_CONFIGURED"};
  }
  const keyBytes = Uint8Array.from(atob(privateKeyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, {name:"Ed25519"}, false, ["sign"]);
  const timestamp = now();
  const nonce = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const signature = await crypto.subtle.sign("Ed25519", key, encoder.encode(`${timestamp}.${nonce}.${bodyText}`));
  const response = await fetch(`${base}${path}`, {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "authorization":`Bearer ${token}`,
      "x-agent-id":agentId,
      "x-agent-timestamp":timestamp,
      "x-agent-nonce":nonce,
      "x-agent-signature":b64(signature)
    },
    body: bodyText || undefined,
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OPEN_${path}_HTTP_${response.status}: ${text.slice(0,300)}`);
  return {ok:true, response:text ? JSON.parse(text) : {}};
}

export async function reportPrimeHealthToOpen(env) {
  if (!env.DB) return {ok:false, skipped:true, reason:"D1_BINDING_MISSING"};
  const base = String(env.MICELIO_OPEN_URL || "").replace(/\/$/, "");
  if (!base || !env.MICELIO_OPEN_AGENT_ID || !env.MICELIO_OPEN_AGENT_TOKEN || !env.MICELIO_OPEN_PRIVATE_KEY_PKCS8_B64) {
    return {ok:false, skipped:true, reason:"MICELIO_OPEN_SECRETS_NOT_CONFIGURED"};
  }
  const [prime, latest] = await Promise.all([
    getPrimeContextSafe(env.DB),
    env.DB.prepare("SELECT run_at,duration_ms,symbols_ok,symbols_failed,forecasts_created,forecasts_evaluated FROM engine_runs ORDER BY id DESC LIMIT 1").first()
  ]);
  const ready = prime.engineReady === true;
  const hasRun = Boolean(latest?.run_at);
  const failed = Number(latest?.symbols_failed || 0);
  const status = !ready ? "critical" : (!hasRun || failed > 0 ? "degraded" : "healthy");
  const summary = !ready
    ? "PRIME não conseguiu ler o estado do motor; verifique o banco e o esquema."
    : !hasRun
      ? "Motor PRIME configurado, mas ainda não há execução registrada."
      : failed > 0
        ? `Última execução parcial: ${Number(latest.symbols_ok||0)} mercados OK e ${failed} com falha.`
        : `Última execução concluída: ${Number(latest.symbols_ok||0)} mercados OK, sem falhas registradas.`;
  const report = {
    component:"mr-tradlab-prime-engine",
    status,
    summary,
    metrics:{
      mode:"PAPER_ONLY",
      realOrdersEnabled:false,
      engineReady:ready,
      agentsTotal:Number(prime.agents?.total || 0),
      agentsActive:Number(prime.agents?.active || 0),
      agentsPaused:Number(prime.agents?.paused || 0),
      latestRun:latest || null,
      source:"MR MICELIO PRIME D1",
      measuredAt:now()
    }
  };
  const body = JSON.stringify(report);
  const heartbeat = await signedPost(env, "/v1/agents/heartbeat");
  const health = await signedPost(env, "/v1/health/report", body);
  return {ok:true, heartbeat:heartbeat.response, health:health.response, reportedStatus:status};
}

async function getPrimeContextSafe(db) {
  try {
    const [summary] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='PAUSED' THEN 1 ELSE 0 END) AS paused FROM engine_agents").first()
    ]);
    return {engineReady:true,agents:summary||{}};
  } catch {
    return {engineReady:false,agents:{}};
  }
}

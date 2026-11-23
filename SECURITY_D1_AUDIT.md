# Auditoria MR Micélio Prime — 2026-11-23

## Escopo e limitações
Revisão estática de `worker.js`, `engine.js`, `evolution.js`, `race.js`, `market-feed.js`, `wrangler.toml` e migrations. Não houve acesso ao dashboard/conta Cloudflare, métricas reais de D1, secrets, Workers logs, Cron status, deployment ativo ou testes executados. Os achados abaixo são evidências de código, não confirmação de exploração ou consumo observado.

## Achados prioritários

### P1 — Chat público podia executar ações administrativas estruturadas
**Evidência anterior:** `worker.js` executava `executePrimeActions()` quando a saída da IA continha ações e havia D1, sem exigir token administrativo. O endpoint `POST /chat` era público.
**Risco:** prompt injection/contexto malicioso poderia provocar pausa/retomada de agentes, missão ou experimento paper.
**Correção nesta branch:** ações só são executadas com `Authorization: Bearer ENGINE_ADMIN_TOKEN`; sem token, a resposta continua, mas execução é bloqueada e `actionExecutionError=ACTIONS_REQUIRE_ADMIN_AUTH`.

### P1 — CORS refletia qualquer Origin
**Evidência anterior:** `corsHeaders()` refletia `Origin` sem allowlist.
**Risco:** qualquer origem browser podia chamar endpoints; CORS não substitui autenticação.
**Correção:** `originAllowed()` valida contra `CORS_ALLOWED_ORIGINS`; origem cross-site não configurada recebe 403. Configure uma lista exata no Worker; wildcard `*` é permitido somente se explicitamente configurado. Requisições sem Origin (server-to-server) continuam aceitas.

### P1 — /chat sem limite de payload nem rate limiting
**Evidência:** parsing direto de `request.json()`, endpoint público e chamada de Workers AI.
**Risco:** payloads grandes e abuso podem elevar CPU, AI invocations e consumo.
**Correção parcial:** JSON é lido com limite streaming de 32 KiB e Content-Length antecipado; acima retorna 413. **Rate limiting ainda precisa ser configurado** (Cloudflare WAF/Rate Limiting ou binding com namespace confirmado).

### P1 — Tick do motor podia sobrepor Cron e chamadas manuais
**Evidência:** `runAutonomousTick()` não tinha lock; Cron é `* * * * *` e endpoint manual existe.
**Risco:** ciclos concorrentes poderiam avaliar forecasts, criar métricas duplicadas/contadores divergentes e pressionar D1.
**Correção:** lock D1 com token de dono e expiração de 10 minutos, migration `0006_engine_tick_lock.sql`; ciclos concorrentes retornam `ENGINE_TICK_LOCKED`. **Aplicar migration antes do deploy.**

### P1 — Evolution recompensa dependia de flags fornecidas pelo chamador
**Evidência:** `riskPassed` e `outOfSample` eram booleanos do payload; não havia produtor independente que provasse a validação.
**Risco:** credencial administrativa poderia declarar métricas/flags sem evidência.
**Correção:** COX rewards desativadas por padrão. Só habilitar `EVOLUTION_REWARDS_ENABLED=true` depois de integrar produtor confiável e validação independente. O endpoint ainda registra eventos e XP quando autorizado, mas não emite COX por padrão.

### P1 — Idempotência da Evolution e recompensa coletiva
**Evidência anterior:** verificação de `source_event_id` e atualização de agente eram operações separadas; recompensa coletiva era check-then-write.
**Risco:** chamadas concorrentes poderiam processar o mesmo evento/recompensa mais de uma vez.
**Correção:** claim token em batch para eventos e tabela diária `evolution_collective_claims`; migration `0007_evolution_idempotency.sql` preserva histórico e faz backfill dos dias que já possuem recompensa coletiva.

### P2 — D1: polling repetia INSERT OR IGNORE de agentes
**Evidência:** endpoints de status/evolution chamavam `ensureAgents()`, que submetia 50 INSERT OR IGNORE em toda chamada.
**Correção:** agora verifica a contagem primeiro e retorna sem batch se já existem 50 agentes. Race seed também usa COUNT e batch em vez de dois writes individuais.

### P2 — D1: tick consultava agentes ativos por símbolo e adaptação em consultas individuais
**Evidência:** 11 mercados repetiam a consulta de agentes; adaptação lia últimas 20 avaliações por agente.
**Correção:** consulta de agentes ativos uma vez por ciclo; mercados processados em grupos de 3; últimas 20 avaliações dos agentes afetados calculadas em uma query com window function; thresholds atualizados em batch.

### P2 — D1: contadores poderiam divergir em inserts ignorados
**Evidência anterior:** os counters eram agregados a partir de forecasts fechados mesmo se INSERT OR IGNORE da avaliação não criasse registro.
**Correção:** estatísticas e adaptação agora usam somente as avaliações cujo insert efetivamente reportou mudança.

### P2 — Durable Object reconexão fixa e promise sem catch
**Evidência:** reconnect sempre após 60 s; persistClosedData chamada sem tratamento explícito de rejeição.
**Correção:** backoff progressivo de 5, 10, 20, 40 até 60 s e promise de persistência com catch.

### P2 — Observabilidade ausente/insuficiente na configuração
**Correção:** Workers Logs habilitados com sampling 10%; traces habilitados com sampling 5% para controlar volume/custo. Confirmar compatibilidade da versão Wrangler instalada antes do deploy.

### P2 — Retenção de D1 não definida
**Evidência:** `engine_runs`, `engine_market_candles`, `engine_forecasts`, `engine_evaluations`, `race_cycles` e `race_trades` são tabelas históricas sem política de retenção/arquivamento no código.
**Recomendação:** não apagar avaliações nem memória de aprendizado. Definir retenção/arquivo para candles e logs detalhados, e manter forecast/evaluation como dataset de aprendizado (ou exportar para R2 antes de qualquer compactação). A estimativa de volume deve ser medida com métricas reais.

### P2 — Endpoints públicos de leitura e feed
**Evidência:** `/engine/status`, `/engine/agents`, `/evolution`, `/race/public-status`, `/market/snapshot`, `/market/health` e `/market/connect` não exigem autenticação.
**Risco:** custo de D1/DO e exposição de métricas públicas. Os endpoints não expõem segredos, mas não há rate limit.
**Correção:** /market aceita somente GET e três paths exatos; paths desconhecidos não iniciam conexão. Rate limiting e decisão sobre endpoints públicos ainda pendentes.

### P1 — Race cycle podia sobrepor chamadas e duplicar trades virtuais
**Evidência:** `race.js` consulta o último ciclo e depois insere; duas chamadas concorrentes podiam passar pelo throttle e executar BUY/SELL; o endpoint manual duplicava a lógica.
**Correção:** lock D1 com token e expiração de 2 minutos, migration `0008_race_cycle_lock.sql`; o endpoint manual agora usa o mesmo executor/lock do ciclo programado.

### P2 — Reconnect/feed e snapshot
**Evidência:** DO mantém até 100 candles por símbolo, o que limita o estado em memória/storage; snapshot só devolve quotes com idade <=15s. Engine valida candles até 3 minutos.
**Status:** validação de frescor já existe. Backoff corrigido. A conexão pode ser reiniciada em evicções/runtime updates; alarm é mecanismo de recuperação, não garantia de conexão permanente.

## Migrations — atenção à sequência
A base já contém `0003_prime_orchestration.sql` e `0004_paper_race.sql`. A migration de índice da PR anterior foi renomeada para `0005_engine_evaluation_index.sql` para não conflitar. Esta branch adiciona:
- `0005_engine_evaluation_index.sql`
- `0006_engine_tick_lock.sql`
- `0007_evolution_idempotency.sql`
- `0008_race_cycle_lock.sql`

Aplicar em ordem, verificando que 0005 não tenha sido aplicada anteriormente sob outro nome. A migration 0007 usa `ALTER TABLE ... ADD COLUMN`; verificar se foi aplicada antes de repetir.

## Correções implementadas nesta branch
- CORS allowlist e bloqueio de origem não configurada.
- Limite streaming de 32 KiB no `POST /chat`.
- Ações da IA protegidas por token administrativo.
- Paths/métodos de Market Feed restritos.
- Tick engine lock, concorrência de mercados limitada a 3.
- D1 polling/queries e agregação de thresholds reduzidos.
- Contadores baseados em avaliações realmente inseridas.
- Idempotência de eventos/recompensas Evolution.
- Recompensas COX disabled by default.
- Race seed e engine/evolution seed com fast-path.
- Backoff de WebSocket e catch explícito de persistência.
- Lock para o ciclo de race, e endpoint manual unificado ao executor.
- Workers logs/traces com sampling.

## Não executado
- Deploy Cloudflare.
- Aplicação de migrations.
- Testes unitários/integration.
- Verificação de secrets/rotacionar tokens.
- Rate limiting/WAF.
- Comparação de D1 reads/writes antes/depois.
- Confirmação do Cron ativo no dashboard.

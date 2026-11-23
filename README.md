# MR Micélio Prime

Backend inicial do MR Micélio Prime para conectar o painel ZERO v0.6 ao Cloudflare Workers AI.

## Configuração
- Worker: `mr-micelio`
- Arquivo de entrada: `worker.js`
- Configuração: `wrangler.toml`
- Binding Workers AI: `AI`

## Endpoints
- GET /health — verifica o serviço e se o binding AI está configurado.
- POST /chat — recebe conversa/contexto e devolve resposta do modelo.

## Publicação automática
O repositório está preparado para Cloudflare Workers Builds:
1. Conecte este repositório e a branch `main` ao Worker `mr-micelio`.
2. Use `npx wrangler deploy` como comando de implantação.
3. O arquivo `wrangler.toml` declara o binding Workers AI com o nome `AI`.
4. Após cada commit na branch `main`, a Cloudflare inicia uma nova compilação/implantação.

## Verificação
1. Abra `/health` na URL do Worker.
2. O resultado esperado, depois que o binding estiver ativo, contém `ok:true` e `status:"READY"`.
3. No ZERO v0.6, informe a URL base do Worker, sem acrescentar `/chat`.

## Segurança e limites
- Não coloque chaves de API no HTML ou no repositório.
- O endpoint ainda não inclui autenticação nem rate limiting; não divulgue publicamente antes de adicionar essas proteções.
- A resposta de IA não equivale a pesquisa web em tempo real; busca externa é uma integração separada.
- Ações são limitadas a uma lista permitida e não executam código arbitrário.
- Operações financeiras reais permanecem desabilitadas; use simulação.
- A disponibilidade e a cota do modelo dependem da conta e das regras atuais da Cloudflare.


## Motor autônomo MR TradLab ZERO

A branch feature/zero-autonomous-50-agents adiciona um motor de simulação contínua com 50 agentes, candles públicos Binance de 1 minuto, previsões avaliadas após 3 minutos, persistência D1 e Cron a cada minuto. A fase é exclusivamente PAPER_ONLY: não há endpoint de ordens, leitura de carteira ou chaves privadas. Consulte ZERO_ENGINE_SETUP.md para ativação e limites.


## Agent Skills (installed in this repository)

Project-level skills are stored in `.agents/skills/` and are available to compatible coding agents:
- `workers-best-practices`: official Cloudflare Workers production guidance.
- `wrangler`: official Wrangler operations/deployment guidance.
- `micelio-trading-review`: trading simulation, strategy validation, and risk review guardrails.
- `d1-cost-optimization`: D1 query/index/batching and preservation of historical learning data.
- `security-review`: endpoint, secrets, CORS, AI action allowlist, and abuse-control review.

See `D1_OPTIMIZATION.md` and migration `0003_engine_evaluation_index.sql` for the evaluation-cycle optimization. Apply migration 0003 to the existing D1 database before relying on the new index.

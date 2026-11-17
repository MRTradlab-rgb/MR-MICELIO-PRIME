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


## Gemma Prime — PAPER TRADING individual

A engine inclui a Gemma como agente individual `gemma-prime`. A cada ciclo alinhado ao horizonte de avaliação (3 minutos), ela recebe somente:
- indicadores calculados a partir dos candles públicos;
- consenso BUY/SELL/HOLD dos 50 agentes do Micélio;
- sinais mais fortes dos agentes e estratégias já cadastradas.

A Gemma escolhe BUY, SELL ou HOLD. BUY/SELL cria uma previsão/operação virtual individual, com preço de entrada, horizonte de 3 minutos e avaliação posterior com taxas e slippage. HOLD ou confiança abaixo de 0,55 não abre operação. Não há envio de ordens a corretoras.

Consulte `GET /engine/agents` para ver a linha `gemma-prime` separada, incluindo total de decisões, operações encerradas, vitórias, derrotas, taxa de acerto e retorno líquido médio. O histórico de cada operação permanece em `engine_forecasts` e `engine_evaluations`.

**Limite da versão:** isto é simulação direcional com avaliação de resultado; ainda não representa uma carteira virtual completa com saldo, quantidade de ativos, gestão de exposição ou curva de patrimônio. A inferência, o cron, D1 e o Worker precisam estar implantados e operacionais para gerar resultados reais de teste.

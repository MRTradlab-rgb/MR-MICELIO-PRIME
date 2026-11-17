# MR TradLab ZERO — Motor autônomo de 50 agentes

## O que esta entrega faz
- Executa um ciclo agendado a cada minuto no Cloudflare Workers.
- Busca candles fechados de 1 minuto da API pública da Binance para BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT e XRPUSDT.
- Mantém 50 agentes: 25 CONSERVADORES e 25 EXPLORADORES, distribuídos em seis famílias de estratégia.
- Gera previsões simuladas BUY/SELL, sem enviar ordens.
- Avalia cada previsão depois de 3 candles e registra o resultado líquido estimado.
- Desconta taxa estimada de 0,10% por lado e slippage estimado de 0,05% por lado.
- Persiste candles, previsões, avaliações e execuções em D1.

## Ativação Cloudflare
1. No banco D1 já destinado ao Micélio Prime (mr-micelio-evolution), execute a migration existente migrations/0001_micelio_evolution.sql se ainda não foi aplicada.
2. Execute migrations/0002_zero_autonomous_engine.sql no mesmo banco.
3. No Worker mr-micelio, confirme o binding D1 com variável DB apontando para esse banco.
4. Crie o secret ENGINE_ADMIN_TOKEN com um valor forte e exclusivo. Não coloque esse token no HTML, GitHub ou mensagens públicas.
5. A configuração wrangler.toml adiciona Cron * * * * *. Após publicar esta branch na configuração do Worker, confirme que o Cron Trigger está ativo.
6. Faça deploy e consulte GET /engine/status. A resposta deve mostrar 50 agentes e mode: PAPER_ONLY.

## Endpoints
- GET /engine/status: estado, contadores e última execução.
- GET /engine/agents: ranking exploratório dos 50 agentes.
- POST /engine/seed: inicializa os 50 agentes; exige Authorization: Bearer ENGINE_ADMIN_TOKEN.
- POST /engine/tick: executa um ciclo manual; exige o mesmo Bearer token. O Cron executa automaticamente.

## Limitações deliberadas desta fase
- O ciclo é de um minuto com candles REST fechados, não um WebSocket persistente por segundo.
- A fase atual não cria ordens, não lê saldo, não acessa carteira, não recebe chaves Binance e não possui endpoint de execução.
- A previsão é uma hipótese estatística, não uma garantia de acerto.
- O cálculo líquido usa custos estimados; deve ser calibrado com a conta/mercado e validado em amostras fora do treino.
- Os resultados deste motor ainda não são automaticamente enviados para as recompensas COX do módulo Evolution. Primeiro precisamos validar a integridade do produtor de previsões e das avaliações.
- Para promover estratégias, exigir amostras independentes, rentabilidade líquida, drawdown e estabilidade por ativo/regime. Acurácia isolada não basta.

## Arquitetura cooperativa
O módulo executa os 50 agentes sem hierarquia de rainha. Prime coordena e mantém o serviço, enquanto a população de agentes conserva avaliações individuais. A futura comunicação entre micélios deve consumir somente resultados validados e identificados, sem depender de uma única instância para continuar o trabalho.


## Centro de Logs e Aprendizado

A branch também inclui uma tela estática em `public/logs.html`, servida pelo Worker em `/logs` por meio do binding de Assets no `wrangler.toml`.

- `GET /engine/logs?limit=50&offset=0`: retorna execuções persistidas no D1, com candles/indicadores resumidos, 50 sinais individuais do Micélio por ativo, decisão da Gemma, motivo, previsões criadas e avaliações do ciclo.
- A tela `/logs` consulta `/engine/status`, `/engine/agents` e `/engine/logs`.
- Filtros: oponente, ativo, direção, agente e estratégia.
- Exportação local: JSON completo e CSV das decisões filtradas.
- Os registros são mantidos no D1 em `engine_runs.details`; o download cria uma cópia no aparelho. O histórico não deve ser confundido com aprendizagem permanente do modelo.
- Não é necessário criar nova tabela ou migration: a tela reutiliza a tabela `engine_runs` já criada pela migration 0002.

Depois de publicar a branch com o novo binding de Assets e o Worker atualizado, abra `/logs`. Se o banco ainda não tiver a migration 0002 aplicada, a tela informará falha de consulta; aplique a migration antes de usar.

## Preparação do ledger da corrida (migration 0004)
A migration `0004_race_ledger.sql` cria o schema canônico para:
- estado global da corrida;
- carteiras Gemma Prime e Micélio Ensemble, com US$ 10 de caixa inicial;
- posições por competidor/ativo;
- operações idempotentes por chave de execução;
- decisões, sinais individuais dos agentes e snapshots de patrimônio.

Ela preserva as tabelas provisórias criadas pela migration 0003, renomeando-as para sufixo `_legacy`; não apaga os registros anteriores. **Não execute manualmente a migration isolada fora da ordem do Wrangler.** Primeiro confira `wrangler d1 migrations list mr-micelio-prime-db`, depois aplique as migrations pendentes.

## API inicial de leitura da corrida
- `GET /race/status`: estado, carteiras, marcação das posições, validade dos candles disponíveis e lista de agentes.
- `GET /race/leaderboard`: ranking por patrimônio calculado.
- `GET /race/portfolio?competitor=gemma-prime|micelio-ensemble`
- `GET /race/history`: operações registradas, com filtros de competidor/ativo/período.
- `GET /race/export?format=json|csv`: exporta trades, decisões e snapshots.
- `POST /race/stop`: rota administrativa protegida.
- `POST /race/start`: permanece deliberadamente bloqueada com HTTP 409 até que o ciclo de previsões seja integrado ao ledger de operações e passe pelos testes de ponta a ponta.

## Testes do núcleo de risco
O módulo puro `src/race-core.mjs` contém cálculo de equity, validação de preço/idade, sizing limitado, execução BUY/SELL sem crédito ou venda descoberta e consenso auditável. Os testes estão em `tests/race.test.mjs` e são executados por `npm test` e GitHub Actions.

## Limite atual — sem largada
O schema, os cálculos puros e endpoints de leitura estão preparados no código. Ainda falta integrar o ciclo do Cron às decisões e operações do ledger (incluindo HOLD, posições, fechamento, snapshots e detecção do vencedor). Portanto, as carteiras semeadas pela migration não significam que a corrida esteja rodando. Não publicar como corrida ativa até concluir essa integração, aplicar as migrations no D1 remoto, fazer deploy e validar o runtime.

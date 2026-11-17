# MR TradLab ZERO — implementação da corrida

## Estado real desta branch
**PREPARAÇÃO TÉCNICA PARCIAL — CORRIDA NÃO INICIADA.** O motor antigo gera previsões individuais e avalia previsões; ainda não executa o ledger de carteiras. O endpoint `POST /race/start` responde HTTP 409 até essa integração existir.

## Schema
- `0003_race_portfolios.sql`: schema provisório histórico.
- `0004_race_ledger.sql`: schema canônico solicitado para `race_state`, `race_wallets`, `race_positions`, `race_trades`, `race_decisions`, `race_agent_signals` e `race_snapshots`.
- A migration 0004 renomeia as tabelas provisórias para `*_legacy` sem apagar seus registros e sem alterar as tabelas engine/evolution.
- A migration semeia duas carteiras com US$ 10 virtuais. Isso só acontece no D1 depois da aplicação remota das migrations.

## Limites definidos
- Taxa estimada: 0,10% por lado.
- Slippage estimado: 0,05% por lado.
- Sem crédito virtual e sem venda descoberta.
- Tamanho máximo de entrada: 25% do patrimônio.
- Exposição agregada máxima: 50% do patrimônio.
- Máximo por posição: 50% do patrimônio.
- Meta: US$ 1.000 de patrimônio líquido confirmado.

## Implementado no código
- `src/race-core.mjs`: funções puras de validação de mercado, equity, sizing, execução BUY/SELL e consenso auditável.
- `tests/race.test.mjs`: testes unitários do núcleo.
- `race.js`: APIs de leitura de status, leaderboard, carteira, histórico e exportação JSON/CSV; rota administrativa de parada.
- `POST /race/start`: permanece bloqueada explicitamente até o ledger estar conectado ao Cron/engine.
- `engine.js`: universo de dados ampliado para os 11 símbolos pedidos.
- GitHub Actions: testes do núcleo e verificação sintática do Worker, engine, evolution e race.

## Bloqueios de largada
1. Integrar sinais e decisões do motor ao ledger para ambos os competidores, registrando inclusive HOLD e os 50 sinais individuais.
2. Implementar abertura/fechamento idempotente de posições, caixa, custos, P&L realizado/não realizado e snapshots em cada ciclo.
3. Garantir transações seguras contra execuções concorrentes e recuperar estado após reinício.
4. Integrar cálculo de drawdown e detecção de vencedor.
5. Validar a migration 0004 no D1 remoto e confirmar as duas carteiras reais no banco.
6. Publicar o Worker e validar todos os endpoints em runtime.
7. Finalizar o painel com comparação de carteiras, operações e evolução real.

Nenhum deploy, migration remota, carteira ativa ou corrida em execução é declarado por esta documentação.

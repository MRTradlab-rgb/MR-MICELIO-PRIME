# MR TradLab ZERO — implementação das carteiras da corrida

## Estado atual
A corrida continua **LOCKED / NÃO INICIADA**. A migration `0003_race_portfolios.sql` cria a estrutura persistente para carteiras, posições e ledger, mas a criação do schema, sozinha, não significa que o motor já esteja executando operações de carteira.

## Estrutura criada
- `race_state`: estado global, meta, custos e limites de exposição.
- `race_wallets`: caixa, P&L realizado, taxas e estado de cada competidor.
- `race_positions`: posições independentes vinculadas a uma chave de previsão única.
- `race_ledger`: trilha contábil idempotente para funding, abertura, fechamento e eventos da corrida.

## Parâmetros iniciais previstos
- Gemma Prime e Micélio Ensemble: US$ 10,00 cada.
- Meta de patrimônio líquido: US$ 1.000,00.
- Taxa estimada por lado: 0,10%.
- Slippage estimado por lado: 0,05%.
- Tamanho máximo por posição: 10% do patrimônio de referência.
- Exposição total máxima: 50%.

## Bloqueios antes da largada
1. Integrar a criação de posições aos sinais exclusivos de `gemma-prime` e `micelio-ensemble`; os 50 agentes individuais não podem ser confundidos com o competidor Micélio Ensemble.
2. Integrar fechamento de posições aos preços válidos no horizonte da previsão.
3. Implementar cálculo de equity, P&L realizado/não realizado, custos e bloqueios de risco.
4. Implementar endpoints de status, carteiras, operações, histórico e início/parada protegidos.
5. Executar migration no D1, testar idempotência e concorrência e validar o Worker publicado.
6. Somente então alterar o estado para READY e permitir início administrativo.

Nenhuma carteira, operação, vitória ou saldo deve ser apresentado como real antes de existir registro persistido e validação de runtime.

## Endpoints iniciais adicionados
- `GET /race/status`: consulta o estado, carteiras e contagens; retorna bloqueios explícitos.
- `POST /race/initialize`: inicializa idempotentemente o estado LOCKED e os dois caixas de US$ 10; exige `Authorization: Bearer ENGINE_ADMIN_TOKEN`.

A inicialização não abre operações e não inicia a corrida. A API foi adicionada ao Worker, mas depende do deploy e da migration 0003 aplicada no D1. A integração de posições com as previsões ainda não foi concluída.

# MR TradLab ZERO — Corrida Gemma Prime vs. Micélio

## Estado
PREPARADA — NÃO INICIADA. Este documento define a proposta da corrida; não representa execução, deploy ou resultado em tempo real.

## Objetivo
Comparar, em PAPER TRADING, duas inteligências independentes:
- `gemma-prime`
- `micelio-ensemble` (consenso auditável dos 50 agentes)

Cada carteira começa com US$ 10,00 virtuais. A primeira a atingir patrimônio líquido de US$ 1.000,00 vence. A corrida termina automaticamente quando uma carteira atingir a meta, após confirmação contábil e de preços válidos.

## Prêmio provisório — sem valor financeiro
Até que exista uma recompensa material aprovada, o prêmio será honorífico e digital:
- título permanente de **Campeã da Corrida MR TradLab ZERO**;
- troféu digital com identificação da vencedora, data, patrimônio final e hash/ID do relatório auditável;
- registro no Hall da Vitória do MR TradLab.

Nenhum prêmio em dinheiro, criptoativo, participação societária ou direito financeiro está prometido. Uma recompensa material futura dependerá de decisão expressa e regras próprias, sem alterar retroativamente os resultados.

## Regras de comparação
1. Mesmo capital inicial, universo de ativos, feed de preços, timestamps, custos estimados e regras de execução simulada para ambas.
2. As carteiras e posições são independentes; uma não pode usar o saldo ou as posições da outra.
3. O Micélio decide com base em um método de consenso documentado dos 50 agentes; votos, divergências e agentes participantes devem ser registrados.
4. Gemma decide de forma independente, podendo considerar os sinais dos agentes como informação, sem copiar automaticamente o consenso.
5. Avaliação contínua dos preços e sinais não significa abrir uma operação a cada atualização. Entradas dependem de critérios de sinal, exposição, risco e prevenção de duplicidade.
6. Registrar cada decisão, inclusive HOLD/NO TRADE, e cada operação com ativo, lado, horário, preço observado, quantidade, estratégia, custos, motivo e resultado.
7. Patrimônio = caixa + posições marcadas a preço válido − passivos/crédito virtual. Mostrar P&L realizado e não realizado separadamente.
8. Não inventar cotações. Se o feed estiver ausente, atrasado ou inválido, suspender novas entradas e marcar o estado como DATA_PAUSED.
9. Taxas e slippage devem ser parâmetros iguais para as duas carteiras, identificados como estimativas até serem calibrados.
10. Atingir a meta exige patrimônio líquido confirmado de pelo menos US$ 1.000,00, não apenas lucro não realizado isolado ou pico momentâneo sem validação.

## Saldo negativo e risco
Saldo negativo não pode surgir de forma implícita nem permitir alavancagem ilimitada. Antes da largada, implementar e documentar um limite explícito de crédito virtual, custo desse crédito (se houver), limite de exposição e regra de bloqueio. Se o limite for atingido, a carteira entra em estado de risco/bloqueio, sem apagar perdas nem reiniciar o saldo. A regra deve ser idêntica para as duas carteiras.

## Critérios de largada — todos obrigatórios
- [ ] Duas carteiras persistentes e independentes com US$ 10,00 cada.
- [ ] Motor de posições, quantidades, caixa, P&L realizado/não realizado e patrimônio.
- [ ] Universo de ativos definido e feed ao vivo validado; nenhum preço inventado.
- [ ] Avaliação de agentes/estratégias com cadência e timestamps auditáveis.
- [ ] Regras de consenso do Micélio e decisão independente da Gemma.
- [ ] Taxas, slippage, sizing, exposição, crédito virtual e limites de risco implementados igualmente.
- [ ] Endpoints de status, carteiras, operações e histórico.
- [ ] Testes de cálculo, idempotência, preço atrasado, saldo negativo, bloqueio e condição de vitória.
- [ ] Deploy confirmado e endpoint de status verificado em runtime.
- [ ] Comando administrativo de início protegido; corrida só começa após todas as verificações.

## Integridade
Até que todos os critérios sejam concluídos e verificados em runtime, o painel deve exibir **AGUARDANDO LARGADA**. Não exibir carteiras, operações, vencedora ou progresso fictícios.

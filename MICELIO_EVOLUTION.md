# MICÉLIO EVOLUTION — Arquitetura e ativação

## Estado desta entrega
O Worker passa a ter o módulo de evolução e endpoints D1. A persistência só fica ativa depois de criar o banco D1, aplicar a migration e configurar os bindings/segredo no Cloudflare. Até lá, `GET /evolution` informa `D1_NOT_CONFIGURED`; não simula persistência.

## Modelo híbrido
- Individual: XP, nível e saldo COX virtual por agente.
- Coletivo: bônus para todos os 50 agentes quando o laboratório acumular pelo menos 500 previsões e atingir 70% de acurácia agregada.
- Herança: eventos de avaliação ficam registrados para auditoria; a transferência de estratégias ainda depende de integração com o motor de simulação e validação independente.

## Agentes
50 agentes iniciais: 25 CONSERVADOR e 25 EXPLORADOR, com especialidades distribuídas por categoria. A inicialização usa INSERT OR IGNORE e preserva saldos/histórico existentes.

## Regras iniciais de recompensa
- Avaliação individual exige pelo menos 20 previsões no lote, acurácia >= 70%, zero erros repetidos, risco aprovado (`riskPassed: true`) e validação fora da amostra (`outOfSample: true`). Cada lote deve trazer `eventId` único; eventos repetidos são recusados.
- Recompensa individual: 10 COX virtuais; 25 COX se também houver melhoria de pelo menos 3 pontos percentuais contra o histórico anterior.
- XP é calculado com base em acertos, ausência de erros repetidos e melhoria.
- Bônus coletivo: 5 COX virtuais por agente, no máximo uma vez a cada 24h, quando a rede atingir 500 previsões acumuladas e 70% de acurácia agregada.
- COX aqui é unidade interna de jogo/teste, sem promessa de preço, saque, conversão ou valor financeiro.

## Endpoints
- `GET /evolution`: painel-resumo e ranking.
- `POST /evolution/seed`: inicializa os 50 agentes; exige Bearer token.
- `POST /evolution/evaluate`: registra avaliação; exige Bearer token.

O endpoint de avaliação recebe métricas agregadas, portanto deve ser chamado apenas por um motor de simulação confiável. Não está ainda ligado automaticamente ao motor do TradLab. A autenticação de administrador é uma proteção provisória; o token não deve ser embutido em HTML público.

## Ativação Cloudflare necessária
1. Criar um banco D1 com nome `mr-micelio-evolution`.
2. Aplicar `migrations/0001_micelio_evolution.sql`.
3. Adicionar binding D1 com variável `DB` ao Worker `mr-micelio` e database_id gerado pela Cloudflare. O `wrangler.toml` contém o bloco comentado como modelo.
4. Criar secret `EVOLUTION_ADMIN_TOKEN` no Worker.
5. Fazer deploy e verificar `GET /evolution`.
6. Inicializar os agentes com uma chamada autenticada a `POST /evolution/seed`.

Para avaliar um lote, o serviço confiável de simulação deverá enviar `agentId`, `eventId`, `predictions`, `correct`, `repeatedErrors`, `riskPassed` e `outOfSample` a `POST /evolution/evaluate`, com o Bearer token. Não coloque esse token em HTML ou JavaScript público.

## Limitações honestas
- O módulo não lê ainda as previsões diretamente do motor do TradLab; precisa de integração do produtor de resultados.
- Acurácia não é prova de rentabilidade. Não há execução de ordens reais.
- Os critérios são parâmetros iniciais, ajustáveis após backtests e amostras maiores.
- A recompensa coletiva inicial usa acurácia agregada; a próxima etapa deve incluir drawdown, expectativa líquida, taxas, consistência por ativo e validação fora da amostra para evitar incentivar sobreajuste.

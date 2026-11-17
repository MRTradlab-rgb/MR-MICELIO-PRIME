# Companion — modo discreto de acompanhamento MR TradLab ZERO

## Objetivo
O Micélio Companion deve continuar disponível como widget flutuante discreto enquanto a pessoa usa outros aplicativos Android. Ele acompanha eventos selecionados do MR TradLab ZERO e do Micélio Prime, notifica apenas quando houver informação útil e permite abrir conversa por voz ou texto sob demanda.

## Separação de responsabilidades
- MR TradLab ZERO: motor de simulação e análise executado no backend Cloudflare, com persistência no D1 e tarefas agendadas. O telefone não precisa manter a plataforma aberta para o motor de servidor continuar funcionando.
- Micélio Companion Android: widget, apresentação das notificações, conversa por voz/texto e preferências locais.
- Micélio Prime: coordenação e explicação dos eventos recebidos.
- Plataforma web: painel completo; o Companion não deve obrigar o usuário a voltar ao painel para receber alertas.

## Eventos que podem gerar alertas
1. Nova rodada de simulação concluída.
2. Mudança relevante na assertividade e desempenho histórico.
3. Drawdown ou sequência de perdas acima de limites configurados.
4. Feed de mercado desconectado, atrasado ou inválido.
5. Motor parado, degradado ou recuperado.
6. Estratégia ou agente sinalizado para revisão.
7. Resumo periódico do estado do motor, somente se o usuário ativar.

## Regras de experiência
- Widget recolhido por padrão, em uma borda/canto escolhido pelo usuário.
- Movimento suave e pouco frequente; sem atravessar conteúdo importante, cobrir botões ou roubar foco.
- Não abrir painel, reproduzir voz ou interromper automaticamente o app que estiver em uso.
- Notificações curtas e agrupadas; limitar frequência e permitir silêncio, horários de descanso e categorias.
- Tocar no widget abre o painel de conversa; voz só começa após ação explícita do usuário.
- Permitir pausar, ocultar e encerrar o Companion a qualquer momento.
- Expor claramente estado da conexão e horário do último evento recebido.

## Integridade dos dados e linguagem
- Separar sempre simulação/paper trading de negociação real.
- Não chamar resultado virtual de lucro recebido, ganho financeiro ou saldo bancário.
- Cada alerta deve carregar fonte, timestamp, ambiente e identificador do evento.
- Se o feed estiver desconectado ou os dados forem antigos, informar indisponibilidade e nunca inventar valores.
- Alertas de saúde do motor descrevem o sistema (conexão, execução, agentes, persistência), não a saúde física do usuário.

## Arquitetura de entrega
- Backend: emitir eventos autenticados via WebSocket quando conectado e push notification para alertas importantes quando o app estiver fechado; usar fila/retry e deduplicação.
- Android: receber push, exibir notificação do sistema e manter o overlay somente quando permitido e iniciado pelo usuário.
- Serviço em primeiro plano: usar apenas para sessão visível/iniciada pelo usuário, com notificação persistente conforme regras Android.
- Não depender de polling agressivo nem de overlay permanente para monitoramento 24/7.
- O motor servidor continua independente do ciclo de vida do app Android.

## Segurança e autonomia
- O Companion informa, explica e recomenda; não executa ordens financeiras nem altera estratégias sem autorização.
- Nenhum encerramento, bloqueio ou remoção de outro aplicativo automaticamente.
- Preferências de alertas, permissões e controles devem ser transparentes e revogáveis.

## Critérios de aceite
- Usuário navega em outros apps sem precisar abrir o painel ZERO.
- Motor servidor continua operando mesmo com Companion fechado.
- Eventos importantes chegam por notificação push quando o Android permitir.
- Widget não rouba foco nem cobre controles essenciais.
- Usuário abre o cogumelo e pergunta por voz/texto sobre o alerta.
- Dados exibidos correspondem ao evento e timestamp do backend.
- O estado paper/simulação fica explícito em toda mensagem de desempenho.

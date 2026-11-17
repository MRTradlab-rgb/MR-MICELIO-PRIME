# Companion — visão Gemini existente + movimento autônomo

## Correção do entendimento do produto

O usuário já possui uma experiência Gemini em que:
- a tela é espelhada/compartilhada com consentimento;
- Gemini recebe o contexto visual da página em tempo real;
- áudio pode ser enviado e a conversa é falada em voz alta;
- Gemini interpreta o conteúdo que aparece na tela.

O Companion não deve substituir essa experiência nem criar um segundo fluxo de visão concorrente. A integração desejada é reutilizar o mesmo fluxo de tela/áudio já funcional e acrescentar um corpo visual autônomo.

## Comportamento esperado

1. **Visão:** consumir os frames, OCR ou elementos estruturados já produzidos pelo fluxo Gemini autorizado. Não presumir que o Companion tem acesso à tela se esse fluxo não estiver conectado.
2. **Localização:** obter caixas/posições de elementos relevantes (botões, menus, gráficos, avisos e controles) com coordenadas normalizadas e timestamp.
3. **Decisão:** escolher um alvo visual por relevância, proximidade e contexto da conversa. Não escolher coordenadas a partir de texto sem evidência visual recente.
4. **Movimento:** motor local no Android anima o cogumelo suavemente até o alvo, aponta/realça e retorna à posição de descanso. A animação não deve depender de uma chamada de IA por frame.
5. **Interação:** ao explicar um elemento, mostrar gesto/ponteiro e fala sincronizada. Não clicar, digitar, enviar ou executar ações sem autorização explícita.
6. **Navegação:** ao mudar de página, atualizar os alvos a partir dos novos frames. Se a tela ficar indisponível, parar de perseguir elementos e indicar que a visão está pausada.
7. **Áudio:** preservar o canal de áudio que já funciona no Gemini; o Companion pode usar TTS local para falas próprias, evitando duplicar ou sobrepor duas vozes.
8. **Privacidade:** captura e microfone sempre indicados e controlados pelo usuário; botão para pausar/encerrar; não armazenar frames/áudio por padrão.

## Movimento implementado nesta atualização

O serviço Android agora tem uma rotina local de deslocamento autônomo em duas dimensões, com alvos temporários, suavização, limites de tela e pausa quando o painel de conversa está aberto ou o usuário arrasta o cogumelo.

Isso resolve apenas a movimentação livre básica. Ainda NÃO é movimento guiado pela visão: a rotina ainda não recebe caixas delimitadoras do Gemini nem sabe onde estão botões ou gráficos.

## Próxima integração técnica obrigatória

Definir um contrato de eventos entre o fluxo Gemini já existente e o Android Companion, por exemplo:

```json
{
  "type": "screen_targets",
  "capturedAt": "2026-11-17T12:00:00Z",
  "sessionId": "opaque-session-id",
  "targets": [
    {
      "label": "Botão Enviar",
      "kind": "button",
      "x": 0.82,
      "y": 0.91,
      "width": 0.14,
      "height": 0.06,
      "confidence": 0.96
    }
  ]
}
```

Coordenadas normalizadas entre 0 e 1. Rejeitar eventos antigos, de outra sessão ou com confiança baixa. O Android converte o alvo normalizado em posição de tela e faz a animação local. Não enviar coordenadas de volta para Gemini em cada frame.

## Critérios de aceite

- O Companion se move mesmo sem o usuário tocar nele.
- Quando recebe um alvo visual válido e recente, aproxima-se desse elemento e aponta para ele.
- Ao mudar de página, abandona alvos antigos e usa os novos.
- Se a visão parar, deixa de fingir que está vendo a tela.
- Voz e áudio existentes continuam funcionando sem eco/dupla fala.
- Nenhum clique ou ação sensível ocorre automaticamente.
- Movimento é fluido, discreto, não cobre controles e pode ser pausado imediatamente.

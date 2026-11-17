# MICÉLIO COMPANION — protótipo 0.1

Este branch adiciona o primeiro esqueleto do Companion ao repositório Micélio Prime.

## Entregue nesta base
- Projeto Android nativo Kotlin (Android Studio / Gradle).
- Cogumelo flutuante sobre outros apps, iniciado pelo próprio usuário.
- Movimento autônomo simples e arraste manual.
- Painel de conversa, envio de texto, reconhecimento de voz e resposta falada.
- Cliente HTTP para o endpoint existente do Micélio Prime: `https://mr-micelio-prime.felipe-revolt.workers.dev/chat`.
- Demonstração web em `companion-web/index.html`, com cogumelo animado, chat e entrada por voz.

## Como abrir
1. Abra a pasta `companion-android` no Android Studio.
2. Aguarde a sincronização Gradle.
3. Instale em um Android físico.
4. Abra o app e autorize "Exibir sobre outros apps" e o microfone.
5. Toque em "ATIVAR COGUMELO FLUTUANTE".

## Limites desta versão
- Ainda não é APK compilado nem testado em aparelho físico.
- O endpoint Prime é usado como integração experimental; sua disponibilidade e configuração AI precisam ser confirmadas no teste.
- Ainda não há AccessibilityService, MediaProjection, análise de sites, proteção antiphishing, monitoramento de apps ou ações de bloqueio.
- A voz usa o reconhecimento e a síntese disponíveis no Android.
- A demonstração web não controla outras abas nem compartilha a tela.
- O serviço em primeiro plano mantém uma notificação visível e pode ser encerrado pelo usuário.
- A movimentação é uma animação local simples; o entendimento contextual de onde apontar será uma etapa posterior.

## Próximas entregas
1. Compilar e corrigir no Android Studio.
2. Validar /health e /chat do Worker Prime.
3. Implementar integração de sessão entre web e Android.
4. Adicionar AccessibilityService e MediaProjection com consentimento.
5. Implementar análise segura de links e alertas, sem remoção ou bloqueio automático de apps.

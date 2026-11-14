# MR Micélio Prime

Backend inicial do MR Micélio Prime para conectar o painel ZERO v0.6 ao Cloudflare Workers AI.

## Endpoints
- GET /health — verifica o serviço e se o binding AI está configurado.
- POST /chat — recebe conversa/contexto e devolve resposta do modelo.

## Publicação
1. Crie um Cloudflare Worker chamado mr-micelio-prime.
2. Publique o conteúdo de worker.js.
3. Em Settings > Bindings, adicione Workers AI com variável AI.
4. Faça Deploy e teste /health. Só considere conectado quando retornar ok:true e status:READY.
5. No ZERO v0.6, informe a URL base do Worker, sem /chat.

## Segurança e limites
- Não coloque chaves de API no HTML ou no repositório.
- O endpoint ainda não inclui autenticação nem rate limiting; não divulgue publicamente antes de adicionar essas proteções.
- A resposta de IA não equivale a pesquisa web em tempo real; busca externa é uma integração separada.
- Ações são limitadas a uma lista permitida e não executam código arbitrário.
- Operações financeiras reais permanecem desabilitadas; use simulação.
- A disponibilidade/cota do modelo depende da conta e das regras atuais da Cloudflare.

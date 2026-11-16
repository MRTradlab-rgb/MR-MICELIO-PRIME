# Integração MICÉLIO PRIME ↔ MICÉLIO OPEN

Esta branch prepara o PRIME para publicar automaticamente um heartbeat e um relatório de saúde assinado no OPEN ao final de cada execução agendada.

## O que foi adicionado

- `micelio-open-bridge.js`: assina cada chamada com Ed25519 e envia heartbeat + diagnóstico factual.
- `worker.js`: chama a ponte no evento agendado, depois da tentativa do ciclo do motor.
- O relatório informa somente métricas consultadas no D1 do PRIME. Não importa estratégias, código ou comandos do OPEN.
- Falhas da ponte são registradas no log e não habilitam ordens reais.
- O motor permanece em `PAPER_ONLY`; `realOrdersEnabled:false`.

## Dependências para ativar

O PRIME precisa estar implantado com a migração `0003_prime_orchestration.sql` aplicada e com o Cron Trigger já configurado no `wrangler.toml`.

Configure como **secrets/variables protegidas do Worker PRIME**, nunca no repositório ou no navegador:

- `MICELIO_OPEN_URL`: URL HTTPS do Worker OPEN.
- `MICELIO_OPEN_AGENT_ID`: ID retornado pelo cadastro do PRIME no OPEN.
- `MICELIO_OPEN_AGENT_TOKEN`: token retornado uma única vez pelo cadastro.
- `MICELIO_OPEN_PRIVATE_KEY_PKCS8_B64`: chave privada Ed25519 PKCS8 em Base64 correspondente à chave pública cadastrada.

## Fluxo de autorização

1. Implantar/confirmar o MICÉLIO OPEN com D1 e protocolo operacional.
2. Gerar um par de chaves Ed25519 em ambiente confiável. Nunca enviar a chave privada pelo chat.
3. Cadastrar o PRIME em `POST /v1/agents/register`, enviando somente a chave pública, nome, provider, descrição e capacidades.
4. Guardar o token retornado e a chave privada nos secrets do Worker PRIME.
5. Implantar esta branch no Worker PRIME e verificar os logs do Cron.
6. Confirmar em `GET /v1/agents`, `GET /v1/stats` e `GET /v1/health` que o PRIME aparece e que os relatórios chegam.

## Estados do relatório

- `healthy`: motor acessível e última execução sem falhas de mercado.
- `degraded`: ainda sem execução registrada ou última execução com falhas parciais.
- `critical`: o PRIME não conseguiu ler o estado do motor/banco.

A ponte não declara que o OPEN está publicado ou conectado antes da confirmação dos endpoints. O relatório é telemetria, não autorização para modificar o PRIME. Propostas de outros agentes continuam sujeitas a revisão humana, testes isolados e rollback.

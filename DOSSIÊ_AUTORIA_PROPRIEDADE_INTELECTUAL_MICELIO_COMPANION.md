# Dossiê de autoria e proteção intelectual — Micélio Companion

**Documento de declaração e organização de evidências — versão 1.0**  
**Data da declaração:** 17 de novembro de 2026  
**Projeto:** Micélio Companion  
**Ecossistema:** MR / Micélio Prime  
**Proponente e autor da concepção do produto, conforme declaração do projeto:** Felipe MR  
**Titularidade jurídica definitiva:** a confirmar com identificação civil, cadeia de contribuições, contratos e análise profissional.

> **Natureza deste documento:** declaração de autoria/concepção e registro organizado de evidências do desenvolvimento. Este arquivo, por si só, NÃO é registro oficial no INPI, não concede patente, não garante exclusividade sobre uma ideia abstrata e não substitui aconselhamento jurídico.

## 1. Declaração de concepção

Felipe MR declara ser o proponente da concepção do produto denominado **Micélio Companion**, concebido como um assistente visual interativo, independente de um único fornecedor de inteligência artificial, com presença flutuante e comportamento contextual em dispositivos digitais.

A proposta central é oferecer um corpo visual comum — representado por um ou mais cogumelos digitais — que possa receber instruções de diferentes IAs e agentes compatíveis, interpretar sinais estruturados de contexto visual autorizados e se movimentar pela interface para apontar, destacar ou explicar elementos relevantes, sem assumir o controle do dispositivo.

A concepção foi desenvolvida em conversas e decisões de produto do projeto MR, incluindo a distinção entre inteligência/percepção fornecida por IAs conectadas e o corpo visual/motor local do Companion.

## 2. Elementos específicos documentados

A documentação atual descreve, entre outros, os seguintes elementos de produto e arquitetura:

1. **Corpo visual independente:** Companion não fica limitado a Gemini, ChatGPT, Claude ou qualquer modelo específico.
2. **Protocolo universal:** contrato versionado para integração de provedores e agentes, com identidade autenticada, capacidades, sessão, comandos e confirmações.
3. **Movimento contextual:** IAs autorizadas podem solicitar que o Companion se aproxime de um alvo visual recente e aponte/destaque o elemento.
4. **Múltiplas presenças:** diferentes agentes podem aparecer como pequenos cogumelos, com convites agrupados e apresentação discreta.
5. **Autorização do usuário:** botão geral para autorizar ou pausar interações, permissões individuais por provedor e revogação imediata.
6. **Arbitragem:** apenas um controlador de movimento por vez, por concessão temporária; outros agentes não disputam o controle.
7. **Não intrusividade:** limites de frequência, deduplicação de convites, áreas seguras, redução de animação e proteção de bateria/CPU/rede.
8. **Privacidade:** sem armazenamento padrão de capturas, áudio, conteúdo de conversas ou histórico sensível para estatísticas.
9. **Estatísticas opcionais:** contagens agregadas de convites, aceites, recusas, interações e categorias de consumo de recursos.
10. **Segurança por padrão:** movimento e apontamento não autorizam cliques, digitação, compras, exclusões, instalações ou mudanças de configuração.

## 3. Materiais e evidências técnicas existentes

Os seguintes materiais estão associados ao desenvolvimento no repositório:

- README_COMPANION.md — visão geral do protótipo e limites conhecidos.
- COMPANION_GEMINI_VISION_AUTONOMOUS_MOTION.md — integração conceitual com fluxo de visão existente e movimento contextual.
- COMPANION_UNIVERSAL_AI_PROTOCOL.md — protocolo universal, autorização, múltiplas presenças e interação não intrusiva.
- companion-android/ — protótipo Android Kotlin.
- companion-web/ — demonstração web.
- Histórico de commits e branches do GitHub — evidência cronológica de arquivos e alterações.

Repositório: https://github.com/MRTradlab-rgb/MR-MICELIO-PRIME  
Branch de desenvolvimento: feature/micelio-companion-prototype

**Atenção:** o histórico de commits demonstra a existência e a evolução de arquivos em determinadas datas; não prova sozinho que todas as ideias ou todos os direitos pertencem exclusivamente a uma pessoa. Preserve cópias locais, exportações do histórico e documentos originais, além de contratos e comprovantes de contribuição.

## 4. Delimitação do que se pretende proteger

A proteção deve ser analisada por categoria, sem confundir conceito abstrato com obra concreta:

- **Código-fonte e código-objeto:** avaliar registro de programa de computador no INPI quando a versão estiver suficientemente desenvolvida.
- **Textos, diagramas, documentação, ilustrações e materiais originais:** preservar versões e avaliar registro autoral adequado.
- **Nome e logotipo “Micélio Companion” / marcas MR:** pesquisar anterioridade e avaliar pedido de registro de marca no INPI nas classes pertinentes.
- **Alegada solução técnica patenteável:** somente após análise de novidade, atividade inventiva, aplicação industrial e matéria patenteável por profissional especializado. Não presumir que um método de software ou ideia de interface seja patenteável.
- **Segredos de negócio e informações não publicadas:** manter repositórios privados, controle de acesso e acordos de confidencialidade quando apropriado.

## 5. Aviso de direitos e ausência de licença

Salvo autorização escrita do titular legítimo ou licença expressa publicada para um material específico, este dossiê e os materiais originais identificados nele não concedem autorização para reprodução, adaptação, distribuição, comercialização, sublicenciamento ou apresentação como obra própria.

Acesso público a um repositório, conversa, demonstração ou documento não deve ser interpretado como cessão automática de direitos ou licença comercial. A titularidade de cada contribuição deve ser verificada, inclusive quanto a código, bibliotecas, componentes de terceiros e conteúdo gerado ou assistido por ferramentas de IA.

Este aviso não cria direitos sobre ideias, métodos ou funcionalidades abstratas que a legislação não proteja, nem impede desenvolvimento independente lícito por terceiros.

## 6. Medidas em caso de uso não autorizado

Se houver suspeita de cópia ou exploração indevida de material efetivamente protegido:

1. preservar URLs, datas, capturas, arquivos originais, histórico de versões, commits e comunicações;
2. identificar precisamente o material copiado e comparar versões, evitando acusações baseadas apenas em semelhança de conceito;
3. obter orientação de advogado especializado em propriedade intelectual;
4. avaliar notificação extrajudicial, pedido de remoção ou cessação de uso, negociação/licenciamento e, se cabível, medidas judiciais;
5. avaliar tutela de urgência, produção antecipada de prova, indenização por danos materiais e/ou morais e demais medidas legalmente cabíveis, conforme os fatos e a prova.

Não existe multa, juros ou indenização automática fixada por este documento. Valores, juros, perdas e danos, custas e medidas processuais dependem da lei aplicável, dos contratos, da prova e de eventual decisão ou acordo.

## 7. Próximas providências recomendadas

- Confirmar o nome civil completo e os dados do titular que serão usados em pedidos oficiais; não inserir documentos pessoais neste repositório público.
- Fazer inventário de autores e colaboradores, incluindo contribuições humanas e ferramentas de IA utilizadas.
- Guardar cópia privada e imutável das versões relevantes e dos arquivos-fonte.
- Avaliar tornar privado o repositório enquanto houver informação comercial ou técnica confidencial.
- Finalizar uma versão identificável do software e estudar o registro de programa de computador no INPI, com hash criptográfico e assinatura digital exigidos pelo procedimento.
- Pesquisar e, se viável, depositar a marca no INPI antes de divulgação comercial ampla.
- Consultar advogado de propriedade intelectual para definir titularidade, contratos de colaboração, termos de uso, licenças e estratégia de proteção.

## 8. Referências oficiais para o Brasil

- INPI — Registro de Programa de Computador: https://www.gov.br/pt-br/servicos/solicitar-o-registro-de-programa-de-computador
- INPI — Guia básico de programa de computador: https://www.gov.br/inpi/pt-br/servicos/programas-de-computador/guia-basico
- INPI — Perguntas frequentes sobre programas de computador: https://www.gov.br/inpi/pt-br/acesso-a-informacao/perguntas-frequentes/programas-de-computador
- Biblioteca Nacional — Orientações gerais sobre direitos autorais: https://www.gov.br/bn/pt-br/atuacao/direitos-autorais-1/perguntas-frequentes-1/copy_of_orientacoes-gerais

## 9. Declaração para assinatura

Eu, **Felipe MR**, declaro que as informações acima representam, de boa-fé, a concepção e o histórico de desenvolvimento que reivindico para o Micélio Companion, ciente de que a titularidade jurídica e o alcance de proteção de cada elemento dependem de documentação, contribuições efetivas, legislação e análise competente.

Local e data: ______________________________________

Nome civil completo: ________________________________

Assinatura: _________________________________________

---

**Controle de versão:** v1.0 — 17/11/2026  
**Status:** dossiê de autoria organizado; registro oficial e validação jurídica ainda não realizados.
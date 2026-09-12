# Análise LGPD — Replay já 2.0

> **Status:** minuta técnica interna, escrita em **12/09/2026** pelo responsável jurídico-operacional.
> **Não é parecer jurídico.** Quem assina parecer é advogado inscrito na OAB. Este documento existe para
> (a) mapear o que o produto realmente faz com dado pessoal, (b) propor uma posição defensável para o piloto
> e (c) entregar ao advogado um material já mastigado, com os pontos de dúvida marcados.
>
> Todos os trechos marcados **[REVISAR COM ADVOGADO]** são pontos em que existe risco relevante, leitura
> dupla razoável, ou em que a recomendação conservadora custa dinheiro/produto e precisa de decisão informada.
>
> Documentos-irmãos: `termos-de-uso.md`, `politica-de-privacidade.md`, `contrato-arena-anexo-lgpd.md`,
> `sinalizacao-quadra.md`, `fluxo-remocao.md`.
> Fontes internas lidas: `docs/PRD.md`, `docs/PLANO.md`, `docs/api/README.md` §3, `docs/gtm/proposta-piloto.md` §6,
> `docs/adr/0001-stack-e-arquitetura.md`.

---

## Sumário

0. [Antes de tudo: três inconsistências internas que precisam ser resolvidas](#0-antes-de-tudo-três-inconsistências-internas-que-precisam-ser-resolvidas)
1. [O que o produto faz, em linguagem de LGPD](#1-o-que-o-produto-faz-em-linguagem-de-lgpd)
2. [Mapeamento de dados pessoais tratados](#2-mapeamento-de-dados-pessoais-tratados)
3. [Base legal proposta para cada tratamento](#3-base-legal-proposta-para-cada-tratamento)
4. [Teste de legítimo interesse (LIA) da captação de imagem](#4-teste-de-legítimo-interesse-lia-da-captação-de-imagem)
5. [Papéis: quem é controlador, quem é operador](#5-papéis-quem-é-controlador-quem-é-operador)
6. [RIPD simplificado — gravação contínua de 12 h/dia](#6-ripd-simplificado--gravação-contínua-de-12-hdia)
7. [Direitos do titular e como atender](#7-direitos-do-titular-e-como-atender)
8. [Retenção e eliminação](#8-retenção-e-eliminação)
9. [Menores de idade em quadra](#9-menores-de-idade-em-quadra)
10. [Compartilhamento por terceiros em redes sociais](#10-compartilhamento-por-terceiros-em-redes-sociais)
11. [Transferência internacional](#11-transferência-internacional)
12. [Segurança da informação e incidentes](#12-segurança-da-informação-e-incidentes)
13. [Checklist do que é obrigatório antes de gravar a primeira partida](#13-checklist-do-que-é-obrigatório-antes-de-gravar-a-primeira-partida)
14. [Fontes](#14-fontes)

---

## 0. Antes de tudo: três inconsistências internas que precisam ser resolvidas

Estas não são questões jurídicas — são erros de documentação que **viram** questões jurídicas no momento em que
a Política de Privacidade for publicada. Publicar um prazo de retenção que o sistema não cumpre é violação direta
do princípio da transparência (LGPD, art. 6º, VI) e do art. 9º, e é o tipo de coisa que a ANPD encontra em cinco minutos.

| # | Conflito | Onde | Efeito |
|---|---|---|---|
| **I-1** | **Retenção de clipe: 90 dias ou 30 dias?** `PLANO.md` (decisão 5) e o briefing deste trabalho dizem **90 dias**. `adr/0001` §3/§5 e `api/README.md` §6 (mensagem de erro `clip-expired` visível ao usuário) dizem **30 dias**. `proposta-piloto.md` §6 diz 30 dias. | PLANO vs ADR/API/GTM | A Política de Privacidade e os Termos não podem ser escritos antes disso ser fechado. **Estes documentos usam 90 dias**, conforme o briefing, mas o texto de erro da API, o `purge_expired_media` e a `proposta-piloto` precisam ser corrigidos junto — ou o número da Política precisa virar 30. |
| **I-2** | **Retenção da sessão completa: 7 dias ou 14 dias?** Briefing, `PLANO.md` e a `adr/0001` rev. 3 dizem **7 dias**; `proposta-piloto.md` §6 (argumento de venda dado ao dono da arena) ainda diz **14 dias**. | PLANO vs ADR/GTM | **Recomendação conservadora: 7 dias.** Menos vigilância retida é menos risco, e o custo cai. Se marketing já prometeu 14 a alguma arena, a promessa é que muda. |
| **I-3** | **Papéis:** `proposta-piloto.md` §6 afirma "contrato define a arena como controladora e nós como operadores". `api/README.md` §3 afirma "a base legal do tratamento é legítimo interesse do parceiro". **Nenhuma das duas se sustenta** — ver §5. | GTM/API vs realidade do produto | Se o contrato da arena for assinado com a cláusula errada, ele precisa ser aditado depois. Corrigir **antes** da primeira assinatura. |

> **[REVISAR COM ADVOGADO]** I-1 e I-2 são decisão de produto com consequência jurídica. I-3 é decisão jurídica com
> consequência contratual e de precificação (controladoria conjunta implica responsabilidade solidária — art. 42, §1º, I).

---

## 1. O que o produto faz, em linguagem de LGPD

Tirando o vocabulário de produto, o Replay já faz **cinco** coisas com dado pessoal:

1. **Capta imagem de pessoas identificáveis** em espaço privado de uso coletivo (quadra de arena), de forma
   **contínua**, 12 h/dia, por câmera fixa, sem que o titular tenha praticado nenhum ato de adesão.
2. **Recorta trechos de 22 segundos** dessa captação e os disponibiliza para **qualquer pessoa logada** que saiba
   arena + quadra + janela de horário (`api/README.md` §3). Não há vínculo atleta↔lance e não há restrição por grupo.
3. **Permite download e redistribuição** desses trechos por terceiros em WhatsApp e Instagram, fora do nosso controle,
   com **marca comercial da arena** aplicada no vídeo.
4. **Retém a gravação contínua** (não só os lances) por 7 dias, acessível ao administrador da arena.
5. **Mantém contas de usuário**, grupos com convite por e-mail, e registros de uso (IP, visualização, download,
   compartilhamento), com finalidade operacional, de segurança e de métricas comerciais para a arena.

Os itens 1, 2 e 3 são o núcleo do risco. Os itens 4 e 5 são mais comuns e mais fáceis de defender.

**Três características agravantes**, que precisam estar claras para quem for avaliar o risco:

- **O titular do dado não é o cliente.** Quem paga é a arena; quem aparece no vídeo é o atleta, que pode nem ter conta.
  Isso quebra a hipótese mais confortável ("o usuário aceitou os termos") para a maior parte das pessoas filmadas.
- **A finalidade não é segurança patrimonial.** Toda a jurisprudência administrativa e a doutrina confortável sobre
  câmeras em área comum (condomínio, comércio) está ancorada em **segurança**. A nossa finalidade é
  **entretenimento e divulgação comercial** — legítima, mas com um peso muito menor no balanceamento do art. 7º, IX,
  e com uma expectativa do titular muito mais frágil.
- **Há finalidade econômica explícita na publicação.** O vídeo sai com a marca d'água da arena e é vendido à arena
  como canal de marketing (`proposta-piloto.md` §5, "o atleta vira divulgador da arena"). Isso aproxima o caso do
  enunciado da **Súmula 403 do STJ** ("Independe de prova do prejuízo a indenização pela publicação não autorizada de
  imagem de pessoa com fins econômicos ou comerciais" — [STJ](https://www.stj.jus.br/docs_internet/revista/eletronica/stj-revista-sumulas-2014_38_capSumula403.pdf)).
  **Este é o risco civil mais concreto do produto, e ele é independente da LGPD.** Ver §10 e o alerta em §3.

> **[REVISAR COM ADVOGADO] — ponto nº 1 de risco.** A marca d'água comercial da arena sobre a imagem de um atleta que
> não consentiu é exatamente a hipótese da Súmula 403. Existem duas leituras: (a) a marca identifica a **origem** do
> vídeo, não associa a pessoa ao produto, e o uso é do próprio atleta — não há "publicação com fins comerciais" pelo
> réu; (b) a arena obtém vantagem econômica direta da circulação da imagem de terceiro não consentida, e responde.
> **Posição conservadora recomendada para o piloto:** tratar a leitura (b) como a provável, e mitigar com
> (i) sinalização física robusta, (ii) marca d'água **discreta**, em canto, nunca sobre a pessoa, nunca com chamada
> comercial ("venha jogar aqui", telefone, preço), (iii) proibição contratual de a arena usar clipe em peça publicitária
> sem autorização escrita e individual de quem aparece (ver `contrato-arena-anexo-lgpd.md` §6).

---

## 2. Mapeamento de dados pessoais tratados

Legenda de risco: 🔴 alto · 🟡 médio · 🟢 baixo.

| # | Dado | Titular | Origem | Onde vive | Retenção proposta | Risco |
|---|---|---|---|---|---|---|
| D1 | **Imagem e som de pessoa em vídeo — clipe de 22 s** | Atleta, acompanhante, funcionário, qualquer pessoa em quadra ou no entorno enquadrado | Câmera fixa da arena | **S3 `sa-east-1`** (`replayja-clips`, privado) 🇧🇷; cópias de cache no **CloudFront** (Price Class All, PoPs dentro e fora do Brasil); cópia de trabalho no disco do relay em São Paulo | **90 dias** (ver I-1) | 🔴 |
| D2 | **Imagem e som — gravação contínua da sessão (12 h/dia/quadra)** | idem | Câmera fixa | **Disco do relay, EC2 `sa-east-1`** 🇧🇷 | **7 dias** (ver I-2) | 🔴 |
| D3 | **Thumbnail do clipe (frame estático)** | idem | Derivado de D1 | **S3 `sa-east-1`** (`replayja-public`) 🇧🇷, servido pelo CloudFront — **público, sem login** | acompanha D1 | 🔴 (ver §7 e alerta abaixo) |
| D4 | **E-mail** | Usuário do app | Cadastro por **OTP** (código de 6 dígitos enviado pela **Resend**) ou "Continuar com Google" (**OIDC manual**) | Tabela `app_user` no **Postgres do Neon em `aws-sa-east-1` (São Paulo)** 🇧🇷 | enquanto a conta existir + 6 meses de log | 🟡 |
| D5 | **Nome** | Usuário do app | Google (OIDC) ou digitado | `app_user` (Neon) — campos: `id`, `e-mail`, `nome`, `criado_em` | idem D4 | 🟡 |
| D6 | **E-mail de convidado de grupo (não cadastrado)** | Terceiro convidado | Digitado por outro usuário | Neon (`group_invite`); envio pela **Resend** | **90 dias** se o convite não for aceito → eliminar | 🔴 (dado de terceiro, coletado sem contato prévio) |
| D7 | **Nome, telefone, e-mail do responsável da arena** | Pessoa física na arena | Contrato / painel | Neon, CRM, e-mail | contrato + 5 anos (prescrição civil) | 🟢 |
| D8 | **Eventos de uso**: busca, abertura de clipe, play, download, compartilhamento e canal, criação de grupo | Usuário logado | Telemetria do app | Neon (`share_event`), analytics | **12 meses** identificado; depois agregar | 🟡 |
| D9 | **Endereço IP, user-agent, data/hora de acesso à aplicação** | Usuário (logado ou não) | Servidor | Neon, Runtime Logs da Vercel, logs de acesso do CloudFront | **6 meses** (Marco Civil, art. 15) e não mais que isso sem motivo | 🟡 |
| D10 | **Código OTP e sessão** — **sem tabela**: o desafio do OTP vive num **cookie HMAC** de curta duração e a sessão, no cookie de sessão | Usuário | Auth própria (padrão portado, `otp.ts` / `session.ts`) | Somente no cookie do navegador do usuário | minutos (OTP) a semanas (sessão) | 🟢 |
| D11 | **Metadado do gatilho**: quadra, horário, dispositivo, `actor_user_id` do botão virtual | Quem apertou o botão virtual | App | Neon (`trigger_event`) | 12 meses | 🟡 |
| D12 | **Dados de pagamento da arena** (PJ) | — | Financeiro | Contabilidade/gateway | fiscal (5 anos) | 🟢 (PJ, fora da LGPD na maior parte) |
| D13 | **Registro de erro do aplicativo** — `traceId`, rota, mensagem, e **e-mail em hash** (nenhum outro dado pessoal) | Usuário | Tabela `app_error` no **próprio Postgres do Neon** (não há Sentry) | Neon | 90 dias | 🟢 — **[REVISAR COM ADVOGADO]** e-mail em hash continua sendo dado **pseudonimizado**, não anonimizado (LGPD, art. 12 e art. 13, § 4º): é dado pessoal enquanto nós tivermos a tabela `app_user` que permite reverter a associação |

**Dados pessoais sensíveis (art. 5º, II):** o produto **não trata** dado biométrico, porque não há reconhecimento
facial nem vínculo automático atleta↔lance (`PLANO.md` decisão 6; `api/README.md` §3). **Isso precisa continuar
verdadeiro** — no dia em que entrar reconhecimento facial, o art. 11 passa a exigir consentimento **específico e
destacado** de cada pessoa filmada, o que é inviável numa quadra e mudaria o produto inteiro.

> ⚠️ **Atenção a um risco de sensível que já existe hoje, sem biometria:** um clipe de 22 s pode revelar, sem nenhuma
> intenção, dado do art. 5º, II — uma pessoa com deficiência, uma tatuagem religiosa, uma camisa de partido, um casal.
> Isso não transforma o tratamento em "tratamento de dado sensível" por si só (não há **finalidade** de tratar esse
> atributo), mas eleva o dever de cuidado e reforça a necessidade do canal de remoção rápido (§7).
> **[REVISAR COM ADVOGADO]**

> 🔴 **Alerta específico sobre D3 (thumbnails públicos).** A decisão de `api/README.md` §3 torna **públicos, sem login
> e sem expiração de URL**, frames estáticos de pessoas identificáveis, para que o Open Graph do WhatsApp funcione.
> Isso é a única superfície do produto em que a imagem de uma pessoa fica acessível a **qualquer um na internet**.
> É também o item que mais destoa do resto da arquitetura de privacidade. **Recomendação conservadora para o piloto**
> (uma das três, em ordem de preferência): (1) thumbnail de compartilhamento **desfocado ou com enquadramento aberto**
> (quadra inteira, pessoas pequenas), com o nome da arena por cima; (2) thumbnail público apenas sob
> **token de compartilhamento** (`/s/<token>`), revogável e incluído no takedown, nunca listável; (3) manter como está
> e assumir o risco, documentando a decisão. Hoje a arquitetura faz (3) por omissão. **[REVISAR COM ADVOGADO]**

---

## 3. Base legal proposta para cada tratamento

Referência normativa: [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

| # | Tratamento | Base legal proposta | Artigo | Observação |
|---|---|---|---|---|
| T1 | Captação contínua de imagem na quadra (D2) | **Legítimo interesse** do controlador e de terceiro | **art. 7º, IX** | Depende de LIA documentado (§4), sinalização (§ `sinalizacao-quadra.md`), retenção curta e canal de oposição |
| T2 | Geração e disponibilização do clipe de 22 s a usuários logados (D1, D3) | **Legítimo interesse** | **art. 7º, IX** | Mesma LIA. **Não é consentimento** — seria impossível coletar de 20 pessoas em quadra, e consentimento inválido é pior que legítimo interesse bem feito |
| T3 | Criação e manutenção da conta, login por OTP/Google (D4, D5, D10) | **Execução de contrato** com o titular | **art. 7º, V** | O usuário pede a conta; os Termos são o contrato |
| T4 | Busca, reprodução e download de clipes pelo usuário logado | **Execução de contrato** | art. 7º, V | Do ponto de vista de **quem usa**. De quem **aparece**, é T2 |
| T5 | Convite de membro para grupo por e-mail (D6) | **Legítimo interesse** do usuário que convida e do controlador | **art. 7º, IX** | Frágil: é e-mail de terceiro que nunca nos procurou. Mitigação obrigatória: 1 e-mail só, opt-out em 1 clique, nada de reenvio automático, eliminação em 90 dias se não aceito |
| T6 | Marca d'água da arena no vídeo | **Legítimo interesse** da arena | art. 7º, IX | Ver alerta da Súmula 403 em §1. Uso **publicitário** do clipe pela arena **não** cabe aqui — exige consentimento (art. 7º, I) e/ou autorização de uso de imagem de direito civil |
| T7 | Registros de acesso à aplicação — IP, data/hora (D9) | **Cumprimento de obrigação legal** | **art. 7º, II** + [Marco Civil, art. 15](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm) | Guarda de 6 meses é obrigação, não escolha. Não estender sem motivo |
| T8 | Segurança, antifraude, rate limit, auditoria de quem viu o quê (D8, D9) | **Legítimo interesse** | art. 7º, IX | Aqui o legítimo interesse é forte: protege o próprio titular filmado contra varredura de acervo |
| T9 | Métricas de produto e painel de alcance para a arena (D8) | **Legítimo interesse**, com dado **agregado** sempre que possível | art. 7º, IX | Painel da arena deve receber **agregado** (nº de clipes, nº de compartilhamentos por canal), nunca lista nominal de quem assistiu o quê |
| T10 | Comunicação transacional (OTP, convite, aviso de remoção) | Execução de contrato / legítimo interesse | art. 7º, V e IX | |
| T11 | Marketing do Replay já para o usuário (novidades, newsletter) | **Consentimento** | **art. 7º, I** | Opt-in separado, desmarcado por padrão, revogável. Não embutir nos Termos |
| T12 | Uso de clipe/foto como **case comercial** do Replay já ou da arena | **Consentimento** específico + autorização de uso de imagem | art. 7º, I + CC art. 20 | Individual, por escrito, de cada pessoa identificável no material |
| T13 | Exercício de direitos em processo | art. 7º, VI | art. 7º, VI | Para reter o mínimo além do prazo quando houver litígio |
| T14 | Dados de menores de 12 anos (criança) eventualmente captados | **art. 14** + melhor interesse | art. 14 | Ver §9. **Não há base confortável** — daí a recomendação de desligar a gravação na escolinha |

### Por que legítimo interesse e não consentimento, na captação

O consentimento do art. 7º, I precisa ser **livre, informado e inequívoco** (art. 5º, XII) e, para ser válido numa
quadra, teria que ser coletado de **cada pessoa presente**, incluindo quem só passou pelo enquadramento, **antes** da
captação. Numa pelada de society com 14 jogadores rotativos, isso é: (a) operacionalmente impossível; (b) inválido na
prática, porque quem se recusa fica sem jogar — o que contamina a liberdade do consentimento; (c) **um consentimento
inválido é pior que legítimo interesse**, porque derruba toda a operação de uma vez, enquanto o legítimo interesse mal
executado ainda admite correção.

O [Guia Orientativo da ANPD sobre Legítimo Interesse (fev/2024)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf)
é explícito sobre isso: o legítimo interesse não é base "residual" nem base "fácil", mas é a adequada quando a finalidade
é concreta, o tratamento é necessário e o titular tem expectativa razoável. Ele exige o **teste em três fases**
(finalidade → necessidade → balanceamento e salvaguardas), a consideração da **legítima expectativa** do titular, a
**documentação** do teste (LIA) e a garantia efetiva do **direito de oposição** (art. 18, § 2º). É o que fazemos em §4.

> **[REVISAR COM ADVOGADO] — ponto nº 2 de risco.** Existe uma leitura razoável e mais severa: a de que o legítimo
> interesse **não cobre a disponibilização do clipe a terceiros** (T2), só a captação (T1). Nessa leitura, captar para
> operar a quadra é uma coisa; **entregar o vídeo da pessoa a qualquer estranho logado que saiba o horário** é outra, e
> exigiria consentimento de quem aparece — o que mataria o produto. **Nossa posição:** T1 e T2 são um só tratamento
> com uma só finalidade, e o que os separa de vigilância é justamente a expectativa (§4). **Mas esta é a questão
> jurídica central do negócio** e merece parecer escrito antes de escalar além do piloto.

---

## 4. Teste de legítimo interesse (LIA) da captação de imagem

Estrutura conforme o Guia da ANPD (fev/2024): **finalidade → necessidade → balanceamento e salvaguardas**.

### Fase 1 — Finalidade

| | |
|---|---|
| **Interesse** | Permitir que praticantes de esporte amador revejam, guardem e compartilhem lances da própria partida; permitir que a arena ofereça esse serviço e divulgue a marca |
| **De quem** | Do controlador (Replay já), da arena (terceiro) e **do próprio titular** — o atleta é, na maioria dos casos, o beneficiário direto |
| **É legítimo?** | Sim. Interesse econômico e de entretenimento são legítimos; a LGPD não exige que o interesse seja nobre, exige que seja **concreto, real e não abusivo** |
| **É específico e informado?** | Sim, desde que a sinalização da quadra e a Política existam **antes** da primeira gravação |
| **Não é** | Segurança patrimonial (não é essa a nossa finalidade e não devemos alegar isso), vigilância de trabalhador, controle de acesso, identificação de pessoas |

### Fase 2 — Necessidade

| Pergunta | Resposta |
|---|---|
| Existe meio menos invasivo de atingir o mesmo fim? | Não para o clipe. Um lance esportivo só existe em vídeo. Filmar do celular de um amigo (o Replay já 1.0) capta menos gente, mas não entrega o produto e, na prática, filma as mesmas pessoas |
| O tratamento é o mínimo necessário? | **Parcialmente — e este é o ponto fraco.** O clipe de 22 s é minimizado por construção. A **gravação contínua de 12 h/dia** não é necessária para o clipe: ela existe para features futuras de IA (`PRD.md` §1, `PLANO.md` princípio 3). Guardar 12 h de vídeo de pessoas para uma finalidade que **ainda não existe** é o item que mais destoa do art. 6º, III (necessidade) e do art. 6º, I (finalidade determinada) |
| Mitigação | Retenção de **7 dias**, acesso restrito ao `partner_admin` da arena, nenhuma exposição ao atleta, nenhum processamento além do corte sob demanda, e **finalidade declarada honestamente** na Política: "manter a gravação por 7 dias para recuperar lances que o botão não pegou e para investigar falha técnica" — **não** "para treinar IA no futuro", que não é finalidade determinada |

> **[REVISAR COM ADVOGADO] — ponto nº 3 de risco.** A gravação contínua é o elo mais fraco do LIA. Duas leituras:
> (a) é acessória ao serviço, retida por prazo curto, com acesso restrito — cabe no art. 7º, IX;
> (b) é **vigilância** de 12 h/dia sem finalidade de segurança declarada, retida "por precaução", e não passa no teste
> de necessidade. **Recomendação conservadora para o piloto:** manter os 7 dias, declarar a finalidade restrita acima,
> **não** usar essa base para treinar modelo nenhum, e tratar qualquer uso futuro (highlights por IA) como **nova
> finalidade**, com novo LIA e novo aviso (art. 6º, I e art. 9º, § 2º). Ver §6.

### Fase 3 — Balanceamento e salvaguardas

**A favor do tratamento:**

- O titular está em **espaço privado de uso coletivo**, praticando esporte à vista de dezenas de pessoas — a
  expectativa de privacidade é objetivamente reduzida, embora **não seja zero**.
- O tratamento **beneficia o próprio titular** na maioria dos casos: ele quer o vídeo.
- O dado captado é **imagem em atividade esportiva pública**, não conteúdo íntimo, financeiro ou de saúde.
- Não há identificação, indexação por nome, biometria, perfilamento, enriquecimento ou venda de dado.
- A varredura é limitada por desenho: janela obrigatória de ≤ 6 h, login obrigatório, rate limit, URLs assinadas
  e curtas, `noindex` (`api/README.md` §3).
- Retenção curta e canal de remoção rápido.

**Contra o tratamento:**

- 🔴 **A expectativa é sobre "ser visto ao vivo", não sobre "ter um arquivo de vídeo meu circulando no WhatsApp".**
  Esta é a diferença que o balanceamento tem que vencer, e ela é vencida **pela sinalização**, não pelo argumento.
  Sem placa visível na quadra, a legítima expectativa não se forma e o LIA **não passa**.
- 🔴 **Qualquer usuário logado acessa o clipe.** A barreira é conhecimento de arena+horário, não vínculo com a partida.
  Um ex-companheiro, um perseguidor, um jornalista, um empregador — qualquer um que saiba onde e quando a pessoa joga
  tem acesso. Isso é real e não deve ser minimizado.
- 🟡 Presença de **menores** (§9).
- 🟡 **Finalidade econômica** com marca comercial sobre a imagem (§1).
- 🟡 O titular filmado normalmente **não tem conta** e, portanto, não tem canal natural para exercer direitos — daí a
  exigência de que o canal de remoção seja **público, sem login** (§7 e `fluxo-remocao.md`).

**Salvaguardas adotadas (estas são o que faz o teste passar):**

| # | Salvaguarda | Onde está implementada |
|---|---|---|
| S1 | **Sinalização física obrigatória** em cada quadra, visível da área de jogo, com QR para a Política e o canal de remoção | `sinalizacao-quadra.md`; obrigação contratual da arena |
| S2 | Aviso no **checkout de reserva** da arena e no regulamento interno | `sinalizacao-quadra.md` §4; contrato |
| S3 | **Login obrigatório** para qualquer clipe; nenhum clipe público por link | `api/README.md` §3 |
| S4 | **Janela máxima de 6 h** por busca; nunca "listar tudo da arena" | idem |
| S5 | **Rate limit** (120 buscas/h, 30 downloads/h) e auditoria com `actor_user_id` | idem |
| S6 | **URLs de mídia assinadas e curtas** (6 h visualização, 15 min download) | `adr/0001` §3 |
| S7 | `noindex, nofollow`; nenhum clipe no `sitemap.xml` | `api/README.md` §3 |
| S8 | **Remoção em até 72 h**, sem exigir justificativa, sem exigir conta | `fluxo-remocao.md` |
| S9 | **Retenção curta**: clipe 90 dias, sessão 7 dias, lifecycle de segurança de 400 dias no bucket | `adr/0001` §3 |
| S10 | **Sem biometria, sem reconhecimento facial, sem vínculo atleta↔lance** | `PLANO.md` decisão 6 |
| S11 | **Sessão contínua invisível ao atleta**, só `partner_admin` | `api/README.md` §3 |
| S12 | **Direito de oposição** atendido como remoção, e como pedido de não-captação junto à arena | §7 |
| S13 | Marca d'água **discreta**, sem chamada publicitária; proibição contratual de uso publicitário sem autorização individual | `contrato-arena-anexo-lgpd.md` |
| S14 | **Gravação desligada em horário de escolinha infantil** | §9; `contrato-arena-anexo-lgpd.md` |

**Conclusão do LIA:** **passa**, para T1 e T2, **condicionado** à execução integral de S1, S2, S8 e S14.
Sem S1 (placa) e sem S8 (canal de remoção) o teste **não passa** — e essas duas são as únicas salvaguardas que
dependem de coisas fora do código.

---

## 5. Papéis: quem é controlador, quem é operador

### O que os documentos internos dizem hoje — e por que está errado

`proposta-piloto.md` §6 diz: *"contrato define a arena como controladora dos dados de imagem no ambiente dela e nós
como operadores"*. `api/README.md` §3 diz: *"a base legal do tratamento é legítimo interesse do parceiro"*.

Essa construção é confortável comercialmente (joga o risco para a arena) e **insustentável de fato**. Controlador é
quem toma as **decisões referentes ao tratamento** (art. 5º, VI). Quem decide:

| Decisão | Quem decide de verdade |
|---|---|
| Que a gravação é contínua, 12 h/dia | **Replay já** (arquitetura do produto) |
| Que o gatilho salva 22 s retroativos | **Replay já** |
| Quanto tempo o clipe e a sessão ficam guardados | **Replay já** |
| **Que qualquer usuário logado, de qualquer lugar do Brasil, pode ver o clipe** | **Replay já** (`api/README.md` §3) |
| Que existe download e compartilhamento para WhatsApp/Instagram | **Replay já** |
| Que existe conta, grupo, convite por e-mail, métrica de uso | **Replay já** |
| Onde os dados são armazenados e por quais subprocessadores | **Replay já** |
| Instalar câmera naquela quadra, e em qual ângulo | **Arena** |
| Em quais horários a quadra opera e quem entra nela | **Arena** |
| Se a marca d'água é dela e como ela usa a página do parceiro | **Arena** |
| Informar os frequentadores (placa, regulamento, checkout) | **Arena** (com material fornecido por nós) |

A arena não instrui o Replay já: ela contrata um produto pronto cujas regras são nossas. Chamar isso de operação
(art. 5º, VII) não resiste a uma fiscalização, e teria um efeito prático perverso — como "operador", teríamos que
responder pelas instruções de um controlador que na verdade não instrui nada, e a arena responderia sozinha por
decisões que nunca tomou.

### Posição recomendada

> **Controladoria conjunta** (art. 5º, VI c/c art. 42, § 1º, I) para a captação e a disponibilização de imagem;
> **Replay já como controlador único** para conta, autenticação, grupos, telemetria e segurança;
> **arena como controladora única** para o que ela faz por fora (reserva, cadastro de aluno, câmera própria).

| Bloco de tratamento | Replay já | Arena |
|---|---|---|
| T1 captação contínua na quadra | **Controlador conjunto** | **Controlador conjunto** |
| T2 clipe e disponibilização | **Controlador conjunto** (decide o modelo de acesso) | **Controlador conjunto** (decide instalar e informar) |
| T6 marca d'água / uso do vídeo pela arena | Operador da aplicação da marca | **Controlador** do uso que fizer |
| T3, T4, T8, T9, T10, T11 (conta, uso, segurança, métrica) | **Controlador único** | — |
| T5 convite de grupo | **Controlador** | — |
| Painel da arena (métricas agregadas) | Controlador | Controlador do uso que fizer |
| Reserva, mensalidade, cadastro de aluno da arena | — | **Controlador único** (fora do nosso escopo) |
| AWS (EC2 do relay, S3, CloudFront), Neon, Vercel, Resend | **Operadores/subprocessadores nossos** | — |

**Consequências que a arena precisa assinar sabendo:**

1. **Responsabilidade solidária** perante o titular (art. 42, § 1º, I) nos tratamentos conjuntos. Isso não é negociável
   por contrato perante o titular; o contrato só distribui o **regresso** entre nós.
2. A arena tem obrigações próprias e **verificáveis**: sinalizar, informar no checkout, encaminhar pedidos em 24 h,
   não usar clipe em publicidade sem autorização individual, avisar incidente.
3. Nós fornecemos: material de sinalização, canal público de atendimento ao titular, execução técnica da remoção,
   registro de operações, RIPD e resposta à ANPD.

> **[REVISAR COM ADVOGADO].** Há uma leitura alternativa defensável: **controladores independentes em cadeia** — a arena
> controla a captação no espaço dela; o Replay já controla a plataforma e a disponibilização. Ela é mais limpa de
> explicar e evita a solidariedade explícita, mas é frágil porque **a finalidade e os meios essenciais são decididos em
> conjunto e são inseparáveis** (não existe a captação sem o nosso produto, nem o nosso produto sem a quadra dela).
> **Recomendação conservadora: assumir a controladoria conjunta, declarar isso na Política e no contrato, e definir a
> repartição de responsabilidades por escrito, como manda o art. 42, § 2º.** É a leitura que menos surpreende um
> fiscal e a que mais protege o titular — e a que, se errada, erra para o lado seguro.

### Encarregado (DPO)

Art. 41 exige **encarregado indicado e com identidade publicada**. Para o piloto:

- Indicar uma pessoa nominalmente (pode ser o próprio Gabriel, enquanto a empresa for pequena — a LGPD não exige
  advogado nem certificação).
- Publicar nome e canal na Política de Privacidade e no rodapé do site: **`privacidade@replayja.com.br`**.
- A arena **não** precisa indicar encarregado próprio se for microempresa (Resolução CD/ANPD nº 2/2022 dispensa o
  agente de pequeno porte de indicar encarregado, **mas exige canal de comunicação**). Ela precisa, sim, de um
  **canal**, e o contrato deve exigir que ela informe qual é.
  **[REVISAR COM ADVOGADO]** — confirmar a redação e o enquadramento da arena como agente de pequeno porte.

---

## 6. RIPD simplificado — gravação contínua de 12 h/dia

O art. 38 permite à ANPD **determinar** ao controlador a elaboração de relatório de impacto, e o art. 10, § 3º prevê
isso especificamente para tratamento fundado em legítimo interesse. Não é obrigatório *a priori*, mas em um produto que
faz **monitoramento sistemático de área acessível ao público, em larga escala, com imagem de pessoas**, o RIPD é a
primeira coisa que será pedida. Fazê-lo antes é barato; fazê-lo depois é sob pressão.

### 6.1 Identificação

| | |
|---|---|
| **Controladores** | Replay já [razão social, CNPJ] e [ARENA], em controladoria conjunta |
| **Encarregado** | [nome] — `privacidade@replayja.com.br` |
| **Tratamento avaliado** | Gravação de vídeo contínua, 12 h/dia, por câmera fixa em quadra esportiva de arena privada de uso coletivo, com retenção de 7 dias e acesso restrito ao administrador da arena; e o recorte de clipes de 22 s derivados dela |
| **Data / versão** | 12/09/2026 — v1, anterior à instalação do piloto |
| **Escopo** | Arena piloto, [N] quadras, [endereço] |

### 6.2 Descrição do fluxo

1. Câmera IP fixa por quadra faz push RTMP para o relay do Replay já (AWS sa-east-1) — `PLANO.md` workstream A.
2. O relay grava 24/7 em segmentos indexados e mantém **7 dias**.
3. O botão físico (webhook assinado) ou o botão virtual dispara `POST /triggers`; o relay corta `[ts−24 s, ts+1 s]`,
   gera MP4 e thumbnail, aplica marca d'água.
4. Clipe e thumbnail vão para o **S3 `sa-east-1`** e são entregues pelo **CloudFront**; metadados para o Postgres do **Neon em `aws-sa-east-1` (São Paulo)**.
5. Usuário logado busca por arena + quadra + janela ≤ 6 h, assiste, baixa, compartilha.
6. `partner_admin` da arena acessa trechos da sessão contínua sob demanda, dentro dos 7 dias.
7. Jobs de retenção eliminam clipe aos 90 dias e sessão aos 7; lifecycle do bucket expira tudo em 400 dias.

### 6.3 Necessidade e proporcionalidade

Ver §4, fases 1 e 2. Resumo: **o clipe é necessário e proporcional; a gravação contínua é o ponto de atrito.**
Ela é mantida por 7 dias com três justificativas declaráveis e verdadeiras: (a) recuperar um lance quando o botão
falhou ou o usuário apertou tarde; (b) diagnosticar falha de câmera, cobertura e sincronismo de relógio; (c) permitir
que o administrador da arena verifique um incidente ocorrido na quadra dentro de uma janela curta.
**Não é justificativa declarável, no piloto: "matéria-prima para IA futura".** Se e quando esse uso existir, é
**nova finalidade** e exige novo RIPD, nova base legal e novo aviso (art. 6º, I; art. 9º, § 2º).

### 6.4 Riscos ao titular e medidas

| Risco | Prob. | Impacto | Medidas | Risco residual |
|---|:--:|:--:|---|:--:|
| Pessoa filmada sem saber | Média | Alto | S1 placa, S2 checkout, S12 oposição, aviso no 1º login | 🟡 |
| Clipe usado para constranger, assediar ou perseguir | Baixa | **Muito alto** | Login obrigatório, auditoria `actor_user_id`, janela ≤ 6 h, rate limit, remoção em 72 h, suspensão de conta nos Termos | 🟡 |
| Vídeo de menor circulando | **Média** (escolinha) | **Muito alto** | S14 desligar na escolinha, remoção pelo responsável sem verificação, sem indexação por nome, ECA Digital (§9) | 🟡 |
| Terceiro baixa e reposta fora do nosso controle | **Alta** | Médio-alto | Aviso explícito nos Termos e na placa, marca d'água rastreável, orientação de notificação da plataforma no `fluxo-remocao.md` | 🔴 **residual alto e inevitável** |
| Vazamento do bucket de sessões (12 h/dia de uma quadra) | Baixa | **Muito alto** | Bucket privado, URLs assinadas e curtas, acesso só `partner_admin`, retenção 7 dias, chaves rotacionadas. ⚠️ **Sem RLS** — com a saída do Supabase (`adr/0001` §4.5) existe **uma camada só** de autorização, na API | 🟡→🔴 |
| Varredura do acervo por scraper com conta válida | Média | Médio | Rate limit, janela obrigatória, auditoria, suspensão | 🟢 |
| Acesso indevido pelo pessoal da arena à sessão contínua | Média | Alto | Perfis nomeados (nada de login compartilhado), log de acesso, cláusula contratual, treinamento de 15 min na instalação | 🟡 |
| Retenção falha e vídeo sobrevive ao prazo | Média | Médio | Job `purge_expired_media` + lifecycle de 400 dias no bucket + monitoramento com alerta | 🟢 |
| Thumbnail público expõe pessoa sem login | **Alta** | Médio | **hoje: nenhuma** — ver alerta em §2 | 🔴 |
| Transferência internacional sem salvaguarda | **Média** (era alta) | Médio | Vídeo, banco e gravação contínua em repouso no Brasil (§11). Resta o acesso do exterior pelos operadores e o cache do CloudFront fora do país | 🟡 até confirmar o DPA/CPC assinado na conta AWS |

### 6.5 Conclusão do RIPD

O tratamento é **viável** com risco residual **aceitável para um piloto de 8 semanas**, condicionado a:

1. Sinalização instalada **antes** da primeira gravação (S1) — bloqueante.
2. Canal público de remoção no ar, com SLA de 72 h (S8) — bloqueante.
3. Política de Privacidade e Termos publicados (art. 9º) — bloqueante.
4. Definição do regime de transferência internacional (§11) — bloqueante.
5. Decisão sobre thumbnails públicos (§2, D3) — bloqueante **ou** decisão de risco assumida por escrito.
6. Gravação desligada em horário de escolinha infantil, se houver (S14).

Reavaliar o RIPD: ao fim do piloto; na arena nº 5; e **obrigatoriamente** antes de qualquer feature de IA sobre a
sessão contínua, de reconhecimento facial, de vínculo atleta↔lance ou de aumento de retenção.

---

## 7. Direitos do titular e como atender

Art. 18. Prazo geral de resposta: **15 dias** para a resposta completa (art. 19, II); confirmação/acesso em formato
simplificado, **imediato** (art. 19, I). Nosso SLA interno é mais curto onde importa.

| Direito | Art. | Como atendemos | Prazo nosso |
|---|:--:|---|---|
| Confirmação da existência de tratamento | 18, I | Resposta por e-mail; para quem não tem conta, exige informar arena+quadra+data/hora | 15 dias |
| **Acesso** | 18, II | Conta: página "Meus dados" + export JSON. Vídeo: **não entregamos** o clipe a quem alega aparecer sem que ele indique o clipe — um clipe tem 10 a 20 pessoas e entregar a terceiro é violar os outros | 15 dias |
| Correção | 18, III | Nome e e-mail editáveis no perfil | 7 dias |
| Anonimização / bloqueio / **eliminação** de dado desnecessário ou excessivo | 18, IV | **É o canal de remoção de clipe.** Sem justificativa, sem conta, sem prova | **72 h úteis** |
| Portabilidade | 18, V | Export JSON de conta, grupos e eventos. Vídeo não é portável para outro fornecedor | 15 dias |
| Eliminação de dado tratado com **consentimento** | 18, VI | Exclusão de conta na própria interface | **imediato na interface; 30 dias para backups** |
| Informação sobre compartilhamento | 18, VII | Lista de operadores/subprocessadores publicada e versionada na Política | contínuo |
| Informação sobre negar consentimento | 18, VIII | Na Política | contínuo |
| Revogação de consentimento | 18, IX | 1 clique (marketing) | imediato |
| **Oposição** a tratamento por legítimo interesse | **18, § 2º** | Duas formas: (a) remoção do clipe (efeito prático da oposição); (b) **pedido de não-captação**, dirigido à arena — na prática, não jogar naquela quadra naquele horário, ou a arena desligar a câmera. **Ser honesto: não conseguimos deixar de captar uma pessoa específica numa quadra.** A oposição se materializa como eliminação, não como não-captação | 72 h para remoção; resposta em 15 dias |
| Revisão de decisão automatizada | 20 | Não aplicável: não há decisão automatizada sobre pessoas | — |
| Petição à ANPD / defesa do consumidor | 18, § 1º | Informado na Política | — |

**Regras de atendimento que precisam estar no fluxo (ver `fluxo-remocao.md`):**

- **Canal público, sem login.** A maioria dos titulares filmados **não tem conta**. Exigir cadastro para pedir remoção
  seria coletar mais dado de quem quer menos tratamento — e é o tipo de fricção que a ANPD lê como obstáculo ao direito.
- **Não exigir justificativa nem prova de identidade para remoção de clipe.** O pedido de remoção é de baixo risco
  (o dano de remover um clipe por engano é quase nulo; o de manter um clipe indevido é alto). Identificação reforçada
  só para **acesso** e **portabilidade**, onde entregar dado ao impostor causa dano.
- **Registrar tudo**: quem pediu, quando, o que foi feito, quando (art. 37 — registro das operações).
- **Responder sempre**, inclusive quando a resposta é "não encontramos" ou "já expirou".

---

## 8. Retenção e eliminação

| Dado | Prazo | Fundamento | Onde é executado |
|---|---|---|---|
| **Clipe (D1) + thumbnail (D3)** | **90 dias** da gravação (ver I-1) | Necessidade (art. 6º, III); o histórico do grupo é o que dá valor à página do grupo | Job `purge_expired_media` + lifecycle de 400 dias no bucket |
| **Sessão contínua (D2)** | **7 dias** (ver I-2) | Necessidade + minimização da vigilância | Retenção do relay + job |
| Cópia local na borda/relay do original sem marca | **7 dias** | Remarcação e recuperação | `buffer.localRetentionHours = 168` |
| Clipe com pedido de remoção | **até 72 h úteis**, e imediatamente invisível | art. 18, IV | `deleted_at` + revogação da URL assinada + invalidação no CloudFront + `DELETE` no S3 (`fluxo-remocao.md`) |
| Conta, e-mail, nome (D4, D5) | Enquanto a conta existir; **30 dias** após pedido de exclusão (janela de arrependimento e expurgo de backup) | art. 15, III / 16 | Exclusão assíncrona (`202`) |
| **E-mail de convite de grupo não aceito (D6)** | **90 dias** → eliminar | Necessidade; e-mail de terceiro | Job |
| E-mail de membro de grupo | Enquanto for membro; ao sair, eliminar da lista em 30 dias | Necessidade | |
| Eventos de uso identificados (D8) | **12 meses**; depois agregar/anonimizar | Necessidade | Job |
| **Registros de acesso à aplicação — IP (D9)** | **6 meses** | **Obrigação legal** — Marco Civil, art. 15. Guardar menos é descumprir a lei; guardar mais precisa de motivo | Retenção de log |
| Registros de erro do app (`app_error` no Neon — `traceId` e e-mail em hash, sem outro dado pessoal) | 90 dias | Necessidade | Job de poda da tabela `app_error` |
| Dados de contato/contrato da arena (D7) | Contrato + 5 anos | Prescrição civil / exercício de direitos (art. 7º, VI e art. 16, I) | |
| Registro de pedidos de titular | 5 anos | Prova de cumprimento (art. 37, 50) | |

**Regra de ouro operacional:** o fim do prazo tem que produzir um **delete verificável**, não um "não aparece mais na
interface". Os testes de aceite do piloto devem incluir: criar clipe → adiantar relógio/forçar job → conferir que o
objeto **não existe mais no S3** e que a URL assinada antiga devolve 404/410, inclusive pelo CloudFront.

---

## 9. Menores de idade em quadra

Este é o ponto onde o produto tem o pior encaixe jurídico, e onde o cenário regulatório mudou em 2026.

### 9.1 O que se aplica

1. **LGPD, art. 14** — tratamento de dados de **crianças e adolescentes** deve ser feito em **seu melhor interesse**.
   O § 1º exige **consentimento específico e em destaque de pelo menos um dos pais ou responsável** para o tratamento
   de dados de **criança** (até 12 anos incompletos). O **Enunciado CD/ANPD nº 1, de 22/05/2023** esclareceu que o
   tratamento de dados de crianças e adolescentes pode se fundamentar em **outras** hipóteses do art. 7º/art. 11 além do
   consentimento, desde que observado o melhor interesse — mas isso **não** é um salvo-conduto: reduz o formalismo,
   não o dever de cuidado.
2. **ECA (Lei 8.069/1990)** e direito de imagem de menor — a autorização de uso de imagem é dada pelo responsável.
3. 🔴 **ECA Digital — [Lei nº 15.211/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm)**,
   em vigor desde **17/03/2026**, fiscalizada pela ANPD. Aplica-se a *"fornecedores de produtos e serviços de tecnologia
   da informação direcionados a crianças e adolescentes, **ou de acesso provável por esse público**"*. Entre as
   obrigações: **aferição confiável de idade** (fim da autodeclaração), supervisão parental e restrição de publicidade.
   A ANPD publicou cronograma de fiscalização em etapas: Etapa I (mar–jul/2026, app stores e sistemas operacionais),
   Etapa II (ago–nov/2026, orientações definitivas e ampliação de setores), Etapa III (a partir de jan/2027,
   fiscalização efetiva) — [ANPD, página do ECA Digital](https://www.gov.br/anpd/pt-br/assuntos/eca-digital), consultada em 12/09/2026.
4. **Prioridade de fiscalização.** No [Mapa de Temas Prioritários 2026–2027 (publicado em 24/12/2025)](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-mapa-de-temas-prioritarios-para-o-bienio-2026-2027-e-atualiza-agenda-regulatoria-2025-2026),
   a ANPD elegeu quatro temas: **direitos dos titulares**, **proteção de crianças e adolescentes no ambiente digital**,
   tratamento pelo Poder Público, e IA/tecnologias emergentes. Dois deles nos acertam em cheio.

> 🔴 **[REVISAR COM ADVOGADO] — ponto nº 3 de risco (empatado com a gravação contínua).** É o Replay já um
> "fornecedor de produto ou serviço de TI **de acesso provável** por crianças e adolescentes"? **Duas leituras:**
> (a) **não** — é uma ferramenta B2B contratada por arenas, com conta restrita a maiores, sem conteúdo dirigido a
> criança, sem publicidade, sem rede social; (b) **sim** — é um site aberto onde adolescentes de 14–17 anos que jogam
> futebol vão querer ver os próprios lances, e o acesso por eles é **previsível**, o que basta para o texto legal.
> **A leitura (b) é a mais provável de prevalecer**, porque "acesso provável" é critério de fato, não de intenção.
> **Recomendação conservadora para o piloto:** assumir (b) e adotar as três medidas mais baratas que ela exige —
> (i) **idade mínima de 18 anos** nos Termos para criar conta, com **verificação declarada + bloqueio de reincidência**,
> não autodeclaração solta; (ii) **nenhuma publicidade comportamental, nenhum perfilamento**, nada de anúncio no app;
> (iii) **desligar a gravação em horário de escolinha infantil**. Revisitar quando a ANPD publicar as orientações
> definitivas da Etapa II (ago–nov/2026), que podem mudar o que "aferição confiável de idade" exige na prática.

### 9.2 O problema concreto: escolinha

Uma arena com escolinha infantil coloca **20 crianças de 7 a 12 anos** em quadra, duas a três vezes por semana,
sob uma câmera que grava 12 h por dia e produz clipes que **qualquer usuário logado do Brasil** pode baixar.
Não existe leitura da LGPD em que isso esteja confortável.

**Mitigações, em ordem de preferência:**

| # | Medida | Custo | Efeito |
|---|---|---|---|
| **M1** | **Desligar a gravação nos horários de escolinha infantil** (agenda por quadra no painel da arena) | Baixo — é uma janela de horário por quadra | **Elimina o risco na raiz.** É a medida mais simples e a mais defensável. `proposta-piloto.md` §6 já a antecipa |
| M2 | Se a arena quiser o produto na escolinha: **modo escolinha** — clipes visíveis **apenas** para responsáveis previamente cadastrados por e-mail pela arena, com autorização de imagem assinada (art. 14, § 1º) | Alto (feature nova) | **Fora do piloto.** Não construir isso agora |
| M3 | Remoção pelo responsável **sem qualquer verificação**, prioridade máxima, SLA de **24 h** (não 72) | Zero | Obrigatório de qualquer forma |
| M4 | Nenhuma indexação por nome de pessoa, nenhum `sitemap`, `noindex` | Já existe | |
| M5 | Idade mínima de 18 anos para conta; aviso no 1º login | Baixo | Reduz exposição ao ECA Digital |
| M6 | Aviso específico na placa e no checkout quando a quadra tiver uso infantil | Baixo | Transparência ao responsável |

> **Recomendação para o piloto: M1 + M3 + M4 + M5 + M6, e M1 como cláusula contratual com a arena.**
> Se a arena piloto tiver escolinha e **recusar** desligar a gravação nesses horários, a posição recomendada é
> **não instalar naquela quadra** — é mais barato perder uma quadra do que carregar este risco no primeiro contrato.

---

## 10. Compartilhamento por terceiros em redes sociais

O produto foi feito para que o atleta baixe e reposte. É o valor central e é o argumento de venda para a arena
(`proposta-piloto.md` §5). Também é o ponto onde perdemos **todo** o controle sobre o dado.

### 10.1 Quem responde pelo repost

| Cenário | Leitura |
|---|---|
| Atleta baixa e manda no grupo de WhatsApp da pelada | **Fora do escopo da LGPD** — art. 4º, I: tratamento por pessoa natural para fins **exclusivamente particulares e não econômicos**. A "household exemption" cobre bem este caso |
| Atleta posta no Instagram pessoal, sem monetização | **Zona cinzenta.** É particular, mas não é "restrito": a audiência é aberta. Aplica-se ainda assim o direito de imagem civil (CC, art. 20), independentemente da LGPD |
| Atleta com perfil comercial, influenciador, ou com publicidade | **Dentro da LGPD** — deixa de ser "não econômico". Ele vira controlador independente |
| **Arena** posta no Instagram da arena | **Sempre dentro da LGPD e do direito de imagem.** Uso econômico, controlador é a arena. Súmula 403/STJ aplicável. **Exige autorização individual de quem aparece** |
| **Replay já** usa clipe em material de venda | Idem: consentimento específico (art. 7º, I) + autorização de uso de imagem (T12) |

### 10.2 O que fazemos com isso

1. **Dizer a verdade, em letra grande, três vezes**: na placa da quadra, no primeiro login e nos Termos —
   *"outras pessoas podem baixar e compartilhar vídeos em que você aparece, inclusive fora do Replay já, e nós não
   conseguimos apagar o que já saiu daqui"*. Transparência é a única defesa real aqui, e ela precisa ser **antecipada**,
   não escondida em cláusula 14.3.
2. **Impor deveres a quem compartilha**, nos Termos: não usar para constranger, assediar, discriminar; não usar em
   publicidade sem autorização de quem aparece; não repostar clipe de criança ou adolescente; suspensão da conta em caso
   de violação (ver `termos-de-uso.md` §6).
3. **Marca d'água como rastreabilidade**, não como proteção — permite saber de qual arena o vídeo veio quando ele
   aparece em outro lugar.
4. **Orientar o titular**, no `fluxo-remocao.md`: quando o vídeo já está fora, apagamos a nossa cópia, invalidamos os
   links assinados, e **fornecemos ao titular um caminho** — texto pronto de notificação extrajudicial e os links dos
   canais de denúncia de uso indevido de imagem do Instagram, WhatsApp, Facebook, YouTube e TikTok.
5. **Nunca prometer o que não podemos**: em nenhum documento dizer "você pode apagar seu vídeo da internet".
   Podemos apagar **do Replay já**.

> **[REVISAR COM ADVOGADO].** Há quem sustente que a plataforma que **fornece o botão de compartilhar** responde
> solidariamente pelo repost abusivo de terceiro. A leitura majoritária (e o [Marco Civil, art. 19](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm))
> aponta para responsabilidade do provedor **apenas após ordem judicial específica de remoção** — com exceções
> relevantes, entre elas conteúdo de nudez/ato sexual (art. 21), que responde por **notificação extrajudicial**.
> **Conservador:** implementar o takedown por notificação extrajudicial simples para **tudo**, sem exigir ordem
> judicial. Somos pequenos e o conteúdo não é jornalístico; não há nada a ganhar em resistir a um pedido de remoção.

---

## 11. Transferência internacional

Base: **LGPD, arts. 33 a 36** e [Resolução CD/ANPD nº 19, de 23/08/2024](https://www.gov.br/anpd/pt-br/assuntos/noticias/resolucao-normatiza-transferencia-internacional-de-dados),
que aprovou o Regulamento de Transferência Internacional e o conteúdo das **Cláusulas-Padrão Contratuais (CPC)**.
O período de adequação de 12 meses **encerrou em 23/08/2025** — ou seja, **já estamos no regime obrigatório**.

Mecanismos admitidos (art. 33 da LGPD; arts. 3º e seguintes da Res. 19/2024):
decisão de adequação · **CPC da ANPD** · cláusulas-padrão equivalentes aprovadas por autoridade estrangeira ·
cláusulas contratuais específicas (com **aprovação prévia** da ANPD) · normas corporativas globais.

**Decisão de adequação existente:** somente a **União Europeia e o EEE**, pela
**[Resolução CD/ANPD nº 32, de 26/01/2026](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)**
(reconhecimento recíproco com a Comissão Europeia; reavaliação em 4 anos). **Os Estados Unidos não têm decisão de
adequação da ANPD.**

### 11.1 Onde os nossos dados realmente estão

> **O que mudou, e por quê importa.** A decisão "só Brasil" do fundador (`adr/0001` rev. 3, Decisão 6 e §4.2)
> coloca **vídeo, banco e gravação contínua em repouso em São Paulo**. Isso elimina a transferência internacional
> **estrutural** que existia nas revisões anteriores — quando os vídeos iam para o Cloudflare R2, que
> [não tem região na América do Sul](https://developers.cloudflare.com/r2/reference/data-location/).
> **O que não elimina** é a transferência **potencial**: todos os nossos operadores são empresas dos EUA, cujo
> suporte e cuja administração podem acessar o dado do exterior, e o CloudFront em *Price Class All* cacheia
> cópias em PoPs fora do Brasil por definição. Dado em repouso no Brasil **reduz muito** o risco; não o zera.

| Fornecedor | Papel | Localização do dado | Situação |
|---|---|---|---|
| 🟢 **AWS — S3 `sa-east-1`** (`replayja-clips`, `replayja-public`) | Operador — **D1, D3 (os vídeos e as capas)** | **São Paulo, Brasil** 🇧🇷 | **Repouso no Brasil.** Resta a transferência potencial por acesso do exterior (operador dos EUA) |
| 🟡 **AWS — CloudFront** (`cdn.replayja.com.br`, Price Class All) | Operador — entrega de D1 e D3; logs de acesso (D9) | **Rede global.** Price Class All inclui PoPs da América do Sul, **mas também de fora dela** | **Transferência internacional real, por desenho.** Cada clipe assistido deixa uma cópia de cache no PoP que atendeu. *Price Class 100* seria **pior**: excluiria os PoPs da América do Sul e empurraria **todo** o cache para fora do país (`adr/0001` §6.4) |
| 🟢 **AWS — EC2 `sa-east-1`** (relay RTMP) | Operador — **D2** (gravação contínua, em disco) e D1 em trânsito | **São Paulo, Brasil** 🇧🇷 | Repouso no Brasil. Mesma ressalva de acesso do exterior |
| 🟢 **Neon** (Postgres — `app_user`, grupos, convites, `share_event`, `trigger_event`, `app_error`) | Operador — D4 a D9, D11, D13 | **`aws-sa-east-1` (São Paulo), confirmado** (`adr/0001` §4.2; [Neon — AWS and Azure Regions](https://neon.com/docs/introduction/regions)). A região do projeto **não pode ser alterada** depois de criado | Repouso no Brasil. Mesma ressalva de acesso do exterior |
| 🟡 **Vercel** (Next.js) | Operador — processamento de requisição, D9 | Funções em **`gru1` (São Paulo)**; edge cache global | Empresa dos EUA, com suporte e administração acessíveis do exterior; **o cache de edge é global por natureza** |
| 🔴 **Resend** (e-mail do código OTP e dos convites de grupo) | Operador — D4, D6 | **EUA** | **Transferência internacional certa.** Todo e-mail de login e todo convite de grupo passa por lá — inclusive o e-mail de terceiro que nunca nos procurou (D6). **É hoje a única perna em que o dado sai do Brasil em repouso** |
| **Google** (login por Google, opcional) | Controlador independente | Global | Transferência; regida pelos termos do Google. Só participa de quem escolhe entrar por ele |
| ~~Cloudflare R2 / Workers / KV~~ | — | — | **Não são mais usados.** Os clipes saíram do R2 para o S3 `sa-east-1` (`adr/0001` §6.4) |
| ~~Sentry~~ | — | — | **Não é mais usado.** Os erros ficam na tabela `app_error` do próprio Neon (`adr/0001` §7) |

**Quatro operadores, uma perna internacional em repouso.** AWS (EC2, S3, CloudFront), Neon, Vercel e Resend —
mais o Google para quem usa o login social. De todos, só o **Resend** guarda dado pessoal fora do Brasil.

> **Nota para o fundador — a ressalva que ele já conhece e decidiu contra.** Juridicamente, a rota **mais simples**
> não é o Brasil: é a **União Europeia**, que tem decisão de adequação da ANPD (Res. 32/2026) e, com ela,
> transferência permitida **sem** cláusula-padrão nenhuma. O Brasil é **melhor de fato** (o dado não sai) e **pior
> de papel** (operadores dos EUA sem decisão de adequação ⇒ é preciso ter a CPC assinada). A decisão foi tomada
> sabendo disso, e ela é defensável: "o vídeo dos seus clientes fica no Brasil" é um argumento que se explica ao
> dono da arena em uma frase, e a alternativa europeia não tem esse ganho. **Registrado aqui para que a escolha
> apareça como escolha, e não como esquecimento**, se um dia for questionada.

### 11.2 O que isso exige, em concreto

1. **Mapear e declarar.** A Política de Privacidade precisa listar os operadores, a finalidade e **o fato de haver
   transferência internacional** (art. 9º, V c/c art. 33). Isso está feito em `politica-de-privacidade.md`.
2. 🔴 **Confirmar o DPA da AWS aceito na conta, e verificar se ele incorpora as CPCs da ANPD.**
   Esta é a pendência que substituiu a antiga "jurisdição do R2". Com S3, CloudFront e EC2, a AWS passou a ser o
   operador do dado mais sensível do produto, e ela é empresa dos EUA — **país sem decisão de adequação da ANPD**.

   **O que foi verificado (12/09/2026):** a página oficial [AWS — Brazil Data Privacy](https://aws.amazon.com/compliance/brazil-data-privacy/)
   afirma apenas que a AWS oferece um *"Data Processing Agreement that meets the requirements of LGPD"*.
   **Ela não menciona** as Cláusulas-Padrão Contratuais da Resolução CD/ANPD nº 19/2024, nem descreve o mecanismo
   de transferência internacional adotado, nem como o cliente adere formalmente ao DPA — orienta contatar o gerente
   de conta. **Ou seja: não é possível afirmar, a partir de fonte pública, que o DPA da AWS já incorpora as CPCs da
   ANPD.** Não afirmamos que incorpora nem que não incorpora — afirmamos que **não está verificado**.

   **Ação concreta, tarefa da semana 1:** (a) baixar o AWS DPA vigente no **AWS Artifact**, dentro do console da
   conta; (b) procurar no texto a referência expressa à Resolução CD/ANPD nº 19/2024 ou às "Cláusulas-Padrão
   Contratuais"; (c) se não houver, abrir chamado ou falar com o gerente de conta pedindo o adendo brasileiro;
   (d) guardar o PDF assinado/aceito junto deste documento. **[REVISAR COM ADVOGADO]**

3. **Mesma verificação para Neon, Vercel e Resend**, que também são empresas dos EUA. O **Resend** é o mais
   urgente dos três, porque é o único em que o dado fica **em repouso** fora do Brasil.
   **[REVISAR COM ADVOGADO]** — a ANPD ainda **não** publicou reconhecimento geral das *Standard Contractual
   Clauses* da União Europeia como "cláusulas-padrão equivalentes" (art. 33, II, "b" da LGPD / Res. 19/2024).
   Enquanto isso não existir, **aceitar o DPA padrão de um fornecedor americano com SCCs europeias não é, por si
   só, cumprimento do art. 33 no Brasil.** Na prática, o fornecedor grande não negocia cláusula sob medida; a
   mitigação realista é (a) manter o dado em repouso no Brasil — que é exatamente o que a decisão do fundador já
   fez —, (b) documentar a análise, (c) registrar a limitação no RIPD como risco assumido.

4. **Acesso remoto conta como transferência, e o cache de CDN também.** Dado armazenado em São Paulo por empresa
   americana cujo suporte acessa do exterior **é** transferência internacional na leitura mais aceita — não adianta
   dizer "está no Brasil" e parar aí. E o **CloudFront em Price Class All deixa cópias de cache fora do país** a
   cada clipe assistido de fora: é transferência por desenho, aceita conscientemente, porque a alternativa
   (*Price Class 100*) seria pior — ela exclui os PoPs da América do Sul e manda **todo** o cache para fora
   (`adr/0001` §6.4). Mitigação já existente e que vale citar: as URLs de mídia são **assinadas e curtas**
   (6 h para visualização, 15 min para download), então a cópia em cache tem vida útil limitada por contrato de
   acesso, não só por TTL.
5. **Nunca enviar vídeo para serviço de IA fora do Brasil** sem refazer esta análise. Vale para qualquer API de
   transcrição, detecção de gol, highlights. É exatamente o cenário da Fase 3 (`PLANO.md`) e ele **não está coberto** por
   nada do que está aqui.

---

## 12. Segurança da informação e incidentes

Art. 46 a 48. O que precisa existir no piloto, sem inventar burocracia:

| Medida | Status hoje | Ação |
|---|---|---|
| ~~RLS em todas as tabelas~~ | 🔴 **Não existe mais.** O RLS saiu junto com o Supabase (`adr/0001` §4.5), e com ele a segunda camada de autorização no banco | **Existe uma camada só de autorização.** Do ponto de vista de privacidade, um bug de autorização na API agora vira incidente direto, sem rede de proteção. As compensações previstas (consultas centralizadas, sessão como primeiro argumento obrigatório, lint contra SQL solto em rota, teste de 403 por endpoint) são **disciplina, não mecanismo** — verificar na entrega do B2 e registrar como risco assumido no RIPD |
| Autorização em duas camadas (API + banco) | Previsto (`api/README.md` §3) | |
| URLs de mídia assinadas e curtas | Previsto | |
| Buckets de clipe e sessão **privados**; público só `replayja-public` | Previsto | Revisar o que é público (§2, D3) |
| Perfis nomeados para `partner_admin` — **nada de login compartilhado na recepção** | A definir | **Cláusula contratual** + onboarding |
| Log de acesso à sessão contínua, com quem e quando | A definir | **Construir** — é a prova de que a vigilância é controlada |
| Rotação de chaves, segredos fora do código | A definir | CI |
| MFA nas contas de administração dos fornecedores | A definir | Fazer agora, custa zero |
| **Plano de resposta a incidente** | Não existe | **Escrever.** Art. 48: comunicar ANPD e titulares em prazo razoável — a ANPD orienta **3 dias úteis** na Resolução CD/ANPD nº 15/2024 de comunicação de incidente. **[REVISAR COM ADVOGADO]** confirmar prazo e formulário vigentes |
| Registro das operações de tratamento (art. 37) | Não existe | Este documento + planilha de operações |

---

## 13. Checklist do que é obrigatório antes de gravar a primeira partida

Bloqueantes de verdade. Nenhum destes é formalidade.

| # | Item | Responsável | Evidência |
|---|---|---|---|
| 1 | **Placa/adesivo instalado e visível em cada quadra gravada**, conforme `sinalizacao-quadra.md` | Replay já fornece / arena instala | **Foto datada de cada quadra**, arquivada |
| 2 | **Política de Privacidade e Termos de Uso publicados** em `replayja.com.br/privacidade` e `/termos`, com data de vigência | Replay já | URL no ar |
| 3 | **Canal de remoção público, sem login, no ar** e testado ponta a ponta (pedido → some da API → some do S3 e do cache do CloudFront) | Replay já | Teste registrado |
| 4 | **Encarregado indicado**, nome e `privacidade@replayja.com.br` publicados e monitorados | Replay já | Rodapé + caixa de e-mail |
| 5 | **Contrato da arena assinado com o anexo LGPD**, com papéis corrigidos (controladoria conjunta) | Ambos | Contrato assinado |
| 6 | **Aviso no primeiro login** do app, sem dark pattern | Replay já | Print da tela |
| 7 | **Aviso no checkout/reserva da arena** e no regulamento interno | Arena | Print / foto |
| 8 | **DPA/CPC da AWS confirmado como assinado na conta** — baixar do AWS Artifact e conferir se incorpora as Cláusulas-Padrão da Res. CD/ANPD nº 19/2024 (§11.2, item 2). Mesma conferência para Neon, Vercel e Resend | Replay já | PDF do DPA arquivado |
| 9 | **Decisão registrada sobre thumbnails públicos** (§2, D3) | Replay já | Decisão escrita |
| 10 | **Horários de escolinha infantil mapeados e gravação desligada neles** | Arena informa / Replay já configura | Agenda no painel |
| 11 | **Jobs de retenção implementados e testados** (90 / 7 dias) com lifecycle de segurança | Replay já | Teste registrado |
| 12 | **RIPD (§6) revisado e datado** | Replay já | Este documento |
| 13 | **Este documento revisado por advogado**, com os `[REVISAR COM ADVOGADO]` respondidos | Advogado | Parecer |

> Os itens 1, 2, 3 e 5 são os quatro que, se faltarem, transformam qualquer reclamação em um caso perdido.
> Os itens 8 e 9 são irreversíveis ou caros de reverter depois.

---

## 14. Fontes

**Normas**
- [Lei nº 13.709/2018 — LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) — consultada em 12/09/2026
- [Lei nº 12.965/2014 — Marco Civil da Internet](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm) — arts. 15, 19 e 21
- [Lei nº 15.211/2025 — ECA Digital](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm) — em vigor desde 17/03/2026
- [Decreto nº 12.622/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12622.htm) — regulamenta o ECA Digital
- [Lei nº 15.352/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15352.htm) — transforma a ANPD em agência reguladora
- Lei nº 8.069/1990 — ECA · Lei nº 10.406/2002 — Código Civil, art. 20 · CF/1988, art. 5º, V e X

**ANPD**
- [Guia Orientativo — Hipóteses legais: Legítimo Interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf) — publicado em **fev/2024**, consultado em 12/09/2026. Teste em três fases, legítima expectativa, documentação do LIA, direito de oposição
- [ANPD lança Guia Orientativo sobre Legítimo Interesse (notícia)](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-lanca-guia-orientativo-sobre-legitimo-interesse)
- [Transferência Internacional de Dados — página oficial](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) — consultada em 12/09/2026. Mecanismos admitidos; **Resolução CD/ANPD nº 32, de 26/01/2026** (adequação União Europeia/EEE, recíproca, reavaliação em 4 anos)
- [Resolução CD/ANPD nº 19, de 23/08/2024 — notícia oficial](https://www.gov.br/anpd/pt-br/assuntos/noticias/resolucao-normatiza-transferencia-internacional-de-dados) — Regulamento de Transferência Internacional e Cláusulas-Padrão Contratuais; período de adequação encerrado em **23/08/2025** ([Mayer Brown, ago/2025](https://www.mayerbrown.com/pt/insights/publications/2025/08/end-of-grace-period-implementation-of-brazils-standard-contractual-clauses-in-international-transfers-of-personal-data))
- [Mapa de Temas Prioritários 2026–2027 e Agenda Regulatória](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-mapa-de-temas-prioritarios-para-o-bienio-2026-2027-e-atualiza-agenda-regulatoria-2025-2026) — publicado em **24/12/2025**. Temas: direitos dos titulares; **crianças e adolescentes**; Poder Público; IA. Videomonitoramento **não** é tema prioritário do biênio
- [ECA Digital — página oficial da ANPD](https://www.gov.br/anpd/pt-br/assuntos/eca-digital) — consultada em 12/09/2026. Escopo ("acesso provável"), cronograma de fiscalização em três etapas
- Enunciado CD/ANPD nº 1, de 22/05/2023 — bases legais aplicáveis a dados de crianças e adolescentes, à luz do melhor interesse — **[REVISAR COM ADVOGADO]** conferir o texto oficial no Diário Oficial antes de citar em documento público

**Jurisprudência (sem extrapolação)**
- [Súmula 403 do STJ](https://www.stj.jus.br/docs_internet/revista/eletronica/stj-revista-sumulas-2014_38_capSumula403.pdf): *"Independe de prova do prejuízo a indenização pela publicação não autorizada de imagem de pessoa com fins econômicos ou comerciais."* Citada apenas pelo enunciado; **não** afirmamos aqui como um tribunal decidiria o caso do Replay já

**Técnicas**
- [AWS — Brazil Data Privacy](https://aws.amazon.com/compliance/brazil-data-privacy/) — consultado em **12/09/2026**. Declara que a AWS oferece um *"Data Processing Agreement that meets the requirements of LGPD"*; **não menciona** as Cláusulas-Padrão Contratuais da Res. CD/ANPD nº 19/2024 nem o mecanismo de transferência internacional adotado, e orienta contato com o gerente de conta. **A incorporação das CPCs da ANPD ao DPA da AWS não está confirmada por fonte pública** — ver §11.2, item 2
- [Neon — AWS and Azure Regions](https://neon.com/docs/introduction/regions) — consultado em 12/09/2026. `AWS South America (São Paulo) — aws-sa-east-1` disponível; região do projeto imutável após a criação
- [Cloudflare — R2 data location e jurisdictional restrictions](https://developers.cloudflare.com/r2/reference/data-location/) — consultado em 12/09/2026. **Citado apenas como registro histórico:** o R2 não tem região na América do Sul, e foi essa limitação que motivou a troca para S3 `sa-east-1` na rev. 3 da `adr/0001`

**Internas**
- `docs/PRD.md` · `docs/PLANO.md` (decisões 5, 6, 8, 9 e task D4) · `docs/api/README.md` §3 e §6 ·
  `docs/gtm/proposta-piloto.md` §6 · `docs/adr/0001-stack-e-arquitetura.md` §§1–3, 5

# Política de Privacidade — Replay já

> **MINUTA — não publicar antes da revisão de advogado.** Escrita em 12/09/2026 pelo responsável
> jurídico-operacional (não advogado). Marcações **[REVISAR COM ADVOGADO]** indicam risco relevante.
> Campos entre `[colchetes]` precisam ser preenchidos. Fundamentação completa em `analise-lgpd.md`.
>
> **Pendências que bloqueiam a publicação:** retenção 90/7 (conflito com `api/README.md`);
> confirmação do DPA/cláusulas-padrão assinados na conta AWS (§8.3); decisão sobre thumbnails públicos (§4.3).

---

# Política de Privacidade do Replay já

**Vigência a partir de:** [DD/MM/AAAA] · **Versão:** 1.0

Esta política explica, sem enrolação, **quais dados nós tratamos, por quê, por quanto tempo e com quem
compartilhamos**. Ela vale para qualquer pessoa que use o Replay já e também para **quem é filmado** nas quadras
das arenas parceiras, mesmo sem ter conta.

Se você quiser falar direto com a gente: **privacidade@replayja.com.br**.

---

## 1. O resumo, em cinco linhas

1. As quadras das arenas parceiras **são filmadas** durante o horário de funcionamento. Existe placa avisando.
2. Quando alguém aperta o botão, os **últimos 22 segundos** viram um vídeo que **qualquer pessoa logada** pode achar
   informando arena, quadra e horário.
3. **Não usamos reconhecimento facial** e **não ligamos** um lance a uma pessoa. Nunca.
4. **Você pode pedir a remoção de qualquer vídeo em que apareça**, sem conta, sem justificativa, e nós tiramos do ar
   em até 72 horas. Ver §7.
5. Guardamos pouco tempo: **lances 90 dias, gravação contínua 7 dias.**

---

## 2. Quem é responsável pelos seus dados

| | |
|---|---|
| **Controlador** | **[RAZÃO SOCIAL]**, CNPJ [CNPJ], [ENDEREÇO] — "Replay já" |
| **Controlador conjunto (imagens da quadra)** | A **arena parceira** onde a câmera está instalada. Nós e a arena decidimos juntos que aquela quadra é filmada e como os vídeos ficam disponíveis, então **somos os dois responsáveis** pelas imagens (LGPD, art. 5º, VI, e art. 42, § 1º, I). O nome, o CNPJ e o contato da arena aparecem na página dela, em `replayja.com.br/[arena]` |
| **Encarregado (DPO)** | [NOME] — **privacidade@replayja.com.br** |

**Você pode procurar qualquer um dos dois** — nós ou a arena — para exercer seus direitos. Se procurar a arena, ela
tem 24 horas para nos encaminhar o pedido. Se procurar a gente, resolvemos direto.

> **[REVISAR COM ADVOGADO]** A qualificação como controladoria conjunta é a posição conservadora recomendada em
> `analise-lgpd.md` §5 e contradiz o que consta hoje em `docs/gtm/proposta-piloto.md` §6 ("arena controladora, nós
> operadores"). A escolha tem efeito direto sobre responsabilidade solidária e sobre o contrato da arena.

---

## 3. O que coletamos, para quê, por quanto tempo e com quem

Esta é a tabela principal. Se você só for ler uma coisa, leia esta.

| O que coletamos | Para quê | Base legal (LGPD) | Por quanto tempo | Com quem compartilhamos |
|---|---|---|---|---|
| **Sua imagem e sua voz no vídeo do lance** (22 segundos) | Para você e outros jogadores reverem, baixarem e compartilharem os lances da partida | **Legítimo interesse** — art. 7º, IX | **90 dias** a partir da gravação | Com **qualquer pessoa logada** no Replay já que informe a arena, a quadra e o horário. Com a arena. Com nossos fornecedores de nuvem (§8) |
| **Sua imagem e sua voz na gravação contínua da quadra** (o dia inteiro de jogo) | Recuperar um lance que o botão não pegou; investigar falha de câmera; permitir que a arena verifique um incidente ocorrido na quadra | **Legítimo interesse** — art. 7º, IX | **7 dias** | **Somente com o administrador da arena.** Nunca com outros atletas, nunca por link, nunca publicamente |
| **Foto de capa do vídeo (thumbnail)** | Fazer a pré-visualização aparecer quando alguém compartilha o link no WhatsApp | Legítimo interesse — art. 7º, IX | Acompanha o vídeo (90 dias) | Fica acessível a quem tiver o link, inclusive fora do app — ver §4.3 |
| **Seu e-mail** | Criar e manter sua conta; enviar o código de acesso de 6 dígitos; avisar sobre convites de grupo | **Execução de contrato** — art. 7º, V | Enquanto sua conta existir; 30 dias após o pedido de exclusão | Provedor de envio de e-mail (**Resend**) e provedor do banco de dados (**Neon**). Se você entra com "Continuar com Google", o Google também participa |
| **Seu nome** | Identificar você nos grupos que você participa | Execução de contrato — art. 7º, V | Idem | Membros dos seus grupos |
| **E-mail de quem você convida para um grupo** | Enviar **um** convite | **Legítimo interesse** — art. 7º, IX | **90 dias** se o convite não for aceito; depois apagamos | Provedor de e-mail |
| **Como você usa o app**: buscas, vídeos abertos, downloads, compartilhamentos e por qual canal | Fazer o serviço funcionar; medir se ele é útil; mostrar à arena, **de forma agregada**, quantos lances foram vistos e compartilhados | Legítimo interesse — art. 7º, IX | **12 meses** identificado; depois vira número sem nome | Arena (só números agregados, nunca "fulano assistiu tal vídeo"). Ferramenta de análise |
| **Seu endereço IP, navegador, data e hora de acesso** | Cumprir a lei brasileira (Marco Civil da Internet, art. 15); proteger o serviço contra abuso e varredura do acervo | **Obrigação legal** — art. 7º, II, e **legítimo interesse** — art. 7º, IX | **6 meses** (é o prazo que a lei manda guardar) | Provedores de infraestrutura; autoridades, mediante ordem judicial |
| **Registro de quem abriu, assistiu e baixou cada vídeo** | Proteger quem aparece nos vídeos: saber quem acessou o quê, se houver abuso | Legítimo interesse — art. 7º, IX | 12 meses | Ninguém, salvo por ordem judicial ou investigação de abuso |
| **Nome, e-mail e telefone do responsável da arena** | Gerir o contrato e o suporte | Execução de contrato — art. 7º, V | Contrato + 5 anos | Contabilidade, financeiro |
| **Seu e-mail, se você aceitar receber novidades** | Mandar novidades do Replay já | **Consentimento** — art. 7º, I | Até você cancelar (1 clique) | Provedor de e-mail |
| **Seu pedido de remoção de vídeo** | Atender o pedido e provar que atendemos | Obrigação legal e exercício de direitos — art. 7º, II e VI | 5 anos | Arena, quando o pedido depender dela |

---

## 4. Explicando melhor as partes delicadas

### 4.1 Por que não pedimos sua autorização antes de filmar

Uma pelada tem 10, 15, 20 pessoas em quadra, e elas mudam o tempo todo. Não existe jeito honesto de pedir
autorização a cada uma antes de cada partida — e uma autorização dada com pressa, na porta da quadra, para poder
jogar, **não seria uma autorização livre de verdade**.

Por isso usamos a base legal de **legítimo interesse** (art. 7º, IX), que é o que a lei prevê para situações assim.
Usar essa base nos obriga a algumas coisas, e nós as cumprimos:

- **Avisar antes:** placa visível em cada quadra filmada, aviso na reserva da arena, aviso no seu primeiro acesso.
- **Coletar o mínimo:** o lance tem 22 segundos, não a partida inteira; a gravação contínua dura 7 dias e só a arena vê.
- **Facilitar a saída:** você pede a remoção de qualquer vídeo, sem conta e sem justificativa (§7).
- **Não fazer o que assusta:** sem reconhecimento facial, sem identificar pessoas, sem perfil de comportamento, sem
  venda de dados, sem publicidade direcionada.

Se você discorda desse tratamento, você tem o **direito de se opor** (art. 18, § 2º) — veja o §7.

### 4.2 Quem consegue ver os vídeos em que você aparece

**Qualquer pessoa com conta no Replay já** que informe a arena, a quadra e um intervalo de até 6 horas.
Nós **não** restringimos a busca a quem jogou na partida, porque não temos como saber quem jogou.

O que existe de proteção, e é real:

- **Login obrigatório.** Nenhum vídeo é público, nem por link direto.
- **Busca sempre com janela de horário.** Não existe "ver todos os vídeos desta arena".
- **Limite de uso:** no máximo 120 buscas e 30 downloads por hora, por pessoa.
- **Links de vídeo expiram** (6 horas para assistir, 15 minutos para baixar).
- **Nada aparece no Google.** Nenhum vídeo é indexado por buscador.
- **Registramos quem acessou.** Se houver abuso, sabemos quem foi.

**Grupo não protege vídeo.** Deixar seu grupo privado esconde a página e a lista de membros, **não** os vídeos.

### 4.3 Foto de capa (thumbnail) pública

Para a pré-visualização aparecer quando alguém manda o link no WhatsApp, a foto de capa do vídeo precisa ser
acessível sem login — o robô do WhatsApp não tem conta. É a única parte do serviço em que uma imagem fica visível
fora do app.

Ela é um **frame estático, sem som e em baixa resolução**, e é apagada junto com o vídeo. Ainda assim, se você não
quer a sua imagem nem nisso, peça a remoção do vídeo (§7) — a capa vai junto.

> 🔴 **[REVISAR COM ADVOGADO] + [PENDÊNCIA TÉCNICA]** Esta é a única superfície pública do produto e o item de maior
> inconsistência com o resto da arquitetura de privacidade (`analise-lgpd.md` §2, D3). As alternativas — capa
> desfocada ou em enquadramento aberto; capa pública apenas sob token de compartilhamento revogável — devem ser
> decididas **antes** de publicar esta política, porque o texto acima muda conforme a decisão.

### 4.4 O que acontece quando alguém baixa e reposta

O Replay já foi feito para isso: você baixa e manda no grupo. Isso significa que **cópias dos vídeos saem do nosso
controle**. Quando alguém baixa um vídeo e posta no Instagram, aquela cópia é dela, não nossa.

Se você pedir a remoção, nós apagamos a nossa cópia e derrubamos os links — mas **não conseguimos apagar uma cópia
que já está no celular ou no perfil de outra pessoa**. Nós te ajudamos com o caminho para pedir a remoção nas outras
plataformas (§7), mas não prometemos algo que não podemos entregar.

### 4.5 Crianças e adolescentes

Para ter conta no Replay já é preciso ter **18 anos ou mais**.

Se uma criança ou adolescente aparece em um vídeo — por exemplo, em uma escolinha — **o pai, a mãe ou o responsável
pode pedir a remoção imediatamente**, sem conta, sem justificativa e sem qualquer verificação. Prazo de **24 horas**.

Em arenas com escolinha infantil, **a gravação fica desligada nos horários de aula**. Se você é responsável e vê
uma câmera ligada durante uma aula, avise em **privacidade@replayja.com.br** — nós desligamos e verificamos.

### 4.6 O que nós não fazemos

- Não usamos reconhecimento facial nem qualquer biometria.
- Não ligamos automaticamente um lance a uma pessoa.
- Não vendemos seus dados.
- Não fazemos publicidade direcionada nem perfilamento comportamental.
- Não usamos seus vídeos para treinar inteligência artificial. **Se um dia formos usar, avisaremos antes e
  refaremos esta política** — não é uma coisa que faríamos sem contar.
- Não tomamos nenhuma decisão automatizada sobre você.

---

## 5. Cookies e tecnologias parecidas

Usamos o mínimo:

| Tipo | Para quê | Dá para desativar? |
|---|---|---|
| **Essenciais** | Manter você logado, lembrar preferências, proteger contra abuso | Não — sem eles o site não funciona |
| **Medição de uso** | Saber quais telas funcionam e onde as pessoas desistem | Sim, no banner e em Conta → Privacidade |

**Não usamos cookies de publicidade, nem pixel de rede social, nem rastreamento entre sites.**

---

## 6. Segurança

Nós usamos, entre outras medidas: criptografia em trânsito (HTTPS) e em repouso; links de vídeo assinados e de curta
duração; controle de acesso verificado em todas as consultas da aplicação; acesso à gravação contínua
restrito a administradores identificados da arena, com registro; e senhas fora do jogo (login por código ou Google).

**Nenhum sistema é 100% seguro.** Se houver um incidente que possa causar risco relevante a você, nós comunicamos
você e a ANPD, conforme o art. 48 da LGPD.

---

## 7. Seus direitos, e como usar

Você tem os direitos do **art. 18 da LGPD**. Na prática:

| Você quer | O que fazer | Prazo |
|---|---|---|
| **Tirar um vídeo do ar** | `replayja.com.br/remover` ou **privacidade@replayja.com.br**. **Sem conta, sem justificativa, sem prova.** Informe arena, quadra, dia e horário aproximado — ou cole o link | **72 horas úteis** (24 h se envolver menor de idade) |
| **Se opor** a ser filmado | Mesmo canal. Na prática, a oposição se resolve removendo os vídeos: **não temos como deixar de filmar uma pessoa específica numa quadra** — quem decide ligar a câmera naquele espaço é a arena. Dizemos isso com todas as letras porque prometer o contrário seria mentira | 72 h / resposta em 15 dias |
| Saber se tratamos dados seus, e quais | **privacidade@replayja.com.br** | Imediato para o básico; 15 dias para o completo |
| Corrigir nome ou e-mail | Conta → Perfil | Na hora |
| Levar seus dados para outro lugar | **privacidade@replayja.com.br** — mandamos um arquivo com sua conta, grupos e histórico de uso | 15 dias |
| **Excluir sua conta** | Conta → Excluir minha conta | Imediato no app; 30 dias para sumir dos backups |
| Cancelar as novidades por e-mail | Link no rodapé do e-mail | Na hora |
| Saber com quem compartilhamos | Está no §3 e no §8 desta política | — |
| Reclamar | **ANPD** (`gov.br/anpd`) e órgãos de defesa do consumidor | — |

**Sobre acesso a vídeo:** se você pedir "me mande todos os vídeos em que eu apareço", nós **não conseguimos** —
não sabemos quem está em qual vídeo, exatamente porque não usamos reconhecimento facial. E não entregamos vídeos
com outras pessoas a quem não estava lá. Se você identificar um vídeo específico, resolvemos esse.

**Excluir a conta não apaga os vídeos em que você aparece** — eles têm outras pessoas e não são "seus". Peça a
remoção deles **antes** de excluir a conta.

---

## 8. Com quem compartilhamos e onde os dados ficam

### 8.1 Quem tem acesso

| Quem | O que recebe | Por quê |
|---|---|---|
| **A arena parceira** | Gravação contínua da quadra dela (7 dias); números agregados de uso | É controladora conjunta e responsável pelo espaço |
| **Outros usuários logados** | Os lances (vídeos de 22 s) | É o serviço |
| **Nossos fornecedores de tecnologia** | Só o necessário, como operadores, sob contrato | Fazer o serviço funcionar |
| **Autoridades** | O que for determinado | Ordem judicial ou obrigação legal |

**Não vendemos dados, não trocamos dados com anunciantes e não compartilhamos com outras arenas.**

### 8.2 Nossos fornecedores (operadores)

| Fornecedor | Para quê | Onde processa |
|---|---|---|
| **Amazon Web Services (AWS)** | Recepção do vídeo das câmeras, **armazenamento dos vídeos** e entrega deles pela rede de distribuição (CloudFront) | **Vídeos guardados em São Paulo, Brasil** 🇧🇷. As cópias temporárias de entrega (cache) ficam em servidores dentro **e fora** do Brasil — ver §8.3. Empresa sediada nos EUA |
| **Neon** | Banco de dados (sua conta, seus grupos, seu histórico de uso e os registros de erro do aplicativo) | **São Paulo, Brasil** 🇧🇷 (empresa sediada nos EUA) |
| **Vercel** | Site e aplicativo | **São Paulo, Brasil** 🇧🇷, com cache distribuído globalmente (empresa sediada nos EUA) |
| **Resend** | Envio de e-mails (código de acesso de 6 dígitos, convites de grupo) | **Estados Unidos** |
| **Google** | Login com conta Google (opcional) | Global |

> **O login é nosso.** Não usamos serviço terceirizado de autenticação: o código de 6 dígitos é gerado e conferido
> por nós, e a sua sessão fica num cookie assinado do próprio Replay já. O Resend só **entrega o e-mail**; o Google
> só confirma que o e-mail é seu, quando você escolhe entrar por ele.
>
> **Os erros do aplicativo ficam com a gente**, numa tabela do nosso próprio banco de dados, guardando apenas o
> código do erro, a tela onde ele aconteceu e o seu e-mail **embaralhado** (hash) — nunca o e-mail legível.
> Não usamos serviço externo de monitoramento de erros.

A lista atualizada fica em **replayja.com.br/privacidade/fornecedores** e é versionada — quando ela muda, a data de
vigência desta política muda junto.

### 8.3 Transferência internacional

**Nós escolhemos guardar os seus vídeos no Brasil.** Os lances, as capas, a gravação contínua da quadra e o banco de
dados com a sua conta ficam em servidores em **São Paulo**. Isso não era o mais barato nem o mais simples — foi uma
decisão deliberada, porque é a imagem de pessoas que está em jogo.

Ainda assim, **parte do tratamento acontece fora do Brasil**, e seria desonesto não dizer:

- **As cópias de entrega dos vídeos.** Para o vídeo carregar rápido, ele é copiado temporariamente para servidores
  de distribuição espalhados pelo mundo. Se alguém assiste a um lance de fora do Brasil, fica uma cópia temporária
  naquele servidor. O original continua em São Paulo, e os links de acesso expiram em poucas horas.
- **Os e-mails que enviamos** — o código de acesso e os convites de grupo — passam por um provedor nos Estados Unidos.
- **As empresas que operam esses serviços são estrangeiras**, e o suporte técnico delas pode, em situações
  específicas, acessar os sistemas a partir de outros países.

Isso é permitido pela LGPD (arts. 33 a 36) desde que existam garantias adequadas. As nossas são:

- **Manter o dado em repouso no Brasil** sempre que possível — é o que fazemos com vídeo, gravação e banco de dados;
- **Cláusulas-padrão contratuais** nos moldes da Resolução CD/ANPD nº 19, de 23/08/2024, ou garantias equivalentes,
  com os fornecedores que tratam dados fora do Brasil; **[a confirmar — ver alerta]**
- Contratos de tratamento de dados com todos os operadores.

> 🔴 **[REVISAR COM ADVOGADO] + [PENDÊNCIA BLOQUEANTE]** Antes de publicar, **confirmar que o DPA da AWS aceito na
> nossa conta incorpora as Cláusulas-Padrão Contratuais da Res. CD/ANPD nº 19/2024** — a página pública da AWS diz
> apenas que o DPA "atende aos requisitos da LGPD" e **não menciona** as cláusulas-padrão brasileiras
> (`analise-lgpd.md` §11.2, item 2). Fazer a mesma conferência para Neon, Vercel e **Resend** — este último é o único
> fornecedor em que dado pessoal fica **em repouso** fora do Brasil. Enquanto não confirmado, **o terceiro marcador
> acima não pode ser publicado como está**. Não publicar esta seção "no chute".

---

## 9. Mudanças nesta política

Quando mudarmos algo relevante, avisamos por e-mail e dentro do app com **15 dias** de antecedência, e a data de
vigência no topo muda. Versões anteriores ficam em `replayja.com.br/privacidade/historico`.

---

## 10. Fale com a gente

- **privacidade@replayja.com.br** — privacidade, remoção de vídeo, direitos sobre seus dados
- **replayja.com.br/remover** — pedido de remoção (sem precisar de conta)
- **contato@replayja.com.br** — suporte e dúvidas gerais
- Encarregado de proteção de dados: **[NOME]**
- **ANPD** — `gov.br/anpd`

---

**[RAZÃO SOCIAL] — CNPJ [CNPJ]** · Versão 1.0, vigente desde [DD/MM/AAAA].

<!--
Fontes normativas usadas na redação (não publicar este bloco):
- LGPD, Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Marco Civil, Lei 12.965/2014, art. 15: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm
- ANPD, Guia Orientativo sobre Legítimo Interesse (fev/2024):
  https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf
- ANPD, Transferência Internacional de Dados (Res. 19/2024 e Res. 32/2026):
  https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados
- ECA Digital, Lei 15.211/2025: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm
- AWS — Brazil Data Privacy: https://aws.amazon.com/compliance/brazil-data-privacy/
- Neon — AWS and Azure Regions (`aws-sa-east-1`): https://neon.com/docs/introduction/regions
Todos consultados em 12/09/2026. Análise completa em docs/legal/analise-lgpd.md.
-->

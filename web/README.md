# Replay já — app web

Next.js 15 (App Router) + TypeScript estrito + `pg` puro. Sem ORM, sem Supabase,
sem Sentry, sem Auth.js.

Entregue na task **B1** do `docs/PLANO.md` (scaffold), com **B3** (auth) completa
e a **base de B2** (API do relay, gatilhos, migrações).

---

## Sumário

1. [Como rodar](#1-como-rodar)
2. [Estrutura](#2-estrutura)
3. [As quatro regras que substituem o RLS](#3-as-quatro-regras-que-substituem-o-rls)
4. [Migrações](#4-migrações)
5. [Autenticação](#5-autenticação)
6. [API do relay](#6-api-do-relay)
7. [Observabilidade sem Sentry](#7-observabilidade-sem-sentry)
8. [Testes e CI](#8-testes-e-ci)
9. [Roteiro do E2E em produção](#9-roteiro-do-e2e-em-produção)
10. [Decisões e pendências](#10-decisões-e-pendências)

---

## 1. Como rodar

```bash
pnpm install
cp .env.example .env.local     # preencha ao menos SESSION_SECRET
pnpm dev
```

Sem `DATABASE_URL` o app **sobe**: `/api/health` responde `degraded` e as páginas
que dependem do banco tratam a ausência. Sem `RESEND_API_KEY`, o código de login
sai no log do servidor — nunca na resposta.

Provisionamento de contas (Vercel, Neon, Resend, Google, AWS):
**`docs/setup-contas.md`**.

| Comando | O que faz |
|---|---|
| `pnpm dev` | servidor de desenvolvimento |
| `pnpm build` | build de produção |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | vitest (o de integração é pulado sem `TEST_DATABASE_URL`) |
| `pnpm migrate` | aplica as migrações pendentes |
| `pnpm migrate:status` | lista o que está aplicado |
| `pnpm migrate:roundtrip` | `up → down → up` (é o que o CI roda) |
| `pnpm seed:piloto` | semeia a Arena Vasco (parceiro, quadras, câmeras, botões, admins) |
| `pnpm smoke:grupo` | cria/confere o grupo do piloto rodando as consultas de verdade (idempotente) |
| `pnpm icones` | regenera os PNG do PWA a partir da forma do `public/icone.svg` |

**Design system:** os tokens vivem em `app/globals.css` e os componentes em
`components/ui/`. O catálogo visual de todos eles, em todos os estados, é a rota
**`/dev/ui`** (fora de produção). O mapa artboard → tela → componente, as
divergências em relação ao canvas e as pendências estão em
**`web/docs/design-system.md`**.

---

## 2. Estrutura

```
web/
  components/
    ui/                        o design system (C1) — Button, ClipCard, Player…
    og.tsx                     a arte das imagens de Open Graph
  docs/design-system.md        tokens, mapa dos artboards e pendências
  app/
    dev/ui/                    catálogo visual dos componentes (404 em produção)
    [arenaSlug]/                 página pública do parceiro (catch-all da raiz)
      [groupSlug]/               página do grupo (semanas derivadas do filtro)
      grupos/novo/               criar grupo (server action em `acoes.ts`)
      s/[sessionSlug]/           página da sessão (uma JANELA, não uma linha)
    convite/[token]/             aceite do convite → membro → grupo
    app/                         área logada: arenas → busca → grupos
    painel/                      painel do parceiro
    entrar/  sair/               auth (2 etapas, pt-BR)
    api/
      auth/{otp,google,logout}/  OTP + Google OIDC manual
      relay/                     cameras, clip-jobs, clips/*, health
      triggers/                  botão virtual e botão físico
      shares/                    `share_event` por canal (nunca cria share_link)
      grupos/[id]/convite/       o link de convite (um `share_link` revogável)
      health/                    check do monitor externo
  db/
    migrations/*.sql             SQL puro, numerado por data, com up e down
    queries/*.ts                 TODO acesso ao banco passa por aqui
  lib/                           auth, db, storage, limites, erros
  scripts/migrate.ts             runner de ~250 linhas
  tests/                         vitest
```

`relay/` (irmão desta pasta) é o fork Python do relay v2. **Não há
`pnpm-workspace.yaml`**: ver §10.

---

## 3. As quatro regras que substituem o RLS

A revisão 3 da ADR trocou Supabase por Neon com `pg` puro, e com isso **a segunda
camada de autorização deixou de existir**. Um `WHERE` esquecido numa rota nova não
volta vazio: volta tudo. Isso é uma dívida de segurança assumida
(`modelo-de-dados.md` §7), e estas quatro regras são a compensação — **todas
verificadas pelo CI**:

1. **Nenhuma rota escreve SQL.** Todo acesso passa por `db/queries/`.
2. **Toda função de consulta recebe a sessão como primeiro argumento**, e o tipo
   obriga.
3. **O escopo entra na cláusula `WHERE`**, nunca num filtro em memória — que é
   como escopo vaza em paginação.
4. **Toda rota autenticada tem o teste do usuário errado** (403), não só o do
   caminho feliz.

Mais duas regras de projeção, porque sem RLS não há privilégio de coluna:
`SELECT *` é proibido em `db/queries/`, e `camera.rtmp_key`, `camera.rtsp_url`,
`button.token_hash` e `relay_node.key_hash` só aparecem na consulta que serve
`GET /api/relay/cameras`.

> O job `disciplina` do CI já pegou uma violação real durante esta própria task:
> `app/painel/page.tsx` chamava `query<T>(...)` direto, e o padrão de grep inicial
> não via a chamada por causa do generic. Os dois foram corrigidos.

---

## 4. Migrações

SQL puro em `db/migrations/`, um arquivo por assunto, nome começando com a data.
Cada arquivo tem **dois blocos**:

```sql
-- +migrate up
CREATE TABLE ...

-- +migrate down
DROP TABLE ...
```

O `down` não é enfeite: sem ORM não há rollback automático, e a compensação que a
ADR §4.3 exige é o **roundtrip `up → down → up`** que o CI roda contra um Postgres
em container. É o que pega o `DROP` esquecido e a dependência na ordem errada.

- Cada arquivo roda em **uma transação**: entra inteiro ou não entra.
- Editar uma migração já aplicada **falha alto** (checksum) — o erro clássico é
  produção ficar com a versão antiga e ninguém perceber.
- Um lock consultivo põe dois deploys simultâneos em fila.
- **Preview não escreve esquema**: fora de `VERCEL_ENV=production` o runner só lê.
  Sem isso, uma branch pela metade aplicaria a migração dela em produção.

As 9 migrações iniciais cobrem as 28 tabelas de `modelo-de-dados.md`. A 10ª
(`slug-convite`) é uma migração **delta**: a 0009 já está aplicada em produção e
o checksum proíbe editá-la, então todo slug de sistema novo entra num arquivo
próprio (ver §10.1.2, decisão 24).

---

## 5. Autenticação

Portada do Sentinela (ADR §4.4), com duas diferenças deliberadas.

**O que se copiou sem discussão**: OTP de 6 dígitos com o desafio num cookie HMAC
de 10 min (**sem tabela** — não há linha para expirar, limpar nem vazar); sessão em
cookie HMAC de 400 dias com renovação deslizante (**sem tabela**);
`app-secret.ts` que **lança em produção** quando `SESSION_SECRET` falta;
`safeEqualB64` comparando **buffers**, não strings; `secure` condicional nos dois
cookies; rate limit com contador no Postgres e fallback em memória; e a **ordem dos
tetos** do `login/route.ts` — todos antes de qualquer trabalho caro.

**O que mudou**:

| | Sentinela | Replay já |
|---|---|---|
| Tabela de usuário | não existe | **`app_user`** — grupos e posse exigem id estável |
| Autorização no cookie | `plan`, `rec`, `chk`, `dsig` | **nada.** `{uid, email, exp}` e só |
| Papel de admin | — | **consultado no banco** a cada requisição de painel |
| Provedores | só OTP | OTP **+ Google** (OIDC manual com `jose`) |

As **três checagens** do `id_token` que não podem faltar — errar qualquer uma é
tomada de conta alheia: `email_verified === true`; `aud === GOOGLE_CLIENT_ID` (um
token legítimo emitido para OUTRO app também é assinado pelo Google); e o `nonce`
conferido contra o cookie do desafio.

A vinculação de contas é o `upsert ON CONFLICT (email)`: quem entrou por OTP na
segunda e por Google na quarta cai na mesma `app_user`.

> **Node e Edge assinam igual.** O middleware roda no Edge (Web Crypto,
> assíncrono) e as rotas no Node (`node:crypto`); os dois precisam ler o cookie um
> do outro, senão a renovação do middleware emitiria um cookie que as rotas
> recusam — sintoma: "de vez em quando o usuário é deslogado sozinho". Há teste
> cruzado (`tests/sessao.test.ts`).

---

## 6. API do relay

`x-relay-key` no cabeçalho; o banco guarda só o SHA-256 da chave.

| Rota | O quê |
|---|---|
| `GET /api/relay/cameras` | lista de câmeras (a **única** rota que projeta `rtmp_key`) |
| `GET /api/relay/clip-jobs` | reivindica jobs — **o caminho canônico do `openapi.yaml`** |
| `POST /api/relay/clip-jobs/claim` | alias do anterior, mesma função |
| `POST /api/relay/clips/{id}/upload-url` | URLs pré-assinadas (S3 direto) |
| `POST /api/relay/clips/{id}/confirm` | verifica e fecha o job |
| `POST /api/relay/health` | `RelayHealthRequest` do contrato, a cada 60 s |

**Quem manda em quem**: o app **não escreve** no relay. O relay pergunta, e a
resposta é sempre uma *lista*, nunca um comando. A única chamada nuvem → relay é
`POST /jobs`, que apenas **acorda** — se falhar, o ciclo de 2 s pega o job.

A reivindicação é atômica (`FOR UPDATE SKIP LOCKED`) com **lease de 120 s**:
vencido sem confirmação, o job volta para `pending`. Reexecutar é seguro porque a
janela é **absoluta** — o mesmo job rodado três vezes produz três arquivos
idênticos na mesma chave de objeto.

O `/confirm` verifica **tamanho e `sha256`** contra o objeto no storage antes de
aceitar, e responde `409 checksum-mismatch` (RFC 9457) quando divergem. Um upload
truncado ou corrompido não vira clipe `ready` que não toca.

---

## 7. Observabilidade sem Sentry

`lib/app-error.ts` grava em `app_error` com `fingerprint`, `route`, `traceId`,
`count`, `first_seen_at`, `last_seen_at` e
`ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1`.

É um Sentry pobre — sem agregação por release, sem breadcrumbs, sem alerta de pico
— mas é **consultável com SQL e não expira**, que é exatamente o que os Runtime
Logs da Vercel não oferecem (retenção curta: um erro de sexta à noite pode não
estar lá na segunda).

O `traceId` vai no corpo do erro (RFC 9457) e é o **mesmo** valor gravado na
tabela: é o fio entre a reclamação do usuário e a linha.

A fingerprint é `rota + tipo do erro + primeira linha de stack nossa` —
deliberadamente **sem a mensagem inteira**, que costuma carregar id e timestamp e
faria cada ocorrência virar um grupo novo.

`/api/health` checa o **banco**, não só se o processo subiu.

---

## 8. Testes e CI

**130 testes, todos passando** — 102 unitários e 28 de integração contra Postgres
real.

Unitários: OTP e desafio HMAC (incluindo o caso multibyte que fazia
`timingSafeEqual` lançar `RangeError`), sessão Node↔Edge, slug e sincronia da lista
de reservados com a migração, janela do corte e cooldown, fingerprint de erro,
pseudonimização LGPD e redirect aberto.

Unitários (acréscimo desta task): a derivação das ocorrências do grupo
(`tests/ocorrencias.test.ts`) — virada de mês, de ano e de ano bissexto, janela
que cruza a meia-noite, fuso da arena contra fuso da máquina, e a tolerância que
mantém "hoje" como próximo jogo enquanto a pelada acontece.

Integração: roundtrip das migrações, as 28 tabelas, os índices da consulta central,
retenção 90/7, keyset sem repetir nem pular, reivindicação atômica com dois relays
concorrentes, lease vencido, `AT TIME ZONE` das sessões semanais, a trava de
grupo apontando para quadra de outro parceiro, e — desta task — a derivação das
ocorrências **rodando as consultas de verdade** (`db/queries/*`): contagem por
janela, clipes por sessão, ocorrência vazia que continua na lista, unicidade do
slug por arena, e a matriz de autorização do grupo (qualquer logado vê os
lances; não membro recebe 404; membro comum não é dono; entrar duas vezes não
duplica).

> As datas dos testes de ocorrência são **calculadas a partir de `now()`**, nunca
> fixas. Uma data fixa faria a suíte passar hoje e falhar em três meses, quando
> ela saísse da janela de 8 semanas — o pior tipo de teste, o que quebra sem
> ninguém ter mexido em nada.

O CI tem dois jobs: `verificar` (lint, typecheck, roundtrip, testes, build, com
Postgres em container) e `disciplina` (os greps que sustentam as regras do §3).

---

## 9. Roteiro do E2E em produção

> Para o fundador, pelo celular, em <https://replayja.vercel.app>.
> Dez minutos, nesta ordem. Se um passo falhar, o passo seguinte não prova nada.

### 9.0 Antes de começar: o diagnóstico

Abra **`/api/health`**. É a única tela que responde as três perguntas de
infraestrutura de uma vez:

```jsonc
{
  "status": "ok",
  "db": "ok",
  "storage": { "estado": "ok", "bucket": "replayja-clips", "latenciaMs": 180 },
  "relay":   { "id": "relay-1", "online": true, "ultimoHeartbeat": "…", "jobsPendentes": 0 }
}
```

| O que aparece | O que significa | O que fazer |
|---|---|---|
| `storage.estado: "erro"` com `AccessDenied` | a **role OIDC** da Vercel não tem permissão no bucket | conferir a trust policy de `replayja-vercel-app` |
| `storage.estado: "erro"` com `InvalidIdentityToken` | a federação OIDC não está ligada no projeto | Vercel → Settings → Security → OIDC |
| `relay.online: false` e `ultimoHeartbeat: null` | o relay **nunca** falou conosco | a instalação da EC2 não terminou |
| `relay.online: false` com heartbeat antigo | o relay caiu | reiniciar o serviço na EC2 |
| `status: "degraded"` | o site funciona, o **vídeo** não | é o storage ou o relay, veja acima |

`status: "degraded"` responde **200** de propósito: o monitor externo alerta por
indisponibilidade, e acordar alguém de madrugada porque o relay reiniciou ensina
o time a ignorar o alerta.

### 9.1 Entrar (com o e-mail de bypass)

1. Abra **`/entrar`**.
2. Digite um dos e-mails de operação (`teste1@replayja.com.br` ou
   `teste2@replayja.com.br`) — eles estão em `OTP_BYPASS_EMAILS`.
3. Digite o **código fixo de 6 dígitos** (`OTP_TEST_CODE`, repassado à parte).

4. Depois de entrar você cai em **`/app`** — a lista de **arenas**, que é o passo
   1 do fluxo do PRD ("Arena/parceiro → horário → vídeos"). Busque por
   `vasco` (nome, cidade ou endereço servem) e confira no card: cidade, nº de
   quadras e **última gravação**. Se a câmera estiver mandando segmento agora, o
   card mostra a pílula **ao vivo**.

> **Não existe mais atalho que pule a arena.** `/app/buscar` sem `?arena=`
> redireciona para `/app`, e a barra de navegação não tem mais um "Buscar"
> solto. Era daí que vinha o "meio bugado": a busca abria ancorada numa arena
> **adivinhada** e, quando o palpite errava, voltava vazia — indistinguível de
> "não gravou".

> **O e-mail não chega, e é esperado.** O domínio ainda não está verificado no
> Resend (pendência G-4/G-1), então nenhum código sai. O bypass existe só por
> causa disso, vale **apenas** para os e-mails dessa lista e grava uma linha
> `{"evento":"otp_bypass"}` nos Runtime Logs a cada uso. Qualquer outro endereço
> — inclusive outro `@replayja.com.br` — continua exigindo o código real.
>
> **Para desligar quando o Resend estiver pronto:** apague `OTP_BYPASS_EMAILS` e
> `OTP_TEST_CODE` da Vercel. Não há código a mudar.

### 9.2 Ver a arena e o painel

5. Abra **`/arena-vasco`** — a página pública da Arena Vasco, com as 2 quadras.
   (Da lista de `/app`, tocar na arena leva direto à busca dela — a página
   pública é o endereço que a **arena** divulga.)
6. Abra **`/painel?arena=arena-vasco`**. As duas contas de operação são `owner`
   da arena, então o painel abre direto.
7. Confira em **Câmeras e gravação**:
   - **gravando** (verde) — a câmera está enviando segmentos. É o que você quer.
   - **aguardando relay** — a câmera foi cadastrada e **nunca** conectou. Não é
     queda: é a chave RTMP que ainda não foi digitada na câmera, ou o relay que
     ainda não subiu.
   - **instável** — grava, mas com cobertura abaixo de 90% em 24 h. A causa
     quase sempre é o uplink da arena, e a ação é do lado do parceiro.
   - **offline** — já conectou e parou.
8. **`/painel/cameras?arena=arena-vasco`** tem a mesma leitura em tabela, com o
   estado do relay (último heartbeat, disco livre, cortes na fila) em cima.

### 9.3 Apertar o botão virtual

9. Abra **`/app/botao?arena=arena-vasco&quadra=quadra-1`**.
10. O topo do cartão diz se a câmera está gravando. **Se não estiver, pare aqui**:
   o toque vai ser recusado de propósito — melhor dizer agora do que entregar um
   vídeo vazio daqui a 30 segundos.
11. Toque em **Salvar lance**. Três coisas acontecem, nesta ordem:
    - confirmação imediata: *"Lance salvo às 20:47"*;
    - o botão trava por **8 segundos** (o cooldown por quadra — cinco toques no
      mesmo gol viram um clipe só);
    - abaixo, *"Cortando o lance…"* até o corte ficar pronto, e então o link
      **Assistir agora**.

O corte normal leva de 15 a 40 segundos. Se passar de 2 minutos, a tela diz
que o lance **não se perde** e manda para a busca — o job continua na fila.

### 9.4 Achar, tocar, baixar, compartilhar

12. Volte a **`/app`**, toque em **Arena Vasco** — e só então a busca abre, já
    ancorada nela. Toque em **Agora** → **Buscar lances**. O atalho usa o
    relógio **da arena** (`America/Sao_Paulo`), não o do celular.
13. O lance recém-salvo aparece na grade. Enquanto está sendo cortado ele tem o
    selo **processando** e **não abre** — um card que abrisse um player vazio
    queimaria mais confiança do que um card que avisa.
14. Toque no card → abre **`/arena-vasco/c/<id>`**, o player. A URL do vídeo é
    assinada e vale **6 horas**.
15. **Baixar em alta** → o arquivo é salvo (não abre em outra aba). A URL de
    download é assinada por **15 minutos**, separada da de reprodução, porque é
    a que vaza. Baixar também **fixa a retenção** do lance por mais 180 dias.
16. **WhatsApp** → no celular abre a folha de compartilhamento do sistema; no
    desktop cai no `wa.me`. **Copiar link** copia a URL do player.
17. Cole o link num grupo: o card mostra a **miniatura** do lance (bucket
    público) com um texto genérico. Nunca dizemos horário e quadra num preview
    que qualquer pessoa vê — quem abrir ainda precisa entrar para assistir.

### 9.5 A sessão e o grupo — o diferencial do PRD

18. No fim do resultado da busca, toque em **Compartilhar esta busca**. Você cai
    em **`/arena-vasco/s/quadra-1-2026-09-12-20h-21h`** — a página da **sessão**,
    que é a mesma janela com endereço próprio, preview de Open Graph e gate de
    login. Abra o link numa aba anônima: a grade aparece **borrada** com o
    contador, igual à página da arena.
19. Na sessão, toque em **Salvar como grupo**. O formulário
    (`/arena-vasco/grupos/novo`) abre com **quadra, dia da semana e horário já
    preenchidos** — só falta o nome. O endereço é derivado do nome enquanto você
    digita, com o selo **Disponível** conferido no servidor.
20. **Criar grupo** leva a **`/arena-vasco/fut-sexta`**. O cabeçalho mostra a
    recorrência, a próxima pelada e os membros; abaixo, uma seção por semana com
    os lances daquela janela e o link para a sessão daquela noite. Semana sem
    lance **continua aparecendo**, com a explicação — sumir com ela faria o
    atleta achar que o produto perdeu o jogo dele.
21. Toque em **Convidar**: a folha traz o link **`replayja.com.br/convite/<token>`**
    (um `share_link`, revogável), o botão do WhatsApp e o de e-mail. Abra o link
    de convite numa aba anônima: ele pede login e, ao voltar, **já entra no
    grupo** e cai na página dele.

> **O e-mail do convite pode não chegar, e isso é esperado** — mesma pendência
> G-4 do login. O convite nunca falha por causa disso: o link e o WhatsApp
> funcionam sempre, e a resposta da rota diz o que aconteceu com o e-mail.

22. **`/app/grupos`** lista os grupos com **próximo horário** e **último lance**.
    A ordem é pelo próximo jogo, não alfabética.

### 9.6 Se algo não funcionar

| Sintoma | Causa mais provável |
|---|---|
| "Câmera fora do ar" ao tocar o botão | a câmera está há mais de 60 s sem segmento |
| "Estamos com um problema técnico" | `relay_node.status` não é `active` |
| "Calma aí" | cooldown de 8 s da quadra — é o comportamento certo |
| O lance fica eternamente "processando" | o relay não está reivindicando jobs: veja `relay.jobsPendentes` em `/api/health` |
| O player abre mas o vídeo não toca | `RELAY_TOKEN_SECRET`/CloudFront divergentes — o erro acontece do outro lado e **não aparece no nosso log** |
| Busca volta vazia com o lance existindo | fuso: confira que a janela é hora **da arena** — e, antes disso, confira **qual arena** está no cabeçalho |
| A semana do grupo aparece vazia com lance existindo | o lance caiu fora da **janela** do grupo (horário ou quadra), ou numa quadra que o grupo não cobre |
| "Este convite não vale mais" | o `share_link` foi revogado, expirou, ou o grupo foi apagado |

---

## 10. Decisões e pendências

### 10.1 Decisões tomadas nesta task

**1. `web/` autocontido, sem `pnpm-workspace.yaml`.** O irmão (`relay/`) é Python
e shell — não há um único pacote npm para compartilhar. Um workspace daria um
lockfile na raiz, um passo a mais de instalação e a necessidade de configurar Root
Directory na Vercel de qualquer jeito, em troca de nada. Quando existir um segundo
pacote JS (o `packages/api-types` gerado do OpenAPI, provavelmente), o workspace
nasce com ele.

**2. Nomes de tabela seguem `modelo-de-dados.md`, não o apelido do briefing.** O
briefing pedia `group` e `group_membership`; `group` é palavra reservada em SQL e o
modelo de dados já resolvera isso com **`play_group`** e **`play_group_member`**.
Mesma coisa para `share_event`, que vem acompanhado de `share_link` (o link curto e
o evento são coisas diferentes: um é o alvo, o outro é a métrica).

**3. Retenção: 90 dias de clipe, 7 de sessão.** Era o conflito P-01/G-03 entre os
docs. A página do grupo precisa de histórico, e a Política de Privacidade já foi
publicada com 90 — publicar um prazo que o sistema não cumpre viola a LGPD. Está
como `DEFAULT` no banco **e fixado em teste**, para não voltar a divergir.

**4. Storage: S3 em `sa-east-1` + CloudFront** (decisão do coordenador, recebida
durante a task; substitui o R2 da ADR §5). `lib/storage.ts` continua genérico e
S3-compatível: `STORAGE_ENDPOINT` é opcional e, quando preenchido, aponta para
qualquer outro provedor. Como o **egress** é o risco conhecido desta troca (no R2
era zero), essa porta fica aberta de graça.

**5. `encodeProfile.bitrateKbps` = 4000, não 6000.** ADR §5, `spec-captura.md`
§4.4 e a volumetria de `modelo-de-dados.md` §8 sempre disseram 4 Mbps; o 6000 do
`openapi.yaml` era o único número fora de linha, e o único com o qual ninguém tinha
feito conta. **O `docs/api/openapi.yaml` foi corrigido** nesta task.

**6. Claim de job nas duas formas.** O canônico é `GET /api/relay/clip-jobs` (o
YAML, que o relay seguiu); `POST /api/relay/clip-jobs/claim` fica como alias
apontando para a mesma função. O relay é atualizado por `git pull` na máquina, não
por deploy nosso — tirar um caminho do ar exigiria coordenar dois deploys em
máquinas diferentes para não perder nenhum corte.

**7. `lib/session-edge.ts` existe.** O middleware roda no Edge, onde
`node:crypto` não existe. A alternativa — o middleware não conferir a assinatura —
foi recusada: um gate que aceita cookie forjado ensina o time a achar que "passou
pelo middleware" significa alguma coisa.

**8. `partial` aparece na busca.** Um lance com 3 segundos faltando ainda é o
lance do atleta; escondê-lo seria pior que entregá-lo rotulado.

**9. TLS decidido pelo host, não só pelo `sslmode`.** `sslDe()` liga TLS para host
remoto sem `sslmode` e **não liga** para `localhost`. Sem isso, todo Postgres local
ou em container morre com "the server does not support SSL connections" — o teste
de integração falhou exatamente assim na primeira execução.

**10. `GET` também aceito no webhook do botão físico.** Vários modelos de
prateleira só sabem fazer `GET` numa URL de template, e o contrato já assume que o
dispositivo do outro lado não sabe fazer melhor.

### 10.1.1 Decisões da task do E2E em produção

**11. O bypass de login virou uma porta com nome, e não um `NODE_ENV`.** O
`testCodeFor` era fechado em produção olhando só `NODE_ENV`, e a consequência
prática era não haver **nenhuma** forma de entrar no produto enquanto o Resend
não verificasse o domínio. As duas alternativas ruins eram óbvias: ligar um
`OTP_TEST_CODE` global (que valeria para qualquer e-mail do mundo) ou adiar o
teste até o domínio ficar pronto. O desenho escolhido é `OTP_BYPASS_EMAILS` +
`OTP_TEST_CODE`, com **igualdade exata** de e-mail (nunca sufixo de domínio,
porque `@replayja.com.br` um dia terá contas de verdade), validação de formato
do código, e **log estruturado por login**. O teste que prende isso é o do
e-mail fora da lista em produção.

**12. A busca é renderizada no servidor, não por `fetch` no cliente.** O
formulário navega (`?arena=&quadra=&data=&de=&ate=`) e quem consulta é a página.
Três razões, em ordem de peso: (a) a conversão de fuso só é correta onde está o
`partner.timezone` — "20:00" é hora da **arena**, o celular pode estar em
qualquer fuso e a função da Vercel roda em UTC; (b) o resultado vira **link
compartilhável**, que é metade do produto; (c) um caminho só de autorização.

**13. `clipesDaArena` ganhou `incluirProcessando`, e ele não usa o índice
parcial.** `clip_partner_time_idx` cobre `status IN ('ready','partial')`. Quem
acabou de apertar o botão precisa **ver o lance nascendo**, então a busca pede
também os quatro estados intermediários — e paga por isso um plano pior dentro
de uma janela de no máximo 6 horas de **uma** arena. A troca vale: a ausência
desse card é o que fazia o atleta apertar o botão de novo no 1.0.

**14. O estado da câmera vem de `lib/saude-visao.ts`, com teste.** As telas do
painel comparavam `camera.status === "online"` — e `online` **não existe** no
enum `camera_status` (`provisioned | recording | degraded | down | disabled`).
Toda câmera aparecia offline, inclusive uma gravando. Com fixture na tela
ninguém via; com dado real, o painel diria ao parceiro que a arena dele está
fora do ar. A leitura virou função pura, com os quatro estados que o parceiro
precisa distinguir — e **"aguardando relay" é um deles**: câmera que nunca
conectou é instalação incompleta, não queda, e as duas pedem ações opostas.

**15. Os KPIs do painel deixaram de ser fixture.** Eles tinham tarja de aviso,
mas "132 lances hoje" numa arena que gravou 4 é exatamente o número que o
parceiro printa e manda no grupo dele. Agora saem de `clip`/`trigger_event` com
`AT TIME ZONE` da arena — e o zero aparece como zero.

**16. `/api/health` passou a checar storage e relay.** Sem access key, a
federação OIDC da Vercel só falha na **primeira chamada real** à AWS — e, sem
este check, a primeira chamada real seria o `upload-url` de um lance que o
atleta acabou de salvar. Um `ListObjectsV2` com `MaxKeys: 1` custa ~200 ms e
troca "descobrir por um clipe perdido" por "descobrir por uma linha de JSON". O
relay é lido de `relay_node.last_seen_at` e **não** é chamado de volta: o app
não manda no relay (§6), e perguntar inverteria a direção da integração.

**17. O download tem rota própria.** `<a download>` só funciona em mesma origem;
apontando para o CloudFront, o navegador **navega** para o MP4 em vez de baixá-lo
(era a pendência §11 do design system). `GET /api/clips/{id}/download` redireciona
para uma URL assinada de 15 min com `response-content-disposition=attachment` —
um redirect, não um proxy: nenhum byte de vídeo passa pela Vercel.

**18. `capaDoClipe` lê sem sessão, e só a thumbnail.** `generateMetadata` roda
para o crawler do WhatsApp, que não tem cookie. Sem uma leitura sem sessão, todo
lance compartilhado chega no grupo como um retângulo cinza. O que a função
projeta é a chave do **bucket público** de thumbnails — o arquivo que já é
servido sem assinatura por decisão consciente — e nada mais: nem horário, nem
quadra, nem chave do bucket privado. O vídeo continua atrás de `clipePorId`.

**19. O seed preserva chave RTMP e NÃO é dono do `relay_node`.** Ele roda contra
produção mais de uma vez. Trocar a chave RTMP de uma câmera já instalada custa
uma visita à quadra com escada, então a chave só é rotacionada com
`--rotacionar-chaves`. O token do botão, que só existe como SHA-256, é
rotacionado automaticamente **apenas** quando o botão nunca deu sinal — nesse
caso não há nada configurado no mundo com ele.

A linha do relay é caso à parte, e a lição foi cara: a primeira versão fazia
`ON CONFLICT DO UPDATE` e gravou um hash provisório por cima do real, feito por
quem provisionou a máquina. Um `key_hash` reescrito faz **toda** rota de
`/api/relay/*` responder 401, e o sintoma (nenhum lance é cortado) não aponta
para o seed em lugar nenhum. Agora é `DO NOTHING`: `key_hash`, `key_version` e
`base_url` pertencem ao provisionamento, e o seed apenas garante que existe uma
linha com o id certo — avisando quando o `rtmp_host` do banco diverge, porque o
banco vence (é ele que o relay lê).

**20. `vercel env pull` não devolve variável marcada como "Sensitive".** Ele
grava a string literal `[SENSITIVE]`, e foi assim que o `pnpm build` local
quebrou com `Invalid URL` (o `metadataBase` tentou `new URL("[SENSITIVE]")`).
Consequências registradas: **(a)** o arquivo puxado da Vercel não serve para
build local — puxe para um nome que o Next não carregue sozinho, como
`.env.piloto`; **(b)** o seed aceita `--emails=` e `--relay-key-hash=` por
argumento e **recusa** qualquer valor que comece com `[SENSITIVE`, porque gravar
isso como hash de chave de relay daria um 401 que ninguém explicaria.

**21. `c` entrou na lista de slugs reservados de grupo.** `/[arenaSlug]/c/[clipId]`
é o player. O segmento estático vence o dinâmico no Next, então um grupo chamado
`c` não quebraria a rota — ficaria **inalcançável**, que é pior: o dono criaria o
grupo, receberia o link e ele abriria um player vazio.

### 10.1.2 Decisões da task do fluxo de arena, sessão e grupos

**22. `/app` é a escolha da arena, e `/app/buscar` recusa rodar sem uma.** O
fundador chamou o fluxo de "meio bugado", e o defeito não estava na tela: `/app`
levava direto à busca, que abria ancorada numa arena **adivinhada**
(`arenaDeReferencia`, por `first_partner_id` → grupo). Quando o palpite errava — e
ele erra para quem joga em mais de um lugar e para quem ainda não tem história
nenhuma — a busca voltava vazia, o que é **indistinguível de "não gravou"**. O
PRD define o fluxo em duas etapas ("Arena/parceiro → horário → vídeos") e agora as
duas existem. `arenaDeReferencia` foi **removida** junto com o atalho "Buscar" da
barra de navegação: um atalho que pula a arena teria de adivinhar uma de novo.

A busca de arenas é um `<form method="get">` e não uma ilha de cliente — o
resultado vira link (`/app?q=vasco`), o botão voltar funciona e a tela chega
pronta no 4G da quadra. A "última gravação" de cada card sai da última amostra de
`camera_health` de cada câmera (lateral dentro de lateral), porque a pergunta do
atleta é "esta arena está gravando?", não "esta arena existe no cadastro".

**23. O slug de sessão ganhou quadra opcional como PREFIXO e minutos implícitos.**
`quadra-1-2026-09-12-20h-21h`. Prefixo e não sufixo porque o trecho final tem
forma fixa, o que torna a separação inequívoca mesmo com slug de quadra cheio de
hífen (`campo-de-areia-2`); query string ficaria de fora quando alguém copiasse
só o caminho. Os minutos somem na hora cheia porque o caso comum é hora cheia e
este link é colado numa mensagem de WhatsApp — `20h00m-21h00m` vira duas linhas.
O formato antigo continua sendo **aceito na leitura**: link já compartilhado não
pode quebrar.

**24. Slug de sistema novo entra por migração DELTA.** `convite` precisou virar
slug reservado (o catch-all `/[arenaSlug]` ocupa a raiz), e a tentação era rodar
`scripts/gerar-seed-slugs.mjs` de novo. A 0009 **já está aplicada em produção** e
o runner confere checksum: regerá-la faria todo deploy seguinte falhar alto. Então
nasceu a `0010-slug-convite.sql` com uma linha, e o teste
`tests/slug.test.ts` passou a **somar todos os `INSERT INTO reserved_slug` de
todas as migrações** em vez de ler um arquivo pelo nome — senão ele passaria a
mentir no primeiro delta.

**25. O convite é um `share_link`, não a coluna de hash de `play_group_member`.**
A coluna existe e é a escolha óbvia até a gente olhar para ela: `invited_email` é
`NOT NULL` e único por grupo, ou seja, ela pressupõe **um convite por e-mail**,
com a linha de membro criada antes do aceite. O link que a pelada cola no
WhatsApp não tem e-mail nenhum, e cinco pessoas abrem o mesmo. `share_link` já é
exatamente isso — token opaco, alvo, `partner_id` para a métrica, `channel_hint`,
contador de abertura e revogação. Manter os dois mecanismos daria **dois caminhos
de aceite com duas regras de expiração**, e o segundo caminho é sempre o que
ninguém testa.

Consequência boa: o grep de disciplina do CI (`token_hash` só em `relay.ts` e
`gatilho.ts`) continua valendo sem exceção nova.

**26. O grupo é ABERTO por link — decisão do piloto.** `design/README.md` deixou
em aberto se o grupo é aberto ou fechado com aprovação do dono. É **aberto**:
quem abre o link de convite logado vira membro, sem fila. O argumento é o mesmo
de `api/README.md` §3 — o grupo **não é uma ACL**: ele esconde a página, as
sessões organizadas e a lista de membros, nunca os clipes, que qualquer pessoa
logada acha pela busca sabendo arena e horário. Uma fila de aprovação custaria
uma tela, um e-mail e uma espera para proteger o que já não está protegido.

Pelo mesmo motivo, **qualquer membro gera convite** (e não só o dono, como
`POST /groups/{id}/members` do contrato): a rota devolve um link, não adiciona
ninguém, e um membro que copie a URL da página já consegue trazer alguém.
Restringir daria a ilusão de controle e faria a pelada usar o link "errado" — o
da página, que não registra quem convidou quem. Editar e apagar continuam sendo
do dono.

**27. A derivação das ocorrências vive nos dois lados, e isso é deliberado.**
`db/queries/clipe.ts` deriva em SQL as ocorrências **passadas** (ele precisa: o
join é com `clip`); `lib/ocorrencias.ts` deriva em TS a **próxima** (não toca em
clipe nenhum, e um `generate_series` por grupo da lista seria trabalho de banco
para produzir uma data). São perguntas diferentes.

O que **não** pode divergir é a contagem e a grade da mesma semana, e essas duas
passaram a compartilhar um fragmento de SQL (`OCORRENCIAS_DO_GRUPO`): copiadas,
o dia em que uma mudasse a tela mostraria "18 lances" sobre uma grade de 6 de
outra janela, e ninguém desconfiaria do SQL.

Durante o teste de integração as duas derivações **discordaram** — a de SQL
incluía a ocorrência de hoje desde a meia-noite (`local_date <= hoje`), a de TS
só depois de o jogo começar. O SQL foi corrigido para `window_start <= now()`: a
página do grupo abriria toda sexta de manhã com "hoje · 0 lances", que se lê
como "o produto não gravou".

**28. `POST /api/shares` grava `share_event` e NÃO cria `share_link`.** O produto
compartilha o endereço canônico (`/<arena>/c/<id>`, `/<arena>/s/<janela>`,
`/<arena>/<grupo>`), que já tem preview de Open Graph e gate próprio; um
encurtador no meio acrescentaria um redirect e um domínio a mais para o WhatsApp
desconfiar. `share_link` fica reservado ao **convite**, onde o token precisa ser
opaco e revogável. A chamada do cliente usa `keepalive`, senão metade dos eventos
de WhatsApp se perderia na navegação que o `wa.me` provoca no mesmo instante.

**29. O e-mail do convite é não-bloqueante.** `RESEND_API_KEY` existe, mas o
domínio ainda não está verificado (pendência G-4) e o envio falha. Falhar o
convite inteiro por causa disso deixaria a pelada **sem link nenhum**, quando o
WhatsApp — que é onde ela conversa — funciona sempre. A rota devolve
`{ url, email: "enviado" | "sem-provedor" | "falhou" | "nao-pedido" }`.

**30. Criar grupo é Server Action, não rota de API.** É escrita de formulário, do
nosso próprio app, com a sessão em cookie. Uma rota traria junto o contrato
público (versão, RFC 9457, rate limit por token) que só faz sentido para o relay
e para o app de terceiros, e nenhum dos dois cria grupo. Quando `POST /groups` do
`openapi.yaml` existir, ele chamará as **mesmas** funções de `db/queries/grupo.ts`
— que é onde a autorização mora.

A criação é **uma transação**, e não três `INSERT`: um `play_group` sem
`play_group_member` é um grupo que existe, aparece na aba da arena e é
**ineditável até por quem o criou** (`exigirDonoDoGrupo` consulta a participação,
não `created_by`). Os dois estados intermediários são irreparáveis pela UI.

**31. O grupo nasce `unlisted`, e a aba da arena mostra os seus.** É o padrão da
tabela e é o certo: um grupo de pelada não é conteúdo de busca. Mas `unlisted`
sumia da aba "Grupos" da arena, inclusive para quem está nele — e foi por ali que
a pessoa chegou. `gruposDaArenaParaUsuario` inclui os `unlisted` **de quem está
olhando**. `private` continua fora de qualquer lista: é para isso que ele existe.

**32. "Último lance" do grupo é filtrado pela JANELA, não só pela arena.** Sem o
filtro de dia da semana e hora local, a linha mostraria o último lance da arena
inteira — e a pelada de segunda exibiria o gol de quinta de outra turma, que é
pior que não mostrar nada.

### 10.2 Pendências do Gabriel

| # | O que | Bloqueia |
|---|---|---|
| **G-1** | **Domínio `replayja.com.br`** (G-07 de `decisoes.md`) | OTP, Open Graph, CDN, TLS do relay |
| **G-2** | **Criar o projeto Neon `replayja` em `aws-sa-east-1`** — a CLI do Neon não está instalada nesta máquina e não havia `NEON_API_KEY`; comandos exatos em `docs/setup-contas.md` §3 | tudo que toca o banco |
| **G-3** | **Vercel: Root Directory = `web`** e conectar o repositório Git (não há comando de CLI para isso) | deploy e preview por PR |
| **G-4** | **Verificar `replayja.com.br` no Resend** (a chave já está na Vercel; o plano Free atingiu o limite de domínios — ver `docs/setup-contas.md`) | o código de login chegar de verdade e o **bypass poder ser desligado** |
| **G-5** | **Google OAuth** (`GOOGLE_CLIENT_ID`/`SECRET`) | o botão do Google (o login por e-mail funciona sem) |
| **G-6** | **Buckets S3 + distribuição CloudFront** — não criados de propósito, geram custo; aprovar junto com a infra do relay | upload e reprodução do clipe |
| **G-7** | **`RELAY_TOKEN_SECRET` idêntico nos dois lados** — o valor já está na Vercel; copiar para o `rec.env` da máquina do relay. Divergência = "o vídeo não toca", **sem erro no nosso log** | reprodução |
| **G-8** | **Spend Management no time da Vercel** — o uso deste produto conta na fatura do Sentinela | surpresa na conta |
| **G-9** | **Desligar o bypass** (`OTP_BYPASS_EMAILS` e `OTP_TEST_CODE` na Vercel) assim que o Resend entregar | duas contas entram em produção com código fixo |
| ~~**G-10**~~ | ~~Alinhar o `key_hash` do relay~~ — **feito pelo coordenador** (`key_version = 2`). O seed não toca mais em `relay_node` quando a linha existe | — |

### 10.3 Dívida conhecida

- **Sem RLS, uma camada só de autorização.** Registrado na ADR §4.5 e no §3 acima.
  Reavaliar na primeira contratação além dos três devs, ou no primeiro incidente de
  vazamento de escopo. O caminho de volta é ligar RLS no próprio Neon (é Postgres) —
  custa uma migração e um `SET LOCAL` no `db.ts`.
- **O teste de plano da consulta central é fraco.** Com 6 linhas o Postgres escolhe
  Seq Scan de qualquer jeito; o teste confere que o índice existe e é usável, não
  que ele é escolhido. O teste de verdade precisa de volume.
- **Cursor de paginação ainda não é assinado.** `api/README.md` §2 pede
  `base64url(payload) + HMAC`; hoje `db/queries/clipe.ts` aceita o par
  `(triggered_at, id)` direto. Entra na B5, com a rota `GET /clips`.
- **`idempotency_key` tem tabela mas não tem middleware.** A camada 1 (cooldown e
  `<button_id>:<evt>`) funciona; a camada 2 (`Idempotency-Key` genérico no HTTP)
  está só no banco.
- **Sem `preview` nos outputs do job.** O relay não o produz e o formato (GIF ou
  MP4 mudo, resolução, duração) é decisão de produto. Pedir um arquivo que ninguém
  sabe gerar faria todo job voltar com erro.
- **Takedown por trecho não tem rota.** `invalidarCache()` está pronta e testável
  em `lib/storage.ts`, mas sem chamador — entra com o fluxo de remoção (D4).
- **Cursor de paginação da busca ainda não existe na tela.** `clipesDaArena`
  aceita keyset, mas `/app/buscar` mostra só a primeira página (24 itens). Numa
  janela de 6 horas de uma quadra isso raramente corta — mas corta em dia de
  torneio.
- **Não há `GET /clips` público na API.** A busca consome a consulta direto do
  Server Component. O endpoint do `openapi.yaml` (com cursor assinado) continua
  pendente e entra com o app de terceiros, não antes.
- **`og:image` do clipe depende da thumbnail já ter subido.** Um lance
  compartilhado nos primeiros segundos ainda não tem miniatura, e o card sai sem
  imagem. O crawler do WhatsApp não volta para tentar de novo.
- **Não há edição nem saída de grupo na tela.** `exigirDonoDoGrupo` e o gatilho
  que promove o membro mais antigo já existem no banco; o que falta é a UI (e a
  rota) de renomear, trocar horário, remover membro e sair. Entra com D4.
- **`notify_weekly` tem coluna e não tem remetente.** A promessa "a galera
  recebe sozinha" aparece na tela do grupo e ainda depende de um job semanal que
  não existe — e que só faz sentido depois do domínio verificado no Resend
  (G-4). Até lá, o convite e o link fazem o trabalho.
- **O convite não expira.** `share_link.expires_at` fica nulo e não há tela de
  revogação; a consulta já respeita os dois campos. Um convite que circula para
  sempre é aceitável num grupo que é aberto por decisão (§10.1.2, decisão 26),
  mas deixa de ser no dia em que existir grupo fechado.
- **A grade borrada do gate continua sendo fixture.** É decoração (`aria-hidden`,
  sem foco, desfocada): mostrar thumbnail REAL a quem não está logado seria
  exatamente o que a decisão de privacidade proíbe.

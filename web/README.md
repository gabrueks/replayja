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
9. [Decisões e pendências](#9-decisões-e-pendências)

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
      [groupSlug]/               página do grupo
      s/[sessionSlug]/           página da sessão (uma JANELA, não uma linha)
    app/                         área logada do atleta
    painel/                      painel do parceiro
    entrar/  sair/               auth (2 etapas, pt-BR)
    api/
      auth/{otp,google,logout}/  OTP + Google OIDC manual
      relay/                     cameras, clip-jobs, clips/*, health
      triggers/                  botão virtual e botão físico
      health/                    check do monitor externo
  db/
    migrations/*.sql             SQL puro, numerado por data, com up e down
    queries/*.ts                 TODO acesso ao banco passa por aqui
  lib/                           auth, db, storage, limites, erros
  scripts/migrate.ts             runner de ~250 linhas
  tests/                         vitest
```

`relay/` (irmão desta pasta) é o fork Python do relay v2. **Não há
`pnpm-workspace.yaml`**: ver §9.

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

As 9 migrações iniciais cobrem as 28 tabelas de `modelo-de-dados.md`.

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

**80 testes, todos passando** — 63 unitários e 17 de integração contra Postgres
real.

Unitários: OTP e desafio HMAC (incluindo o caso multibyte que fazia
`timingSafeEqual` lançar `RangeError`), sessão Node↔Edge, slug e sincronia da lista
de reservados com a migração, janela do corte e cooldown, fingerprint de erro,
pseudonimização LGPD e redirect aberto.

Integração: roundtrip das migrações, as 28 tabelas, os índices da consulta central,
retenção 90/7, keyset sem repetir nem pular, reivindicação atômica com dois relays
concorrentes, lease vencido, `AT TIME ZONE` das sessões semanais, e a trava de
grupo apontando para quadra de outro parceiro.

O CI tem dois jobs: `verificar` (lint, typecheck, roundtrip, testes, build, com
Postgres em container) e `disciplina` (os greps que sustentam as regras do §3).

---

## 9. Decisões e pendências

### 9.1 Decisões tomadas nesta task

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

### 9.2 Pendências do Gabriel

| # | O que | Bloqueia |
|---|---|---|
| **G-1** | **Domínio `replayja.com.br`** (G-07 de `decisoes.md`) | OTP, Open Graph, CDN, TLS do relay |
| **G-2** | **Criar o projeto Neon `replayja` em `aws-sa-east-1`** — a CLI do Neon não está instalada nesta máquina e não havia `NEON_API_KEY`; comandos exatos em `docs/setup-contas.md` §3 | tudo que toca o banco |
| **G-3** | **Vercel: Root Directory = `web`** e conectar o repositório Git (não há comando de CLI para isso) | deploy e preview por PR |
| **G-4** | **`RESEND_API_KEY`** + verificar `replayja.com.br` no Resend | o código de login chegar |
| **G-5** | **Google OAuth** (`GOOGLE_CLIENT_ID`/`SECRET`) | o botão do Google (o login por e-mail funciona sem) |
| **G-6** | **Buckets S3 + distribuição CloudFront** — não criados de propósito, geram custo; aprovar junto com a infra do relay | upload e reprodução do clipe |
| **G-7** | **`RELAY_TOKEN_SECRET` idêntico nos dois lados** — o valor já está na Vercel; copiar para o `rec.env` da máquina do relay. Divergência = "o vídeo não toca", **sem erro no nosso log** | reprodução |
| **G-8** | **Spend Management no time da Vercel** — o uso deste produto conta na fatura do Sentinela | surpresa na conta |

### 9.3 Dívida conhecida

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
- **Páginas são placeholders.** Layout certo, estilo mínimo: o design system é a
  task C1, e ele consome os tokens de `app/globals.css`.

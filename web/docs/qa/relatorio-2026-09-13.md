# QA — Replay já 2.0 · 13/09/2026

> Auditoria de comportamento e de permissão sobre `web/` e `relay/`, com leitura
> (somente leitura) do banco de **produção** via `DATABASE_URL` do `.env.piloto`
> e varredura HTTP de `https://replayja.com.br` deslogado.
>
> Regra desta auditoria: **nenhum achado entra aqui sem um teste que falha antes
> e passa depois**, ou — quando o conserto é de outro dono — sem o arquivo e a
> linha da causa.

---

## 0. A pergunta do fundador, respondida primeiro

> *"Um usuário normal não pode ser admin da Arena Vasco."*

**No banco de produção, hoje, nenhum usuário comum é admin.** Leitura de
`partner_admin` da `arena-vasco`:

| `invited_email` | `role` | `status` | desde |
|---|---|---|---|
| `teste1@replayja.com.br` | `owner` | `active` | 12/09 20:54 |
| `teste2@replayja.com.br` | `owner` | `active` | 12/09 20:54 |

E `app_user` tem quatro contas, das quais **duas não administram nada**:

| e-mail | criada | arenas que administra |
|---|---|---|
| `teste1@replayja.com.br` | 12/09 20:54 | 1 |
| `teste2@replayja.com.br` | 12/09 20:54 | 1 |
| `bolzi.gabriel@gmail.com` | 13/09 10:24 (OTP real) | **0** |
| `lucasfaraht@gmail.com` | 13/09 10:45 (OTP real) | **0** |

### Então por que pareceu que era admin?

**`bolzi.gabriel@gmail.com` é `owner` do GRUPO `fut-de-segunda`** — e dono de
grupo tem cara de admin: edita a pelada, convida, remove membro, corta convite,
vê o e-mail completo dos outros membros. São poderes reais, e não são poderes de
arena. A distinção está certa no código (`db/queries/autorizacao.ts`:
`exigirAdminDaArena` consulta `partner_admin`, `exigirMembroDoGrupo` consulta
`play_group_member`) e está certa no banco; o que ela não tem é um lugar na tela
que diga em voz alta "isto é o seu grupo, não a arena". **Não é bug — é uma
pergunta de produto**, listada na §5.

### Mas o mecanismo que ele temia existia, armado

`scripts/seed-piloto.ts` resolvia a lista de donos da arena assim:

```ts
const emails = (args.emails ?? utilizavel(process.env.OTP_BYPASS_EMAILS) ?? "")
```

`OTP_BYPASS_EMAILS` **é a lista de login sem e-mail** (`lib/otp.ts`) — a porta
estreita aberta porque o domínio do Resend demorou a ser verificado. Ela
responde *"quem consegue ENTRAR"*, não *"quem MANDA na arena"*. Enquanto as duas
fossem a mesma lista, **acrescentar o Gmail do fundador ali para testar o login
o promovia a `owner` da Arena Vasco no próximo `pnpm seed:piloto`** — com
câmera, chave RTMP, token de botão, remoção de vídeo e equipe junto, e sem uma
linha de aviso.

Não aconteceu porque o seed não foi rodado de novo depois de 12/09. Corrigido em
`ccb6a09` (§3, A-3).

### Os três — e só três — caminhos para virar admin de arena

Varredura completa de escritas em `partner_admin`:

1. `scripts/seed-piloto.ts` — era a porta larga; agora exige `--emails=` ou
   `PILOT_ADMIN_EMAILS`, e nunca lê a lista de bypass.
2. `db/queries/painel-equipe.ts#convidarAdmin`, chamada por
   `app/painel/equipe/acoes.ts`, que começa por `exigirArena(slug, "owner")`.
3. SQL direto no Neon.

**Não existe vinculação automática no login.** `app/api/auth/otp/verify/route.ts`
e `app/api/auth/google/callback/route.ts` chamam `upsertUsuarioPorEmail`, que
escreve em `app_user` e em mais nada. Um convite pendente por e-mail não vira
admin quando a pessoa entra — porque não existe convite pendente: `convidarAdmin`
já cria a linha `active`. **Não há sequestro de conta por e-mail no Google OIDC**:
`lib/google-oidc.ts` recusa `email_verified !== true` antes de chegar ao upsert,
confere `aud`, `iss` e `nonce`, e o `state` é conferido no callback.

---

## 1. Tabela de achados

Severidade: **S1** quebra segurança ou promessa publicada · **S2** bug de
comportamento com dano real · **S3** ruído, dívida, ou risco só em cenário futuro.

| # | Sev | Achado | Onde | Repro | Estado |
|---|:--:|---|---|---|---|
| A-1 | S1 | **Redirect aberto em `/entrar`**: `redirect(params.redirectTo)` sem sanitizar, e o valor cru repassado ao formulário (que faz `router.push`) | `app/entrar/page.tsx:47` | logado, abrir `/entrar?redirectTo=https://evil.com` → sai do domínio | ✅ `b1b7eb9` |
| A-2 | S1 | **`destinoSeguro` furado**: `/\evil.com` e `/<TAB>/evil.com` passavam e viravam `https://evil.com/` no `new URL()` do callback do Google | `lib/destino.ts`, consumido em `app/api/auth/google/callback/route.ts:80` | `new URL(destinoSeguro("/\\evil.com"), origem).host === "evil.com"` | ✅ `b1b7eb9` |
| A-3 | S1 | **Seed dava `owner` da arena a quem estivesse em `OTP_BYPASS_EMAILS`**; e o `ON CONFLICT` ressuscitava admin removido a cada execução | `scripts/seed-piloto.ts` | `OTP_BYPASS_EMAILS=x@y.com pnpm seed:piloto` → `x@y.com` vira `owner` | ✅ `ccb6a09` |
| A-4 | S1 | **`POST /api/grupos/{id}/convite` sem rate limit**: e-mail ilimitado, para endereço arbitrário, pelo nosso domínio verificado — que é o mesmo que entrega o OTP | `app/api/grupos/[groupId]/convite/route.ts` | laço de `POST` com `{"email":"…"}` | ✅ `a9b3f1b` |
| A-5 | S1 | **Retenção de 90 dias não existia**: nenhuma consulta filtrava `clip.expires_at`, `purge_expired_clips` nunca foi escrito, `vercel.json` agenda um cron só | `db/queries/clipe.ts`, `db/queries/parceiro.ts`, `vercel.json` | um clipe com `expires_at` no passado continua na busca e baixável | ✅ `b0567fa` + `5891e52` — ver §8 |
| A-6 | S2 | **`bem-vindo` não estava em `RESERVED_SLUGS`** — arena com esse slug fica inalcançável para sempre (slug é imutável) | `lib/reserved-slugs.ts` | `validarSlugDeArena("bem-vindo").ok === true` | ✅ `4078c1c` |
| A-7 | S2 | **`/api/grupos/{id}/convite` e `/api/shares` sem `mesmaOrigem`**: `SameSite=Lax` é same-*site*, e `lerJson` não olha `Content-Type` | idem + `app/api/shares/route.ts` | `POST` `text/plain` de um subdomínio nosso | ✅ `a9b3f1b` |
| A-8 | S2 | **`/confirm` do relay aceitava `objectKey` arbitrário** — um clipe podia apontar para qualquer objeto do bucket privado, e o `/download` assina a URL para qualquer logado | `app/api/relay/clips/[clipId]/confirm/route.ts` | `confirm` com `objectKey` de outra arena | ✅ `7e26f73` |
| A-9 | S2 | **"Papel atualizado." para um `UPDATE` que não aconteceu** — promover admin removido passava na checagem e não escrevia nada | `db/queries/painel-equipe.ts#alterarPapelDoAdmin` | trocar papel de um `status='removed'` | ✅ `64c4622` |
| A-10 | S3 | **O cooldown testado não era o que rodava**: `emCooldown` tinha 3 testes e zero chamadores; `criarGatilho` refazia a conta à mão | `db/queries/gatilho.ts` | grep: `emCooldown` só aparecia na lib e no teste | ✅ `55f25b8` — reconferido em 13/09 |
| A-11 | S3 | **`robots.txt` anuncia um `sitemap.xml` que responde 404** | `app/robots.ts` (não há `app/sitemap.ts`) | `curl -o /dev/null -w "%{http_code}" https://replayja.com.br/sitemap.xml` → `404` | ✅ `23d444e` |
| A-12 | S3 | **`resolverArena` distingue "não encontrada" de "sem permissão"** — oráculo de enumeração, contra a regra que `exigirArena` documenta 20 linhas abaixo | `app/painel/_lib/arena.ts:60-70` | logado sem papel: `?arena=existe` vs `?arena=naoexiste` dão telas diferentes | ✅ `23d444e` |
| A-13 | S3 | **Grupo com cara de arena**: dono de grupo vê poderes de dono e conclui que administra a arena | produto | a própria confusão que abriu esta auditoria | 🟡 agente de UX/atleta (fora do backend) |
| A-14 | S3 | **Câmera que nunca conectou reporta `degraded`, não `down`** — `arenavascoq2` está com `last_segment_at = NULL`, `coverage_24h = 0` e status `degraded` | `db/queries/relay.ts#registrarSaudeDoRelay` (CASE de status) | leitura de produção | ✅ `23d444e` |
| A-15 | S3 | **`lib/problem.ts` declara `clip-expired` (410) e ninguém o lança** — clipe fora da retenção agora responde 404 | `lib/problem.ts:17` | grep: uma ocorrência, no tipo | ✅ `5891e52` |

---

## 2. O que foi verificado e está **certo**

Vale registrar, porque uma auditoria que só lista problemas não diz onde não
vale gastar revisão da próxima vez.

- **Autorização do painel.** As sete páginas de `/painel/**` passam por
  `resolverArena` e as 26 server actions por `exigirArena` — conferido uma a
  uma. `?arena=` nunca vira dado antes de `papelNaArena`/`exigirAdminDaArena`
  consultarem `partner_admin` **no banco, na requisição**. O cookie não carrega
  papel.
- **Disciplina de SQL.** Zero chamadas a `query(`/`transacao(` fora de
  `db/queries/` e `lib/db.ts` — a regra que substitui o RLS está de pé.
- **Escopo do relay.** `reivindicarJobs`, `clipeParaUpload`,
  `reportarStatusDoJob` e `confirmarClipe` todos filtram por `relay_node_id`.
  **Relay B não vê job de relay A.** O lease de 120 s é devolvido no próprio
  `claim` (não depende de cron), e `attempt >= 5` vira `failed` com `timeout`.
- **Saúde de câmera de outro relay.** `registrarSaudeDoRelay` confere
  `camera.relay_node_id` antes de gravar cada amostra.
- **`x-relay-key`.** Comparação em tempo constante (`crypto.timingSafeEqual`) e
  hash no banco; o bootstrap por env só vale quando não há linha.
- **Token do botão.** É `sha256` comparado por índice no banco — não há string
  de segredo comparada em JS, então o ponto de "timing-safe compare" do roteiro
  não se aplica. Formato conferido antes da ida ao banco; 404 só para token
  inexistente; revogado responde `202 rejected_button_revoked` e **continua
  gravando `last_signal_at`**, que é o que permite descobrir o botão trocado
  ainda pendurado na parede.
- **Bypass do OTP.** `testCodeFor` compara por **igualdade exata** com a lista
  normalizada, nunca por sufixo de domínio; `@replayja.test` só vale fora de
  produção; todo login por essa porta grava `{"evento":"otp_bypass"}`.
- **Rate limit do OTP.** Os dois baldes com a assimetria certa (e-mail por
  `peek`, só o erro gasta ficha; IP consome sempre), e ambos **antes** de
  qualquer trabalho caro.
- **Google OIDC.** `state`, `nonce`, `aud`, `iss` e `email_verified` — as cinco
  conferidas. A vinculação `ON CONFLICT (email)` só é alcançada com e-mail
  comprovado.
- **XSS.** Zero `dangerouslySetInnerHTML` no repositório. Nome de grupo e de
  arena passam por JSX, que escapa.
- **Injeção de SQL.** Tudo parametrizado; os `ILIKE` de busca concatenam apenas
  `%` em torno de um `$1`.
- **Takedown.** `executarExpurgo` faz banco → S3 → CloudFront e **registra em
  `verification` as três camadas que ainda não faz**. A URL assinada anterior
  morre na prática porque o objeto deixa de existir.
- **Relay.** `python -m unittest discover -s relay/tests` → **127 testes, OK**,
  antes e depois das mudanças. Nenhum caso novo foi necessário: janela de corte,
  cache de marca e claim já estão cobertos, e a conferência nova de `objectKey`
  é um no-op para o relay legítimo, que devolve a chave que recebeu
  (`relay/clip-worker.py:932`, `alvo["objectKey"]`).

### Varredura HTTP de produção (deslogado) — nenhum 500

```
200 /                     307 /app                  200 /convite/xxx
200 /entrar               307 /painel               200 /descadastro/xxx
200 /sair                 307 /arena-vasco/grupos/novo   200 /api/health
200 /arena-vasco          307 /arena-vasco/c/<uuid>  200 /robots.txt
200 /bem-vindo            200 /arena-vasco/s/2026-09-12-20h-21h
404 /dev/ui               404 /nao-existe            404 /arena-vasco/nao-existe
401 /api/clips/abc        401 /api/relay/cameras     401 /api/relay/clip-jobs
404 /sitemap.xml   ← A-11
```

---

## 3. O que eu corrigi (com teste)

| Commit | O quê | Teste |
|---|---|---|
| `b1b7eb9` | A-1, A-2 — redirect aberto e o furo do `destinoSeguro` | `tests/redirecionamento.test.ts` (12) |
| `4078c1c` | A-6 — `bem-vindo` reservado + migração delta `0015` | `tests/slug.test.ts` (varredura de `app/`) |
| `ccb6a09` | A-3 — fonte da lista de donos + `ON CONFLICT` que ressuscitava | `tests/admins-do-piloto.test.ts` (10) |
| `a9b3f1b` | A-4, A-7 — teto do convite e `mesmaOrigem` | `tests/api-guardas.test.ts` (7, por varredura de `app/api/**`) |
| `b0567fa` | A-5 (metade) — `expires_at` no `WHERE` das consultas do atleta | `tests/retencao.test.ts` (6) |
| `7e26f73` | A-8 — chave de objeto recalculada em vez de aceita | `tests/chave-de-objeto.test.ts` (6) |
| `64c4622` | A-9 — confirmação que vem do que o banco fez | `tests/painel-equipe.test.ts` (4) |
| `55f25b8` | A-10 — `criarGatilho` passa a usar `emCooldown` | `tests/janela-corte.test.ts` (+1) |

**Três dos testes são varreduras de fonte, e isso é deliberado.** A regra que
importa vale para a rota, o slug e o `redirectTo` que alguém vai escrever
*amanhã* — um teste que exercita o que existe hoje não diz nada sobre ela. É a
mesma disciplina do teste de reservados que já existia. Onde há isenção
(descadastro do RFC 8058, webhook do botão, cron com segredo próprio), ela está
nomeada uma a uma, com o motivo.

### Nota sobre a varredura que existia e não pegava

`tests/slug.test.ts` tinha um caso chamado *"toda rota de sistema de primeiro
nível está reservada"* — e ele era uma **lista escrita à mão** das rotas "que
existem hoje". "Hoje" era três levas atrás: `convite`, `descadastro`, `dev` e
`bem-vindo` nasceram depois e nenhuma entrou nela. Três estavam reservadas por
cuidado de quem as escreveu; `bem-vindo` não estava. O teste agora varre `app/`.

---

## 4. O que fica para a próxima leva (com dono claro)

### A-5 · O expurgo de bytes — ~~o maior item aberto~~ ✅ **fechado em §8.1** (`5891e52`)

O que eu consertei foi o que o **usuário vê**: um clipe vencido some da busca,
do grupo, do contador e do download, mesmo que nenhum job rode. O que **continua
faltando** é tirar os bytes:

- `purge_expired_clips` (04:00 BRT) aparece na ADR §4, em
  `docs/modelo-de-dados.md` §8 e num comentário de `lib/storage.ts` — e **não
  existe em lugar nenhum do código**. `vercel.json` agenda um cron só, o
  `resumo-semanal`.
- Consequência: o MP4 continua no S3 `sa-east-1` e o trecho continua no disco da
  EC2 depois dos 90 dias. A Política de Privacidade diz que não.
- Também faltam, do mesmo documento: `detect_camera_down`,
  `detect_coverage_gaps`, `rollup_share_events`, `reconcile_storage`.

**Escopo sugerido**: uma rota `app/api/cron/expurgo/route.ts` com o mesmo
desenho do `resumo-semanal` (`CRON_SECRET`, teto por passada, idempotência por
lote), reusando `apagarObjetos`/`invalidarCache`, e a entrada em `vercel.json`.
Não fiz porque apagar objeto de produção não é mudança que um agente de QA
empurra sem alguém olhando.

### A-11 · `sitemap.xml` — ✅ **fechado em §8.3** (`23d444e`)

`app/robots.ts` anuncia `Sitemap: …/sitemap.xml` e não há `app/sitemap.ts`.
Duas saídas, as duas de uma linha: criar o sitemap com `/[arena]` e
`/[arena]/[grupo]` público (é o que `docs/api/README.md` §3 descreve), ou tirar
a linha do `robots.txt`. Prefiro a primeira — o sitemap é aquisição para o
parceiro.

### A-14 · Câmera que nunca conectou aparece como `degraded` — ✅ **fechado em §8.3** (`23d444e`)

`arenavascoq2` está em produção com `last_segment_at = NULL`,
`coverage_24h = 0.000` e `status = 'degraded'`. O `CASE` de
`registrarSaudeDoRelay` só considera `recorder_up` e a cobertura — um gravador
de pé apontado para uma câmera que nunca transmitiu cai em `degraded`, que se lê
como "grava mal", quando a verdade é "nunca instalou". `lib/saude-visao.ts` já
sabe a diferença (`aguardando`) e o painel a mostra; quem mente é a coluna.
Baixo impacto hoje (a tela acerta), mas a coluna é o que um alerta futuro vai
ler. **Dono: quem cuidar da bancada do relay.**

---

## 5. O que exige decisão do fundador

### D-1 · Grupo com cara de arena (A-13) — **a causa do susto** · 🟡 com o agente de UX/atleta

Dono de grupo edita a pelada, convida, remove membro e vê e-mail completo dos
membros. Dono de arena mexe em câmera, chave RTMP, botão e remoção de vídeo. São
dois conjuntos diferentes, e a tela não diz qual é qual em lugar nenhum. A
sugestão é barata: uma linha de contexto na página do grupo ("Você organiza esta
pelada" / "Você administra a Arena Vasco"). **É trabalho do agente de UX/atleta**
— fica registrado aqui porque a confusão custou uma auditoria.

### D-2 · O oráculo de enumeração do painel (A-12) — ✅ **resolvido em §8.3**, e sem trocar a frase

`resolverArena` responde `nao-encontrada` para um slug que não existe e
`sem-permissao` para um que existe e você não administra. `exigirArena`, 20
linhas abaixo, documenta explicitamente a regra oposta ("nunca distinguir as
duas é o que impede enumerar arenas pelo painel"), e `docs/api/README.md` §6
também.

**Não corrigi de propósito**, porque o conserto tem um preço de produto real: a
tela "Sem permissão nesta arena · se você administra outra, ela está na lista" é
exatamente a frase certa para o caso comum (o gerente de duas arenas colou o
link errado), e colapsar tudo em "Arena não encontrada" a troca por uma frase
que manda a pessoa conferir um link que está certo. E o vazamento é pequeno: a
existência de uma arena com página pública já é pública. **Só vaza a existência
de arena com `public_page_enabled = false`.** Escolha: consistência com o
contrato, ou a frase melhor. Prefiro a frase, com a regra corrigida no
documento.

### D-3 · `OTP_BYPASS_EMAILS` ainda ligado em produção — 🟡 **fundador decidiu MANTER** (13/09); a recomendação abaixo continua de pé

A porta está aberta e é auditável (toda entrada grava
`{"evento":"otp_bypass"}`), e o domínio do Resend **está verificado desde
13/09** — que era a condição de saída escrita em `lib/otp.ts`: *"assim que o
domínio estiver verificado, apagar as duas variáveis da Vercel desliga tudo sem
tocar em código"*. A condição foi cumprida. Apagar `OTP_BYPASS_EMAILS` e
`OTP_TEST_CODE` agora não remove admin nenhum (depois de `ccb6a09` as duas
coisas estão separadas) e fecha a única porta de login que não passa por caixa
postal. **Recomendo apagar as duas.**

### D-4 · Clipe vencido: 404 ou 410? — ✅ **410**, decidido pelo fundador e implementado em §8.1

Com A-5 corrigido, um clipe fora da retenção responde **404**. O catálogo de
`lib/problem.ts` já declara `clip-expired` (410, *"Este lance foi gravado em
12/08/2026 e já saiu do ar"*) e **ninguém o lança** — a única ocorrência da
string no repositório é a declaração do tipo. O 410 é a resposta mais gentil
(diz que existiu), e custa uma consulta a mais no player. **É decisão de UX do
atleta**, e a página do player está com o outro agente.

---

## 6. Verificações

```
pnpm typecheck   ✅  tsc --noEmit, sem erro
pnpm lint        ✅  0 erros, 1 aviso pré-existente (eslint.config.mjs,
                     import/no-anonymous-default-export)
pnpm test        ✅  326 passando, 73 pulados (integração, exige Postgres)
pnpm build       ✅  exit 0
relay            ✅  python -m unittest discover -s relay/tests → 127 OK
```

Baseline antes desta auditoria: 252 passando. **+74 casos**, todos em cima de
comportamento que não estava coberto.

### Estado de produção no fechamento (leitura, nada escrito)

```
partner        arena-vasco · active · página pública ligada
partner_admin  2 owners ativos (teste1@, teste2@) · 0 usuário comum
app_user       4 · 2 entraram hoje por OTP real (Gmail)
play_group     2 (fut-sexta, fut-de-segunda) · ambos unlisted
clip           4 · 0 fora da retenção → o filtro novo não esconde nada hoje
clip_job       4 · todos done · attempt 1 · nenhum órfão, nenhum lease pendurado
trigger_event  4 · todos accepted · nenhuma recusa
relay-1        active · último sinal há minutos · key_hash próprio (não provisório)
camera q1      degraded · cobertura 24h 0,846
camera q2      degraded · nunca transmitiu (A-14)
reserved_slug  91 → a migração 0015 sobe `bem-vindo` no próximo deploy
takedown       0 · blackout 0
```

Nenhuma branch Neon foi criada.

---

## 7. Notas para os outros agentes

- **Para quem está em `components/ui` / `app/app` / `app/[arenaSlug]`**: durante
  esta auditoria os testes `abaAtivaDe` (`tests/ui/bottom-nav.test.tsx`) e
  `Voltar` ficaram vermelhos por algumas horas com a árvore de vocês em voo.
  Estavam verdes no fechamento — só registro para o caso de reaparecerem.
- **`app/entrar/page.tsx`** está fora da minha divisão e fora da lista de
  intocáveis. Editei assim mesmo (A-1): é uma linha, é segurança, e deixar o
  achado em relatório enquanto a porta continua aberta não me pareceu defensável.
  Se conflitar com algo de vocês, o que importa preservar é
  `const destino = destinoSeguro(params.redirectTo)` **antes** de qualquer uso.
- **`lib/limites.ts`** ganhou `conviteGrupo` e `conviteUsuario`. Se a sheet de
  convite precisar de outra frase para o 429, ela vem do `detail` do
  `excedeuLimite` na rota.

---

## 8. O fechamento — 13/09, à tarde

> Escrito pelo agente de backend que recebeu este relatório com as quatro
> decisões do fundador já tomadas. **Doze dos quinze achados estão fechados**;
> os três que sobram estão nomeados no fim, com dono.

### As quatro decisões, e o que cada uma virou

| # | Decisão | O que foi feito |
|---|---|---|
| 1 | **Retenção de clipe: 90 dias**, mantida | Nada mudou no prazo; mudou quem o cumpre — §8.1 |
| 2 | `OTP_BYPASS_EMAILS` **fica ligado** | Não tocado, como pedido. D-3 permanece aberto por escolha |
| 3 | **E-mail de membro mascarado**; completo só para o dono | `3cae9df` — §8.2 |
| 4 | **Clipe vencido → `410 clip-expired`** | `5891e52` — §8.1 |

### 8.1 · A-5 e A-15 — o expurgo de verdade (`5891e52`)

O que `b0567fa` tinha feito era metade: quatro consultas do atleta ganharam
`expires_at > now()`. Faltavam **cinco leituras**, **duas escritas**, o job, e o
`410`.

**As cinco leituras.** A pior era `capaDoClipe`: ela serve o card do WhatsApp
**sem cookie**, então um clipe vencido continuava entregando a imagem da pessoa
na superfície mais pública do produto. Junto foram o polling (`estadoDoClipe`), a
fila de remoção do painel, e os contadores de `painel-visao`, `painel-quadras` e
`saude`. Nas consultas de grupo faltavam quatro.

**As duas escritas — o buraco menos óbvio.** `registrarDownloadDoClipe` faz
`expires_at = GREATEST(expires_at, now() + 180 dias)`. Sem filtro de validade,
**baixar um clipe vencido desfazia a retenção** e fazia a próxima passada do
expurgo pular exatamente o clipe que alguém acabou de baixar. O pino estende a
validade de um lance vivo; não ressuscita um morto.

**O job.** `GET /api/cron/purge-clips`, `0 7 * * *` (04:00 BRT), guarda igual à
do resumo semanal. Apaga os objetos dos dois buckets, invalida o CloudFront **por
prefixo** (cada caminho conta uma das 1.000 invalidações gratuitas do mês) e só
então marca a linha — a ordem da retenção, oposta à do takedown. Se um bucket
falhar, **nada** é marcado: `purged_at` é a promessa de que os bytes sumiram, e
meia promessa deixaria o clipe sair da varredura com o MP4 no ar.

**`clip.purged_at`** (migração 0016) separa duas perguntas que `deleted_at`
misturava — "sumiu da API" e "saiu do disco". É ela que faz o job recolher o
**takedown cujo `DeleteObjects` falhou**, um caso que hoje fica com o protocolo
em `executado` e os bytes para sempre, porque nada mais olha para aquela linha.
O `deleted_reason` original sobrevive ao expurgo: é a única prova de por que
aquele vídeo saiu.

**O `410`.** `GET /api/clips/{id}` e o download perguntam "existiu?" antes de
dizer "não existe", e respondem com a data da gravação no fuso da arena. A
consulta extra só roda no caminho de erro.

**A resposta à ressalva do §4** — *"apagar objeto de produção não é mudança que
um agente de QA empurra sem alguém olhando"*: continua certa, e é por isso que o
job tem teto por passada, é idempotente, recusa marcar quando o storage falha,
responde `pendentes`/`mais_antigo` como termômetro, e roda no vale de tráfego.
A primeira execução em produção é observável pela resposta do próprio cron.

**Testes.** `tests/retencao.test.ts` deixou de listar as quatro consultas à mão e
passou a **varrer** `db/queries/**` — toda função que lê `clip` ou filtra, ou
está em `ISENTAS` com o motivo escrito; isenção órfã falha. É a correção da
mesma armadilha que a §3 deste relatório descreveu sobre os slugs reservados.
E `tests/retencao.integracao.test.ts` (14 casos, Postgres real) insere um clipe
vencido de verdade e prova que ele some de cada rota, que o pino não o
ressuscita, que o expurgo o acha, que marcar duas vezes não reapaga, e que o
takedown entra na mesma varredura mantendo o motivo.

### 8.2 · Decisão 3 — o e-mail do membro (`3cae9df`)

A regra já existia e o endereço vazava assim mesmo, por uma porta que ninguém
olhou: **o campo se chamava `email` nos dois casos**. Para a tela, "o e-mail do
membro" era um campo só que às vezes trazia o endereço e às vezes a máscara — e
a página do grupo escrevia `m.display_name ?? m.email` em três lugares, que é o
`??` que despeja o endereço inteiro no dia em que alguém entra sem nome.

O contrato novo não deixa escolher errado: `email` é `null` para quem não é dono,
`emailMascarado` está sempre lá, e `nome` já vem resolvido. **`null` e não a
máscara** é a decisão que importa: um campo que carrega ora um ora outro esconde
o erro, porque `l***@gmail.com` numa tela é indistinguível de um e-mail estranho.
Nulo quebra alto — some da tela e falha no `tsc`.

### 8.3 · Os três achados soltos (`23d444e`)

**A-12, o oráculo.** A §5 apresentou isto como escolha entre consistência e a
frase melhor, e a escolha era falsa. Não é preciso colapsar tudo em "Arena não
encontrada" (que manda o gerente de duas arenas conferir um link que está certo):
as duas situações passam a devolver `sem-permissao`, e a frase cobre as duas sem
dizer qual foi — *"Esta conta não administra a arena deste endereço — ou o
endereço não é de nenhuma arena. Se você administra outra, ela está na lista."*
A saída continua sendo a lista.

**A-14, a câmera.** `down` quando não há segmento nesta amostra **nem** no
histórico. `down` e não `provisioned`: `provisioned` é o estado de nascimento, e
reescrevê-lo a cada heartbeat apagaria a diferença entre "cadastrada agora" e
"cadastrada há três semanas e nunca ligou". A tela continua dizendo "aguardando
relay" — `lerSaudeDaCamera` pergunta `last_segment_at` antes do status, e agora
há um teste que prende essa ordem.

**A-11, o sitemap.** Escrito, e não removido do `robots.txt`: o sitemap é
aquisição para o parceiro. Entram a home, `/[arena]` e `/[arena]/[grupo]`
público, e **nada** que leve a um vídeo — um sitemap é um convite ao rastreador,
e convidar para uma rota que o `robots.txt` proíbe é mandar dois recados opostos.
Consulta própria (`db/queries/sitemap.ts`), porque `arenasPublicas` tem
`LIMIT 30` e faria o sitemap parar de listar a arena 31 em silêncio.

**A-10** foi reconferido: `55f25b8` fechou de verdade — `criarGatilho` importa e
chama `emCooldown`, e `tests/janela-corte.test.ts` prende isso por varredura de
fonte.

### 8.4 · Verificações

```
pnpm typecheck   ✅  tsc --noEmit, sem erro
pnpm lint        ✅  0 erros, 1 aviso pré-existente (eslint.config.mjs)
pnpm test        ✅  suíte inteira verde
                     • tests/retencao.test.ts          32
                     • tests/retencao.integracao.test.ts 14 (Postgres real)
                     • tests/membros-do-grupo.test.ts   10
                     • tests/achados-2026-09-13.test.ts  8
                     • tests/api-guardas.test.ts        11 (+4: guarda de cron)
pnpm build       ✅  exit 0
relay            ✅  python -m unittest discover -s relay/tests → 127 OK
```

**Relay: nenhuma mudança de contrato.** Nada aqui toca o que o relay envia ou
recebe — `camera.status` é derivado no servidor e o relay não o lê; o expurgo
mexe em objetos do S3 que o relay já não conhece depois do `confirm`. `127 OK`
antes e depois, e `openapi.yaml` já documentava o `410` de `/clips/{clipId}`
desde o primeiro dia (era a implementação que faltava).

O teste de integração rodou contra uma **branch Neon** (`qa-retencao-2026-09-13`,
projeto `replayja`), criada com as migrações aplicadas e **apagada no fim**.
Nenhuma escrita em produção.

### 8.5 · O que continua aberto

| # | O quê | Dono |
|---|---|---|
| **A-13 / D-1** | Grupo com cara de arena — a linha de contexto na página do grupo | Agente de UX/atleta (já em voo: `papelNaArena` foi ao `page.tsx` do grupo) |
| **D-3** | `OTP_BYPASS_EMAILS` ligado | **Fundador** — decidiu manter; a recomendação de apagar as duas variáveis continua de pé |
| **Takedown, camadas 2, 5 e 6** | Revogação das URLs assinadas já emitidas, segmento no disco do relay, `revalidateTag` do ISR | Não atribuído. Registrado em `verification.pendentes` a cada execução, e o protocolo só vira `concluido` sem elas quando as camadas implementadas passam |
| **Jobs do `modelo-de-dados.md` §8** | `detect_camera_down`, `detect_coverage_gaps`, `rollup_share_events`, `reconcile_storage` | Não atribuído. O expurgo era o único com promessa publicada atrás dele; estes são operação |

**A primeira execução do `purge-clips` em produção merece ser olhada.** Hoje o
banco tem 0 clipes fora da retenção (§6), então a primeira passada deve responder
`{"clipes":0,"motivo":"nada-a-fazer"}`. Se responder outra coisa, a resposta diz
o quê — é para isso que ela carrega `pendentes` e `mais_antigo`.

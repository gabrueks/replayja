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
11. [Marca d'água](#11-marca-dágua)
12. [Grupos v2 — o grupo que se administra sozinho](#12-grupos-v2--o-grupo-que-se-administra-sozinho)
13. [Correções de UX — 2026-09-13](#13-correções-de-ux--2026-09-13)

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

Cada job carrega a **marca d'água** a aplicar — nunca nula, com URL assinada do
PNG do parceiro ou a instrução de usar a marca padrão do relay. Ver §11.

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

**325 testes, todos passando** — 252 unitários e 73 de integração contra Postgres
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

> Para o fundador, pelo celular, em <https://replayja.com.br>.
> Dez minutos, nesta ordem. Se um passo falhar, o passo seguinte não prova nada.
>
> **O roteiro é o mesmo desde o visual v2 — os rótulos é que mudaram.** Onde
> antes se lia "Buscar lances", agora se lê "Bora achar seu lance"; "Agora" virou
> "Acabei de jogar"; "Salvar como grupo" virou "Joga toda semana? Vira grupo".
> Nenhuma rota, nenhum parâmetro e nenhum comportamento mudaram (`docs/design-system.md`
> §12).

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

4. Depois de entrar você cai em **`/app`** — a escolha da **arena**, que é o passo
   1 do fluxo do PRD ("Arena/parceiro → horário → vídeos"). Busque por
   `vasco` (nome, cidade ou endereço servem) e confira no card: a capa, a cidade,
   o nº de quadras. Se a câmera estiver mandando segmento agora, o card mostra a
   pílula verde **Gravando agora** no canto da capa.

   A partir daqui a **barra de quatro abas** (Arenas · Lances · Grupos · Perfil)
   fica no rodapé de toda tela logada, com a aba da rota acesa. Ela some no botão
   virtual e no player, que são telas de uma ação só.

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

   Abra a mesma URL numa aba anônima e confira duas coisas que foram consertadas
   junto com o visual: o contador do topo **conta o lance que ainda está sendo
   cortado** (antes ele sumia, e o atleta concluía que o produto o tinha comido),
   e a marca d'água da grade borrada diz **ARENA VASCO** — antes ela carregava
   `ARENA CALABOUÇO`, a marca da fixture.
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
11. Toque em **Salvar lance** — o círculo de 206px no meio da tela escura. Três
    coisas acontecem, nesta ordem:
    - confirmação imediata: *"Salvo às 20:47 — em 30 segundos ele aparece aqui"*;
    - o botão trava por **8 segundos** (o cooldown por quadra — cinco toques no
      mesmo gol viram um clipe só);
    - abaixo, *"Cortando o lance das 20:47…"* até o corte ficar pronto, e então o
      link **Assistir agora**. Os toques anteriores da mesma pelada ficam listados
      em **Salvos nesta pelada**, logo abaixo.

O corte normal leva de 15 a 40 segundos. Se passar de 2 minutos, a tela diz
que o lance **não se perde** e manda para a busca — o job continua na fila.

### 9.4 Achar, tocar, baixar, compartilhar

12. Volte a **`/app`**, toque em **Arena Vasco** — e só então a busca abre, já
    ancorada nela. Toque em **Acabei de jogar** e depois na **lupa** ao lado dos
    campos de início e fim. O atalho usa o relógio **da arena**
    (`America/Sao_Paulo`), não o do celular.
13. O lance recém-salvo aparece na grade, com o **horário como título do card**.
    Enquanto está sendo cortado ele aparece como um ladrilho preto com o relógio
    amarelo e *"Cortando… fica pronto em ~30 s"*, e **não abre** — um card que
    abrisse um player vazio queimaria mais confiança do que um card que avisa.
    Ele **aparece e conta**: sumir com o lance de quem acabou de apertar o botão
    é o pior resultado possível desta tela.
14. Toque no card → abre **`/arena-vasco/c/<id>`**, o player. A URL do vídeo é
    assinada e vale **6 horas**.
15. O botão verde do **WhatsApp** ocupa a linha; **Instagram**, **baixar** e
    **copiar link** são os três ladrilhos ao lado. Toque no de **baixar** → o
    arquivo é salvo (não abre em outra aba). A URL de
    download é assinada por **15 minutos**, separada da de reprodução, porque é
    a que vaza. Baixar também **fixa a retenção** do lance por mais 180 dias.
16. **WhatsApp** → no celular abre a folha de compartilhamento do sistema; no
    desktop cai no `wa.me`. O cartão amarelo **Estender o lance · PRO** abaixo da
    barra está desabilitado de propósito: o recurso existe, não está no ar, e
    dizer isso vale mais que escondê-lo.
17. Cole o link num grupo: o card mostra a **miniatura** do lance (bucket
    público) com um texto genérico. Nunca dizemos horário e quadra num preview
    que qualquer pessoa vê — quem abrir ainda precisa entrar para assistir.

### 9.5 A sessão e o grupo — o diferencial do PRD

18. No fim do resultado da busca, toque em **Manda pro grupo**. Você cai
    em **`/arena-vasco/s/quadra-1-2026-09-12-20h-21h`** — a página da **sessão**,
    que é a mesma janela com endereço próprio, preview de Open Graph e gate de
    login. Abra o link numa aba anônima: a grade aparece **borrada** com o
    contador, igual à página da arena.
19. Na sessão, toque em **Criar**, na faixa preta *"Joga toda semana aqui?"*. O
    formulário
    (`/arena-vasco/grupos/novo`) abre com **quadra, dia da semana e horário já
    preenchidos** — só falta o nome. O endereço é derivado do nome enquanto você
    digita, com o selo **Disponível** conferido no servidor.
20. **Criar grupo** leva a **`/arena-vasco/fut-sexta`**. O cabeçalho preto mostra
    a recorrência, a próxima pelada e os membros; abaixo, uma seção por **rodada**
    ("Rodada 12", que é a palavra que a turma usa no WhatsApp) com os lances
    daquela janela e o link para a sessão daquela noite. Rodada sem lance
    **continua aparecendo**, com a ilustração e a explicação — sumir com ela faria
    o atleta achar que o produto perdeu o jogo dele.
21. Toque em **Convidar**: a folha traz o link **`replayja.com.br/convite/<token>`**
    (um `share_link` revogável, **válido por 14 dias**), o botão do WhatsApp e um
    campo para mandar por e-mail. Abra o link de convite numa aba anônima: ele
    pede login e, ao voltar, mostra **o grupo, a arena, quem chamou e o horário**
    — e só entra quando você toca em **Entrar no grupo** (§12, decisão 54).

21a. Ainda como dono, toque em **Arrumar**: `/[arena]/[grupo]/editar` traz nome,
    esporte, quadra, dias, horário e **quem pode ver esta página**, mais a lista
    de membros (com "Tirar"), a de convites vivos (com "Cortar") e o "Sair do
    grupo" — que promove o membro mais antigo. O **endereço aparece travado**, com
    a razão ao lado.

21b. Na página do grupo, confira o **seletor de rodada** no fim da lista
    (`?r=1` leva às oito rodadas anteriores), o **melhor da rodada** no topo e o
    **Adicionar ao calendário**, que baixa `<grupo>.ics`.

> **O e-mail do convite sai de verdade desde 2026-09-13** (domínio verificado no
> Resend — G-4 fechada). Ele continua **não-bloqueante** por desenho: se o envio
> falhar por qualquer motivo, o convite não falha junto — o link e o WhatsApp
> funcionam sempre, e a resposta da rota diz o que aconteceu com o e-mail.

22. **`/app/grupos`** lista os grupos com **próxima pelada** e **último lance**.
    A ordem é pelo próximo jogo, não alfabética.
23. Toque na aba **Lances**: `/app/lances` mostra as últimas 6 horas da arena em
    que você jogou por último, com atalho para trocar de arena. É a resposta à
    pergunta que traz alguém para esta aba — "cadê o lance que eu acabei de
    salvar?".
24. Toque na aba **Perfil**: e-mail, grupos, **Avisos por e-mail** (um
    interruptor por grupo, que salva no toque), o atalho do painel (só para quem é
    admin de alguma arena, e o papel vem do BANCO, nunca do cookie) e **Sair**.
25. Saia e abra **`/`** numa aba anônima: na primeira abertura o navegador cai em
    **`/bem-vindo`**, as três telas de apresentação. "Pular" sai a qualquer
    momento, e a marca de "já vi" fica no `localStorage` — nenhum outro link do
    produto é interceptado por ele.

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
| "Este convite não vale mais" | o `share_link` foi revogado, **passou dos 14 dias**, ou o grupo foi apagado |
| O resumo semanal não chegou | (a) `CRON_SECRET` não está na Vercel — a rota recusa; (b) a rodada não teve lance (e aí é o comportamento certo); (c) já havia linha em `play_group_digest` para aquele par (grupo, data); (d) o membro desligou o aviso em Perfil ou no rodapé do e-mail |
| "Editar grupo" não aparece | você é membro, não dono. O botão **Arrumar** só existe para `role = 'owner'` |
| A página abre sem estilo nenhum (texto azul sublinhado) | o CSS não chegou: quase sempre é um `next start` antigo servindo um build que não existe mais. Reiniciar o processo resolve; em produção, refazer o deploy |

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

**29. O e-mail do convite é não-bloqueante.** Escrita quando o domínio ainda não
estava verificado no Resend, a decisão **continua valendo depois de ele estar**:
falhar o convite inteiro porque um provedor de e-mail teve um mau minuto deixaria
a pelada **sem link nenhum**, quando o WhatsApp — que é onde ela conversa —
funciona sempre. A rota devolve
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

### 10.1.3 Visual v2 — "Luz de quadra"

A direção aprovada pelo fundador (`design/v2/`) está no ar. O mapa completo
— tokens, componentes, o que ficou diferente do canvas e por quê — está em
`web/docs/design-system.md` §12. Aqui ficam só as decisões que mudam como o
produto se comporta, não como ele se parece.

**33. App claro, e o escuro só onde ele trabalha a favor.** A v1 era escura
inteira, e metade do feedback do fundador foi que ela lia como ferramenta de dev.
Todo app de consumo brasileiro é claro (Zé, iFood, Rappi, Mercado Livre). O
escuro ficou em três telas: **player** (o vídeo tem de ser a coisa mais clara da
tela), **botão virtual** (usado na beira da quadra, à noite — uma tela branca de
6 polegadas na mão cega quem acabou de olhar o jogo) e **onboarding**. As duas
superfícies escuras são classes globais (`.noite`, `.tinta`) que redefinem os
MESMOS tokens, e não um vocabulário paralelo: por isso nenhum componente do
sistema ganhou uma variante "escura".

**34. O laranja virou três tokens, e a razão é acessibilidade.** `#FF6B1F` sobre
branco dá 2,8:1 — reprova em qualquer texto e reprovaria em qualquer botão com
branco por cima. `--cor-marca` continua sendo a marca e continua aparecendo onde
ele é lindo, sobre escuro; `--cor-acao` (`#D93C06`) pinta botão; e
`--cor-acao-escrita` (`#C23604`) escreve link e número, porque o tom de
preenchimento dá 4,13:1 como texto sobre o fundo quente. A regra é curta:
**`--cor-acao` pinta, `--cor-acao-escrita` escreve.** `--cor-texto-3` também
desceu de `#786F66` para `#726961` pelo mesmo motivo — o canvas mediu contra o
branco, e a maior parte do texto de apoio vive sobre `--cor-fundo`.

**35. Os nomes de token da v1 viraram apelidos, e isso foi o que manteve o painel
de pé.** As sete telas do painel do parceiro foram entregues no mesmo dia e ficam
fora desta rodada. Em vez de reescrever ~30 módulos de CSS de uma vez — trocando
uma mudança de pele por uma mudança de esqueleto — `--cor-acento`, `--cor-borda`,
`--raio-12`, `--texto-32`, `--e-16` e companhia apontam para os valores novos num
bloco marcado "compatível" no fim de `:root`. O painel herdou a paleta clara sem
uma linha editada. A lista encolhe conforme os módulos migram; nada de novo deve
usar um apelido.

**36. Duas rotas novas nasceram da barra de abas, não do contrário.** A barra de
quatro abas exige que as quatro levem a algum lugar. "Arenas" e "Grupos" já
existiam; "Lances" apontando para `/app/buscar` — que **recusa rodar sem `?arena=`**
(decisão 22) — seria uma aba que pisca e volta. Então `/app/lances` mostra as
últimas 6 horas da arena em que o atleta jogou por último, usando a MESMA consulta
da busca e da página da arena, sem nenhuma consulta nova. E `/app/perfil` é curta
de propósito: o produto não tem conta para configurar (sem senha, sem foto), e o
que cabe ali é quem você é, o que é seu e como sair. "Sair" saiu do cabeçalho de
toda tela logada — era o link mais destacado de um app cujo objetivo é a pessoa
ficar.

**37. O onboarding é um destino, não um pedágio.** `/bem-vindo` tem as três telas
da primeira abertura, e **nenhuma rota redireciona para lá** a não ser a home. O
produto vive de link compartilhado: quem chega em `/arena-vasco/c/<id>` veio ver
UM lance, e interceptar essa chegada com três telas de apresentação é a forma mais
rápida de perder a pessoa que o link trouxe. A marca de "já vi" fica no
`localStorage` e não num cookie — um cookie novo no aparelho de quem ainda não
entrou é um identificador a mais viajando em toda requisição, por uma preferência
de interface. A consequência é que o onboarding reaparece em outro navegador, e
isso está certo: é outro aparelho, e a pessoa pode ser outra.

**38. O clipe em processamento passou a APARECER, e a contar.**
`lancesDeHojeNaArena` contava só `ready` e `partial`, então a página pública dizia
"3 lances hoje" com o quarto ainda saindo do forno — e o card dele era um card
apagado com um selo. Quem acaba de apertar o botão abre a página nos 30 segundos
seguintes; o que ele concluía é que o produto comeu o lance dele. Agora a consulta
conta o mesmo conjunto que `clipesDaArena` mostra quando a tela pede
`incluirProcessando`, e o card tem cara própria — ladrilho preto, relógio amarelo,
"Cortando… fica pronto em ~30 s". **Duas contagens da mesma coisa sempre divergem,
e a que mente é sempre a que o usuário vê primeiro.**

**39. A prévia borrada deixou de exibir a marca d'água de outra arena.** A amostra
vem de `lib/fixtures.ts`, e a fixture carrega `ARENA CALABOUÇO` queimada — então
`/arena-vasco` deslogada exibia, borrada mas legível, a marca de um parceiro que
não é aquele. `LoginGate` ganhou a prop `marca`, que sobrescreve o que vier na
amostra; sem ela a prévia sai sem marca nenhuma, em vez de mentir.

**40. Os horários com lance NÃO aparecem para quem não entrou.** O artboard da
arena mostra "20:47 · 20:51 · 21:03" em pílulas na página deslogada, e isso ficou
de fora. O contador é uma contagem agregada; uma lista de horários diz a qualquer
um que passou alguém naquela quadra naquele minuto, e a regra do produto é que
nada que aponte para um vídeo específico existe sem login (`api/README.md` §3).
Está registrado como decisão de produto pendente em `docs/design-system.md` §12.7,
não como esquecimento.

**41. A ação principal saiu do scroll.** `CtaFixo` é uma barra branca fixa no
rodapé, com a linha de apoio como parte do componente. Na página da arena
deslogada, "Entrar pra liberar a busca" ficava no meio do scroll e sumia assim que
o atleta descia para ver os horários — ou seja, sumia exatamente quando ele estava
convencido. A linha de apoio ("Leva 20 segundos. Sem senha, sem cadastro.") não é
decoração: é a objeção que a pessoa tem no dedo antes de tocar, e deixá-la a cargo
de cada tela é como ela desaparece em metade delas.

**42. Uma frase por ação, repetida em toda tela.** "Entrar pra ver meus lances" é
sempre essa — na home, na arena, no grupo, na sessão. "Bora achar seu lance" é
sempre essa. Variar o rótulo por tela é o que um gerador de texto faz, e é metade
do que dava ao produto cara de protótipo. O texto do e-mail do código foi junto, e
o cartão dele deixou de ser preto: num cliente de e-mail claro, um bloco escuro no
meio da caixa de entrada tem aparência de spam promocional.

### 10.2 Pendências do Gabriel

| # | O que | Bloqueia |
|---|---|---|
| **G-1** | **Domínio `replayja.com.br`** (G-07 de `decisoes.md`) | OTP, Open Graph, CDN, TLS do relay |
| **G-2** | **Criar o projeto Neon `replayja` em `aws-sa-east-1`** — a CLI do Neon não está instalada nesta máquina e não havia `NEON_API_KEY`; comandos exatos em `docs/setup-contas.md` §3 | tudo que toca o banco |
| **G-3** | **Vercel: Root Directory = `web`** e conectar o repositório Git (não há comando de CLI para isso) | deploy e preview por PR |
| ~~**G-4**~~ | ~~Verificar `replayja.com.br` no Resend~~ — **feito em 2026-09-13** (plano Pro, domínio verificado, OTP real entregue; `docs/decisoes.md` G-07). Continua valendo o teto do plano e o **G-9** (desligar o bypass) | — |
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
- ~~**Não há edição nem saída de grupo na tela.**~~ **Feito** — §12 "Grupos v2".
- ~~**`notify_weekly` tem coluna e não tem remetente.**~~ **Feito** — §12. O job
  existe e o domínio está verificado no Resend desde 2026-09-13; falta só
  `CRON_SECRET` na Vercel (V-1).
- ~~**O convite não expira.**~~ **Feito** — §12: 14 dias, com revogação na tela.
- **A grade borrada do gate continua sendo fixture.** É decoração (`aria-hidden`,
  sem foco, desfocada): mostrar thumbnail REAL a quem não está logado seria
  exatamente o que a decisão de privacidade proíbe.

---

## 11. Marca d'água

O lado do app do pipeline de marca d'água. O lado do relay — o filtergraph, o
cache do PNG, o deploy por SSM — está em [`relay/README.md`](../relay/README.md)
§"Marca d'água".

### O bug que esta seção existe para não voltar

Todo clipe de produção saía com `watermark_applied = false`, e **não era bug de
código**: não havia PNG em lugar nenhum. O `claim` mandava `watermark: null`
quando o parceiro não tinha logo, e o relay — que também não tinha um PNG nosso
instalado — entendia isso como "entregue cru". Os clipes saíam, tocavam, subiam
para o S3 e chegavam ao atleta. Só que sem a única coisa que a arena vê do
produto.

A lição de contrato: **um campo nulo que significa "faça o padrão" é um campo
que vai ser lido como "não faça nada".** O `watermark` do job nunca mais é nulo
— ele diz `kind: "partner"` ou `kind: "default"`.

### A regra (decisão 9 do `PLANO.md`, D-03 de `decisoes.md`)

| O parceiro enviou PNG? | O que sai no clipe |
|---|---|
| **sim** | a marca **dele** no canto configurado (`watermark_width_pct`, padrão 18% da largura) **e** a assinatura do Replay já no canto inferior oposto (10%, opacidade 0,6) |
| **não** | só a do Replay já, 14% da largura, `bottom-right` |

`partner.watermark_enabled = false` desliga a marca **do parceiro**, não a
nossa. Não existe clipe limpo: um MP4 circulando no WhatsApp sem dizer de onde
veio é o oposto do que o produto vende. Se um dia houver plano que compre o
clipe sem marca, vira um `kind` novo em `lib/marca-dagua.ts` — não um `if`
escondido no relay.

### Onde mora cada peça

| Arquivo | Papel |
|---|---|
| `lib/marca-dagua.ts` | **A regra, pura e testável.** Decide `kind`, posição, largura e opacidade a partir de `partner_branding`. Sem rede, sem banco — e é por isso que tem teste |
| `lib/storage.ts` → `urlDeLeituraPrivada` | assina o `GET` do PNG do parceiro no bucket privado (1 h) |
| `lib/storage.ts` → `chaveDaMarcaDoParceiro` | `branding/<partnerId>/watermark.png`. **Contrato compartilhado com o painel**: é onde o upload grava e de onde o claim assina |
| `lib/relay-claim.ts` → `marcaDoClaim` | junta as duas coisas, uma vez por job |
| `db/queries/relay.ts` → `confirmarClipe` | grava `watermark_applied`, `watermark_version` e `watermark_kind` |
| `tests/marca-dagua.test.ts` | 13 testes, sendo o mais importante o mais bobo: **nenhuma entrada produz clipe sem marca** |

### Por que o PNG do parceiro é privado

É o logo comercial da arena, não uma imagem do produto. Numa CDN aberta,
adivinhar um UUID entregaria a marca de todo parceiro — e thumbnail e Open
Graph, que *são* públicos, são a exceção consciente de `api/README.md` §3, não
a regra.

`urlDeLeituraPrivada` assina direto no S3, **não** pelo CloudFront: quem lê é o
relay, na mesma região do bucket (`sa-east-1`), e o arquivo tem ~45 KB que ele
guarda em cache local por versão. Passar pela CDN pagaria egress de borda e
exigiria distribuir o bucket privado sob outra política.

### Quando falha

Falhar em assinar a URL — credencial de deploy, política de bucket, objeto
ausente — **não derruba o job**. `marcaDoClaim` cai para `kind: "default"` e o
clipe sai com a nossa marca. O contrário custaria o lance do atleta por causa de
uma configuração de infraestrutura.

O preço é que a falha fica invisível para quem só olha o vídeo. Por isso o relay
devolve `watermarkKind: "default-fallback"` no `confirm` e a coluna é indexada:

```sql
SELECT count(*) FROM clip
 WHERE partner_id = $1 AND watermark_kind = 'default-fallback';
```

Zero é o único número normal.

### Como conferir em produção

Depois de um deploy da Vercel **e** da atualização do relay por SSM (a máquina
não se atualiza sozinha — `relay/deploy-ssm.sh`):

1. Apertar o webhook do botão da quadra 1.
2. No banco:
   ```sql
   SELECT id, status, watermark_applied, watermark_kind, watermark_version
     FROM clip ORDER BY created_at DESC LIMIT 1;
   ```
   Esperado: `watermark_applied = true` e `watermark_kind = 'default'`
   (ou `'partner'`, se a arena já tiver enviado o PNG).
3. Abrir o MP4 e **ver a marca no canto** — o passo que nenhum teste substitui,
   porque o modo de falha desta feature é sempre "o arquivo está certo e a
   imagem está errada".

---

## Painel do parceiro

> Sete telas em `/painel`, todas com a mesma pergunta na frente: **de qual arena
> você é admin?**

### As rotas

| Rota | O que faz |
|---|---|
| `/painel?arena=<slug>` | visão geral: KPIs (lances hoje/7 d/30 d, atletas, compartilhamentos, grupos ativos), gravação **por quadra** com última gravação e cobertura 24 h, lances por horário e compartilhamentos por canal |
| `/painel/quadras` | criar, editar e desativar quadra (nome, endereço, esporte, piso, coberta, horário de funcionamento); vincular câmera e botão |
| `/painel/cameras` | tabela de saúde + cadastro de câmera nova (aloca a porta do relay) |
| `/painel/cameras/<id>` | **servidor RTMP e chave** para configurar o equipamento, com copiar e QR; estado, último segmento, cobertura 1 h/24 h, bitrate; renomear, desligar e **gerar nova chave** |
| `/painel/botoes` | botões por quadra com último sinal, bateria e contagem; criar (mostra o webhook **uma vez**, com QR), revogar e regenerar token |
| `/painel/pagina` | logo e marca d'água (upload de PNG), prévia sobre um frame com posição/opacidade/largura reais, cores, contato, endereço, horários, Instagram e o link público |
| `/painel/equipe` | admins da arena: convidar por e-mail, trocar papel, remover |
| `/painel/privacidade` | horários bloqueados por quadra (escolinha) e fila de pedidos de remoção, com o expurgo de verdade |

A navegação é lateral no desktop e vira **abas roláveis** abaixo de 900 px. Ela é
o único pedaço de cliente do layout, porque `?arena=` só existe em
`useSearchParams` — e um layout do App Router não recebe `searchParams`.

### Decisões desta task

**33. O painel não usa `parceiroPublicoPorSlug`.** Aquela consulta exige
`public_page_enabled`, e reaproveitá-la criava uma armadilha exata: o parceiro
desligava a própria página pública em `/painel/pagina` e, no mesmo instante,
perdia o painel — inclusive o botão de ligá-la de volta. Nasceu
`parceiroDoPainelPorSlug`, e a resolução de arena + permissão virou um lugar só
(`app/painel/_lib/arena.ts`): **sete telas com sete cópias do mesmo bloco é a
promessa de que a oitava vai esquecer uma linha** — e a linha esquecida não
devolve vazio, devolve a operação da arena de outra pessoa.

**34. Página RENDERIZA o erro; server action LANÇA.** `resolverArena` devolve um
motivo (a tela mostra estado vazio com saída); `exigirArena` lança o problema
RFC 9457 e é o que toda ação de escrita chama primeiro. Server action é um POST
com nome ofuscado, não um método privado: o `arenaSlug` chega do cliente e vale
tanto quanto um parâmetro de URL.

**35. A porta do relay é alocada por `UPDATE … RETURNING`, nunca por `SELECT`
seguido de `UPDATE`.** Dois operadores cadastrando câmera durante a mesma
instalação é o caso normal; com leitura e escrita separadas os dois recebem a
MESMA porta, e o índice único recusa o segundo — depois de já ter mostrado a
porta na tela para quem está com a escada na mão. O contador continua
**monotônico** (nunca reaproveita porta de câmera removida): uma câmera antiga,
mal desconfigurada no app do cliente, empurraria vídeo para o lugar de outra.
Relay cheio desfaz a transação com `throw`, e não com um `return`, justamente
para **não queimar a porta** a cada tentativa.

**36. A chave da câmera é projetada — e só em `db/queries/relay.ts`.** A tela de
detalhe precisa dela (é o que o instalador digita no equipamento), e a regra de
projeção de `modelo-de-dados.md` §7.3 restringe `rtmp_key` a um arquivo. A
escolha foi trazer as consultas para lá em vez de abrir exceção no grep do CI —
uma exceção "menos uma coisa" é a que ninguém lembra de reavaliar. Mesma coisa
para o token do botão, que ficou em `gatilho.ts`. `viewer` não vê nenhum dos
dois: credencial que derruba a quadra não é relatório.

**37. Rotacionar chave e regenerar token pedem confirmação que diz o CUSTO.** As
duas ações derrubam equipamento instalado até alguém ir à quadra. A confirmação
é um segundo estado do mesmo botão e não um `window.confirm` — o diálogo nativo
não cabe o texto e, no celular, aparece colado no topo, longe do dedo.
`camera.key_version` existe para o suporte correlacionar a queda com o clique.

**38. O QR é gerado no servidor, por um codificador nosso de 300 linhas.** O que
ele codifica é o token do botão. `<img src="/api/painel/qr?dados=…">` colocaria
o segredo em query string — isto é, no log de acesso, no `Referer` e no
histórico. Uma biblioteca resolveria o desenho e não o vazamento. O codificador
cobre modo byte, correção M, versões 1 a 6 (106 bytes) e **recusa** acima disso,
em vez de emitir um QR que a câmera do celular não lê e que ninguém depura na
quadra. O teste (`tests/painel-qr.test.ts`) traz um LEITOR escrito no sentido
inverso a partir da norma: ele decide sozinho quais células são padrão de
função, desfaz a máscara e desentrelaça os blocos. Se o texto volta, o
posicionamento está certo.

**39. O upload da marca não passa pela Vercel.** Server action tem teto de 1 MB
de corpo e a marca pode ter 2 MB. Em vez de subir o teto para o app inteiro, o
navegador faz `PUT` numa URL pré-assinada (`urlDeUpload`, a mesma que o relay já
usa) e o servidor **confere depois**: `Range: bytes=0-32` no objeto e leitura do
IHDR. Entre a validação da tela e o objeto no bucket não passa código nosso, e
um JPEG renomeado para `.png` passa por qualquer checagem de extensão — e faria
o relay queimar um retângulo preto no vídeo do cliente.

**40. `watermark_width_pct` e `watermark_scale` são o mesmo número, com um dono
só.** O contrato com o pipeline da marca fala em porcentagem (18 = 18% da
largura do quadro); a 0002 já guardava a mesma grandeza como `watermark_scale`
(0,12). Duas colunas para o mesmo número é como as duas divergem no dia em que
alguém escreve numa só, então a 0011 acrescenta a coluna nova **e um gatilho**
que mantém a escala sincronizada em qualquer escrita, inclusive por `psql`. O
relay continua lendo `watermark_scale` sem saber que a tela mudou.

**41. A prévia da marca usa os MESMOS três números do corte.** Posição,
opacidade e largura em % — e a margem de 3% é o `watermark_margin` padrão, não
uma escolha de CSS. Uma prévia com margem "bonitinha" mostraria uma coisa e o
vídeo entregaria outra, que é o pior resultado possível para uma tela cujo único
trabalho é ser fiel. Ela é desenhada sobre grama e não sobre cinza porque a
pergunta da arena é "vai dar pra ler?", e a resposta depende do fundo.

**42. Contato e endereço vão para `partner_contact`, não para colunas novas de
branding.** A tabela já existe, já tem o enum `contact_kind` com WhatsApp,
telefone, e-mail, Instagram e endereço, já valida E.164 por `CHECK` e já é o que
a página pública lê. Duplicá-los no branding daria duas verdades e uma página
pública mostrando a antiga. O horário de funcionamento é a exceção — ele não tem
`contact_kind` e virou `partner_branding.opening_hours`, texto livre, porque
arena tem feriado e "domingo só de manhã", e um par de colunas `time` obrigaria
a mentir. Salvar **substitui o conjunto** (apaga e reinsere): com upsert por
tipo, esvaziar o campo do telefone não apagaria nada.

**43. Convidar admin não cria link de convite.** `partner_admin` tem
`invite_token_hash`, e a leitura óbvia é gerar um link de aceite. O login do
produto JÁ é a prova de posse do e-mail — não há senha, entra-se com um código
de 6 dígitos enviado para o endereço. Um link provaria exatamente a mesma coisa,
com uma tela, um e-mail e um prazo de expiração a mais, e com um **segundo
caminho de aceite que ninguém testa** (é o mesmo argumento da decisão 25, sobre
o convite de grupo). A consequência a não esquecer é que um e-mail digitado
errado vira um admin que nunca aparece — por isso a tela marca **"aguardando
primeiro acesso"**, que é como o dono vê o próprio erro de digitação no mesmo
dia.

**44. A regra do último dono vive em dois lugares, de propósito.** O gatilho
`partner_admin_exige_owner` (migração 0003) é a garantia real: vale para `psql`,
script e qualquer rota futura. O que ele não faz é explicar — o erro chega como
`check_violation`, que vira 500 na tela. `podeRemoverAdmin` existe para dar a
frase em pt-BR antes de tentar. Se as duas divergirem, **o banco vence**.

**45. O horário bloqueado é checado em `db/queries/gatilho.ts`, depois do
cooldown e ANTES da câmera.** Depois do cooldown porque é o caminho quente e o
cooldown já está em memória; antes da câmera porque o bloqueio é decisão de
POLÍTICA — durante a escolinha a câmera pode estar perfeita e ainda assim não
pode haver clipe, e recusar por "câmera fora do ar" mandaria o suporte da arena
caçar um defeito que não existe. A recusa tem enum próprio
(`trigger_outcome.rejected_blackout`, acrescentado com `ADD VALUE IF NOT EXISTS`
para o roundtrip do CI passar) e a avaliação é função pura
(`bloqueioEmVigor`), porque a conta depende do relógio de parede DA ARENA e a
virada da meia-noite é o tipo de coisa que só teste de mesa pega. O intervalo é
`[início, fim)`: dois bloqueios colados (8–9 e 9–10) não podem disputar o
instante das 9h.

**46. O expurgo é um protocolo, não um `DELETE`.** Toda remoção pelo painel abre
um `takedown_request` (`RJ-2026-000123`) antes de apagar, mesmo quando quem pede
é a própria arena: `fluxo-remocao.md` §9 exige registro com quem decidiu e
quando, guardado por cinco anos — é a prova de cumprimento dos arts. 37 e 50 da
LGPD. A ordem aqui é a do takedown e **não** a do expurgo por retenção: marca-se
`deleted_at` primeiro (imediato e reversível, o vídeo sai do ar) e só depois
apagam-se os objetos (irreversível). `verification` grava o que cada camada
respondeu, **inclusive as três que este código ainda não faz** — revogação das
URLs assinadas já emitidas, segmento no disco do relay e `revalidateTag` das
páginas em cache. O protocolo só vira `concluido` quando as camadas
implementadas passam: um takedown pela metade é pior que nenhum, porque a pessoa
foi avisada de que o vídeo saiu.

### Migração

`db/migrations/2026-09-12-0011-painel-do-parceiro.sql`, **aditiva** e com `down`:

- `partner_branding.watermark_width_pct` (5–30, padrão 18) + gatilho que mantém
  `watermark_scale = pct/100`; `partner_branding.opening_hours`;
- `camera.key_version` e `camera.key_rotated_at`;
- `court.indoor` (coluna própria, e não um valor dentro de `surface`, que é o
  piso e é texto mostrado ao atleta);
- **`court_blackout`** (arena ou quadra, dia ISO, intervalo que não atravessa a
  meia-noite, rótulo, ativo);
- `trigger_outcome` ganha `rejected_blackout`;
- **`takedown_request`** (modelo mínimo de `fluxo-remocao.md` §9.1) com
  protocolo por sequência, e `clip.deleted_reason` / `clip.takedown_request_id`
  — sem elas, um clipe com `deleted_at` não distingue "expirou pela retenção" de
  "foi removido a pedido de alguém que aparece nele", e a segunda é a que
  precisa ser provável em cinco anos.

O `down` não remove o valor do enum: o Postgres não tem `ALTER TYPE … DROP
VALUE`, e é por isso que o `up` usa `ADD VALUE IF NOT EXISTS`.

### O que ficou pendente

| # | O quê |
|---|---|
| **P-1** | A rota do botão virtual (`app/api/triggers/route.ts`) ainda mapeia `rejected_blackout` no `default` do `switch`, que responde "Quadra sem câmera". O problema `court-blackout` e o atalho `quadraBloqueada()` já estão em `lib/problem.ts`: falta **uma linha** de `case` — a rota é de outro dono nesta leva |
| **P-2** | Do expurgo, faltam as camadas 2, 5 e 6 do `fluxo-remocao.md` §7 (revogar URL assinada já emitida, apagar o segmento no disco do relay, `revalidateTag`). Elas estão listadas em `verification.pendentes` de cada protocolo |
| **P-3** | Não há tela para **responder** ao solicitante nem para marcar um pedido como improcedente: a fila mostra, executa e registra |
| **P-4** | A janela de bloqueio não atravessa a meia-noite. Para escolinha (manhã e fim de tarde) isso basta; para um bloqueio noturno são dois registros |
| **P-5** | O QR para na versão 6 (106 bytes). Acima disso a função lança e a tela mostra só o valor com "copiar" — a versão 7 exigiria o bloco de *version information*, que nenhum caso de uso nosso pede |
| **P-6** | `viewer` continua vendo tudo menos os segredos e os botões de escrita. Não há papel "só financeiro" nem trilha de auditoria de quem mexeu no quê (fora o `takedown_request`) |

---

## 12. Grupos v2 — o grupo que se administra sozinho

Esta seção é o delta da rodada de **grupos e sessão do atleta**. Ela fecha três
dívidas que estavam em §10.3 desde o começo — *"não há edição nem saída de grupo
na tela"*, *"`notify_weekly` tem coluna e não tem remetente"* e *"o convite não
expira"* — e acrescenta ao grupo as duas coisas que faltavam para ele ser um
lugar em vez de uma listagem: o **seletor de rodada** e o **melhor da rodada**.

Nada da arquitetura mudou. As semanas continuam **derivadas** (não existe tabela
de sessão), a autorização continua morando em `db/queries/`, e o grupo continua
**não sendo uma ACL**: ele esconde a página, as sessões organizadas e a lista de
membros — nunca os clipes.

### 12.1 O que existe agora, por rota

| Rota | O que mudou |
|---|---|
| `/[arena]/[grupo]` | Seletor de rodada (`?r=N`), "melhor da rodada", "Adicionar ao calendário", botão **Arrumar** para o dono e **Sair do grupo** para o membro |
| `/[arena]/[grupo]/editar` | **Nova.** A tela do dono: nome, descrição, esporte, quadra, dias, horário, visibilidade; lista de membros com "Tirar"; lista de convites vivos com "Cortar"; e "Sair do grupo" com a explicação de quem assume |
| `/[arena]/[grupo]/agenda.ics` | **Nova.** O `.ics` da próxima pelada, com recorrência semanal de 12 ocorrências |
| `/[arena]/s/[sessao]` | Título humano: **"Sexta, 12 set · 20h–21h · Quadra 1"** num `<h1>` só |
| `/convite/[token]` | Deixou de entrar no grupo sozinha: mostra **grupo, arena, quem chamou e quando a pelada acontece** antes do botão |
| `/descadastro/[token]` | **Nova.** A saída da lista, explicada. Sem login |
| `/app/perfil` | Seção **"Avisos por e-mail"** — um interruptor por grupo, que salva no toque |
| `POST /api/grupos/{id}/convite` | O link nasce com **14 dias** e é renovado a cada toque; aceita `{ email }` para mandar (e remandar) o convite pelo Resend |
| `DELETE /api/grupos/{id}/convite` | **Nova.** Corta um convite (`revoked_at`) |
| `GET /api/cron/resumo-semanal` | **Nova.** O job do resumo. `vercel.json` agenda `0 11 * * *` — 8h de Brasília |
| `GET`/`POST /api/descadastro/{token}` | **Nova.** O um clique do RFC 8058 |

Migrações: **`0013-grupo-edicao-e-resumo`** (`play_group.sport`,
`play_group.updated_by`, tabela `play_group_digest`) e
**`0014-slug-descadastro`** (o slug reservado, por arquivo delta — decisão 24).

### 12.2 Decisões

**47. O slug do grupo NÃO é editável, e a tela diz isso em voz alta.** O
formulário de edição mostra o endereço num cartão travado, com a razão ao lado.
Trocar `fut-de-segunda` porque a pelada virou terça quebraria — em silêncio — o
link fixado no tópico do WhatsApp há meses, os e-mails já mandados e o histórico
do navegador de dez pessoas. `EdicaoDeGrupo` nem tem o campo: a ausência é a
garantia. O dia em que isso não bastar, a saída é `partner_slug_alias` (que já
existe para arena), com o endereço antigo redirecionando — nunca uma troca seca.

**48. O grupo ganhou `sport`, e `NULL` continua querendo dizer "o da quadra".**
`court.sport` já existe, mas um grupo com `all_courts = true` não tem quadra de
onde herdar, e uma arena mista (society + futevôlei) faz "todas as quadras"
significar dois esportes. O padrão é nulo porque a maioria dos grupos não tem
opinião — forçar a escolha faria todo mundo marcar o primeiro da lista, e o
campo passaria a mentir.

**49. O histórico de edição é uma COLUNA, não uma tabela.** `updated_at` já vinha
do gatilho desde a 0005; faltava o **quem**, e ele virou `play_group.updated_by`.
Uma tabela de auditoria com diff por campo é o certo no dia em que houver disputa
entre donos de um grupo; hoje a pergunta real é a do WhatsApp — *"quem mudou o
horário?"* — e ela se responde com uma coluna.

**50. Sair do grupo é do atleta; o sucessor é escolhido pelo BANCO.** O gatilho
`play_group_member_promove_dono` (0005) promove o membro ativo mais antigo assim
que não sobra dono ativo. Ele é `DEFERRABLE INITIALLY DEFERRED` — roda no
`COMMIT` — e é por isso que `sairDoGrupo` consulta "quem assumiu" **depois** da
transação, não dentro dela. Diferente da arena, que **recusa** a saída do último
dono: ali o recurso é da empresa, aqui é da pessoa, e travar a saída dela para
proteger uma pelada seria cobrar um preço pessoal por um problema de dados.

**51. O último a sair deixa o grupo VAZIO e VIVO.** Nada de apagar em cascata. A
página continua respondendo, o link fixado no WhatsApp continua abrindo, e quem
chegar por ele entra. Apagar o grupo quando o último membro sai destruiria
exatamente o que o produto vende — o endereço permanente.

**52. Remover recebe o id da PARTICIPAÇÃO, não o do usuário.** É a única chave
que serve também para convite não aceito (`user_id` é nulo enquanto ninguém
aceitou), e é o que a lista da tela já tem em mãos. E o dono **não** se remove
pela lista: a ação devolve `"voce-mesmo"` e aponta para "Sair do grupo", que é a
que promove sucessor. Remover a si mesmo pela lista deixaria o grupo sem dono sem
ninguém perceber.

**53. O convite expira em 14 dias e é RENOVADO no reuso.** `share_link.expires_at`
já era respeitado pela consulta de aceite; faltava alguém preenchê-lo. Catorze
dias é o tamanho de duas rodadas. E o link vivo é devolvido *e renovado* a cada
toque em "Convidar": quem convida toda semana nunca vê o convite morrer, e quem
convidou uma vez e sumiu deixa o token expirar sozinho — que é o comportamento
desejado. Revogar é `revoked_at` e nunca `DELETE`: `share_event` aponta para a
linha, e *"este link trouxe 6 pessoas antes de a gente cortar"* é a informação
que justifica o corte.

**54. A página de aceite deixou de entrar no grupo sozinha.** A versão anterior
adicionava a pessoa na própria renderização — abrir o link *era* entrar. Isso
economizava um toque e custava três coisas: ninguém via **no que** estava
entrando; um `GET` mudava estado (qualquer pré-busca de link — o Next, o preview
do WhatsApp, um antivírus de e-mail corporativo — adicionava a pessoa); e o
aceite ficava fora do alcance de qualquer confirmação. Agora a tela mostra grupo,
arena, quem chamou e a recorrência, e o botão faz o resto. O grupo **continua
aberto por link** (decisão 26): o que mudou é de quem é o consentimento, não quem
decide. Quem já é membro é redirecionado direto, sem tela.

**55. O e-mail de quem convidou sai MASCARADO até na tela de aceite.** O token
circula por encaminhamento de WhatsApp; o nome basta para reconhecer quem chamou.
Devolver o endereço completo faria de todo convite encaminhado um vazamento de
contato.

**56. A idempotência do resumo semanal é uma LINHA DE BANCO, e ela vem antes do
envio.** O cron da Vercel não promete execução única (reexecuta em falha, e um
deploy no meio da janela põe duas instâncias no ar). `play_group_digest` tem
chave primária `(grupo, data local)` e o job faz `INSERT … ON CONFLICT DO
NOTHING` **antes** de falar com o Resend: quem ganha a linha manda, quem perde
desiste em silêncio — a mesma disciplina da reivindicação de job do relay.
Reservar *depois* faria uma falha no meio da lista virar um remando geral na
passada seguinte. **Preferimos perder um resumo a mandar dois**: o segundo e-mail
é o que faz alguém apertar "isto é spam", e o domínio queimado é o mesmo que
manda o código de login.

**57. O job pergunta por JANELA FECHADA, não por "ontem".** "Ontem" é ambíguo num
produto com fuso por arena: o job roda em UTC e às 21h de São Paulo já é outro dia
lá. A pergunta certa é *"que janela de grupo terminou desde a última passada?"*, e
ela se responde com `window_end`, que é um instante absoluto. A folga de 30 horas
cobre uma execução que falhou — sem mandar duas vezes, porque quem garante isso é
a linha de cima.

**58. Rodada sem lance não vira e-mail.** `rodadasParaResumo` tem `HAVING count(c.id) > 0`.
Um "Rodada de sexta: 0 lances" lembraria a pessoa de que o produto existe
exatamente no dia em que ele não entregou nada — e é assim que se ensina alguém a
ignorar um remetente.

**59. Sem provedor de e-mail, a rodada é reservada MESMO ASSIM.** Quando
`RESEND_API_KEY` não existe (um preview, um `next dev`) o job registra e não
envia. É deliberado: ligar o provedor numa terça não pode disparar uma avalanche
de resumos de peladas de duas semanas atrás. O registro é o que mantém o passado
passado.

**60. O opt-in mora na PARTICIPAÇÃO, não na conta.** `notify_weekly` está em
`play_group_member`, e `/app/perfil` mostra um interruptor por grupo. A pergunta
real de quem joga em três peladas é *"quero o resumo DESTA?"*; um interruptor
único por conta transformaria "não quero o da terça" em "não quero nenhum" — e
quem não consegue calar só um acaba calando tudo.

**61. O descadastro é um token assinado, sem tabela e sem validade.** Todo o
resto do produto expira (cookie, código de login, convite); este não pode. O
Gmail guarda o `List-Unsubscribe` junto da mensagem, e a pessoa aperta "Cancelar
inscrição" num e-mail de oito meses atrás — um token vencido ali vira uma tela de
erro no lugar de um direito, e a reação a isso não é pedir um link novo, é marcar
como spam. O token só sabe fazer uma coisa (`notify_weekly = false`), e religar é
um toque no perfil: o pior caso de um token vazado é alguém desligar um e-mail.

**62. Duas URLs para a mesma saída.** O RFC 8058 manda o cliente de e-mail fazer
`POST` na URL do cabeçalho; uma rota do App Router é `page.tsx` **ou** `route.ts`,
nunca as duas. Então o `POST` mora em `/api/descadastro/[token]` (que também trata
`GET`, porque metade dos clientes só *abre* a URL) e a página com explicação em
`/descadastro/[token]`. `descadastro` precisou virar slug reservado de primeiro
nível — enterrá-lo em `/app/` o poria atrás do gate de login do middleware, que é
exatamente a fricção que a LGPD (art. 18) proíbe.

**63. Sim, há um `GET` que muda estado — e ele é a exceção medida.** É o do
descadastro. A ação só DESLIGA (nunca liga), é reversível num toque, e o
comportamento real dos clientes de e-mail é este: recusar não protegeria ninguém,
só deixaria o descadastro quebrado em metade deles. A rota também dispensa
`mesmaOrigem` e `Content-Type: application/json` — as duas guardas de
`lib/http-guards.ts` existem para barrar CSRF em rotas que agem em nome de um
**cookie**, e esta age em nome de um token.

**64. "Melhor da rodada" ordena por COMPARTILHAMENTO antes de visualização.** Ver
é barato: abrir a página do grupo já conta. Compartilhar custa uma decisão
("isto merece ir pro grupo") e é o comportamento que o produto vende. Ordenar por
view elegeria quase sempre o primeiro card da grade — o mais alto na tela — e a
seção viraria um espelho da ordenação, não um destaque. Com zero de tudo, a seção
**não aparece**: um destaque sem sinal é o primeiro da lista com outro nome.

**65. O seletor de rodada é um `OFFSET` no SQL e um `?r=N` na URL.** A lista de
ocorrências é **gerada**, não paginada de uma tabela que cresce: "a rodada 12 é a
décima segunda da lista" continua verdade entre duas requisições, então o keyset
assinado que a busca de clipes exige não faz sentido aqui. Pular em memória
significaria trazer todas as ocorrências desde hoje com seis clipes cada para
jogar fora a maior parte. E o par de links (em vez de botões) faz cada bloco virar
um endereço: o botão voltar funciona, e a rodada de três meses atrás pode ser
mandada no WhatsApp.

**66. A numeração da rodada é absoluta, com horizonte de um ano.** "Rodada 12"
precisa ser a mesma noite na primeira e na terceira página. Para isso a página
conta **todas** as ocorrências conhecidas (53 semanas — uma linha por ocorrência,
barato) e numera de trás para a frente. Um grupo com mais de um ano passa a
numerar a partir do horizonte; é o preço de não guardar a rodada em tabela, e ele
só será cobrado quando existir um grupo que sobreviveu um ano — que é um problema
bom de ter.

**67. O `.ics` é escrito à mão, em UTC, com recorrência CURTA.** Sem biblioteca:
as três coisas com pegadinha (CRLF, dobra em **75 octetos** — não caracteres, e
"pelada de sábado" tem acento — e escape de TEXT com a barra invertida antes da
vírgula) cabem em cinquenta linhas com teste, e cada dependência nova é peso de
cold start. `DTSTART` com `TZID` exigiria um bloco `VTIMEZONE` completo, e um
VTIMEZONE errado é pior que nenhum. A consequência de usar UTC é que a
recorrência congela o offset, e é por isso que ela tem `COUNT=12`: três meses, o
mesmo horizonte da página. Um `RRULE` infinito seria uma promessa que o arquivo
não pode cumprir.

**68. O título da sessão virou um `<h1>` só.** Era "Sexta, 12 de setembro" em 34px
com "20:00–21:00 · todas as quadras" em cinza embaixo — e a segunda linha lia como
metadado. Mas a sessão **é** a junção das três coisas: sem quadra e horário,
"Sexta, 12 de setembro" nomeia o dia, não a pelada, e duas turmas da mesma noite
ganhariam títulos idênticos. A hierarquia continua (data em peso cheio, resto em
apoio), dentro do mesmo elemento — que é o que o leitor de tela deve anunciar de
uma vez. E a hora saiu de `20:00` para `20h`: este título existe para ser lido em
voz alta, e `20:00` é a forma que ninguém usa falando.

**69. Confirmação destrutiva é um componente, não `window.confirm`.** O diálogo
nativo vem com o domínio grudado no texto ("replayja.com.br diz:"), que é a
aparência de um golpe; não aceita o desenho do produto; e nos navegadores
**embutidos** — o do WhatsApp e o do Instagram, por onde metade dos links do
produto é aberta — às vezes simplesmente não aparece, e a ação acontece sem
pergunta nenhuma. `AcaoConfirmada` abre a pergunta **no lugar do botão**, com
"Cancelar" à esquerda: quem tocou por engano acha a saída onde o dedo já estava.

**70. O interruptor de preferência é um `<input type="checkbox">` de verdade, e
não tem botão "Salvar".** A chave é CSS por cima da caixa nativa — tab, espaço,
VoiceOver e `<label>` clicável vêm de graça, e a aparência é a mesma. E a escrita
acontece no toque, com `useOptimistic` movendo a chave na hora: uma tela de
preferências com botão de salvar é uma tela onde metade das pessoas muda o
interruptor, sai, e volta para descobrir que nada mudou.

### 12.3 Testes

`tests/grupo-v2.test.ts` (18 unitários) cobre o que é **puro**: o `.ics` (carimbo
UTC, escape com barra antes da vírgula, dobra em 75 octetos que nunca parte um
caractere multibyte, `BYDAY` ordenado e sem repetição, ausência de `RRULE` quando
não há dia), o token de descadastro (ida e volta, payload adulterado com
assinatura boa, assinatura trocada, lixo que **não pode lançar**, id que não é
uuid) e os e-mails (assunto do resumo no singular e no plural, escape de HTML no
nome do grupo, os dois cabeçalhos do RFC 8058).

`tests/migracoes.integracao.test.ts` ganhou **20 testes** contra Postgres real,
em `"grupo v2: edição, saída, convite e resumo"` — cada cenário com o **seu**
grupo, porque teste de membro é destrutivo por natureza e um grupo compartilhado
faria a ordem dos `it` virar parte do contrato:

- dono edita nome/esporte/quadra/visibilidade e `updated_by` fica gravado; o slug
  **não** muda; trocar para "todas as quadras" **apaga** a quadra antiga em vez de
  somar; membro comum recebe **403** e quem não é membro recebe **404**;
- convite nasce com 14 dias e é reaproveitado; revogar mata o token e **mantém** a
  linha; não se revoga o convite de outro grupo com id adivinhado; convite vencido
  não resolve;
- "melhor da rodada" escolhe o mais compartilhado **apesar** de outro ter 40 views,
  e exige login;
- a rodada de ontem entra na fila do resumo com a contagem certa; quem desligou o
  aviso sai da lista de destinatários e o grupo em que todos desligaram sai da
  fila; `reservarResumo` devolve `true` uma vez e `false` na segunda; o
  descadastro por token desliga os três grupos e é idempotente;
- membro sai e o contador **reconta da tabela**; quem saiu pode voltar; o dono não
  se remove pela lista e membro comum não remove ninguém; **quando o dono sai, o
  banco promove o membro ativo mais antigo** e o novo dono edita de verdade; o
  último a sair deixa o grupo vazio, vivo e reentrável.

> As datas continuam **calculadas a partir de `now()`**. O resumo olha para uma
> janela de 30 horas, e "ontem" está sempre dentro dela — uma data fixa faria a
> suíte passar hoje e falhar amanhã.

A integração desta rodada rodou num **branch Neon efêmero** (`teste-grupos-v2`, no
projeto `replayja`), apagado ao fim. O Docker Desktop desta máquina não sobe o
daemon; o CI continua usando o Postgres em container.

### 12.4 O que ficou pendente

| # | O quê |
|---|---|
| **V-1** | **`CRON_SECRET` na Vercel.** Sem ele a rota do resumo recusa em produção — de propósito. É uma variável nova (`.env.example`), e variável nova só vale para deployments criados **depois** dela |
| **V-2** | **O teto do Resend é compartilhado com o Sentinela.** O resumo soma ao OTP no mesmo plano; um sábado de manhã com muitos grupos é o primeiro lugar onde isso aperta. O job tem teto de 200 envios por passada, e a fila que sobrar volta na passada seguinte — mas ninguém é avisado quando isso acontece |
| **V-3** | **Não há tela de reenvio em massa nem lembrete de convite** — e não deve haver: a mitigação do T5 de `docs/legal/analise-lgpd.md` é "um e-mail só, sem reenvio automático". O reenvio é sempre um ato manual de quem convida |
| **V-4** | **O expurgo de convite não aceito em 90 dias (D6) continua sem job.** `share_link` tem `expires_at` e a consulta o respeita, mas a linha permanece na tabela depois de vencer |
| **V-5** | **O `.ics` promete 12 ocorrências.** Passadas elas, quem quiser continuar com a pelada na agenda baixa o arquivo de novo. Um `RRULE` infinito em UTC mentiria se o horário de verão voltasse |
| **V-6** | **A numeração de rodada tem horizonte de 53 semanas** (decisão 66) |
| **V-7** | **Não há aviso para quem foi removido nem para quem foi promovido a dono.** O gatilho promove em silêncio; a pessoa descobre ao abrir a página. O e-mail de "você agora cuida do grupo" entra quando o Resend estiver de pé |
| **V-8** | **`play_group.sport` não aparece em lugar nenhum além do formulário.** Ele existe para a busca por esporte e para o card da arena, que ainda leem `court.sport` |
| **V-9** | **Trocar `SESSION_SECRET` invalida todo link de descadastro já enviado.** A variável já derrubava sessão e desafio de OTP; agora ela também assina o token do rodapé do e-mail. O link vira "este link não vale mais" — o que manda a pessoa para `/app/perfil` em vez de deixá-la sem saída, mas continua sendo um custo novo da rotação |

### 12.5 O smoke de produção

`pnpm smoke:grupo-v2` (`scripts/smoke-grupo-v2.ts`) roda as MESMAS funções de
`db/queries/*` que as telas rodam, e **não escreve nada** além do `upsert`
idempotente do usuário da sessão. A restrição é o ponto: `reservarResumo` grava
em `play_group_digest`, e a linha gravada SILENCIA o resumo daquela rodada para
sempre — um smoke que a chamasse cancelaria o e-mail de uma pelada de verdade
para provar que sabe mandá-lo.

O que ele confere: o grupo e o dono, os convites vivos com validade e métrica, as
rodadas conhecidas, o "melhor da rodada", o `.ics` gerado em memória, quem optou
pelo resumo, a fila do cron agora, e a ida e volta do token de descadastro — que
é a única forma de descobrir que `SESSION_SECRET` não está configurado neste
ambiente antes de o link do rodapé falhar na caixa de entrada de alguém.

> O token de descadastro **não pode ser conferido de fora**: `vercel env pull`
> devolve `[SENSITIVE]` no lugar do segredo de produção, então um token assinado
> na máquina de quem desenvolve é legitimamente recusado lá. Quem assina e quem
> confere em produção é o mesmo processo, com o mesmo segredo.

---

## Painel v2

> O app do atleta ganhou a "Luz de quadra" (`design/v2/`) e o painel só herdou os
> tokens. Esta rodada traduziu as sete telas de `/painel` para a v2 — **sem tocar
> em server action, consulta ou autorização**. Foi troca de pele, como no resto
> do produto.

Não há artboard de painel na v2. O de referência é `design/Painel.dc.html`, da
v1 — escuro, com lateral de 232px, KPIs de quatro colunas e tabelas com filete
por linha. O que foi traduzido dele: a lateral, os ladrilhos de número com a
variação embaixo, o bloco da arena no topo. O que foi descartado: o fundo escuro,
a borda de 1px em card, tabela e KPI, e a escala de tipografia sem salto.

### O que mudou, tela por tela

| Tela | O que mudou |
|---|---|
| **Chassi** (`layout.tsx`, `painel.module.css`) | Topo fixo branco com logo, **brasão + nome da arena + seletor** quando a conta administra mais de uma, e-mail e sair. Lateral virou **card branco grudado abaixo do topo** no desktop e **abas roláveis com pílula** abaixo de 900px. Fundo quente, zero contorno, sombra no lugar da linha |
| **Visão geral** | KPIs viraram **stat tiles** 38/11 com **variação vs. o período anterior**; "gravação por quadra" ganhou selo semântico e **régua de cobertura** com o corte dos 90%; os dois gráficos passaram a usar `GraficoDeBarras` (CSS puro, tokens, tabela acessível junto) |
| **Quadras** | Estado saiu do título e virou selo; quadra inativa deixou de ser `opacity: .62` e virou outra superfície; estado vazio ilustrado; os vínculos saíram de dentro de um `<label>` com vários controles |
| **Câmeras** | Tabela com **zebra suave** no lugar do filete por linha, selo de estado em quatro cores, cabeçalho do relay com selo; estado vazio com a voz da v2 |
| **Detalhe da câmera** | O **bloco de copiar** virou o herói da tela: mono de 17px em `--cor-texto` cheio, botão de copiar de 48px em `--cor-acao`, QR em moldura branca. "Estado" virou grade de mini-números; a cobertura hora a hora saiu verde/vermelha |
| **Botões** | Selo por botão ("ativo", "sem sinal", "revogado") e **pilha fraca como selo amarelo**; bloco "anote agora" do webhook em amarelo |
| **Marca e página** | A prévia da marca d'água passou a ser desenhada **sobre `ArteQuadra`** — a quadra à noite do design system — em 16/9, com os mesmos três números do corte |
| **Equipe** | "Aguardando 1º acesso" virou selo amarelo ao lado do nome; "você" virou selo neutro |
| **Privacidade** | Bloqueio com selo "bloqueando"/"desligado"; protocolo de remoção com selo por estado (amarelo enquanto corre, verde só em `concluido`); dois estados vazios ilustrados |

### Decisões do painel v2

**P-1. O painel deixou de usar os apelidos da v1 — e o bloco "compatível" de
`globals.css` pode encolher.** Aquele bloco (`--cor-acento`, `--cor-borda`,
`--raio-12`, `--texto-32`, `--e-16`…) existia justamente para o painel herdar a
paleta clara sem uma linha editada (`docs/design-system.md` §12.1). Com esta
rodada, `app/painel/**` só escreve token canônico. Quem for remover os apelidos
precisa conferir o que sobrou fora do painel — aqui não sobrou nada.

**P-2. Os quatro estados de câmera ganharam quatro cores, num componente do
painel.** `StatusDot` é do design system e fala a língua do atleta: online,
offline, gravando, cortando. O painel precisa distinguir **gravando · instável ·
aguardando relay · offline**, e o mapeamento de `lib/saude-visao.ts` manda
"instável" para o mesmo verde de "gravando" — verde é a cor de "pode ir dormir",
o sinal errado para uma câmera que grava com buracos. A regra da casa é não
editar `components/ui` para criar variante, então nasceu
`app/painel/_components/SeloDeEstado.tsx`. A forma do ponto muda junto da cor
(cheio · anel vazado · quadrado): cor sozinha morre no daltonismo e no sol.

**P-3. A variação dos ladrilhos é derivada, e o rótulo diz de quê.**
`metricasDoPainel` já devolve `lances_7d` e `lances_30d` na mesma consulta, e as
duas janelas terminam agora — então os 23 dias anteriores à última semana já
estão lá. `_lib/tendencia.ts` faz a conta e escreve **"contra a média das semanas
anteriores"**, não "semana passada": prometer a segunda e entregar a primeira é o
tipo de imprecisão que o parceiro descobre no dia em que confere no braço. Uma
coluna nova custaria outra varredura de 30 dias em `clip` a cada abertura do
painel para responder à mesma pergunta.

**"Atletas" não ganha seta**, e é o mesmo cuidado: `count(DISTINCT)` de 30 dias
menos o de 7 **não** é o número de atletas dos 23 dias anteriores — quem jogou
nas duas janelas é contado uma vez só.

**"Lances hoje" também não ganha seta**, e isso só apareceu com o piloto na tela:
hoje é um dia pela metade, então às 10h da manhã o ladrilho dizia "−100% contra a
média diária" e às 23h diria o contrário sem que nada na arena tivesse mudado. A
média diária ficou como linha de apoio.

**P-4. O bloco de copiar é dimensionado para o poste, não para o monitor.** É a
única tela do produto lida **de pé, na quadra, ao sol, com a escada na mão**.
Daí mono de 17px em vez de 13, `--cor-texto` cheio (17:1) sobre
`--cor-superficie-2` em vez do cinza de apoio, botão de copiar de **48px** (acima
do mínimo de 44 do WCAG, porque o alvo de quem está de pé não é o de quem está
sentado) e `user-select: all` no valor — um clique seleciona tudo, que é o
caminho que sobra quando não há área de transferência. "Copiado!" vira verde e
volta sozinho em 2 s.

**P-5. "Anote agora" trocou o verde pelo amarelo.** Ele era um bloco de sucesso.
Verde diz "deu certo, pode seguir", que é exatamente a leitura que faz alguém
fechar a aba sem copiar uma credencial que **não volta**. `--cor-pro` é a cor mais
rara do sistema e a única do painel que significa "pare e olhe agora".

**P-6. O topo carrega a arena porque errar de arena é um erro silencioso.** Uma
conta que administra duas arenas vê números plausíveis da arena errada e não tem
como perceber. A lista vem de `arenasDoAdmin` no layout — a **mesma** leitura que
`resolverArena` já faz, a partir do `uid` da sessão; ela não é a barreira e o
gate continua sendo o da página. Trocar de arena corta o caminho em
`/painel/<seção>`: manter `/painel/cameras/<id>` na arena nova seria um 404
garantido, porque aquele id não existe lá.

**O brasão são as iniciais, e não o logo enviado.** O logo vive no bucket privado
junto com os clipes; mostrá-lo no topo exigiria uma URL assinada por requisição,
em toda página do painel, para um elemento de 38px.

**P-7. Zebra no lugar de um filete por linha.** Seis colunas com uma borda embaixo
de cada linha desenham uma grade, e grade é o que faz uma tabela de operação
parecer planilha exportada. A faixa de `--cor-superficie-2` (5% de luminância
abaixo do branco) guia o olho sem desenhar nada — e cumpre a regra da v2 de
**borda OU sombra, nunca as duas**.

**P-8. Linha inativa deixou de ser `opacity: .62`.** Opacidade rebaixa o contraste
do texto junto: a quadra desativada ficava ilegível justamente para quem procura
o botão de reativar. Agora o inativo é outra **superfície** (o fundo quente, sem
sombra) e continua passando AA.

**P-9. A prévia da marca d'água é 16/9 sobre a arte de quadra.** A pergunta da
arena é "vai dar pra ler?", e a resposta depende do fundo — que é uma quadra à
noite, não grama chapada: a marca costuma ficar em cima, contra o céu e o
refletor. `ArteQuadra` é semeada com o slug, então duas arenas não recebem o mesmo
frame. Os três números (posição, opacidade, largura em % do quadro) continuam
sendo os mesmos que vão para o corte, e a proporção tem de ser a do vídeo: num
retângulo de outra proporção os três mentem juntos.

### Medições

Lighthouse **desktop**, Chrome headless sobre `next build` + `next start`, com o
banco do **piloto** e sessão real (cookie assinado com o `SESSION_SECRET` do
piloto, para não depender da tela de código):

| Rota | Performance | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| `/painel` | **100** | **100** | **100** | 63 |
| `/painel/cameras/arenavascoq1` | **100** | **100** | **100** | 63 |
| `/painel/pagina` | **100** | **100** | **100** | 63 |

O 63 de SEO é `is-crawlable: Page is blocked from indexing` — e é **de propósito**:
toda rota do painel declara `robots: { index: false, follow: false }`. A outra
auditoria reprovada é `bf-cache`, comum a toda página `force-dynamic`.

**Hex fora dos tokens em `app/painel/`: dois, no mesmo arquivo.** `#fff` e `#000`
em `_components/QrCode.tsx` são exigência da norma do QR, não cor do sistema — em
`--cor-superficie` o fundo viraria translúcido nas telas `.noite` e o leitor do
celular recusaria o código. Estão comentados no arquivo. Há também **um
`!important`**, em `.previaArte`: `ArteQuadra` recebe a altura como prop e a
escreve em `style` inline, então ela não estica dentro de uma caixa com
`aspect-ratio`; a alternativa seria uma prop nova em `components/ui`, que não era
editável nesta rodada.

**Capturas:** `web/docs/capturas/v2/painel-*.png` — visão geral, câmeras, detalhe
da câmera e marca e página, em 1280 (escala 1) e 390 (escala 2, a convenção das
capturas do app).

### O que ficou pendente

| # | O quê |
|---|---|
| **PV-1** | **Não há tela de escolha de arena com foto.** O seletor do topo e a lista de `EstadoDaArena` usam o brasão de iniciais; quando `C9` entregar o upload de capa, os dois viram cards com imagem |
| **PV-2** | **O painel não tem estado de carregamento.** Toda rota é `force-dynamic` e renderiza no servidor; num 4G ruim a tela fica branca até a resposta. Um `loading.tsx` por rota com o esqueleto dos ladrilhos é barato e não entrou nesta rodada |
| **PV-3** | **A variação só existe em "lances em 7 dias".** Compartilhamentos e grupos ativos não têm janela anterior na consulta — e acrescentá-la é mudança de `db/queries/`, que estava fora do escopo desta rodada |
| **PV-4** | **`select` continua sendo elemento nativo com regra repetida.** `painel.module.css` copia o campo do `Input` (60px, `--cor-superficie-2`, anel de foco) porque CSS Modules não herda entre arquivos. O certo é um `Select` no design system |
| **PV-5** | **A tabela de câmeras não ordena nem filtra.** Com duas câmeras não faz falta; com vinte, faz |
| **PV-6** | **Nada aqui foi medido no celular real.** As capturas de 390 saem do emulador do Chrome; o alvo de 48px do botão de copiar foi escolhido pelo contexto (de pé, ao sol), não medido com instalador |

---

## 13. Correções de UX — 2026-09-13

O fundador testou <https://replayja.com.br> pelo celular e voltou com **seis
bugs**. Nenhum deles é de dado ou de consulta: são todos de chassi — a tela que
não tem saída, a faixa que não respeita a margem, a folha que não tem fundo.
Cinco dos seis existiam desde a v2 e passaram por duas revisões sem serem vistos,
o que diz algo sobre revisar tela de celular num monitor de 27".

As seis correções estão em seis commits, um por causa. O que segue é a causa e a
correção de cada uma.

### Os seis

**1 · A faixa de chips batia na borda esquerda.** `ChipFaixa` sangra para fora do
container (é o que faz o quinto chip parecer continuar para além da tela em vez
de terminar numa parede) e devolve o mesmo tanto em `padding`, para o primeiro
chip ficar alinhado com o texto acima dele. O valor sangrado era **fixo em 20** —
a margem da página. Dentro do cartão branco da busca, cuja margem interna é
**14**, a faixa passava 6px para fora do cartão: "Acabei de jogar" nascia colado
na borda e "Quadra 1 · society" era fatiado pela quina arredondada.

Agora o recuo é `--faixa-recuo`, **declarado por quem embala** — o cartão diz 14,
a página continua dizendo 20 —, e `scroll-padding-inline` estende a mesma regra à
rolagem (sem ele, um chip trazido à vista por teclado ou por `scroll-snap`
encosta na parede e perde o respiro que o `padding` desenhou). O `padding-block`
subiu de 4 para 8: `overflow-x: auto` obriga o eixo vertical a `auto` também,
então a sombra das pílulas não tem como escapar da faixa — ela cabe ou é cortada,
e `--sombra-1` borra 16px.

As outras duas fileiras do produto — arenas em `/app/lances`, quadras no botão
virtual — copiavam o desenho e copiavam o defeito. Foram junto.

**2 · O "×" do player levava para a arena, e de lá não se saía.** O botão
apontava para `/[arena]` — um destino **fixo, escolhido no código**, e não o
lugar de onde a pessoa veio. Quem chegou ao lance pela busca era despejado na
página pública da arena, que até esta rodada não tinha barra inferior.

**3 · `/[arena]/grupos/novo` não tinha saída nenhuma.** Nem seta, nem barra — só
a migalha de pão, que é texto de 13px e ninguém lê como botão.

**6 · Voltar de um grupo caía na arena, e de lá não se saía.** A mesma seta fixa,
o mesmo beco.

Os três são o mesmo bug, e a correção é o componente `Voltar` (abaixo) mais a
barra inferior nas telas de arena.

**4 · "Chamar a galera" estava transparente.** Um `<dialog>` sobe para a **camada
de topo** com `showModal()`, mas continua herdando as variáveis de CSS do pai
**no DOM**. A folha é aberta de dentro do cabeçalho `.tinta` da página do grupo,
onde `--cor-superficie` vale `rgba(255,255,255,0.07)`: ela pedia
`background: var(--cor-superficie)` e recebia 7% de branco.

A correção tem três partes, e as três são necessárias:

1. **`.luz`**, a paleta clara aplicável a uma subárvore. Ela não é uma segunda
   lista de hex — é o **mesmo bloco de `:root`**, com o seletor compartilhado
   (`:root, .luz { … }`), justamente para não haver como sair de sincronia;
2. a folha **redeclara `--cor-superficie`** em si mesma, para o fundo continuar
   opaco mesmo que alguém tire o `luz` do JSX;
3. `isolation: isolate`, `z-index` e `overflow` próprios, e o backdrop de 55%
   para **66%** — é ele, e não a folha, que precisa apagar a página.

`AcaoConfirmada` foi conferido junto e **não** tinha o problema: ele não usa
`<dialog>` (a pergunta abre no lugar do botão). É o único outro candidato no
produto — `grep -rn "<dialog" app components` devolve um arquivo só.

**5 · "Seus lances" tinha dois botões para a mesma coisa.** "Buscar por horário"
dentro do estado vazio e "Bora achar seu lance" embaixo da grade, os dois
apontando para `/app/buscar?arena=…`. Dois rótulos diferentes para o mesmo lugar
não são duas opções: são uma pergunta que o atleta não tem como responder, e ele
responde parando.

Agora existe **um só**, "Achar meu lance", e ele muda de **lugar** conforme o
estado — dentro do vazio quando não há nada (é ali que o olho está), abaixo da
grade quando há. Nunca os dois. O destino virou regra escrita e testada
(`app/app/lances/destino.ts`): com **uma** arena o CTA pula direto para a busca
dela; com mais de uma, passa pela escolha da arena, que é o passo 1 do fluxo do
PRD. O estado "você ainda não jogou numa arena com câmera" passou a dizer a mesma
frase, em vez de "Escolher a arena".

### O componente `Voltar`, e a regra dele

A regra é uma só, e tem dois casos:

- **navegou dentro do site** → `router.back()`. Empilhar uma entrada nova em vez
  de voltar é o que transforma "voltar duas vezes" num labirinto;
- **caiu de um link do WhatsApp** → o destino de `para`, que é a tela de **origem
  daquele conteúdo** (a busca da arena, para o player; a lista de grupos, para o
  grupo), nunca a home.

Saber qual dos dois é o caso **não dá para perguntar ao navegador**:
`history.length` conta também a página externa que trouxe a pessoa, e o App
Router do Next não guarda índice em `history.state` (conferido no navegador:
`{__NA, __PRIVATE_NEXTJS_INTERNALS_TREE}` — o `idx` é do Pages Router).
`document.referrer` também não serve sozinho: ele é fixado no **carregamento do
documento** e não muda em navegação de cliente, então depois de dois toques
dentro do app ele ainda aponta para o WhatsApp.

Então quem conta é o app. `RegistroDeNavegacao` fica montado no **layout raiz** e
soma uma visita a cada mudança de rota; duas ou mais significam que existe uma
tela nossa atrás. O referrer entra como **segunda** pista, para o caso de uma
navegação de documento inteiro dentro do site (um `redirect` de servidor), em que
o contador nasce em 1. Quando as duas pistas falham, a decisão é a alternativa —
errar para esse lado nunca tira a pessoa do site; errar para o outro tira.

Ele mora no layout **raiz**, e não no de `/app`, porque as três telas sem saída
do relato vivem fora de `/app`.

E ele é um **`<a href>`**, não um `<button>`: a saída tem de existir **antes** de
o JavaScript hidratar. No 4G da quadra, um botão não hidratado é literalmente o
sintoma relatado. Com `href`, o destino alternativo já funciona no HTML, o toque
longo oferece "abrir em nova aba" e o leitor de tela anuncia um link com destino;
o JavaScript só **melhora**. Ctrl/Cmd/Shift-clique e botão do meio continuam
sendo do navegador.

### A barra inferior fora de `/app`

**O critério que passa a valer:** em qualquer tela do atleta existe **ou** a barra
inferior **ou** um "voltar" que funciona. A auditoria completa:

| Tela | Saída |
|---|---|
| `/app`, `/app/lances`, `/app/buscar`, `/app/grupos`, `/app/perfil` | barra (layout de `/app`) |
| `/app/botao` — botão virtual | `Voltar` → busca da arena (a barra some: tela de uma ação só) |
| `/[arena]` — página da arena | barra, **logado**; `CtaFixo` de entrar, deslogado |
| `/[arena]/c/[clipId]` — player | `Voltar` "×" → busca da arena (sem barra: é tela imersiva) |
| `/[arena]/s/[sessao]` | `Voltar` + barra, logado |
| `/[arena]/[grupo]` | `Voltar` → `/app/grupos` + barra, logado |
| `/[arena]/[grupo]/editar` | `Voltar` → o grupo + barra |
| `/[arena]/grupos/novo` | `Voltar` → a arena + barra |
| `/bem-vindo` — onboarding | isenta por decisão (tela de uma ação só) |
| `/entrar` | isenta: é a porta |

Deslogado **não** recebe a barra nas telas públicas: o pé da tela é o `CtaFixo` de
entrar, e as quatro abas levariam todas ao login — o que é pior que não tê-las.
`com-barra` e `com-cta` nunca aparecem juntas na mesma tela.

**E as duas classes de reserva passaram a ser escritas repetidas**
(`.com-barra.com-barra`). Não é enfeite: o módulo de CSS de cada página escreve
`padding` no **atalho**, e o atalho zera o `padding-bottom` da classe global. As
duas têm a mesma especificidade (0,1,0), então quem ganha é quem o Next escrever
por último no CSS publicado — e isso **muda por rota**, conforme a ordem dos
chunks. Foi assim que a reserva do CTA fixo da página da arena já estava perdida
em produção **antes** desta rodada: `.parceiro_pagina__…` sai depois de
`.com-cta`, e o botão "Entrar pra ver meus lances" cobria o fim do conteúdo.
Repetir a classe leva a especificidade para 0,2,0, tira a decisão da ordem do
bundler, e não custa um `!important` nem uma linha em módulo nenhum.

`abaAtivaDe` ganhou uma **segunda passagem** para as rotas de arena, onde o
prefixo não resolve porque o primeiro segmento é um slug. O segundo segmento é o
que distingue player (`/c/…`) e sessão (`/s/…`), que acendem **Lances**, de
`grupos/novo` e da página do grupo, que acendem **Grupos**. Como o catch-all
ocupa a raiz do domínio, a regra confere o slug contra `RESERVED_SLUGS` antes:
`/entrar`, `/painel` e `/privacidade` continuam sem aba nenhuma.

### Testes

38 testes novos, e eles **não estão em `tests/`**: esta rodada correu em paralelo
com um agente de QA que era o dono daquele diretório, então os testes nasceram
colados no que prendem. O `vitest.config.ts` explica e inclui os dois lugares; o
padrão da casa continua sendo `tests/`.

| Arquivo | O que prende |
|---|---|
| `components/ui/Voltar.test.tsx` | a regra nos dois casos, o contador (inclusive a dupla montagem do modo estrito) e o clique com modificador |
| `components/ui/chassi.test.ts` | o recuo da faixa e o fundo da folha, lidos **da folha de estilo** — e a paridade `.noite`/`.tinta` × `.luz` |
| `components/ui/InviteSheet.test.tsx` | a folha veste `luz` mesmo aberta de dentro de um `.tinta`, e continua modal |
| `components/ui/BottomNav.rotas.test.ts` | as rotas de arena, com ênfase no que **não** pode acender aba |
| `app/app/lances/destino.test.ts` | o CTA único e o destino dele |

Os testes de CSS sabem que são testes de texto. Eles não juram que a tela está
certa — juram que a regra que a conserta não foi apagada, que é o modo real como
este tipo de bug volta.

Uma asserção de `tests/ui/bottom-nav.test.tsx` mudou de propósito: `/arena-vasco`
**passou** a acender "Arenas". O que ela realmente guardava — o prefixo `/app` não
pode casar por texto — continua preso, agora via `/aplicativo/lances`.

### Capturas

`docs/capturas/v2/fix-*.png`, 390px:

| Arquivo | O quê |
|---|---|
| `fix-1-chips-antes.png` / `-depois.png` | a faixa de chips dentro do cartão da busca |
| `fix-4-folha-antes.png` / `-depois.png` | "Chamar a galera" aberta de dentro de um bloco `.tinta` |
| `fix-2-3-6-voltar-depois.png` | o `Voltar` no claro (o "antes" é a ausência do controle) |
| `fix-2-3-6-voltar-escuro-depois.png` | o mesmo sobre `.noite` |

Elas saem de `/dev/ui`, que ganhou três parâmetros só para isto: `?so=<id>`
mostra uma vitrine só, `?antes=1` reinjeta as regras de CSS que estavam em
produção antes desta rodada, e `?convite=1` abre a folha — o Chrome sem cabeça
não clica nem rola. Para regerar:

```bash
pnpm dev
chrome --headless=old --hide-scrollbars --window-size=390,844 \
  --screenshot=docs/capturas/v2/fix-1-chips-depois.png \
  "http://localhost:3000/dev/ui?so=chip"
```

**As telas inteiras não foram capturadas, e isto é uma lacuna real.**
`/app/lances`, o player, o grupo, o criar grupo e a página da arena precisam de
banco, e esta máquina não tem `DATABASE_URL` configurado (`/api/health` responde
`db: "nao-configurado"`). O que está capturado é o componente corrigido na largura
certa, dentro do cartão certo, sobre o fundo certo — não a tela em volta dele.
Conferir as seis telas em produção depois do deploy continua sendo trabalho de
alguém com sessão.

### O que ficou estranho no caminho

| # | O quê |
|---|---|
| **UX-1** | **A página da arena deslogada continua sem saída para dentro do produto.** Ela tem o `CtaFixo` de entrar e mais nada — quem chega pelo Instagram da arena e não quer entrar não tem para onde ir. É decisão de produto, não bug, mas é o único lugar do app onde não existe nem barra nem voltar |
| **UX-2** | **`/app/lances` escolhe a arena sozinha** (`arenas[0]`) quando não vem `?arena=`. É o mesmo palpite que a v2 tirou da busca por ter produzido o "busquei e não achou". Aqui ele é menos grave (a fileira de arenas fica visível logo abaixo do título), mas é o mesmo padrão |
| **UX-3** | **A fileira de arenas de `/app/lances` só aparece com duas arenas ou mais.** Com uma só, a tela não diz que existe a possibilidade de trocar — e o CTA agora pula direto para a busca daquela arena, o que reforça a impressão de que ela é a única que existe |
| **UX-4** | **O `EllipsisVertical` do player não é um menu.** É um link para a busca da arena com cara de "mais opções". Ou vira menu de verdade, ou vira um ícone que diz o que faz |
| **UX-5** | **`/app/botao` não tem barra, por decisão, e a única saída é a seta.** Está dentro do critério, mas é a tela mais frágil dele: se a seta quebrar, o beco volta |
| **UX-6** | **Duas fileiras roláveis do produto não usam `ChipFaixa`** (arenas em `/app/lances`, quadras no botão virtual) — elas são links, e o `Chip` é um `aria-pressed`. A consequência é que o mesmo CSS está copiado em três arquivos, e foi por isso que o bug 1 apareceu em três lugares. Um `Faixa` genérico em `components/ui` resolveria |
| **UX-7** | **O cabeçalho do grupo virou um lugar apertado.** Ele agora carrega o `Voltar`, o título, a linha de horário, a próxima pelada, os avatares e três botões de ação. Em 390px, com um nome de grupo longo, a linha de ações já quebra |

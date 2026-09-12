# API do Replay já 2.0 — decisões de contrato

> Companheiro de `docs/api/openapi.yaml` (OpenAPI 3.1). Este documento explica **por quê** o
> contrato é como é. O YAML é a fonte da verdade sobre **o quê**.
>
> Relacionados: `docs/adr/0001-stack-e-arquitetura.md`, `docs/modelo-de-dados.md`.

## Sumário

1. [Superfícies e hosts](#1-superfícies-e-hosts)
2. [Paginação](#2-paginação)
3. [Autorização — quem vê o quê](#3-autorização--quem-vê-o-quê)
4. [O gatilho e a janela do corte](#4-o-gatilho-e-a-janela-do-corte)
5. [Idempotência e retomada](#5-idempotência-e-retomada)
6. [Erros, limites e versionamento](#6-erros-limites-e-versionamento)
7. [Ferramentas e verificação](#7-ferramentas-e-verificação)

---

## 1. Superfícies e hosts

| Superfície | Host | Runtime | Auth |
|---|---|---|---|
| **Gatilho — botão físico** | `replayja.com.br/api/v1/triggers/b/{token}` | Next.js Route Handler (`gru1`) | token no caminho |
| **Gatilho — botão virtual** | `replayja.com.br/api/v1/triggers` | idem | `userSession` |
| **App do atleta** | `replayja.com.br/api/v1` | idem | `userSession` (cookie HMAC próprio) |
| **Painel do parceiro** | `replayja.com.br/api/v1` | idem | `userSession` + `partner_admin` ativo |
| **Relay → nuvem** | `replayja.com.br/api/relay` | idem | `relayKey` (`x-relay-key`) |
| **Nuvem → relay** | `relay-1.replayja.com.br` | EC2 + Caddy + `auth-sidecar` | `relayToken` |

### Quem manda em quem

Padrão herdado do relay v2 do Sentinela, em produção desde 29/08/2026:

> **O app não escreve no relay.** O relay pergunta — a lista de câmeras, a fila de jobs — e a resposta é sempre uma *lista*, nunca um comando.

A única chamada nuvem → relay é `POST /jobs`, e ela apenas **acorda** o relay para buscar a fila mais cedo. Se falhar (relay reiniciando, rede), nada se perde: o ciclo de 2 s pega o job. A chamada existe só para tirar até 2 s da latência percebida.

Três consequências práticas:

1. **O relay continua gravando com o app inteiramente fora do ar.** Um deploy quebrado na Vercel não custa nenhum lance — custa o atraso do corte, que é recuperado quando o app volta.
2. **A superfície de escrita do relay é zero.** Não há endpoint no relay que aceite instrução de fora; só leitura (`/clip`, `/thumb`, `/stats`) e um aviso sem corpo.
3. **O relay prefere errar para mais.** Se `GET /relay/cameras` não responder, vier inválida, vier vazia, ou remover mais da metade dos gravadores de uma vez, ele **aborta o ciclo e não desliga nada**. Sobra é desperdício de disco; falta é lance perdido — e no Sentinela três câmeras passaram um dia inteiro sem gravar exatamente por uma falha silenciosa deste tipo.

### O que desapareceu em relação à v1 do contrato

O desenho anterior tinha um computador de borda por arena, e com ele: `POST /devices/register`, `/devices/heartbeat`, `GET /devices/commands` (long-polling de 25 s), `/devices/commands/{id}/ack`, `/trigger-events`, `/clips/{id}/upload-url` e `/confirm` na versão de borda, e toda a família `/session-recordings/*` de upload de segmentos. Havia também um Cloudflare Worker dedicado (`edge.replayja.com.br`) só para aguentar 7M de heartbeats/mês.

Nada disso existe. **O relay é uma máquina nossa**, alcançável por HTTPS, e o volume de controle caiu para ~1 requisição por minuto por relay.

## 2. Paginação

### Keyset, nunca offset

Todas as listagens usam **cursor opaco** (`cursor` + `nextCursor` + `hasMore`), nunca `page`/`offset`.

**Por quê**: a lista mais importante do produto (`GET /clips`) é ordenada por `triggeredAt DESC` e **cresce enquanto o usuário rola** — a pelada está acontecendo e o relay está subindo clipes. Com `OFFSET`, cada clipe novo empurra a lista e o usuário vê itens repetidos entre páginas (ou pula itens, no outro sentido). Keyset ancora no último item visto e é imune a isso.

O ganho de performance vem de brinde: `OFFSET 5000` faz o Postgres varrer e descartar 5.000 linhas; `(triggered_at, id) < (?, ?)` é um `Index Scan` direto.

### Formato do cursor

```
base64url( JSON.stringify({ t: "2026-09-14T23:12:07.481Z", i: "01927f3a-...", v: 1 }) )
  + "." + HMAC-SHA256(payload, CURSOR_SECRET).slice(0, 16)
```

- **Opaco por contrato**: documentado como "não construir à mão".
- **Assinado** para que um cliente não possa injetar um cursor arbitrário e furar os filtros da consulta (o cursor participa da cláusula `WHERE`).
- **Versionado** (`v`) para permitir mudar a ordenação sem quebrar clientes com cursores antigos em voo — cursor de versão desconhecida devolve `422` e o cliente recomeça da primeira página.

### Limites

| Endpoint | `limit` padrão | Máximo | Motivo |
|---|---|---|---|
| `GET /clips` | 24 | 60 | 24 = 8 linhas de 3 thumbnails no grid mobile; 60 evita respostas de 60 KB no 4G da quadra |
| `GET /partners` | 24 | 60 | |
| `GET /groups` | 24 | 60 | |
| `GET /groups/{id}/sessions` | — | 52 semanas | Não paginado: a resposta é uma lista curta de cards de semana |
| `GET /partner/{id}/cameras` | — | — | Não paginado: uma arena tem 2–20 câmeras |
| `POST /session-recordings/{id}/segments/upload-url` | — | 50 por lote | Equilibra round-trips e tamanho do corpo |

Listas naturalmente pequenas (quadras, contatos, dispositivos, membros de grupo) **não são paginadas** de propósito — paginar 4 quadras é complexidade sem benefício, e o limite superior é conhecido e baixo. Se algum dia uma arena tiver 200 quadras, aí sim.

### Intervalos obrigatórios

`GET /clips` exige `from` **e** `to`, com intervalo máximo de **6 horas**. Não é uma limitação técnica — é uma decisão de produto e de privacidade (§3). O cliente sempre sabe o intervalo: ou o usuário escolheu, ou veio da janela de um grupo.

---

## 3. Autorização — quem vê o quê

Esta é a decisão mais delicada da API, porque o produto grava **imagem de pessoas em espaço semipúblico**.

### O problema real

Um clipe de 22 segundos de uma pelada tem 10 a 20 pessoas em quadra. **Não existe forma confiável de saber de quem é o lance.** Quem apertou o botão pode ser o goleiro, um amigo na arquibancada ou o garçom. Qualquer modelo de "dono do clipe" seria arbitrário.

A alternativa técnica — reconhecimento facial para atribuir clipes a atletas — está descartada: sob a LGPD, dado biométrico é **dado pessoal sensível** (art. 11) e exigiria consentimento específico e destacado de cada pessoa filmada, o que é impraticável numa quadra de society. E não é o produto.

### A decisão

> **Clipes são visíveis para qualquer usuário autenticado que forneça arena + janela de tempo.**
> A proteção não vem de restringir *quem* pode ver, e sim de restringir *quanto* se pode varrer,
> exigir identificação de quem viu, e responder rápido a pedidos de remoção.

Concretamente:

| Regra | Implementação |
|---|---|
| **Login obrigatório para qualquer clipe** | `GET /clips` e `GET /clips/{id}` rejeitam anônimo com `401`. Nenhum clipe é público, nem por link direto |
| **Nunca existe "listar todos os clipes da arena"** | `from`/`to` obrigatórios, intervalo ≤ 6h, `to` no máximo 400 dias atrás. Sem janela, sem resultado |
| **Rate limit por usuário** | 120 buscas/hora, 30 downloads/hora, 60 aberturas de clipe/hora |
| **Mídia sempre por URL assinada e curta** | Reprodução 6h, download 15 min, HMAC verificado no Worker de `media.*`. Um link de MP4 colado num fórum morre no mesmo dia |
| **Thumbnails são públicos** | Frame estático, sem áudio, baixa resolução. Precisam ser públicos para o Open Graph funcionar (o crawler do WhatsApp não tem sessão). É a exceção consciente |
| **Nenhum clipe é indexável** | `/s/<token>` e páginas de clipe têm `X-Robots-Tag: noindex, nofollow`. Só `/[arena]` e `/[arena]/[grupo]` público entram no `sitemap.xml` |
| **Auditoria de acesso** | `share_event` registra `opened`/`played`/`download` com `actor_user_id`. Sabemos quem viu o quê |
| **Takedown em 72h** | Formulário no rodapé de todo clipe. `deleted_at` sai da API em segundos; o objeto some do S3, o cache é invalidado no CloudFront **e o trecho some do disco do relay** em até 72h |
| **Obrigação contratual da arena** | O contrato do parceiro exige sinalização física visível ("Esta quadra é filmada — replayja.com.br/\<slug\>") e cláusula no regulamento da arena. A base legal do tratamento é legítimo interesse do parceiro, com o aviso prévio que ela sustenta |

### Por que não restringir mais

1. **Restringir mais não protegeria mais.** Se o acesso exigisse ser "membro de um grupo daquela arena", qualquer pessoa criaria um grupo e teria o mesmo acesso. A barreira seria fricção pura, não segurança.
2. **O mercado inteiro funciona assim** (`docs/concorrentes.md`): Chame o VAR, Meu Replay, Olho no Lance e z2play descobrem por arena → quadra → data → hora. Ser mais restritivo que todos os concorrentes, sem ganho real de privacidade, transformaria o principal diferencial (login sem fricção) numa desvantagem.
3. **O conhecimento da janela já é a barreira.** Para achar um lance é preciso saber arena, quadra e o horário com precisão de horas. Quem tem isso é quem estava lá.

### O que é mais restrito — e por quê

| Recurso | Quem vê | Por quê |
|---|---|---|
| **`session_recording` / `session_segment`** (gravação contínua de 12h) | **Somente `partner_admin` ativo da arena.** Nunca exposto ao atleta, nem por link | Isto é **vigilância contínua**, não um lance compartilhável. Um clipe de 22s é um momento esportivo; 12 horas ininterruptas de uma quadra é outra categoria de dado. Enquanto não houver produto construído em cima (highlights por IA), o acesso fica restrito a quem já é responsável legal pelo espaço |
| **`camera`, `camera_health`, `button`, `trigger_event`, `clip_job`, `coverage_gap`** | `partner_admin` da arena | Dado operacional. `camera.rtmp_key` e `button.token_hash` não são expostos a ninguém |
| **`relay_node`, `relay_health`** | **ninguém** além de `service_role` | É infraestrutura nossa, compartilhada entre arenas; o painel recebe um resumo montado pela API |
| **`share_event`, métricas** | `partner_admin` da arena | Contém padrão de comportamento de usuários |
| **E-mails de membros de grupo** | Completo só para o `owner` do grupo; mascarado (`g***@gmail.com`) para os demais membros | A lista serve para saber quem está no grupo, não para extrair base de contatos |
| **Clipes em `processing`/`failed`** | `partner_admin` (via `includePending=true`) | Ruído para o atleta, diagnóstico para a arena |

### O grupo **não** é uma ACL

Ponto que precisa ficar explícito para não criar expectativa falsa no time nem no usuário:

> Um grupo **privado** esconde a *página*, as *sessões organizadas* e a *lista de membros*.
> Ele **não** esconde os clipes: qualquer usuário logado que saiba a arena e o horário
> encontra os mesmos vídeos por `GET /clips`.

O grupo é **conveniência e organização** (o valor do PRD: "vídeos já organizados por sessão/semana, atualizados automaticamente"), mais captura de e-mail para o parceiro. Não é um cofre. A UI não deve sugerir o contrário — o texto de `visibility` diz "quem pode ver esta página", nunca "quem pode ver estes vídeos".

### Matriz consolidada

| Recurso | Anônimo | Logado | Membro do grupo | Dono do grupo | Admin da arena |
|---|:--:|:--:|:--:|:--:|:--:|
| `GET /partners/{slug}` (página da arena) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /partners/{s}/groups/{g}` — `public` | metadados | ✅ | ✅ | ✅ | ✅ |
| `GET /partners/{s}/groups/{g}` — `unlisted` | mínimo | ✅ | ✅ | ✅ | ✅ |
| `GET /partners/{s}/groups/{g}` — `private` | 404 | 404 | ✅ | ✅ | ✅ |
| `GET /clips` (com janela ≤ 6h) | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| `GET /clips/{id}` + reprodução | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| `POST /clips/{id}/download` | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| `POST /shares` | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| `GET /shares/{token}` (preview OG) | ✅ metadados | ✅ | ✅ | ✅ | ✅ |
| `POST /triggers/virtual` (botão virtual) | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| `GET /groups/{id}/sessions` | ❌ | se `public`/`unlisted` | ✅ | ✅ | ✅ |
| `PATCH`/`DELETE /groups/{id}` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `POST /groups/{id}/members` (convidar) | ❌ | ❌ | ❌ | ✅ | ❌ |
| Sessão completa gravada | ❌ | ❌ | ❌ | ❌ | ✅ |
| Dispositivos, botões, métricas | ❌ | ❌ | ❌ | ❌ | ✅ |
| Branding, contatos | leitura pública | leitura | leitura | leitura | ✅ escrita (`owner`/`manager`) |
| Convidar admin da arena | ❌ | ❌ | ❌ | ❌ | ✅ só `owner` |

### Não há defesa em profundidade — e o que se faz no lugar

Nas revisões 1 e 2 a autorização era verificada **duas vezes**: na rota e, de novo, por RLS no Postgres do Supabase. Com a mudança para o Neon com `pg` puro (ADR §4), **a segunda camada deixou de existir**. Um `WHERE` esquecido numa rota nova não volta vazio: volta tudo.

Isso é uma dívida de segurança assumida, não um detalhe de implementação. As compensações, detalhadas em `modelo-de-dados.md` §7, são quatro e todas verificáveis por CI:

1. **Nenhuma rota escreve SQL.** Todo acesso passa por `db/queries/`, e o CI falha se encontrar `query(` fora dali.
2. **Toda função de consulta recebe a sessão como primeiro argumento**, e o tipo obriga. Não existe leitura de clipe que aceite só um `partnerId`.
3. **O escopo entra na cláusula `WHERE`**, nunca num filtro em memória depois da consulta — que é como escopo vaza em paginação.
4. **Toda rota autenticada tem o teste do usuário errado** (403), não apenas o teste do caminho feliz. É o item da definição de pronto que substitui o que a RLS fazia sozinha.

Mais duas regras de projeção, porque sem RLS não há privilégio de coluna: `SELECT *` é proibido em `db/queries/`, e `camera.rtmp_key`, `camera.rtsp_url`, `button.token_hash` e `relay_node.key_hash` só aparecem na consulta que serve `GET /relay/cameras` (autenticada por `x-relay-key`) e na tela de provisionamento, que as mostra uma única vez.

**O caminho de volta**, se um dia valer: o Neon é Postgres, então RLS está lá. Custa uma migração, um papel não privilegiado e um `SET LOCAL` no `db.ts`. Vale ter isso escrito enquanto o desenho ainda permite.

---

## 4. O gatilho e a janela do corte

### Não há mais transporte nuvem → borda

A v1 deste contrato dedicava uma seção inteira a escolher entre long-polling, WebSocket e MQTT para entregar o comando de "botão virtual" a um computador dentro da arena, atrás de CGNAT. **A pergunta deixou de existir.** O relay é uma máquina nossa com IP público; a nuvem simplesmente chama.

```
botão Wi-Fi ──POST /triggers/b/<token>──┐
                                         ├─> API ─> clip_job no Postgres ─┐
site logado ──POST /triggers────────────┘                                 │
                                                  POST /jobs (acorda) ────┤
                                                                          ▼
                                     relay: GET /relay/clip-jobs a cada 2 s
```

Com isso some também a expiração agressiva de comando. Na v1, `trigger_clip` expirava em **15 segundos**, porque um gatilho entregue com atraso capturava o lance errado — pior que não capturar nada. Agora **a janela é absoluta e a sessão está gravada**: executar o corte cinco minutos depois produz exatamente o mesmo clipe. `clip_job.expires_at` é de 30 min e existe só para não acumular lixo.

### O contrato do botão físico

O botão é um dispositivo de prateleira com webhook configurável (Shelly Button 1 ou equivalente). O contrato é deliberadamente pobre, porque o firmware é de terceiro e não podemos mudá-lo:

| Regra | Por quê |
|---|---|
| Segredo **no caminho** (`/triggers/b/{token}`) | Um botão de bateria não faz HMAC nem manda cabeçalho custom |
| **Corpo vazio é válido**; `Content-Type` ignorado | Vários modelos não enviam corpo |
| Resposta **sempre `202`**, mesmo em recusa | O botão não tem como tratar erro, e não queremos que repita |
| `404` só para token inexistente | Único caso em que vale sinalizar, para não manter token morto vivo |
| Query opcional `?bat=`, `?evt=`, `?rssi=` | Para os modelos que suportam template de URL |
| `?evt=` (contador do próprio botão) vira chave de idempotência | Um botão que reenvia por timeout não gera dois clipes |
| Cooldown de 8 s por botão, 120/hora | Cinco apertos seguidos viram um clipe |

O token na URL é um segredo fraco, exatamente como a chave RTMP e pelo mesmo motivo: o dispositivo do outro lado não sabe fazer melhor. A defesa é o dano baixo (alguém dispara um clipe numa quadra pública), o cooldown, o rate limit e a revogação em um clique.

### Dimensionar a margem: o carimbo é hora de chegada, não hora da cena

Este é o ponto em que o desenho de relay pode errar silenciosamente, e merece o cuidado que a v1 dedicava à deriva de relógio.

Três instantes que ninguém deve confundir, e as duas latências que os separam:

```
t_cena ──(reação do jogador)──> dedo no botão ──(A)──> t_chegada no servidor
   └──(B)──> posição do quadro na linha do tempo do relay
```

| | Coluna | Padrão | O que é |
|---|---|---|---|
| **(A)** Acordar do botão | `button.wake_latency_ms` | 1500 ms | Sai do sono profundo, associa no Wi-Fi, resolve DNS, faz TLS. A maior e a mais variável — piora com pilha fraca e com Wi-Fi congestionado |
| **(B)** Origem da câmera | `camera.origin_lag_ms` | 3000 ms | Encoder da câmera + rede da arena + buffer do ffmpeg no relay |

> **O relay não descobre (B) sozinho.** O `PROGRAM-DATE-TIME` que ele publica é hora de **chegada** (início da sessão + duração acumulada da mídia), não hora da cena. No Sentinela essa perna chegou a ~12 s pelo caminho da nuvem Tuya e ficou invisível a qualquer conta feita contra o próprio relay — a prova aritmética foi uma amostra dar **latência negativa de −0,13 s**, que não existe. Pelo caminho RTMP direto a perna é muito menor, mas **precisa ser medida, não estimada.**

**Como medir (10 min por câmera, item do roteiro de instalação):** filmar um celular com relógio de segundos apontado para a câmera, pedir `/thumb` naquele instante, comparar. A diferença é `origin_lag_ms`. Para o botão, `POST /partner/{id}/buttons/{id}/test` abre uma janela de 30 s e mede a chegada.

**A janela resultante:**

```
t_press  = arrival_at − button.wake_latency_ms
deliver  = [ t_press − 24 s + origin_lag , t_press + 1 s + origin_lag ]   → 25 s entregues
cut      = [ deliver.from − 8 s , deliver.to + 5 s ]                      → 38 s brutos
```

O corte bruto é **13 segundos mais largo** que o entregue, de propósito. Absorve: erro das duas medidas, o alinhamento de segmento (o remux `-c copy` começa no segmento que **contém** `from`, sobrando até um segmento de cabeça) e a variação de `wake_latency` entre pilha nova e pilha velha. Bytes extras num arquivo temporário do relay custam zero; um lance cortado ao meio custa o cliente.

O recorte exato para os 25 s acontece no passe de marca d'água, que já recodifica — a precisão final é de quadro, não de segmento.

### Quando o clipe cai num buraco de uplink

O relay calcula `coverageRatio` a partir do próprio índice: quanto da janela pedida existe de fato em disco. Três desfechos:

| `coverageRatio` | Estado | O que o atleta vê |
|---|---|---|
| `1.0` | `ready` | O lance, normal |
| entre `minCoverageRatio` (0,6) e `1.0` | **`partial`** | O lance, com um aviso: "faltam ~3 s — a internet da arena oscilou" |
| `< 0.6` | `failed` (`no_coverage`) | "Não foi possível recuperar este lance" — e o gatilho vira evidência no painel do parceiro |

`partial` **aparece na busca**. Um lance com 3 segundos faltando ainda é o lance do atleta; escondê-lo seria pior que entregá-lo rotulado. E cada ocorrência alimenta `coverage_gap`, que o painel do parceiro mostra como "a internet da arena oscilou N vezes ontem" — uma reclamação acionável do lado dele, não do nosso.

---

## 5. Idempotência e retomada

O relay opera sobre uma rede que cai no meio de um `POST`, e o botão é um dispositivo que pode reenviar por conta própria. Quatro camadas, cada uma resolvendo um problema diferente.

### Camada 1 — O gatilho não pode virar dois clipes

| Origem | Chave | Constraint |
|---|---|---|
| Botão físico que reporta contador | `<button_id>:<evt>` | `UNIQUE (idempotency_key)` parcial em `trigger_event` |
| Botão físico sem contador | cooldown de 8 s por botão | recusa com `rejected_cooldown` |
| Botão virtual | `Idempotency-Key` do cliente | tabela `idempotency_key` (camada 2) |

O cooldown não é só antiabuso: é a idempotência de quem não tem como ser idempotente. Cinco apertos em três segundos viram um clipe — e um botão que reenvia porque não recebeu o `202` cai na mesma regra.

### Camada 2 — `Idempotency-Key` no HTTP

Cabeçalho opcional (UUID do cliente) em todo endpoint que muda estado, do app e do relay. Tabela `idempotency_key` com `(principal, key)` como PK — `principal` é `relay:<id>` ou `user:<uuid>`, o que impede um chamador de adivinhar a chave de outro —, `request_hash`, resposta original e TTL de 24 h.

- Mesma chave + mesmo `request_hash` → devolve a resposta original, **sem reexecutar**.
- Mesma chave + `request_hash` diferente → `422` (`idempotency-key-reuse`). É bug do cliente; falhar alto é melhor que executar algo inesperado.
- Requisição ainda em voo com a mesma chave → `409` + `Retry-After: 1`.

### Camada 3 — O job, e o *lease*

`clip_job` é reivindicado atomicamente (`FOR UPDATE SKIP LOCKED`), então dois relays nunca pegam o mesmo. O que cobre o caso feio — **o relay morrer no meio de um corte** — é o *lease* de 120 s: vencido sem confirmação, o job volta para `pending` e é reexecutado.

Reexecutar é seguro **porque a janela é absoluta**: `cut_from`/`cut_to` são instantes, não "os últimos 22 segundos". O mesmo job rodado três vezes produz três arquivos idênticos na mesma chave de objeto. `attempt` limita a 5 tentativas antes de `failed`.

Esta é a diferença estrutural em relação à v1: lá, reexecutar um gatilho atrasado capturava o lance errado, e por isso tudo tinha de ser rápido e efêmero. Aqui, reexecutar é inofensivo.

### Camada 4 — O upload

Os bytes não passam pela API: o relay faz `PUT` direto no S3 `sa-east-1` com URL pré-assinada — e, por estar na mesma região do relay, esse upload é gratuito.

1. **`objectKey` determinístico**: `clips/<partner>/<court>/<date>/<clipId>/wm.mp4`. Object storage não é append log — repetir um `PUT` sobrescreve com bytes idênticos e é inofensivo por construção.
2. **`POST /relay/clips/{id}/upload-url` pode ser chamado quantas vezes for preciso** e só emite URLs para os arquivos ainda **não confirmados**. É assim que o relay retoma um upload interrompido: pergunta o que falta.
3. **`/confirm` valida antes de aceitar**: `HeadObject` no S3, comparação de `sizeBytes` e `sha256`. Divergência → `409`, e o relay reenvia aquele arquivo. Um upload truncado **não** vira clipe `ready` corrompido.
4. **Reconfirmar é `200` sem efeito**, devolvendo o estado atual.

### O que ficou mais simples, e o que ficou mais difícil

**Mais simples**: sumiram `clientEventId` por dispositivo, `clientSegmentId` por segmento, `alreadyConfirmed[]` para retomada de sessão, e a fila persistente em SQLite na borda. A sessão completa não sobe para lugar nenhum — ela já está no disco de destino no instante em que é gravada.

**Mais difícil**: não há mais buffer local na arena. Na v1, um upload que falhasse ficava em disco e subia depois; agora, o que não chegou ao relay **não existe**. A idempotência protege contra reprocessamento duplicado, mas nada protege contra um lance que nunca foi gravado. Esse buraco é tratado como risco de produto, não de protocolo — ver `plano-tecnico.md` §4 R1.

## 6. Erros, limites e versionamento

### Formato de erro — RFC 9457

```json
{
  "type": "https://replayja.com.br/problems/clip-expired",
  "title": "Clipe expirado",
  "status": 410,
  "detail": "Este lance foi gravado em 12/08/2026 e já saiu do ar.",
  "instance": "/api/v1/clips/01927f3a-...",
  "traceId": "b7f2c1a9e4d3"
}
```

`Content-Type: application/problem+json`. **`detail` é escrito em pt-BR e pronto para exibir ao usuário** — e **nunca cita o prazo de retenção** em número. O padrão é 90 dias, mas é configurável por parceiro (`partner.clip_retention_days`), e uma mensagem que promete "30 dias" vira mentira na primeira arena que contratar outro prazo. Não é uma mensagem de log. `traceId` é o mesmo valor gravado em `app_error`, e é o que liga a reclamação do usuário à linha.

Catálogo inicial de `type`: `clip-expired`, `clip-not-ready`, `range-too-large`, `camera-down`, `trigger-cooldown`, `slug-taken`, `invite-expired`, `last-owner`, `idempotency-key-reuse`, `checksum-mismatch`, `no-coverage`, `relay-unavailable`, `not-a-partner-admin`.

### Códigos de status

| Código | Quando |
|---|---|
| `200` | OK, ou repetição idempotente de algo já feito |
| `201` | Criado agora |
| `202` | Aceito, resultado assíncrono (convites, botão virtual, exclusão de conta) |
| `204` | OK sem corpo (ack, `logout`, long-poll vazio) |
| `401` | Sem credencial ou credencial inválida |
| `403` | Autenticado, sem permissão |
| `404` | Inexistente **ou** invisível — nunca distinguir os dois (evita enumeração) |
| `409` | Conflito de estado (slug em uso, checksum divergente, dispositivo offline, último dono) |
| `410` | Existiu e expirou (clipe fora da retenção, convite vencido, link revogado) |
| `422` | Corpo válido, semântica inválida (intervalo > 6h, data sem offset) |
| `429` | Rate limit — sempre com `Retry-After` e `RateLimit` (RFC 9331) |

### Rate limits

| Escopo | Limite | Motivo |
|---|---|---|
| `POST /auth/otp/start` | 3 / e-mail / 15 min; 10 / IP / h | Custo de e-mail e antiabuso |
| `POST /auth/otp/verify` | 5 tentativas por código | Força bruta de 6 dígitos |
| `GET /clips` | 120 / usuário / h | Anti-varredura (§3) |
| `POST /clips/{id}/download` | 30 / usuário / h | Anti-raspagem de acervo |
| `POST /triggers/virtual` | 10 / usuário / quadra / h | Anti-spam do botão virtual |
| `POST /groups/{id}/members` | 100 convites / grupo / dia | Antiabuso de e-mail |
| Botão físico | 1 / 8 s (cooldown) e 120 / hora | Cinco apertos viram um clipe |
| Relay (`/api/relay/*`) | 120 req / relay / min | Detecta relay em loop |

Implementados no Route Handler com contador no Postgres (`rate_limit` com janela deslizante) e cache em memória por instância. O cooldown do botão é uma checagem em `button.last_pressed_at`, não um contador — é barato e é exatamente a semântica desejada.

### Versionamento

- Versão no caminho: `/v1`. **Só incrementa com quebra de compatibilidade.**
- Compatível (não incrementa): adicionar campo opcional na resposta, adicionar valor de enum **em campo de resposta**, adicionar endpoint, relaxar validação.
- Incompatível: remover ou renomear campo, tornar campo obrigatório, mudar tipo, restringir validação, adicionar valor de enum **em campo de requisição** que o servidor antigo não entende.
- **Clientes devem ignorar campos desconhecidos.** O relay em especial: ele é atualizado por `git pull` + `systemctl restart` na máquina, e pode ficar atrás do app por semanas.
- O relay envia `version` em cada `POST /relay/health`; o servidor pode adaptar a resposta a versões antigas.
- **Compromisso**: `/v1` fica no ar por no mínimo 12 meses após o lançamento de `/v2`. E a URL de webhook de um botão instalado numa quadra **nunca** muda de formato — trocá-la exigiria ir à arena reconfigurar cada botão.

---

## 7. Ferramentas e verificação

| Necessidade | Ferramenta |
|---|---|
| Tipos TypeScript a partir do spec | `openapi-typescript` → `packages/api-types`, usado pelo web e pelo worker de processamento do relay |
| Cliente tipado no front | `openapi-fetch` (leve, sem geração de código de runtime) |
| Validação de requisição/resposta em runtime | Zod nos handlers, gerado a partir do spec com `openapi-zod-client`; o spec é a fonte, não o contrário |
| Lint do contrato | `spectral lint openapi.yaml` no CI, com regras `oas3` + regra própria "todo endpoint que muda estado aceita `Idempotency-Key`" |
| Mock para o front antes do backend | `prism mock openapi.yaml` — desbloqueia o workstream C antes do B (`docs/plano-tecnico.md`) |
| Simular o relay | Um script que faz `GET /relay/clip-jobs` e confirma com um MP4 fixo — permite testar o pipeline inteiro sem câmera |
| Teste de contrato | Suite `vitest` que roda os exemplos do spec contra staging e falha se a resposta divergir do schema |

**Regra de processo**: o `openapi.yaml` é alterado **antes** da implementação, em PR próprio. É o documento que os três workstreams (relay, backend, web) usam para trabalhar em paralelo — se ele ficar desatualizado, a paralelização quebra junto.

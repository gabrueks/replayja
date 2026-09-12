# Relay do Replay já — gravar 24/7, cortar o lance, entregar o clipe

Fork enxuto do **relay v2 do Sentinela** (`monitoring/relay2/`, em produção
desde 29/08/2026 com 24 câmeras). Grava todas as câmeras continuamente numa
EC2 em `sa-east-1`, serve trechos arbitrários do disco e produz o clipe de 25 s
com a marca d'água do parceiro.

**Nenhum software nosso roda dentro da arena.** A câmera Intelbras empurra RTMP
para cá; o botão é um `POST` HTTPS para a API. É a decisão D-01 de
`docs/decisoes.md` e a §2 da ADR.

> **A máquina do Sentinela é intocável.** Aquele relay é produção com clientes
> pagantes, já mediu 53% de CPU steal e não tem folga para carga nova. Este
> relay roda em **máquina separada**, com nomes próprios (`replayja-*`) para
> que nenhum comando copiado de um runbook caia na máquina errada.

---

## Sumário

1. [Arquitetura](#arquitetura)
2. [Peças](#peças)
3. [O que veio do Sentinela e o que mudou](#o-que-veio-do-sentinela-e-o-que-mudou)
4. [Do gatilho ao clipe](#do-gatilho-ao-clipe)
5. [Portas e hosts](#portas-e-hosts)
6. [Configuração (`rec.env`)](#configuração-recenv)
7. [Subir a infra (AWS)](#subir-a-infra-aws)
8. [Marca d'água](#marca-dágua)
9. [Subir uma alteração](#subir-uma-alteração)
10. [Testes](#testes)
11. [Runbook — os incidentes herdados](#runbook--os-incidentes-herdados)
12. [Checklist T5 — a câmera reconecta depois da queda?](#checklist-t5--a-câmera-reconecta-depois-da-queda)
13. [Decisões e pendências](#decisões-e-pendências)

---

## Arquitetura

```
  ARENA (nada nosso rodando aqui)                    AWS sa-east-1 · t4g.medium (arm64)
 ┌────────────────────────────┐           ┌──────────────────────────────────────────────────┐
 │ Intelbras VIP 3230 B SL G3 │           │                                                  │
 │ 1080p30 · 3 Mbps · GOP 1s  │──RTMP────▶│ replayja-rec@<cam>      record.sh                │
 │ RTMP Virtual Áudio LIGADO  │  :19350+  │   ffmpeg -listen -c copy                         │
 └────────────────────────────┘  (1 porta │            │                                     │
 ┌────────────────────────────┐  por câm.)│            ▼                                     │
 │ Botão (Zigbee/virtual)     │           │   /srv/rec/<cam>/<sessão>/   fMP4 ~2s + m3u8      │
 └──────────────┬─────────────┘           │        st1 250 GB · LVM · xfs                    │
                │                         │            │                                     │
                │ POST /triggers          │            ▼                                     │
                ▼                         │   replayja-recserver     rec-server.py           │
 ┌────────────────────────────┐           │     índice SQLite (segments · spans · events)    │
 │  API — Next.js na Vercel   │           │     /live /vod /clip /thumb /spans /stats /logs  │
 │  clip_job no Postgres      │           │     poda · watchdog · wal_loop                   │
 │  (SKIP LOCKED, lease 120s) │           │            │           ▲                         │
 └────┬──────────────────▲────┘           │            │           │ /clip -c copy           │
      │                  │                │            ▼           │                         │
      │ POST /jobs       │ GET /relay/clip-jobs   replayja-clip-worker   clip-worker.py       │
      │ (só ACORDA)      │ POST /relay/clips/…    recorte exato + marca d'água + thumb + OG   │
      │                  │ POST /relay/health     CPUQuota=120% · Nice=10 · 2 slots           │
      └──────────────────┴───────────────▶│            │                                     │
                                          │   replayja-auth (9998) + Caddy (443, TLS)        │
                                          └────────────┼─────────────────────────────────────┘
                                                       │ PUT em URL pré-assinada
                                                       ▼
                                          armazenamento S3-compatível (R2 na ADR §6)
                                                       │
                                                       ▼  egress zero
                                                  atleta · WhatsApp · Instagram
```

**Quem manda em quem.** O app **não escreve no relay**. O relay pergunta — a
lista de câmeras, a fila de jobs — e a resposta é sempre uma *lista*, nunca um
comando. A única chamada nuvem → relay é `POST /jobs`, e ela apenas **acorda**;
se falhar, nada se perde. O relay continua gravando com o app inteiramente fora
do ar: um deploy quebrado na Vercel não custa nenhum lance, custa o atraso do
corte.

**Não existe servidor de mídia.** O relay v1 do Sentinela usava MediaMTX e
panicava ~20×/dia (nil pointer no muxer HLS sob troca de sessão, sem correção
upstream). Aqui o vivo é uma playlist de janela deslizante montada por consulta
ao índice sobre os arquivos já gravados — o padrão nDVR de Flussonic/Wowza.
Playlist é texto; texto não panica.

---

## Peças

| Arquivo | Papel |
|---|---|
| `record.sh` | Um gravador por câmera (`replayja-rec@<id>`). Dois ramos: **RTMP push** (padrão) e **RTSP pull** (bancada e plano B) |
| `rec-server.py` | Índice SQLite, `/live`, `/vod`, `/clip`, `/thumb`, `/spans`, `/stats`, `/logs`, poda, watchdog, `wal_loop` |
| `clip-worker.py` | **Novo.** Reivindica jobs, corta ao quadro, aplica marca d'água, sobe por URL pré-assinada e confirma |
| `health-report.py` | **Novo.** `POST /relay/health` a cada 60 s |
| `sync-cameras.sh` | **Novo** (funde `sync-cams` + `sync-rtmp`). Reconcilia gravadores e confs com `GET /relay/cameras`, a cada 2 min |
| `auth-sidecar.py` | Valida cada requisição localmente (token HMAC no caminho, `x-relay-key` ou `Bearer`) |
| `retire-camera.sh` | **Novo.** Encerra uma câmera de verdade (gravador + conf + gravação). Ação humana, irreversível |
| `backup.sh` | Backup diário do que não se reconstrói (segredos, confs de ingest, índice via `VACUUM INTO`) |
| `watermark-replayja.png` · `watermark-replayja-assinatura.png` | **Novos.** A marca do Replay já e a assinatura discreta. Versionadas no repo e instaladas em `/opt/replayja-relay` — o padrão de toda arena sem logo **não** depende de rede. Refeitas por `tools/gerar-marca-dagua.py` |
| `deploy-ssm.sh` | **Novo.** Publica arquivos na EC2 por SSM Run Command (a máquina não se atualiza sozinha) |
| `Caddyfile` | TLS + roteamento; `/rec/*` sai como arquivo estático imutável |
| `setup.sh` | Provisiona a máquina (Ubuntu 24.04 **arm64**, LVM sobre st1) |
| `units/` | Unidades e timers systemd |
| `infra/` | Terraform da instância, EIP, SG e volumes. **Nada aplicado** |
| `tests/` | Testes unitários (qualquer SO) + `e2e.sh` e `mock_api.py` (Linux) |

---

## O que veio do Sentinela e o que mudou

### Veio inteiro (e por quê)

Estas quatro coisas são cicatrizes de incidente real. Foram copiadas com o
comentário original porque o comentário é o que impede alguém de "limpar" o
código e repetir o incidente.

| O que | Por quê |
|---|---|
| **Regra de ouro do gravador** — uma sessão da origem = um ffmpeg = um diretório | Emendar sessões no mesmo ffmpeg (tentado 2×) embaralha o relógio do muxer e ele **para de cortar arquivos em silêncio**: processo vivo, dados entrando, nada saindo |
| **`db_release()` por requisição** | Sem ele o relay passou **19 h sem um único checkpoint**: WAL de 7,1 GB contra um banco de 703 MB, sem um erro em lugar nenhum. Causa: cursor aberto de um cliente HTTP que sumiu no keep-alive |
| **`VACUUM INTO` no backup** | O `.backup` do sqlite3 recomeça do zero a cada commit externo. Com o WAL grande, **nunca termina**: 7h28min queimando um vCPU para entregar 4 KB |
| **`#EXT-X-START` na playlist ao vivo** | Um segmento de 68 s enterrado na janela levava o `TARGETDURATION` a 68, e o player entrava **192 s atrás** do vivo. O `n` sai da **mediana** da cauda, não do máximo |

Vieram também, sem drama: o índice incremental (`seq`/`disc` prontos na
tabela), os contadores em `cam_state` (o `/stats` somava a tabela inteira e
custava 15 s de CPU por ciclo), o `QuietServer` (desconexão de player não é
incidente), o `HEAD` em todas as rotas com o atalho do `/thumb` (sonda não paga
ffmpeg), a janela atrasada de 45 s para câmera em rajadas, a poda em duas
camadas (idade + `DISK_HIGH`), o watchdog que só reinicia quando o **batimento**
também está velho, e a escrita atômica de conf com `chmod` antes do `mv`.

### Saiu

| O que saiu | Por quê |
|---|---|
| **Origem Tuya inteira** (`allocate`, portão de preroll, chave AES, catálogo de enlatados, `pump.py`, `sweep_dups`) | Nenhuma câmera do Replay já passa por nuvem de terceiro. Eram ~400 linhas de tratamento de dialeto sem nada sobre o que operar |
| **Detector** (`detect.py`, `enhance.py`, `sombra-noite.sh`, tabela `sightings`, dataset de vereditos) | Outro produto. Também era a **única** dependência pesada (torch + ultralytics, ~1,6 GB de wheels) — tirá-la é o que faz o arm64 não doer |
| **Transcodificador 360p** (`transcoder/`, `SD_ORIGIN`, `/master`, `/sd`) | Existia para uma grade de 21 tiles num celular. Aqui o atleta vê **um** clipe de cada vez |
| **`sync-cams.sh` + `sync-rtmp.sh`** | Fundidos em `sync-cameras.sh`: a nossa API entrega tudo numa chamada. Dois timers na mesma origem era herança da ordem em que as features nasceram lá |
| **`probe-audio.sh` e `AUDIO_CAMS`** | A VIP 3230 não tem microfone. `-an` incondicional — e isso é decisão de **LGPD**, não de espaço: gravar áudio numa quadra captaria conversa de terceiros |
| **`add-rtmp-cam.sh` / `add-rtsp-cam.sh`** | O provisionamento nasce no painel; o relay só materializa |

### Mudou

1. **`/stats` fala o contrato.** O corpo é exatamente o `RelayHealthRequest` do
   `openapi.yaml` (camelCase, ISO-8601), não o JSON interno do Sentinela. Com
   isso o `health-report.py` é um cano de três linhas em vez de um tradutor que
   envelhece em silêncio quando alguém acrescenta um campo.
2. **`/clip` devolve dois cabeçalhos novos**: `X-Coverage-Ratio` (quanto da
   janela existe de fato em disco) e `X-Window-Start-Ms` (onde o arquivo bruto
   começa de verdade — o keyframe). O segundo é o que permite ao worker cortar
   ao quadro.
3. **`coverage_from_spans()` virou função pura**, usada pelo `/clip`, pelo
   `/spans`, pelo `/stats` e pelo worker. Uma conta só, num lugar só, com
   teste — porque é ela que decide `ready` × `partial` × `failed`.
4. **Nomes**: `sentinela-*` → `replayja-*` em unidades, caminhos
   (`/opt/replayja-relay`, `/etc/replayja`, `/var/lib/replayja`) e variáveis.
5. **Gravadores numa fatia própria** (`replayja-rec.slice`) com `Nice=-5`,
   contra `Nice=10` e `CPUQuota=120%` do worker. É o cgroup que alimenta
   `cpu.recorderPercent` no `/stats` — o número que teria denunciado os 53% de
   steal do Sentinela meses antes de alguém ler `/proc/stat` à mão.
6. **`CAMERA_DOWN_S` = 90 s** como limiar único de "câmera offline", publicado
   no relatório de saúde.

---

## Do gatilho ao clipe

```
t_cena ──(reação)──▶ botão ──(wakeLatency)──▶ API ──▶ clip_job ──▶ worker
                                               │
          janela = [t − 24 s + originLag , t + 1 s + originLag]   ← a API monta
          corte  = [janela.de − 8 s , janela.até + 5 s]           ← ~38 s brutos
```

> **O relay não descobre a latência de origem sozinho.** O
> `PROGRAM-DATE-TIME` que ele publica é hora de **chegada**, não hora da cena.
> Qualquer conta feita contra o próprio relay herda esse erro sem perceber — no
> Sentinela a prova aritmética foi uma amostra dar latência **negativa de
> −0,13 s**, que não existe. Quem compensa é o `camera.originLagMs`, **medido
> na instalação** filmando um celular com relógio de segundos e comparando com
> o `/thumb`. Dez minutos por câmera, e é item do roteiro de instalação.

Dois passos de ffmpeg, e a divisão de trabalho entre eles é o ponto:

| Passo | Onde | Codec | Precisão | Custo |
|---|---|---|---|---|
| **A** | `/clip` do rec-server | `-c copy` | corta em **keyframe** (início do segmento) | I/O, ~200 ms |
| **B** | `clip-worker.py` | re-encode H.264 | **exata ao quadro** | 27–53 núcleo-segundos |

O passo B só existe porque a marca d'água exige re-encode de qualquer jeito
(ADR §5) — e, já que ele acontece, o corte fica exato de graça. Três detalhes
do passo B que **não** são preferência de estilo:

- **`-ss` DEPOIS do `-i`** (seek de saída). O oposto do que se faz com
  `-c copy`. Com re-encode, o seek de saída decodifica desde o começo do
  recorte bruto e para no quadro certo, sem errar o alvo quando o keyframe está
  antes.
- **`format=yuv420p` explícito.** Sem isso o vídeo **não toca no iOS**.
- **`+faststart`.** Põe o índice na frente; é literalmente o que faz o vídeo
  abrir no WhatsApp.

**Validação antes de publicar** (`ffprobe`): duração, H.264, `yuv420p`, largura
≥ 1280, tamanho mínimo. Com uma correção que a `spec-captura` não previu —
quando a cobertura é parcial o clipe é **legitimamente** mais curto, e cobrar
25 s reprovaria exatamente o caso que o produto decidiu entregar rotulado.
Reprovou → **não publica e não confirma ao atleta**: um clipe inválido entregue
é pior que um clipe ausente.

**Cobertura decide o desfecho** (`docs/api/README.md` §4):

| `coverageRatio` | Estado | O atleta vê |
|---|---|---|
| `1.0` | `ready` | o lance, normal |
| 0,6 – 1,0 | **`partial`** | o lance, com "faltam ~3 s — a internet da arena oscilou" |
| < 0,6 | `failed` (`no_coverage`) | "não foi possível recuperar este lance", e o gatilho vira evidência no painel do parceiro |

---

## Portas e hosts

| Porta | Quem escuta | Exposta? |
|---|---|---|
| 443 | Caddy (TLS) → `relay-1.replayja.com.br` | **sim** |
| 80 | Caddy (ACME HTTP-01) | **sim** — fechá-la é como o certificado para de renovar 60 dias depois |
| 19350–19399 | um `ffmpeg -listen` por câmera → `stream.replayja.com.br` | **sim, a faixa inteira** |
| 9900 | `rec-server` | loopback |
| 9998 | `auth-sidecar` | loopback |

**Dois nomes, um Elastic IP, e a separação é deliberada:** `stream.` é o nome
que fica **digitado dentro de cada câmera instalada**, onde mudar custa uma
visita à quadra. Ele aponta para o EIP, então trocar a instância não toca em
nenhuma câmera.

> ⚠️ **Abrir uma porta não abre a faixa.** No Sentinela, em 08/09/2026, só a
> 19350 estava aberta: a 19351 e a 1935 respondiam com pacote descartado, e o
> sintoma de fora é um *timeout* de 8 s que não diz nada. Custou meio dia.
> **Teste a faixa antes de mandar o instalador subir no poste:**
> `nc -vz <ip> 19350 && nc -vz <ip> 19351`.

Rotas públicas (todas atrás do `auth-sidecar`):

```
GET  /t/<token>/live/<cam>/index.m3u8      janela deslizante
GET  /t/<token>/vod/<cam>/index.m3u8?from&to
GET  /t/<token>/clip/<cam>?from&to         MP4 faststart (teto 5 min)
GET  /t/<token>/thumb/<cam>?t              JPEG (HEAD não gera)
GET  /t/<token>/rec/<cam>/<sessão>/<seg>   mídia, arquivo estático
POST /jobs                                 a nuvem acorda o worker (Bearer)
GET  /stats                                RelayHealthRequest (Bearer)
```

---

## Configuração (`rec.env`)

`/etc/replayja/rec.env`, modo 600, **não versionado**. Modelo completo e
comentado em [`rec.env.example`](rec.env.example). Os que importam:

| Variável | O que é |
|---|---|
| `API_URL` | Base da API, terminando em `/api` |
| `RELAY_ID` | Nome deste relay; vai no `relayId` de cada relatório de saúde |
| `RELAY_KEY` | **relay → API** (`x-relay-key`). Quem tiver isto lê a lista de câmeras **com as chaves de ingest** |
| `RELAY_TOKEN` | **API → relay** (`Authorization: Bearer`). Separado de propósito: comprometer um não dá o outro |
| `RELAY_TOKEN_SECRET` | Assina o token de leitura de vídeo. **Se divergir da Vercel, TODO o vídeo cai com 401** — é o primeiro item do backup por isso |
| `RETAIN_HOURS` | Retenção da sessão completa. **72 = 3 dias** (piloto enxuto). A maior alavanca de custo do sistema: 7 → 3 dias tira US$ 456/mês a 20 arenas |
| `RECORD_CAMS` | **Derivado, não editado à mão.** Quem escreve é o `sync-cameras.sh`. Mexer aqui funciona até o próximo tique (2 min) |
| `DISK_HIGH` / `DISK_LOW` | 0,85 / 0,78. Rede de segurança: gravador nunca pode parar por disco cheio |
| `WORKER_SLOTS` | 2 processamentos simultâneos |
| `WORKER_BITRATE_KBPS` | 4000 (ADR §5). O job pode sobrepor com `encodeProfile` |
| `RTMP_PORTS_OPEN` | A faixa que o SG abre de fato. Só serve para o sync **avisar** quando uma câmera vem com porta fora dela |

---

## Subir a infra (AWS)

> **Nada foi aplicado.** O `terraform apply` cria recursos que geram custo e é
> decisão do Gabriel.

```bash
cd relay/infra
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars          # cidrs_ssh e nome_chave_ssh são obrigatórios

terraform init
terraform plan -out=relay.tfplan  # CONFERIR: 1 instância, 2 volumes, 1 EIP, 1 SG

# ⬇️ este é o comando que gera custo. Só o Gabriel roda.
terraform apply relay.tfplan
```

O que sai: `t4g.medium` arm64 em `sa-east-1`, crédito **`standard`**, raiz gp3
de 60 GB, volume st1 de 250 GB (recurso separado, com `prevent_destroy`),
Elastic IP e um SG com 443, 80, 19350–19399 e SSH restrito ao CIDR que você
informar (sem padrão, de propósito).

> **Crédito `standard`, nunca `unlimited`.** No padrão da AWS (`unlimited`),
> estourar o baseline **não** estrangula: cobra US$ 0,05 por vCPU-hora
> excedente, em silêncio, e o primeiro aviso é a fatura. Em `standard` a
> máquina desacelera e o alarme de crédito dispara. Se `email_alarme` estiver
> preenchido, o módulo já cria o alarme de `CPUCreditBalance` — e é ele que
> responde "já é hora de trocar por `c7g.large`?" (ADR §9).

Depois do apply, o `terraform output proximo_passo` imprime a sequência: criar
os dois registros A (`relay-1.` e `stream.`), copiar o repo, preencher o
`rec.env` e rodar o `setup.sh`.

Custo de referência da ADR §9 para este perfil: **≈ US$ 64,51/mês (R$ 329)**
com a conta inteira do piloto enxuto, dos quais instância + IP + Neon são 56%.

---

## Marca d'água

Até 2026-09-12 **todo clipe de produção saía com `watermark_applied=false`** —
e não por bug: não havia PNG em lugar nenhum. O `claim` mandava
`watermark: null` quando o parceiro não tinha logo, e o relay, que também não
tinha um PNG nosso instalado, entendia isso como "entregue cru".

### A regra (decisão 9 do `PLANO.md`, D-03 de `decisoes.md`)

| O parceiro tem PNG? | O que sai no clipe |
|---|---|
| **sim** | a marca **dele** no canto configurado (largura `widthPct`, padrão 18%) **e** a assinatura do Replay já no **canto inferior oposto** (10% de largura, 60% de opacidade) |
| **não** | só a do Replay já, 14% de largura, `bottom-right` |

**Não existe clipe limpo.** `partner.watermark_enabled = false` desliga a marca
*do parceiro*, não a nossa. Um MP4 sem marca nenhuma circula no WhatsApp sem
dizer de onde veio, que é o oposto do que o produto vende. Se um dia houver
plano que compre o clipe sem marca, isso vira um `kind` novo no contrato — não
um `if` escondido aqui.

### De onde vem cada PNG

```
 PARCEIRO  bucket privado replayja-clips        NOSSO  arquivo local, no repo
           branding/<partnerId>/watermark.png          /opt/replayja-relay/
                      │                                  watermark-replayja.png
                      │ URL ASSINADA (S3 GET, 1 h)       watermark-replayja-
                      │ emitida pelo claim               assinatura.png
                      ▼
           cache em /var/cache/replayja/watermark
           chave = (caminho no bucket, versão)  ou  sha256
```

O nosso é **arquivo local, versionado no repo**, e isso é a decisão: ele é o
padrão de toda arena sem logo, e fazer o caso mais comum depender de rede, de
bucket e de credencial seria pôr o comum na dependência do frágil. Refazê-lo é
`python3 tools/gerar-marca-dagua.py` (precisa de Pillow; o PNG fica < 60 KB).

O do parceiro é **privado** porque é o logo comercial da arena — publicá-lo numa
CDN aberta entregaria a marca de todo parceiro a quem adivinhasse um UUID.

> ⚠️ **A chave do cache não pode conter a URL.** Ela vem assinada e muda a cada
> `claim`: cachear por URL é o mesmo que não cachear, e custa uma ida à rede no
> caminho crítico de cada lance. Quem identifica a marca é o **caminho** no
> bucket mais a `version` — ou o `sha256`, quando o contrato o traz.

### O contrato, no job

```jsonc
"watermark": {
  "kind": "partner",              // ou "default"
  "url": "https://…?X-Amz-…",     // null quando kind = "default"
  "sha256": "…",                  // opcional; quando vem, é conferido
  "version": 4,                   // 0 = a marca padrão do Replay já
  "position": "bottom-right",     // aceita também a grafia com `_`
  "opacityPct": 85,               // pontos percentuais (fração também é aceita)
  "widthPct": 18                  // % da LARGURA do vídeo
}
```

O `confirm` devolve `watermarkApplied`, `watermarkVersion` (a do PNG que
**realmente** entrou — 0 quando foi a nossa) e `watermarkKind`.

### Falha não derruba o clipe

Não conseguir baixar a marca do parceiro — URL expirada, 403, `sha256`
divergente, download truncado — faz o worker aplicar a **nossa** e reportar
`watermarkKind: "default-fallback"`. O atleta não tem nada a ver com a política
do bucket, e o lance dele continua sendo o lance dele.

O preço disso é que a falha fica silenciosa para quem só olha o vídeo. Por isso
o rótulo existe e é indexado:

```sql
SELECT count(*) FROM clip
 WHERE partner_id = $1 AND watermark_kind = 'default-fallback';
```

Qualquer número diferente de zero é credencial, política de bucket ou versão —
nunca "normal".

### O filtergraph

Tudo no **mesmo passe** de recorte e encode que já existia: nenhum ffmpeg a
mais, nenhum segundo de CPU a mais (ADR §5).

```
[0:v]scale=1920:1080:…,pad=…,setsar=1[base];
[1:v]scale=346:-1,format=rgba,colorchannelmixer=aa=0.850[wm0];   ← parceiro, 18%
[base][wm0]overlay=W-w-48:H-h-48:format=auto[ov0];
[2:v]scale=192:-1,format=rgba,colorchannelmixer=aa=0.600[wm1];   ← assinatura, 10%
[ov0][wm1]overlay=48:H-h-48:format=auto[ov1];
[ov1]format=yuv420p,split=3[v][t1][t2];   …e daí a miniatura e o Open Graph
```

Quatro detalhes que **não** são preferência de estilo:

- **`format=rgba` antes do `colorchannelmixer=aa=`.** Um PNG que o ffmpeg
  decodifique sem canal alfa faz o `aa=` não ter o que multiplicar: a opacidade
  some **sem erro nenhum** e a marca sai 100% opaca em cima do lance.
- **A miniatura e o Open Graph saem DEPOIS dos overlays.** O card do WhatsApp
  é metade do motivo de a arena querer o clipe circulando.
- **A largura é aritmética sobre 1920, não `scale2ref`.** A saída é pinada em
  1080p pelo `scale`+`pad`, então a conta é exata e testável; o `scale2ref`
  consome e reemite o fluxo de referência (reordenando os rótulos a cada marca
  acrescentada) e tem semântica de `iw`/`mdar` que varia entre versões do
  ffmpeg — e aqui não há como rodar ffmpeg para conferir. Se a saída deixar de
  ser 1080p fixo, é `LARGURA_BASE` que muda, e o teste da largura junto.
- **A margem é 2,5% da LARGURA nos dois eixos**, não 2,5% de cada dimensão: o
  pixel é quadrado depois do `setsar=1`, e usar a altura no eixo vertical
  deixaria a marca visivelmente mais colada embaixo.

---

## Subir uma alteração

> ### ⚠️ A MÁQUINA NÃO SE ATUALIZA SOZINHA
>
> Um push em `main` faz a Vercel redeployar o app em ~1 min. O relay continua
> rodando o código do dia em que alguém o instalou à mão — **de propósito**: ele
> tem de sobreviver a um deploy quebrado do app (§Arquitetura, "quem manda em
> quem"). A consequência prática é que toda leva que mexe no `clip-worker.py`,
> no `rec-server.py` ou nas marcas d'água tem um **segundo passo, humano**.
>
> Hoje não há SSH: a instância só é alcançada por **SSM** (sem porta 22, sem key
> pair — `docs/setup-contas.md`). Então o caminho é o `deploy-ssm.sh`, e o
> `make deploy-file` abaixo só volta a servir se alguém reabrir o SSH.

### Via SSM, do CloudShell (o caminho de hoje)

```bash
# CloudShell da conta do Gabriel, região sa-east-1
git clone --depth 1 https://github.com/gabrueks/replayja.git ~/replayja-deploy
sh ~/replayja-deploy/relay/deploy-ssm.sh          # worker + as duas marcas
sh ~/replayja-deploy/relay/deploy-ssm.sh rec-server.py   # ou um arquivo só
```

O script faz `git pull` em `/tmp/replayja` **dentro da instância**, imprime o
`md5sum` de cada arquivo antes e depois, guarda um `.bak-<data>`, compila o
Python antes de publicar, copia com `cp` e reinicia **só** a unidade que usa
cada arquivo — conferindo que ela subiu. `record.sh` fica deliberadamente de
fora (ver abaixo).

Conferir depois:

```bash
aws ssm start-session --region sa-east-1 --target i-04bb3a7f14df569ca
sudo journalctl -u replayja-clip-worker -n 50 --no-pager
sudo ls -l /opt/replayja-relay/watermark-replayja*.png
```

### Via SSH (quando existir)

> ### ⚠️ NÃO rode o `setup.sh` para publicar um arquivo só
>
> Ele publica a pasta inteira e leva junto tudo o que estiver divergente, **em
> silêncio**. No Sentinela foi assim que uma versão velha do detector voltou a
> produção — e foi assim que duas mãos publicaram o mesmo arquivo por cima uma
> da outra. **Confira o `md5sum` do destino contra o que você espera encontrar
> antes de copiar; se não bater, alguém passou por ali.**

```bash
make deploy-file F=rec-server.py
# depois, reinicie SÓ quem usa o arquivo:
#   rec-server.py   -> systemctl restart replayja-recserver
#   clip-worker.py  -> systemctl restart replayja-clip-worker
#   auth-sidecar.py -> systemctl restart replayja-auth
```

`cp` (não `install`, não `mv`): o `install(1)` **trunca o destino no lugar**, e
um processo que estivesse lendo o arquivo veria metade dele. O alvo recebe um
`.bak-<data>`; rollback é copiar de volta e reiniciar.

Reiniciar `recserver`/`auth`/`worker` **não toca em gravador nenhum** — são
unidades diferentes e a gravação não tem lacuna.

**`record.sh` é a exceção.** Cada restart custa **30–90 s de lacuna por
câmera** na cobertura. Numa hora com três deploys a cobertura da última hora
despenca e parece regressão. Não reinicie a frota por esporte — e julgue saúde
sempre pela janela de **24 h**.

Provisionamento completo (máquina nova, unidade nova, mudança no `Caddyfile`):

```bash
make deploy-full
ssh <relay> "sudo systemctl restart 'replayja-rec@*'"   # só se o record.sh mudou
```

---

## Testes

### `make test` — roda em qualquer lugar

127 testes de biblioteca padrão, sem ffmpeg e sem rede. Cobrem exatamente as
contas cujo erro seria **silencioso** em produção:

| Grupo | O que prova |
|---|---|
| Cobertura | união de spans (não soma — somar esconderia um buraco), janela parcial, limiar de 0,6, nunca > 1,0 |
| Janela/keyframe | offset do `-ss` nunca negativo, `cut` sempre mais largo que `deliver`, e as duas implementações (rec-server em ms, worker em s) dando o mesmo número |
| Índice | `PROGRAM-DATE-TIME` do ffmpeg (`+0000` sem dois-pontos), leitura incremental, `seq`/`disc` monotônicos, buraco de 60 s partindo o span, reindexar sem consumir `seq` |
| Playlist | `EXT-X-DISCONTINUITY` + `MAP` novo na troca de sessão, `EXT-X-START` só no vivo, mediana em vez de máximo, caminho absoluto no `/clip` e relativo no navegador |
| Worker | validação com cobertura parcial, idempotência por `jobId`, escape da vírgula no `select` |
| Marca d'água | as 4 posições nas duas grafias, o encadeamento de duas marcas na ordem das entradas do ffmpeg, `format=rgba` antes do alfa, canto oposto da assinatura, sha256 divergente, fallback para o PNG local, e as 4 formas de uma chave de cache colidir entre parceiros |
| Protocolo | claim (GET e POST), lease, `upload-url` só do que falta, PUT idempotente, **409 em checksum divergente**, API caindo sem virar exceção |
| Sidecar | token expirado, token de outra câmera, prefixos de leitura |
| Sync | **o validador é extraído do `.sh` e executado de verdade**: id com travessia de caminho, porta fora da faixa, porta booleana, duas câmeras na mesma porta, e injeção de shell (`;`, `$(...)`, crase, aspa, quebra de linha) na URL de RTSP — que o `record.sh` executa como root |

```
$ python3 -m unittest discover -s tests
Ran 127 tests in 15.4s
OK
```

### `make test-e2e` — precisa de Linux

`tests/e2e.sh` sobe a API de mentira (`tests/mock_api.py`), o rec-server, o
worker e um `ffmpeg -f lavfi -i testsrc2` empurrando RTMP de verdade, e prova
em 10 passos: segmentos escritos → índice e `/spans` → `/clip` de 22–25 s com
faststart → `/thumb` (e `HEAD` sem gerar) → job virando clipe com marca d'água,
validado, subido e confirmado com sha256 conferido → **um segundo job com a
marca de PARCEIRO, baixada por URL, cacheada por versão e composta com a
assinatura** → recorte bruto retido →
job repetido não refazendo trabalho → `POST /relay/health` → poda respeitando
`DISK_HIGH`.

```bash
cd relay && make test-e2e          # ou: sh tests/e2e.sh
```

> **Ele NÃO foi executado nesta máquina.** O WSL está desabilitado
> (`Wsl/0x80070422`) e o daemon do Docker não sobe sem ele; não há `ffmpeg` no
> Windows. É o primeiro comando a rodar assim que existir uma máquina Linux —
> inclusive a própria EC2, antes de apontar a primeira câmera.

---

## Runbook — os incidentes herdados

### 1. O WAL do índice é um sinal vital

O `rec.db` roda em WAL, e o WAL **só cresce sem parar quando o checkpoint está
bloqueado** — nunca por volume. Um dia saudável fica em dezenas de MB. O
`/stats` publica `index.walBytes`; acima de `WAL_MAX_BYTES` (512 MB) o
`wal_loop` registra `wal_travado` no diário.

O que trava o checkpoint: **um cursor aberto**. A conexão SQLite é thread-local
e o servidor fala HTTP/1.1, então a thread sobrevive à requisição no
keep-alive. Se o cliente some no meio de uma resposta que está iterando um
cursor, o cursor fica aberto segurando um snapshot. **Nenhum erro aparece em
lugar nenhum.**

Consertar um WAL já estourado exige tirar os leitores do caminho:

```bash
sudo systemctl stop replayja-recserver
sudo sqlite3 /var/lib/replayja/rec.db "PRAGMA wal_checkpoint(TRUNCATE);"  # 0|0|0 = zerou
sudo systemctl start replayja-recserver
```

Com o serviço no ar não adianta: o checkpoint devolve `busy=1` em silêncio.
Custa ~1 min sem playlist; **os gravadores continuam escrevendo no disco.**

### 2. Sessão emendada — a regra de ouro

**Sintoma:** o gravador está vivo, o `journalctl` não diz nada, a câmera está
conectada — e **nenhum arquivo novo aparece no diretório**. O `/stats` mostra a
cobertura despencando e `secondsSinceLastSegment` subindo com o processo de pé.

**Causa:** alguém tentou emendar duas sessões da origem no mesmo ffmpeg.
Timestamps de sessões diferentes embaralham o relógio do muxer e ele para de
cortar arquivos. Aconteceu duas vezes no Sentinela.

**Não conserte "otimizando" o `record.sh`.** Uma sessão = um ffmpeg = um
diretório. A descontinuidade resultante é expressa por `EXT-X-MAP` +
`EXT-X-DISCONTINUITY`, o player atravessa, e o `/clip` também.

Enquanto isso: `systemctl restart replayja-rec@<cam>` devolve vídeo em ~2 s.

### 3. Backup que nunca termina

Se `systemctl status replayja-backup` mostra a unidade rodando há horas
queimando CPU: é o `.backup` do sqlite3, que recomeça do zero a cada commit
externo. **Este script usa `VACUUM INTO` justamente por isso** — se alguém
trocar de volta, o sintoma volta. Há `timeout -k 30 600` no script e
`TimeoutStartSec=1200` no unit; backup nenhum aqui tem o direito de rodar por
horas.

### 4. Segmentos longos ("a internet da arena oscilou")

`longSegments24h` conta segmentos com `EXTINF > 10 s`. Eles **não** são defeito
do gravador nem do GOP: são buraco no uplink **da arena**. A prova está no
disco — um segmento declarando 68 s com 323 KB, quando o normal de 4 s tem
~780 KB. É 1,5 s de imagem esticada por 68 s de linha do tempo, e o `EXTINF`
está **certo**.

Não tente consertar no `record.sh`: `-force_key_frames` não existe em `copy`, e
`+split_by_time` cortaria fora de keyframe, transformando um atraso
intermitente em vídeo quebrado. O conserto do lado do player é o
`#EXT-X-START`, que já está aplicado. O conserto de verdade é a internet da
arena — e é por isso que o **Spike U** (48 h medindo o uplink) tem veto antes
do contrato.

### 5. Câmera "fora do ar" ou relay falhando?

```bash
sudo curl -s localhost:9900/stats | python3 -m json.tool     # saúde completa
sudo curl -s "localhost:9900/logs?limit=50"                 # diário de bordo
sudo journalctl -u 'replayja-rec@*' -f                      # log dos gravadores
sudo journalctl -u replayja-clip-worker -n 50               # o worker
```

| No log do gravador | Significa |
|---|---|
| `sessao RTMP encerrada: N segmentos`, N alto | vídeo real chegou — está tudo bem |
| `aguardando conexao RTMP` repetindo | a **câmera** não está conectando: energia, rede da arena, ou a faixa de portas fechada |
| `sessao RTMP encerrada: 0 segmentos` em sequência | alguém conecta e desiste: scanner de porta, ou câmera com chave errada |
| `sem conf de ingest` | o `sync-cameras` ainda não materializou — confira `journalctl -u replayja-sync-cameras` |

### 6. O sync desligou gravador demais / não desligou nada

O sync **prefere errar para mais**. Se a API não responde, devolve JSON
inválido, lista vazia, registro fora do formato, ou se a mudança removeria mais
que **metade** dos gravadores de uma vez, ele **aborta o ciclo inteiro e não
desliga nada** — e diz isso no log. Sobra é desperdício de disco; falta é lance
perdido. No Sentinela, três câmeras passaram um dia inteiro sem gravar por uma
falha silenciosa deste tipo.

Para forçar um ciclo: `sudo /opt/replayja-relay/sync-cameras.sh`.

E o sync **nunca apaga conf**. Encerrar uma câmera é
`sudo /opt/replayja-relay/retire-camera.sh <id>`, que pede confirmação digitada
porque apaga a gravação junto.

### 7. A fila de clipes parou

```bash
sudo cat /run/replayja/worker.json      # inFlight, slotsTotal, failedLastHour
sudo journalctl -u replayja-clip-worker -n 100
```

| Sintoma | Causa provável |
|---|---|
| `/clip cheio; deixo o lease vencer` | `CLIP_SLOTS` saturado. **Não é falha**: o job volta à fila inteiro |
| `clipe invalido: duracao X abaixo do piso` | cobertura pior que a janela sugeria, ou `-ss` errado |
| `upload-url ... falhou (401)` | `RELAY_KEY` divergente da API |
| `confirm ... (409)` | checksum divergente: o objeto subiu truncado. O relay reenvia |
| `jobs: {"stale": true}` no `/stats` | o worker está fora há mais de 60 s |

---

## Checklist T5 — a câmera reconecta depois da queda?

Teste **bloqueante** do `PLANO.md` (risco 22): em push RTMP, a câmera precisa
voltar sozinha. Se ela não voltar, cada oscilação da arena vira uma câmera
morta até alguém ir lá.

| # | Passo | Esperado |
|---|---|---|
| 1 | Câmera gravando. `curl -s localhost:9900/stats \| grep secondsSinceLastSegment` | < 5 |
| 2 | Tire a rede da câmera (desligue o PoE) por **2 min** | — |
| 3 | `journalctl -u replayja-rec@<cam> -f` | `sessao RTMP encerrada: N segmentos`, depois `aguardando conexao RTMP` |
| 4 | Religue o PoE. Cronometre até o primeiro `.m4s` novo | **< 90 s** |
| 5 | `journalctl` | uma linha `sessao RTMP encerrada` nova, com N crescendo |
| 6 | `/logs` do rec-server | `camera_offline` e depois `camera_online`, com a duração |
| 7 | `/stats` → `coverage1h` | caiu proporcionalmente ao tempo fora, **e volta a subir** |
| 8 | `/live/<cam>/index.m3u8` | **uma** `#EXT-X-DISCONTINUITY` nova, e o player atravessa |
| 9 | `/clip` cobrindo a queda | MP4 que toca **antes e depois** do buraco, e `X-Coverage-Ratio` < 1 refletindo o tempo fora |
| 10 | Repita 5× seguidas | o gravador **nunca** entra em recuo escalonado (a espera é fixa em 2 s) |

**Reprovou?** Passo 4 acima de 90 s → ligue o **reboot agendado diário** na
câmera (`Sistema > Manutenção Automática`) e abra alarme de cobertura. Passo 4
nunca acontecendo → o firmware não retenta; é motivo para reprovar o modelo, e
o registro vai para `docs/hardware/pesquisa-cameras.md`.

> **Rede de segurança do buraco de uplink:** o microSD da câmera, com
> recuperação manual (assistida por videochamada no piloto). Não existe ANR
> para nós — é função de NVR proprietário. A saída futura é uma caixinha
> Tailscale para alcançar a câmera atrás do CGNAT.

---

## Decisões e pendências

Decisões que este fork tomou sozinho (o briefing pediu para decidir e
documentar, não perguntar).

### Decididas aqui

1. **Claim de job: `GET /relay/clip-jobs` (o `openapi.yaml`), não
   `POST /relay/clip-jobs/claim` (o briefing).** `docs/api/README.md` diz com
   todas as letras que "o YAML é a fonte da verdade sobre o quê". As duas
   formas estão implementadas e testadas; trocar custa duas linhas no
   `rec.env` (`WORKER_CLAIM_PATH`, `WORKER_CLAIM_METHOD`), sem deploy.
   **Para o Gabriel:** se o backend for construir `/claim`, avise — a decisão
   é do lado de lá, e o relay segue.
2. **Bitrate de saída: 4000 kbps, não 6000.** ADR §5, `spec-captura.md` §4.4 e
   o briefing dizem 4 Mbps; o `openapi.yaml` declara `encodeProfile.bitrateKbps`
   com padrão 6000. O worker usa o valor do **job** quando ele vem, e 4000
   quando não vem. **Divergência a resolver no contrato.**
3. **O recorte bruto fica em DISCO (`/srv/rec/_raw`), não em `/dev/shm`.** A
   `spec-captura` §4.4 põe o intermediário em tmpfs (certo para o passe) e a
   ADR §5 quer ele retido 48 h para reprocessar quando a arena trocar o logo
   (certo para o produto). 48 h × 200 clipes × 14 MB ≈ 5,6 GB — que cabe no
   disco e **não** cabe na RAM de uma `t4g.medium`. O passe roda em `/dev/shm`;
   só o bruto desce para o disco.
4. **`/stats` devolve o `RelayHealthRequest` do contrato**, não um JSON
   interno. Faz do `health-report.py` um cano em vez de um tradutor.
5. **Sem áudio, incondicionalmente.** Não é `AUDIO_CAMS` desligado por padrão:
   é `-an` no código, porque a bullet não tem microfone e gravar áudio de
   quadra abriria uma base legal, um aviso e uma política de retenção que o
   produto não tem. Ligar áudio no futuro é decisão de produto **com LGPD
   anexa**, não flag de configuração.
6. **Faixa de portas: SG abre 19350–19399; o sync aceita até 19599** (o que o
   contrato permite) e **avisa** no log quando uma câmera chega com porta fora
   da faixa aberta. Rejeitar seria perder a câmera em silêncio; aceitar sem
   avisar seria o timeout de 8 s que não diz nada.
7. **`retire-camera.sh` como ação humana.** `GET /relay/cameras` não tem lista
   de lápides (o `sync-rtmp` do Sentinela tinha). Sumir da lista desliga o
   gravador e **preserva a conf**; apagar exige um humano digitando
   `ENCERRAR`.
8. **`CAMERA_DOWN_S` = 90 s** para "offline", como o briefing pediu — mas a
   **cobertura de 24 h** continua sendo o número para julgar saúde. A de 1 h
   engana logo depois de qualquer reinício (30–90 s de lacuna por câmera).

### Pendente do Gabriel

| # | O que | Bloqueia |
|---|---|---|
| P1 | **`terraform apply`** em `relay/infra/` | a máquina existir. Comando exato em [Subir a infra](#subir-a-infra-aws) |
| P2 | **Bucket e jurisdição** (decisão G-04 de `decisoes.md`: Brasil → UE → EUA). O relay faz `PUT` genérico em URL pré-assinada e **não sabe quem é o provedor** — trocar não toca em nenhum arquivo daqui | a API emitir URLs de verdade |
| P3 | **Segredos**: `RELAY_KEY`, `RELAY_TOKEN`, `RELAY_TOKEN_SECRET`. O último **tem de ser idêntico** ao da Vercel | o vídeo tocar |
| P4 | **DNS**: `relay-1.replayja.com.br` e `stream.replayja.com.br` → o EIP. O Caddy só emite certificado depois que `relay-1` resolve | TLS |
| ~~P5~~ | ~~PNG da marca d'água do Replay já~~ **Feito em 2026-09-12**: `watermark-replayja.png` e `watermark-replayja-assinatura.png` versionados no repo (§Marca d'água). **Falta publicá-los na EC2** — a máquina não se atualiza sozinha: `sh relay/deploy-ssm.sh` do CloudShell | — |
| P6 | **`RETAIN_HOURS`**: 72 (3 dias, R$ 329/mês) ou 168 (7 dias, R$ 942). Vale −R$ 116/arena/mês e é P-09 em `decisoes.md` | a conta do piloto |
| P7 | **Rodar `make test-e2e`** na primeira máquina Linux — de preferência a própria EC2, **antes** de apontar a primeira câmera | confiança no pipeline |
| P8 | **Kit de bancada** (G-06): 1 VIP 3230 + microSD + injetor PoE | o checklist T5 |

### Débito conhecido

- **`preview` não é produzido.** O worker entrega `watermarked`, `thumbnail`,
  `og` e (sob pedido) `source`. O `preview` do contrato precisa de definição de
  produto — resolução, duração, se é GIF ou MP4 mudo — antes de virar código.
- **Takedown por trecho não tem rota.** `POST /cam/<id>/forget` apaga uma
  câmera inteira; a LGPD promete que "o trecho some do disco do relay em até
  72 h" (`api/README.md` §3). Hoje isso é manual. Vale uma rota
  `POST /cam/<id>/purge?from&to` quando o fluxo de remoção (D4) for
  implementado de verdade.
- **`sessionsLast10m` e a janela atrasada de 45 s** foram herdadas do
  Sentinela, onde câmeras em rajada eram comuns. Com RTMP direto de uma
  Intelbras isso deve ser raro; o mecanismo fica porque é barato, mas **ainda
  não foi visto acontecer aqui**.
- **Acima de 24 câmeras**, a faixa de portas vira incômodo operacional e o
  caminho é MediaMTX em modo RTMP-only (ADR §2). Não está implementado — e não
  deve estar antes da 6ª arena.

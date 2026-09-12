# Especificação de captura — Replay já 2.0

> **Versão 1.0 · 12/09/2026.** Substitui `spec-gravador-borda.md`, que descrevia um agente rodando num PC dentro da arena. Esse agente **não existe mais**.
>
> **Premissa, não reabrir:** não há computador na arena. A câmera IP **empurra RTMP** para um relay nosso na AWS (**sa-east-1**), que grava 24/7 em **fMP4** com `ffmpeg -c copy` e corta o clipe a partir do índice quando chega um gatilho. É o mesmo desenho do **relay v2 do Sentinela**, que está em produção — `C:\Users\gabri\Documents\monitoring\relay2\README.md`. O botão tem internet própria e dispara webhook HTTPS (`pesquisa-botao.md`). O PC de borda é plano B (`pesquisa-computador-borda.md`).
>
> **Este documento obedece à ADR `docs/adr/0001-stack-e-arquitetura.md`** e não redecide nada que ela fixou. O que vem de lá, e é premissa aqui: **1080p30 a 3 Mbps**, **GOP de 1–2 s**, relay em **EC2 `c7g.large` em `sa-east-1`**, **`ffmpeg -listen` com uma porta por câmera até 24 câmeras por relay** (acima disso, MediaMTX em modo RTMP-only), o campo **`ingest_kind = rtmp_push | rtsp_pull`** no contrato de ingestão, e o **clipe entregue de 25 s a 4 Mbps** com marca d'água aplicada na nuvem. O que este documento acrescenta é o lado do hardware: como a câmera precisa estar configurada, como o gatilho vira clipe, o microSD como cópia de segurança, e a conta de banda por arena.

---

## 0. Sumário das decisões

| # | Decisão | Justificativa curta |
|---|---|---|
| **D1** | A câmera **empurra** (RTMP), o relay **recebe** | Atravessa CGNAT, dispensa IP fixo, port-forward e DDNS. Quem disca é a câmera. |
| **D2** | **GOP de 1–2 s na câmera** (`Intervalo do frame I` = 30 a 60) — **fixado pela ADR** | É o quantum do índice inteiro e do `/thumb`. **Não** é a precisão do clipe final: essa vem do re-encode (§4.3). |
| **D3** | **H.264 main, compressão inteligente DESLIGADA, CBR** | RTMP/FLV não carrega H.265; H.264+/H.265+ mexem no bitrate sozinhos e sujam o índice. |
| **D4** | **3 Mbps** por câmera no padrão (2 Mbps em link apertado, 4 Mbps em arena premium) — **fixado pela ADR** | A frota do Sentinela empurra a 2 Mbit/s em 1080p e entrega 18–20 GB/dia por câmera. 3 Mbps é o meio-termo entre qualidade de esporte e o upload da arena. |
| **D5** | **Uma porta TCP por câmera até 24 câmeras por relay**; acima disso, **MediaMTX em modo RTMP-only** — **fixado pela ADR** | `ffmpeg -listen 1` atende **uma** conexão. É a lição já registrada no relay v2. |
| **D6** | Janela pedida ao índice: **[ts − 24 s, ts + 1 s]**, buscada com folga (~38 s brutos). **Entrega: 25 s, exatos ao quadro** | O `-c copy` só corta em keyframe; o corte exato acontece no **re-encode que já existe para a marca d'água** (ADR §5). §4.3 |
| **D7** | **Áudio: trilha silenciosa** (`RTMP Virtual Áudio` na câmera VIP) | Resolve a compatibilidade do FLV **e** mata a questão de LGPD de áudio ambiente de graça. |
| **D8** | **Sessão completa é o próprio acervo do relay** | Não existe "gravação de sessão" separada: o relay já grava 24/7. "Sessão" é um recorte por horário sobre o mesmo índice. |
| **D9** | **microSD de alta resistência na câmera, gravação contínua** | É a **única** cópia local. Rede de segurança para o buraco de uplink. Recuperação manual no piloto. |
| **D10** | **Todos os carimbos em UTC epoch ms.** Fuso é metadado da arena | Mata a classe inteira de bugs de horário de verão e fuso. |
| **D11** | O relay **nunca** recebe comando do app; o relay **pergunta** ao app | Regra herdada do Sentinela: o app não escreve no VPS. A resposta é uma lista, não um comando. |

---

## 1. O caminho completo

```
  QUADRA                          INTERNET DA ARENA            AWS sa-east-1
  ─────────────────────────────   ───────────────────────      ─────────────────────────────────

  Câmera VIP 3230 B SL G3
   ├── PoE 802.3af ──────┐
   ├── microSD 256 GB    │        uplink                       ┌───────────────────────────────┐
   │   (cópia local)     ├── RTMP push ──────────────────────▶ │  relay (EC2/Lightsail)        │
   └── H.264 1080p30 ────┘        (porta TCP dedicada)         │                               │
       CBR 3 Mbps, GOP 60                                      │  ffmpeg -listen 1 -f flv      │
                                                               │    -c:v copy -c:a copy        │
  Botão Zigbee ──▶ ponte na recepção                           │    -f hls -hls_time 2         │
   └── webhook HTTPS ───────────── Wi-Fi da arena ─────────▶   │    -hls_segment_type fmp4     │
       {button_ref, ts, bearer}                                │                               │
                                                               │  índice SQLite  ──▶ /clip     │
  Celular do atleta                                            │  poda por dias/disco          │
   └── botão virtual ──────────── 4G ────────────────────────▶ │                               │
                                    API do Replay já ──────────┤  (pergunta a lista de câmeras)│
                                    (Vercel/Postgres)          └───────────────┬───────────────┘
                                              ▲                                │
                                              └── clipe pronto ────────────────┘
                                                  (MP4 faststart, S3)
```

**Três caminhos independentes** e essa independência é intencional:

1. **Vídeo**: câmera → relay. Não passa pelo app. Se o app cair, a gravação continua.
2. **Gatilho**: botão → API → relay. Se o botão cair, o vídeo continua sendo gravado e o lance pode ser recuperado depois por horário.
3. **Controle**: relay pergunta ao app quais câmeras gravar (D11). Se a resposta falhar, o relay **erra para mais** — mantém gravando o que já gravava. Sobra é disco desperdiçado; falta é lance perdido.

---

## 2. Configuração da câmera

Feita **uma vez**, na interface web da câmera, no provisionamento. Depois é congelada e o relay monitora se saiu do padrão (§9).

### 2.1 Vídeo — *Câmera > Vídeo > Stream principal*

| Parâmetro | Valor | Por quê |
|---|---|---|
| Tipo de compressão | **H.264** (não H.264B, não H.265, **não** "Compressão inteligente") | FLV clássico não carrega HEVC. H.264+ altera o bitrate sozinho e a plataforma que vive disso manda desligar [F, Monuv]. |
| Perfil | **Main** | Compatibilidade de compartilhamento (WhatsApp/Instagram/iOS antigo). |
| Resolução | **1920 × 1080** | |
| Taxa de frames | **30 FPS** | Bola a 80 km/h anda 0,74 m por quadro. A 20 fps o lance pula. |
| Tipo de taxa de bit | **CBR** | O índice fica previsível e o alarme de "bitrate anômalo" (§9) passa a significar alguma coisa. |
| Taxa de bit | **3072 kbps** (2048 em link apertado, 4096 em arena premium) | §8 |
| **Intervalo do frame I** | **60** (= 2 s) no padrão · **30** (= 1 s) onde o link aguentar | **D2.** Define a granularidade do índice, do `/thumb` e do tamanho do buraco quando um segmento se perde. GOP curto custa ~8–12 % de bitrate. |
| B-frames | **0**, se a interface expuser | Elimina a classe de bugs de PTS/DTS negativo no corte. |
| Marca d'água da câmera | **desligada** | É outra coisa (verificação de adulteração), não a marca d'água do parceiro — essa é aplicada na nuvem. |

**Stream extra:** deixe habilitado em 640×360 / 15 fps, mas **não** empurre. Ele serve para o suporte olhar a câmera por RTSP na LAN durante a instalação sem brigar com o push.

### 2.2 Imagem — *Câmera > Condições*

| Parâmetro | Valor | Por quê |
|---|---|---|
| **Exposição > Modo** | **Manual** | **O ajuste mais importante depois do GOP.** No automático a câmera cai para 1/30 s à noite e a bola vira um risco. |
| **Obturador** | **1/250 s** (1/500 s em quadra bem iluminada ou beach tennis) | Congela a bola. A VIP aceita de 1/3 s a 1/100000 s [F]. |
| Ganho | automático, **teto 60–80** | Acima disso a imagem vira granulado. |
| Antiflicker | **60 Hz** (ou *Exterior* em quadra descoberta) | Refletor de LED barato cintila. |
| **Dia & Noite** | **Colorido (fixo)** | No automático o ICR sai do caminho e o vídeo vira P&B. |
| **IR / Iluminador** | **Desligado** | IR de 30 m não ilumina um campo de 45 m: cria halo branco nos primeiros 8 m e escurece o resto. O clipe fica feio e P&B. |
| Compensação de luz | **WDR** (em quadra descoberta) ou **desligado** (coberta) | Na 3230 SL é DWDR de 60 dB — ajuda pouco. WDR real de 120 dB só na 3260 Z. |
| Foco | **travado manualmente** depois de apontar | Alambrado e grade fazem o autofoco "caçar" o tempo todo. |
| Rotação / espelho | conforme montagem | |

### 2.3 Interface — *Câmera > Interface (OSD)*

| Parâmetro | Valor | Por quê |
|---|---|---|
| Data/hora sobreposta | **DESLIGADA** | **Não queimar horário no vídeo.** Além de feio no Instagram, impede reuso do quadro e vira mentira permanente se o relógio estiver errado. O carimbo vive no metadado. |
| Nome do canal | desligado | |
| Máscara de área | só se houver janela de vizinho no enquadramento (LGPD) | |

### 2.4 Rede — *Rede*

| Parâmetro | Valor |
|---|---|
| IP | **fixo** na faixa da arena (ou reserva de DHCP por MAC) |
| **NTP** | **habilitado**, servidores `a.ntp.br`, `b.ntp.br`, `c.ntp.br` (NIC.br, stratum 1 no Brasil), intervalo 30 min |
| **Fuso da câmera** | **UTC (GMT+00:00)**, horário de verão **desligado** — D10 |
| UPnP, P2P/Cloud do fabricante, FTP, SMTP | **desligados** |
| Senha | única por câmera, gerada e guardada no nosso cofre |
| HTTPS | ligado |

> **Por que UTC na câmera se o vídeo é remuxado?** Porque o carimbo que o relay publica é **hora de chegada no relay**, não hora da cena, e todo diagnóstico (comparar o OSD de uma foto com o `PROGRAM-DATE-TIME`) depende de a câmera e o relay falarem o mesmo relógio. Essa lição está registrada no relay v2: o `PROGRAM-DATE-TIME` do Sentinela é hora de chegada, e a perna câmera→relay é invisível para qualquer conta feita contra ele.

### 2.5 Armazenamento — *Armazenamento > Gravação*

| Parâmetro | Valor |
|---|---|
| microSD | **256 GB, linha de alta resistência** (SanDisk High Endurance / Samsung PRO Endurance) |
| Modo | **Gravação contínua**, stream **principal**, 24/7 |
| Sobrescrita | **habilitada** (quando encher, apaga o mais antigo) |
| Autonomia esperada | ~8 dias a 3 Mbps · ~12 dias a 2 Mbps |

### 2.6 RTMP — *Rede > RTMP*

| Campo | Valor |
|---|---|
| Habilitar | **sim** |
| Tipo de Stream | **Principal** |
| Tipo de endereço | **Personalizado** |
| Endereço personalizado | `rtmp://stream.replayja.com.br:<porta>/live/<chave>` |
| **RTMP Virtual Áudio** | **LIGADO** (só existe no modelo bullet, que é o nosso) |

O formato é o do manual: *"o link deve ser colocado no seguinte formato `URL_da_Transmissão + / + Chave_do_stream`. O link não deve conter caracteres especiais."* [F, manual VIP 3230 SL G3].

> **D7, escrito por extenso.** A bullet não tem microfone. Várias plataformas RTMP recusam FLV sem trilha de áudio, e por isso a Intelbras criou o *RTMP Virtual Áudio*. Nós ligamos: ganhamos um FLV bem-formado **e** um produto que não grava conversa de terceiros — o que dispensa base legal, aviso e política de retenção de áudio. Se um dia o áudio virar feature (grito da galera no gol), é uma decisão de produto com LGPD anexa, não um efeito colateral da configuração.
>
> Contraponto registrado: na **linha Mibo** isso não é possível — o tutorial oficial exige áudio **habilitado** para o RTMP funcionar [F]. Mais um motivo para a Mibo não entrar no kit comercial.

---

## 3. O que o relay precisa

### 3.1 Uma porta por câmera, e quando isso deixa de servir

O `ffmpeg -listen 1 -f flv -i "rtmp://0.0.0.0:<porta>/live/<chave>"` atende **uma** conexão. Um gravador = uma porta = uma câmera. É exatamente o que o relay v2 faz hoje, e é o desenho que adotamos.

| Escala | Desenho | Por quê |
|---|---|---|
| **Até 24 câmeras por relay** (= 6 arenas de 4 quadras) | **Uma porta TCP por câmera**, faixa reservada (no Sentinela é **19350–19399**) | Zero software novo. Reusa `record.sh`, `sync-rtmp.sh` e `sync-cams.sh` tal como estão. **É o limite fixado pela ADR §4.** |
| **Acima de 24 câmeras** | **MediaMTX em modo RTMP-only**, porta única (1935), autenticação por chave no path | Esticar a faixa de portas vira problema de firewall, de observabilidade e de NAT. A lição já está escrita no relay v2: *"passando de umas dezenas, o caminho é um ingest de verdade, não esticar a faixa."* |

O relay é uma **`c7g.large` em `sa-east-1`** — Graviton, **CPU dedicada, não `t4g` burstable**. A ADR é explícita sobre o porquê, e o motivo é do domínio deste documento: *"passou do baseline, o hipervisor estrangula"* — e **um gravador estrangulado perde segmento, e segmento perdido é lance perdido.** No Sentinela isso foi medido em 53 % de *steal*.

**A pegadinha que já custou meio dia no Sentinela:** a faixa precisa estar aberta no firewall do provedor, e **abrir uma porta não abre a faixa**. Em 08/09/2026 só a 19350 estava aberta; a 19351 e a 1935 respondiam com pacote descartado. **Item de checklist de provisionamento de arena nova: conferir a porta de fora antes de mandar o instalador subir no poste.**

### 3.2 Cadastro de uma câmera nova

Fluxo herdado do Sentinela, e é o que faz "cadastrar no site" bastar:

1. No `/admin` do Replay já, botão **Câmera nova**: dá-se o nome ("Society 1 — Arena Calabouço"); o app sorteia **id, porta e chave**, e mostra os dois campos para colar.
2. Um temporizador no relay (2 min) lê `GET /api/relay/rtmp-cams` com `x-relay-key`, escreve `/etc/replayja/rtmp/<id>.conf` (modo 600, com `PORT` e `KEY`) e reinicia o gravador se a conf mudou.
3. Outro temporizador (2 min) lê `GET /api/relay/cameras` e liga/desliga as unidades `replayja-rec@<id>` para bater com a lista.
4. **Sem quadra atribuída não há gravador.** A câmera nasce na fila "Câmeras novas"; é ao atribuir a quadra que ela começa a gravar. Não é corrida: o ciclo seguinte conserta.

**O campo que mantém o plano B vivo:** cada câmera carrega `ingest_kind = rtmp_push | rtsp_pull` no contrato de ingestão (ADR). Hoje todas são `rtmp_push`. Uma arena com uplink ruim que ganhe um PC de borda (`pesquisa-computador-borda.md`) entrega vídeo como `rtsp_pull` **sem mudar nada no resto do sistema** — mesmo índice, mesmo `/clip`, mesmo worker de marca d'água. É por isso que o campo existe desde o dia 1, mesmo com um valor só em uso: o custo de tê-lo agora é uma coluna; o custo de acrescentá-lo depois é uma migração no caminho crítico de uma arena com problema.

**Três regras que não se negociam**, todas herdadas de erro real:

- **O sync nunca apaga conf.** Sumir da lista do app não apaga o segredo do relay — a câmera pararia de conectar e a chave nova teria que ser digitada presencialmente. Quem encerra uma câmera é um script explícito.
- **O sync prefere errar para mais.** App sem resposta, JSON inválido, lista vazia, ou remoção de mais da metade dos gravadores de uma vez → **aborta o ciclo inteiro e não desliga nada**. Sobra é disco; falta é lance perdido.
- **A chave é segredo fraco por natureza.** RTMP é texto claro e sem autenticação. Quem tiver leitura do banco pode empurrar vídeo para uma câmera nossa. Aceitável porque o app continua **sem poder escrever no relay**. Mitigar com: chave longa e aleatória por câmera, porta não adivinhável, e alarme quando uma câmera "grava" com bitrate fora do esperado.

### 3.3 Gravação

Um `ffmpeg` por câmera, uma sessão da origem = um diretório:

```bash
ffmpeg -nostdin -hide_banner -loglevel error \
  -listen 1 -f flv -i "rtmp://0.0.0.0:${PORT}/live/${KEY}" \
  -c:v copy -c:a copy \
  -f hls -hls_time 2 -hls_list_size 0 \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_flags program_date_time+temp_file+independent_segments \
  -hls_segment_filename "${dir}/%d.m4s" \
  "${dir}/index.m3u8"
```

Por que cada pedaço:

- **`-c:v copy`** — não recodifica. Custa I/O, não CPU. É o que permite dezenas de câmeras numa máquina pequena.
- **fMP4 e não MPEG-TS** — arquivo truncado por queda continua reproduzível, e o `/clip` remuxa direto.
- **`program_date_time`** — põe o carimbo absoluto em cada segmento. É o índice de "hora de relógio → arquivo", mantido pelo próprio ffmpeg. É sobre isso que o corte do §4 trabalha.
- **`temp_file`** — o segmento é escrito como `.tmp` e renomeado. Elimina a corrida de ler um `.m4s` pela metade.
- **`independent_segments`** — cada segmento começa em keyframe. É o que torna o concat válido.
- **`-hls_time 2`** — pedido, não garantia: o muxer só fecha em keyframe, então **o GOP da câmera manda**. Com GOP de 2 s os segmentos saem em 2 s; com GOP de 4 s (caso das Mibo) saem em 4 s.
- **Uma sessão = um diretório.** Emendar sessões num único ffmpeg embaralha o relógio do muxer, e ele **para de cortar arquivos em silêncio** — processo vivo, dados entrando, nada saindo. Está documentado no relay v2 como "regra de ouro", depois de duas tentativas frustradas. Não repetir.

**Espera após desconexão: fixa e curta (2 s).** Recuo escalonado aqui vira negação de serviço de graça — basta alguém bater na porta algumas vezes para deixar a câmera real sem conseguir conectar.

---

## 4. Do gatilho ao clipe

### 4.1 O gatilho

O botão (ou o celular) faz um `POST` HTTPS para a nossa API. Contrato mínimo:

```
POST /v1/triggers
Authorization: Bearer <segredo-da-ponte-da-arena>
webhook-id: 01924f3a-7c10-7b2e-9d41-0a1b2c3d4e5f
webhook-timestamp: 1789243872
```

```json
{
  "button_ref": "0x00124b0029b1c3d7",
  "arena_id": "arena-calabouco",
  "source": "button_zigbee",
  "t_device_utc_ms": 1789243872180,
  "battery_pct": 64,
  "lqi": 148
}
```

| `source` | Quem dispara | Latência típica |
|---|---|---|
| `button_zigbee` | botão físico → ponte na recepção → webhook | 250–600 ms |
| `app` | botão virtual no celular do atleta (logado) | 50–280 ms |
| `ai` | detector na nuvem, sobre o acervo (roadmap) | — |

O **`webhook-id` é a chave de idempotência** e o formato segue o *Standard Webhooks* — a escolha e o porquê estão em `pesquisa-botao.md` §6, inclusive a diferença importante de que **com ponte a identidade é atestada pela ponte**, não assinada pelo botão. A API resolve `button_ref → court_id → camera_id` e chama o relay.

### 4.2 De qual relógio sai o `ts`

Dois relógios, e eles discordam: o do botão e o da nossa API (que é confiável). A regra:

```
t_chegada   = hora da API ao receber (UTC, confiável)
t_device    = t_device_utc_ms do corpo (quando existir)
Δ           = t_chegada − t_device

se a fonte tem relógio confiável E 0 ms ≤ Δ ≤ 5000 ms
                                       →  ts = t_device            (caminho normal)
senão                                  →  ts = t_chegada − 400 ms  (latência típica assumida)
                                          e marca clock_fallback = true
```

**Quem tem relógio confiável, e quem não tem:**

| Fonte | Relógio | Regra |
|---|---|---|
| `button_zigbee` via ponte | A ponte tem NTP; o botão não tem relógio nenhum | Usa `t_device` da ponte, com a checagem de `Δ` |
| `app` (celular) | ❌ **Nunca confiável** — o Android tolera ~5 s de erro por design, o offset medido em celular tem média de 192 ms e picos de 840 ms, e o usuário pode desligar o ajuste automático (`pesquisa-botao.md` §2.1) | **Sempre `t_chegada`.** Nunca `Date.now()` do cliente |

Por que não usar sempre `t_chegada`: um botão que dorme e acorda pode levar 1–3 s para postar, e esse atraso entra inteiro no erro. Por que não confiar sempre no dispositivo: relógio de dispositivo deriva. **O `Δ` de cada disparo é registrado** — se a mediana subir, o Wi-Fi da arena ou a ponte estão degradando, e isso vira alarme antes de virar reclamação.

### 4.3 A janela: 25 s entregues, ~38 s buscados

O PRD pede **22 s retroativos**. A ADR fixou a entrega em **25 s**: a janela **[ts − 24 s, ts + 1 s]** — 24 s antes do aperto e **1 s de pós-roll**, porque a comemoração é a parte que vira Instagram.

O que muda em relação ao desenho de borda antigo: **o corte final não é `-c copy`**. O clipe passa por um re-encode de qualquer forma, para aplicar a marca d'água do parceiro (ADR §5). E re-encode corta **no quadro exato**. Isso reorganiza as responsabilidades:

| Passo | Codec | Precisão | O que determina |
|---|---|---|---|
| **A — `/clip` do relay** | `-c copy` | corta em **keyframe** | busca material com folga: **~38 s brutos** em volta da janela |
| **B — worker de marca d'água** | re-encode H.264 | **exata ao quadro** | entrega **25,000 s** com `-ss` de saída |

```
          GOP = 2 s (K = keyframe)
  ─┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬─▶
   K   K   K   K   K   K   K   K   K   K   K   K   K   K
   ◀──────── passo A: ~38 s brutos, começa num K ─────────▶
           ▲                                       ▲
        ts−24 s                                  ts+1 s
           ◀────── passo B: 25,000 s exatos ──────▶
```

**Por que ~38 s e não 25:** o passo A precisa conter, com margem, o keyframe anterior a `ts − 24 s` **e** alguns segundos extras para o decodificador do passo B estabilizar antes do primeiro quadro entregue. Custa ~14 MB de tmpfs por clipe e zero CPU. É barato demais para economizar.

> **O erro do GOP não sumiu — mudou de lugar.** Com o re-encode, o GOP não afeta mais a precisão do clipe final. Ele continua definindo (a) a **granularidade do índice** e do `/thumb`, (b) **quanto material extra** o passo B tem que decodificar e (c) o tamanho do buraco quando um segmento se perde. Por isso D2 continua valendo: GOP de 1–2 s, não 4.

**Orçamento de erro fim a fim** (pior caso realista, e agora sem o termo do keyframe):

| Fonte | Pior caso |
|---|---|
| Relógio do botão vs. UTC | 2,0 s (limitado pelo `Δ` do §4.2, senão cai no fallback) |
| Latência do webhook até a API | 1,0 s |
| Snap de keyframe | **0 s** — absorvido pelo re-encode |
| **Total** | **≈ 3 s, sempre para trás** |

Com 24 s antes do aperto, o lance está garantido dentro do clipe **se o atleta apertar em até ~21 s depois dele**. Confortável. Se o piloto mostrar apertos mais tardios, a alavanca é aumentar a janela — não apertar o GOP.

### 4.4 O corte

**Passo A — o relay junta os segmentos que cobrem a janela folgada** (`-c copy`, exatamente como o `/clip` do relay v2, que já atravessa descontinuidade de sessão montando uma playlist temporária com caminhos absolutos de disco):

```bash
ffmpeg -hide_banner -loglevel error -nostdin \
  -allowed_extensions ALL -protocol_whitelist file,crypto,data \
  -i /tmp/<clip_id>.m3u8 \
  -c copy -avoid_negative_ts make_zero \
  -f mp4 -movflags +frag_keyframe+empty_moov \
  -y /dev/shm/<clip_id>-raw.mp4
```

**Passo B — o worker corta exato, aplica a marca d'água e fecha o MP4 de compartilhar** (receita da ADR §5, reproduzida aqui porque a configuração da câmera depende dela):

```bash
ffmpeg -hide_banner -ss "$OFFSET" -t 25 -i /dev/shm/<clip_id>-raw.mp4 -i watermark.png \
  -filter_complex "[1:v]scale=iw*${SCALE}:-1[wm];\
                   [0:v][wm]overlay=W-w-${MX}:H-h-${MY}:format=auto,format=yuv420p" \
  -c:v libx264 -preset veryfast -b:v 4M -maxrate 4.5M -bufsize 8M \
  -movflags +faststart -an -y /srv/clips/<clip_id>.mp4
```

Três detalhes que **não** são preferência de estilo:

- **`-ss` DEPOIS do `-i`** aqui (*seek de saída*) — o oposto do que se faz com `-c copy`. Com re-encode, o seek de saída decodifica desde o começo do recorte bruto e para no quadro certo; **não erra o alvo quando o keyframe está antes**. (Com `-c copy`, `-ss` depois do `-i` é o erro clássico que produz vídeo começando em quadro P.)
- **`format=yuv420p` explícito.** Sem isso, **o vídeo não toca no iOS**.
- **`+faststart`** põe o índice na frente. É literalmente o que faz o vídeo abrir no WhatsApp.

O intermediário fica em `/dev/shm` (tmpfs): evita ~14 MB de escrita em disco por clipe, e o disco do relay está ocupado gravando 24/7.

**Validação antes de publicar** (`ffprobe`): duração em **[24,8 ; 25,2] s**, ≥ 1 stream H.264, largura 1920, `pix_fmt = yuv420p`, tamanho > 1 MB. Falhou → não publica, registra `clip_invalid`, **não confirma ao atleta**.

### 4.5 Dedupe, cooldown e quarentena

| Camada | Regra | Por quê |
|---|---|---|
| Dedupe de rede | mesmo `webhook-id` → no-op (idempotente) | Retry da ponte não gera clipe duplicado. |
| Debounce | mesmo `button_ref` em **400 ms** → descarta | Zigbee pode duplicar; a rede também. |
| Cross-source | mesma quadra, fontes diferentes, em **1,5 s** → um clipe só | O atleta aperta o físico e o amigo aperta o virtual. |
| **Cooldown** | **8 s** por quadra. Apertos na janela viram `trigger_suppressed` + métrica | Dois clipes em < 8 s têm > 60 % de sobreposição — vira ruído na galeria. |
| Quarentena | > 6 disparos do mesmo botão em 60 s → suspende 10 min + alerta | Botão molhado ou travado é o modo de falha mais provável em quadra de areia sob chuva. |
| Limite diário | 200 clipes/quadra/dia (*soft*) → alerta, não bloqueia | |

### 4.6 Desempenho e latência esperada

| Passo | Tempo |
|---|---|
| Webhook do botão → API | 0,3–1,0 s |
| API → relay (chamada interna) | < 50 ms |
| **Passo A** (concat `-c copy`, ~38 s / ~14 MB) | 150–350 ms |
| **Passo B** (re-encode com marca d'água) | **27–53 núcleo-segundos de fonte por clipe** → **5–15 s** de relógio numa `c7g.large` [ADR §5, sobre medição real do Sentinela] |
| `ffprobe` de validação | ~30 ms |
| Publicação (relay → R2, ~12,5 MB) | 1–3 s |
| **Gatilho → clipe disponível ao atleta** | **≈ 8 a 20 s** |

Comparável à arquitetura anterior (0,6 s de corte + 11 s de upload da arena ≈ 15–25 s), com uma diferença importante: **o gargalo mudou de lugar**. Antes era o uplink da arena, que não controlamos; agora é CPU na nossa máquina, que se compra.

⚠️ **Os gravadores têm prioridade absoluta sobre os clippers.** Na ADR isso é `CPUQuota=120%` + `Nice=10` numa unidade systemd separada, com **2 slots** de processamento e `503` + `Retry-After` quando satura. **É melhor um clipe sair 40 s depois do que um segmento de sessão se perder** — o clipe atrasado é um incômodo, o segmento perdido é irrecuperável.

---

## 5. A gravação da sessão completa

**Não existe um pipeline separado para isso.** O relay já grava 24/7 — a "sessão completa" do PRD é **um recorte por horário sobre o mesmo índice**, servido por playlist VOD (`/vod/<cam>/index.m3u8?from=&to=`) ou baixado em MP4 único pelo `/clip`.

| Parâmetro | Valor |
|---|---|
| Gravação | **24/7** — o gravador nunca é desligado por agenda |
| **Poda por janela de operação** | mantém em disco **só a janela de funcionamento da arena** (padrão **12 h/dia**); o resto é apagado na poda diária |
| Retenção padrão | **7 dias** de janela de operação |
| Retenção em plano premium | 30 dias (é só disco e custo de nuvem) |
| Poda por espaço | acima de **85 %** de disco, apaga o mais antigo até voltar a 75 % |
| **Nunca podados** | clipes publicados e a fila de publicação |
| Teto de download | **5 min** por trecho (`CLIP_MAX_MS`), e o número precisa **bater** com o limite no app |

> **Grava 24/7, guarda 12 h.** Os dois lados dessa frase são deliberados. **Grava 24/7** porque ligar e desligar gravador por agenda é código novo com o modo de falha mais caro que existe aqui — não gravar quando devia — e porque arena tem horário elástico (o torneio que varou a madrugada é exatamente a sessão que alguém vai querer). **Guarda 12 h** porque ninguém pede replay das 4 da manhã, e a poda por janela corta o disco pela metade sem risco nenhum: se o vídeo já foi podado e alguém o quiser, ele nunca existiu para o cliente de qualquer forma. A janela é **metadado da arena**, configurável, com 1 h de folga de cada lado.

**Volume, com os números medidos na frota real do Sentinela** (1080p por RTMP): as câmeras que empurram a 2 Mbit/s dão **18–20 GB/dia** cada. Extrapolando linearmente:

| Bitrate | **Ingresso** no relay, por câmera (24/7) | **Residente** em disco, por câmera (12 h/dia) | 2 câmeras · 7 d | **4 câmeras · 7 d** |
|---:|---:|---:|---:|---:|
| 2 Mbps | 21,6 GB/dia | 10,8 GB/dia | 151 GB | **302 GB** |
| **3 Mbps** (padrão) | **32,4 GB/dia** | **16,2 GB/dia** | 227 GB | **454 GB** |
| 4 Mbps | 43,2 GB/dia | 21,6 GB/dia | 302 GB | **605 GB** |

Os **454 GB** batem com a volumetria da ADR para o piloto (1 arena, 4 quadras, 7 dias). O **ingresso** de 4 câmeras a 3 Mbps é de **3,89 TB/mês** — e é esse o número que manda na conta de rede da AWS, não o residente.

**O que este documento não decide:** custo de EBS/egress em `sa-east-1` e escolha de storage dos clipes — está na ADR §6 e §7. O que ele entrega é o volume acima e um aviso: **o ingresso de 3,89 TB/mês por arena é o número que domina a conta**, e ele existe mesmo nas horas em que ninguém joga.

---

## 6. Relógio e carimbos

| Regra | |
|---|---|
| **Tudo em UTC epoch ms** | nomes de arquivo, metadados e APIs |
| Fuso da arena (`America/Sao_Paulo`) | **metadado da arena**, aplicado só na apresentação |
| NTP na câmera | `a.ntp.br`, `b.ntp.br`, `c.ntp.br` + `pool.ntp.org` de reserva |
| NTP no relay | `chrony`, com `makestep` só nas primeiras atualizações após o boot; depois **só slew** |
| **Nunca dar `step` no relógio do relay com gravação ativa** | um salto para trás faz dois segmentos receberem o mesmo `PROGRAM-DATE-TIME` e o corte sai do momento errado, ou vazio |
| Sem OSD queimado | §2.3 |

**A ressalva honesta, herdada do relay v2:** o `PROGRAM-DATE-TIME` que o relay publica é **hora de chegada no relay** (início da sessão + duração acumulada da mídia), **não hora da cena**. A perna câmera → internet → relay é invisível para qualquer conta feita contra ele. No push direto essa perna é curta (é uma conexão TCP, não uma nuvem de fabricante no meio, como era a Tuya com ~12 s), mas **não é zero** e cresce exatamente quando o link da arena engasga.

Consequência prática: **não exiba latência ao usuário** e não construa nada que dependa de precisão sub-segundo entre o relógio do botão e o do vídeo. O orçamento de erro do §4.3 já assume isso.

Metadados que cada clipe carrega: `clip_id` (UUIDv7), `arena_id`, `court_id`, `camera_id`, `t_trigger_utc_ms`, `t_start_utc_ms`, `duration_ms`, `gop_s`, `source`, `clock_fallback`, `button_id`, `codec`, `sha256`.

---

## 7. microSD: a cópia de segurança quando o uplink cai

### 7.1 O problema, medido

Nas 24 h até 11/09/2026 na frota do Sentinela: **68 segmentos acima de 10 s, todos em câmeras por push**. Um caso cru do disco — 74 s sem um byte, e o segmento que atravessa o buraco declara **68 s com 323 KB** contra ~780 KB de um segmento normal. As câmeras puxadas por RTSP de dentro do local tiveram **zero**.

E chega em bando: cinco câmeras do mesmo local abrindo buraco **no mesmo minuto**, duas vezes em dez minutos. Não é GOP, não é o gravador — **é o uplink do lugar caindo**.

Para o Replay já: **74 s de buraco numa pelada engole de três a cinco lances**, e o atleta que apertou não vai achar o vídeo.

### 7.2 Por que não se conserta do lado do relay

Duas ideias que parecem consertos e não são (já testadas e descartadas no relay v2):

- **`-force_key_frames`** não existe em `-c copy`. Para inserir keyframe seria preciso **recodificar a frota inteira** — e nem resolveria: o buraco é da origem, não do muxer.
- **`-hls_flags +split_by_time`** capa a duração declarada, mas cortando **fora de keyframe**: os segmentos deixam de ser independentes, `#EXT-X-INDEPENDENT-SEGMENTS` vira mentira e o player engasga em qualquer troca de posição. Troca atraso intermitente por vídeo quebrado.

**A gravação está certa.** O `EXTINF` de 68 s é honesto: a câmera de fato não mandou nada naquele minuto.

### 7.3 ANR — a função que resolveria isso sozinha, e por que não temos acesso a ela

**ANR** (*Automatic Network Replenishment*) é exatamente o conserto ideal: a câmera grava no microSD durante a queda de rede e, **quando a rede volta, o gravador puxa o trecho faltante e emenda no acervo** — o buraco desaparece sozinho, sem ninguém agir.

**Ela existe, e não serve para nós.** O que a pesquisa apurou:

| Fabricante | ANR? | Funciona com push RTMP? |
|---|---|---|
| **Dahua** (séries 3 e 5) | Sim, divulgada pelo próprio fabricante | ❌ **Não.** É uma função **do NVR**: habilita-se no NVR, em *Armazenamento*, e o NVR puxa o trecho da câmera pelo **protocolo privado do fabricante** |
| **Hikvision** | Sim | ❌ **Não.** Idem — função do NVR Hikvision |
| **Intelbras VIP 3230 B SL G3** | **A palavra "ANR" não aparece** em nenhum ponto do manual do usuário nem do datasheet [F, busca no texto dos dois PDFs] | — |

**A conclusão é dura e precisa estar escrita:** **ANR só funciona câmera ↔ NVR do mesmo fabricante, em protocolo proprietário.** Não existe ANR sobre RTMP push, nem sobre RTSP para terceiros, nem sobre ONVIF. Adotar ANR significaria **colocar um NVR Intelbras na arena** — que é um computador na arena, exatamente o que esta arquitetura eliminou, e com a agravante de que aí o vídeo ficaria preso no NVR e teria que sair de lá de algum jeito.

### 7.3.1 O que temos no lugar: **SFTP com "Emergência (cartão SD)"**

A VIP tem uma função vizinha, que **é nossa e está documentada**:

> *"**Emergência (cartão SD):** a câmera irá gravar no cartão SD, se instalado, caso o servidor fique indisponível."* [F, manual VIP 3230 SL G3 §5.5, seção FTP]

A câmera aceita um destino **FTP ou SFTP** (porta 22), com agendamento de gravação *Regular* 24/7, e **cai automaticamente para o microSD quando o servidor não responde**. Isso dá uma **segunda cópia independente do push RTMP**, por um caminho que não compartilha o modo de falha do RTMP (§5.2: câmera que não reconecta).

| | |
|---|---|
| **O que resolve** | Uma segunda via de entrega. Se o RTMP cair e o SFTP não, o vídeo chega assim mesmo. E se os dois caírem, o SD assume sozinho. |
| **O que NÃO resolve** | **Não há reenvio automático do trecho perdido.** A documentação não promete *backfill*, e a pesquisa não encontrou nenhum fabricante Dahua/Amcrest que prometa. Quando o link volta, a câmera retoma o envio **dali para frente**; o buraco continua só no cartão. |
| Formato | Os arquivos saem em **`.dav`** (contêiner Dahua). O `ffmpeg` costuma abrir, **mas isso não foi validado** — é incerteza aberta (§11). |
| Custo | Zero de hardware. Um endpoint SFTP nosso e uma credencial por câmera. |

**Decisão para o piloto: não ligar o SFTP.** Ele dobra o tráfego de subida da arena (é uma segunda cópia integral, não um complemento) — e banda é justamente o recurso escasso (§8). O SFTP entra **como opção por arena** no dia em que uma arena tiver banda sobrando e histórico ruim de reconexão de push. A configuração fica documentada aqui para não ter que ser redescoberta.

### 7.4 O que o microSD cobre, e o que não cobre

| | |
|---|---|
| **Cobre** | O conteúdo. O lance existe, gravado localmente na câmera, mesmo com o link fora. |
| **Não cobre** | A entrega automática. Recuperar exige alguém agir. |
| **Não cobre** | O gatilho. Se a internet da arena caiu, o webhook do botão também não saiu (a menos que o botão seja 4G — ver `pesquisa-botao.md`). |

### 7.5 Procedimento de recuperação — **manual no piloto**

1. **Detecção.** O relay alarma quando uma câmera fica **> 60 s sem segmento novo** em horário de operação (§9). O alarme registra a janela exata do buraco.
2. **Confirmação com o cliente.** Se a arena reclamar de lance perdido, a janela de buraco já está no painel — em geral a conversa começa por aí, e não pelo cliente.
3. **Acesso à câmera.** O suporte entra na interface web da câmera → *Reprodução* → seleciona a janela → **baixa o MP4** do cartão.

   > ⚠️ **Aqui está o furo do plano, e ele é estrutural.** Sem PC na arena não existe nada dentro da LAN para servir de ponte: a câmera está atrás do CGNAT do provedor e **não roda cliente de VPN**. Tailscale/WireGuard resolvem CGNAT, mas exigem **um dispositivo no local** funcionando como *subnet router* — que é exatamente o que a arquitetura removeu. As três saídas, em ordem de custo:
   >
   > | Saída | Custo por arena | Observação |
   > |---|---|---|
   > | **Alguém no local** abre a interface da câmera pelo Wi-Fi da arena e sobe o arquivo, guiado por videochamada | R$ 0 | Funciona. É lento e depende de boa vontade. **É o plano do piloto.** |
   > | **Caixinha de acesso**: Raspberry Pi Zero 2 W (ou roteador GL.iNet/MikroTik) na LAN rodando Tailscale como *subnet router* | **[E] R$ 300–500** | Resolve de vez, e **a mesma caixinha serve de ponte RTSP→RTMP** se um dia for preciso (`pesquisa-cameras.md` §4.1). Melhor relação custo/benefício se a recuperação virar rotina. |
   > | **Roteador da arena com VPN** (se ela já tiver MikroTik/Ubiquiti/GL.iNet) | R$ 0 | Depende do que a arena tem. Perguntar no levantamento. |
   >
   > **Decisão do piloto: não colocar caixinha.** Medir `clip_recovered_from_sd`. Se passar de ~2 por arena por mês, a caixinha entra no BOM — e aí ela custa 1/8 do PC de borda e resolve dois problemas.
4. **Ingestão.** O arquivo é subido pelo `/admin` do Replay já, associado à quadra e ao horário. O sistema recorta os 23 s em volta do carimbo do gatilho que ficou órfão (o gatilho **é** registrado mesmo sem vídeo — ver abaixo) e publica o clipe.
5. **Registro.** Cada recuperação vira uma linha de métrica `clip_recovered_from_sd`. **Se esse número passar de ~2 por arena por mês, o gatilho G1 do PC de borda disparou** (`pesquisa-computador-borda.md` §2).

> **O gatilho órfão é a chave desse fluxo.** Quando chega um webhook e o índice não tem vídeo para a janela, **não descarte**: grave o evento com `status: "sem_video"` e a janela pedida. É isso que permite recuperar do cartão dias depois sem adivinhar horário, e é isso que dá o número honesto de "quantos lances perdemos" — que ninguém no mercado mede.

**Automatizar quando?** Só se a frequência justificar. O caminho seria a câmera fazer *backup* automático do trecho faltante por FTP, mas isso exige um serviço de FTP nosso, credencial por câmera na câmera, e a câmera saber qual trecho falta — que ela não sabe. Não vale no piloto.

---

## 8. Banda por arena e o pré-requisito de contrato

### 8.1 A conta

Push contínuo, 24/7, por câmera. Acrescentar **~10 %** de overhead de RTMP/TCP/retransmissão sobre o bitrate de vídeo.

| Bitrate por câmera | **2 câmeras** | **4 câmeras** |
|---:|---:|---:|
| **2 Mbps** | 4,0 Mbps (+10 % = **4,4**) | 8,0 Mbps (+10 % = **8,8**) |
| **3 Mbps** (padrão) | 6,0 Mbps (+10 % = **6,6**) | 12,0 Mbps (+10 % = **13,2**) |
| **4 Mbps** | 8,0 Mbps (+10 % = **8,8**) | 16,0 Mbps (+10 % = **17,6**) |

### 8.2 O que exigir no contrato

Um link de "300 mega" no Brasil costuma ter **30 Mbps de upload** — e a arena usa esse upload para o PDV, o Wi-Fi dos clientes, a música e as câmeras de segurança dela. O número que importa não é o do plano: é o **upload livre, sustentado, no horário de pico**.

**Cláusula proposta, em linguagem de contrato:**

> A CONTRATANTE se compromete a disponibilizar, no local, conexão de internet com **upload sustentado livre de no mínimo `2 × N × B` Mbps**, medido no horário de maior movimento, onde `N` é o número de quadras equipadas e `B` o bitrate por câmera definido na instalação (padrão 3 Mbps). Abaixo desse patamar, a qualidade de vídeo será reduzida automaticamente, e a CONTRATADA não responde por lances não gravados decorrentes de indisponibilidade do enlace.

O fator **2×** não é margem de segurança inventada: é o que separa "cabe na média" de "cabe no pico". Push é tráfego constante, mas TCP retransmite, e a arena tem outros usuários.

| Quadras | Bitrate | **Mínimo a exigir (2×)** | Plano típico que atende |
|---:|---:|---:|---|
| 2 | 2 Mbps | **9 Mbps** | qualquer fibra residencial |
| 2 | 3 Mbps | **14 Mbps** | fibra 200–300 Mb |
| 4 | 2 Mbps | **18 Mbps** | fibra 300 Mb |
| **4** | **3 Mbps** | **27 Mbps** | **fibra 500 Mb / link dedicado pequeno** |
| 4 | 4 Mbps | **36 Mbps** | fibra 500–700 Mb |

### 8.3 Spike U — medir o uplink por 48 h **antes de assinar o contrato**

O plano técnico exige isto como porta de entrada de arena nova, e a razão está em uma frase: **speedtest não serve**. Um speedtest mede o **pico instantâneo** num momento escolhido pelo próprio teste; o que nos derruba é a **estabilidade sustentada no horário de pico** — e as duas coisas não têm relação. Uma arena com "500 mega" pode ter 30 Mbps de pico de upload e mesmo assim abrir buracos de 74 s às 20h de terça, que é exatamente quando ela mais fatura.

**O que se está medindo, e com que critério de aprovação:**

| Métrica | Como se lê | Aprova se |
|---|---|---|
| **Upload sustentado no p5** (o pior 5 % das amostras, no horário de operação) | é o que sobra quando todo mundo está usando | **≥ 2 × N × B** Mbps (§8.2) |
| **Disponibilidade do enlace** | % do tempo com resposta | **≥ 99,5 %** do horário de operação |
| **Maior janela contínua sem resposta** | é o tamanho do lance perdido | **≤ 20 s** |
| **Número de janelas > 10 s** | quantos lances por semana se perde | **≤ 5 por 48 h** |
| **Perda de pacote no pico** | prevê o comportamento do TCP do push | **≤ 1 %** |
| **Jitter / variação de RTT** | link saturado tem RTT explodindo antes de perder pacote | RTT no pico **≤ 3 ×** o RTT ocioso |

**Como fazer com o que o dono da arena tem em mãos.** Em ordem de preferência:

**Opção 1 — a própria câmera de bancada (a melhor, e a que eu recomendo).** Leve **uma** câmera VIP configurada como no §2, aponte para qualquer canto, e deixe empurrando 48 h para o relay. Depois leia, no índice do relay, exatamente o que este documento usa para julgar saúde (§9.1):

```sql
-- buracos: segmentos com duração declarada muito acima do GOP
SELECT datetime(started_at/1000,'unixepoch','-3 hours') AS quando,
       dur_ms/1000.0 AS segundos, bytes
  FROM segments WHERE cam = ? AND dur_ms > 10000 ORDER BY started_at;

-- cobertura por hora: segundos de vídeo sobre segundos de relógio
SELECT strftime('%Y-%m-%d %H', started_at/1000, 'unixepoch','-3 hours') AS hora,
       SUM(dur_ms)/36000.0 AS cobertura_pct
  FROM segments WHERE cam = ? GROUP BY hora ORDER BY hora;
```

Isso mede **a coisa certa**: não "qual a banda do link", e sim **"este link consegue sustentar o nosso tráfego?"**. Um teste sintético pode passar e a câmera reprovar. Custo: uma câmera, um cabo e uma tomada.

**Opção 2 — sem câmera, com o que a arena tem.** Um celular Android velho ou um notebook deixado ligado na rede da arena, rodando um script de 48 h. O mínimo aceitável:

```bash
# a cada 20 s: um ping curto e um upload real de 2 MB. Uma linha por amostra.
while :; do
  t=$(date -u +%FT%TZ)
  lat=$(ping -c 5 -q 1.1.1.1 2>/dev/null | awk -F'/' '/rtt|round-trip/{print $5}')
  loss=$(ping -c 20 -q 1.1.1.1 2>/dev/null | awk '/packet loss/{print $6}')
  up=$(curl -s -o /dev/null -w '%{speed_upload}' -X POST --data-binary @2mb.bin \
        https://api.replayja.com.br/v1/netcheck)
  echo "$t,$lat,$loss,$up" >> uplink.csv
  sleep 20
done
```

Três regras que fazem esse script valer alguma coisa, e sem as quais ele não vale nada:

1. **Upload real, não `speedtest-cli`.** O que interessa é subir **para o nosso endpoint, na nossa região**, pelo mesmo caminho que a câmera vai usar. Um speedtest escolhe o servidor mais próximo e mede outra coisa.
2. **Amostra a cada 20 s, 48 h contínuas, cobrindo pelo menos uma noite de pico.** Uma tarde de quarta não representa a terça às 20h. **Combine a janela com o dono** para pegar o dia mais cheio.
3. **Guarde toda amostra, inclusive as que falharam** — o `timeout` do `curl` **é** o dado. A tentação de descartar erro destrói justamente a métrica que importa.

**Opção 3 — o roteador da arena.** Se for MikroTik, Ubiquiti, pfSense ou qualquer coisa com SNMP/gráfico, peça **o gráfico de 7 dias de tráfego de saída e a contagem de reconexões PPPoE**. É grátis, é histórico, e a contagem de reconexões costuma ser mais reveladora que qualquer teste que a gente faça em 48 h. **Pergunte sempre; use como complemento, nunca como única fonte** — o gráfico mostra o que foi usado, não o que estava disponível.

**O resultado do Spike U é uma das três decisões**, e nenhuma delas é "vamos tentando":

| Resultado | Decisão |
|---|---|
| Passa em tudo | Contrato com a cláusula de §8.2, bitrate padrão de 3 Mbps |
| Falha só no p5 de banda | Contrato com **2 Mbps por câmera** e menos quadras, ou upgrade de link pago pela arena como pré-condição |
| Falha em disponibilidade ou em buracos | **Não vender sem PC de borda** (`pesquisa-computador-borda.md` §2, gatilho G1). Vender assim mesmo é vender um produto que vai falhar exatamente nos jogos cheios |

### 8.4 Degradação automática

O bitrate é escolhido no provisionamento a partir de um **teste de upload feito no local** e repetido semanalmente pelo próprio relay (medindo o que a câmera consegue entregar). O instalador leigo **não** escolhe bitrate.

| Upload livre medido | Bitrate por câmera | Efeito |
|---|---|---|
| ≥ 2× necessário | **3 Mbps** | padrão |
| 1,3×–2× | **2 Mbps** | qualidade visivelmente pior no fundo de quadra; ainda vendável |
| < 1,3× | **2 Mbps e alerta comercial** | ou reduzir o número de quadras, ou acionar o plano B do PC de borda |

⚠️ **Não reduzir fps para economizar banda.** 1080p a 2 Mbps ainda dá vídeo de esporte utilizável; 1080p a 15 fps não. Se precisar cortar, corte bitrate, depois resolução, e **nunca** os 30 fps.

### 8.5 Montante de dados da arena

3 Mbps × 24 h = **32,4 GB/dia por câmera**. Uma arena de 4 quadras empurra **~130 GB/dia**, **~3,9 TB/mês**. Se o link da arena for **franquiado** (link móvel, satélite), isso inviabiliza o produto — **conferir franquia no levantamento**, é uma pergunta de uma linha que evita uma venda ruim.

---

## 9. Saúde, alarmes e operação remota

Não há agente na arena, então **tudo o que sabemos vem do relay e da API**. É menos informação do que antes, e o desenho tem que assumir isso.

### 9.1 O que o relay observa por câmera

| Sinal | Como se obtém | Alarme |
|---|---|---|
| **Câmera empurrando?** | idade do último segmento escrito | **> 60 s em horário de operação → P1** |
| **Buraco no uplink** | segmento com duração declarada > 10 s | > 3/dia por câmera → P2 · qualquer um > 30 s → P2 + registra janela para recuperação do SD |
| **Cobertura em 24 h** | segundos de vídeo / segundos de relógio | < 0,90 → P2 (câmera com problema de verdade, não ruído) |
| **Bitrate fora do padrão** | tamanho médio do segmento | ±40 % do esperado → P2 (**alguém mexeu na câmera**) |
| **GOP fora do padrão** | duração mediana do segmento | > 2,5 s → P2 (o corte vai ficar impreciso) |
| **Disco** | uso do volume | > 85 % → poda automática · > 92 % → P1 |
| **Reconexão** | nº de sessões RTMP abertas em 10 min | ≥ 4 em 10 min → câmera instável, P2 |

> **Câmera saudável fica em 0,95–0,96 de cobertura**; a mediana da frota do Sentinela é 0,92. Abaixo de 0,90 é problema. E a cobertura **cai depois de qualquer reinício da frota** (~30–90 s de lacuna por câmera) — para julgar saúde, use a janela de 24 h, nunca a de 1 h logo após um deploy.

### 9.2 O que **não** dá para saber sem agente na arena

Registrar honestamente, porque muda o suporte:

- **Temperatura, energia e nobreak.** Sem telemetria. Queda de energia aparece como "a câmera parou de empurrar" — igual a cabo solto, igual a link caído. O diagnóstico vira telefonema.
- **Estado do cabo/PoE.** Idem.
- **Bateria do botão.** Só chega porque o Zigbee a reporta e a ponte a repassa no webhook (é por isso que `battery_pct` está no contrato do §4.1). Alarme em `battery_pct < 20` e em "nenhum aperto em 48 h de operação". Ver `pesquisa-botao.md` §8.

**Mitigação de baixo custo:** pedir ao dono da arena, no cadastro, o modelo do roteador e um contato do provedor. Quando o alarme for "todas as câmeras pararam no mesmo segundo", o script de atendimento já sabe que é o link, não o equipamento.

### 9.3 Reboot remoto

A câmera VIP tem **reinício agendado** nativo. Ligar em **04:00 local**, diário. É a mitigação mais barata para o caso "a câmera não reconectou o push sozinha" (`pesquisa-cameras.md` §5.2), que é o risco menos conhecido desta arquitetura.

---

## 10. Testes de aceitação

| # | Teste | Critério |
|---|---|---|
| **T1** | Câmera VIP 3230 B SL G3 empurra RTMP para `ffmpeg -listen 1 -f flv` com `RTMP Virtual Áudio` ligado | Sessão abre, segmentos fMP4 caem em disco, vídeo abre. **Bloqueante do BOM.** |
| **T2** | Medir a duração mediana do segmento com `Intervalo do frame I` = 30 e = 60 | 1,0 s e 2,0 s respectivamente, ±10 % |
| **T3** | 100 gatilhos consecutivos em 4 quadras | 100 clipes válidos, duração 23,0–25,0 s, p95 de corte < 1,5 s |
| **T4** | Comparar o clipe com filmagem de referência | O lance está **dentro** do clipe em 100 % dos casos, nunca cortado no início |
| **T5** | **Derrubar o link da arena por 1, 5 e 30 min** | Cronometrar a volta do push. Registrar se a câmera reconecta sozinha ou precisa de reinício. **Risco principal.** |
| **T5b** | **Spike U** na arena candidata (§8.3) | 48 h de amostras; p5 de upload, disponibilidade, maior janela sem resposta, perda no pico. **Porta de entrada: sem isso não se assina contrato.** |
| **T5c** | Clipe entregue: `ffprobe` de 50 clipes | Duração **25,000 s ±0,2**, `pix_fmt = yuv420p`, abre no WhatsApp e no Instagram a partir de um iPhone |
| **T6** | Desligar a câmera da energia 20× em 10 min | Volta sozinha; no máximo o último segmento incompleto |
| **T7** | 4 gatilhos no mesmo milissegundo | 4 clipes corretos, p95 < 2 s |
| **T8** | Botão apertado 20× em 30 s | 3–4 clipes (cooldown), 16+ `suppressed`, sem quarentena indevida |
| **T9** | Gatilho numa janela **sem vídeo** (link caído) | Evento gravado com `status: "sem_video"` e janela registrada; nenhuma confirmação falsa ao atleta |
| **T10** | Recuperação do microSD: baixar o trecho, ingerir, publicar | Clipe publicado corretamente associado ao gatilho órfão |
| **T11** | Bitrate a 2, 3 e 4 Mbps × 48 h | Volume em disco bate com a tabela do §5 ±15 % |
| **T12** | Vídeo noturno com shutter 1/250 s vs. automático | A bola é identificável no quadro congelado em 1/250 s e não é no automático |
| **T13** | 7 dias contínuos sem intervenção | Cobertura ≥ 0,95, zero reinício não planejado |

---

## 11. Incertezas abertas

| Item | Status |
|---|---|
| **Push RTMP da VIP contra o nosso relay** | Documentado pelo fabricante **[F]**; **não testado em bancada**. T1 é bloqueante. |
| **Reconexão após queda de link** | **A maior incerteza desta arquitetura.** A fonte que temos diz que câmera RTMP tipicamente precisa de reinício [F, Monuv]. Se confirmado, o reboot diário (§9.3) vira obrigatório e o reboot por PoE gerenciável entra na conversa. T5. |
| `RTMP Virtual Áudio` aceito por `ffmpeg -f flv` | Plausível, não validado. Plano B: relay com `-an`. |
| Faixa aceita de `Intervalo do frame I` na VIP | Ajustável [F]; faixa exata não lida. T2. |
| **8 clipes/hora/quadra** | **Chute herdado.** Todo o §5 e o §8 dependem dele para o volume de clipes (não para o volume de gravação contínua, que é fixo). Medir na primeira semana. |
| **Conflito aberto com a ADR: qual câmera** | A ADR §9 descreve o desenho com **"Câmera IP Intelbras Mibo empurrando RTMP"**. A pesquisa desta revisão **reprova a linha Mibo** para o kit comercial: máximo de 20 fps nos modelos H.264, H.265 nos de 30 fps, **sem controle de obturador**, **sem controle de GOP** e sem PoE (`pesquisa-cameras.md` §2.2). A recomendação passou para a **VIP 3230 B SL G3**, que também faz push RTMP nativo. **Isso não muda nenhuma decisão de arquitetura da ADR** — muda o modelo no BOM e o custo por quadra. **Item para a revisão do PM (task 0.9).** |
| Arquivos `.dav` do SFTP abrem no `ffmpeg`? | Não validado (§7.3.1). Só importa se o SFTP for ligado. |
| **ANR** | Verificado e **descartado**: só existe câmera ↔ NVR do mesmo fabricante, em protocolo proprietário (§7.3). Reabrir apenas se algum fabricante publicar ANR sobre ONVIF. |
| Bitrate real x qualidade percebida a 2 / 3 / 4 Mbps | Não medido em quadra. T11 + T12. |
| Custo de nuvem (S3/EBS/egress em sa-east-1) | **Fora do escopo deste documento.** Entrega aqui: 130 GB/dia por arena de 4 quadras a 3 Mbps. |
| Acesso remoto à câmera para recuperação do SD (§7.5) | **Furo estrutural, agora documentado com três saídas.** Sem dispositivo na LAN não há como alcançar a câmera atrás de CGNAT. Piloto: recuperação assistida por videochamada. Se virar rotina: caixinha Tailscale [E] R$ 300–500. |
| Ingest único (MediaMTX) | Desenho conhecido, **não construído**. Só vira necessário a partir de ~30 câmeras. |

---

## Fontes

- Relay v2 do Sentinela — `C:\Users\gabri\Documents\monitoring\relay2\README.md` e `record.sh`. Seções usadas: "Câmera Intelbras por RTMP (push) — criada no /admin, sem SSH", "Câmera por RTSP (pull) — o caminho fora da nuvem", "Regra de ouro do gravador", "De onde vêm os segmentos longos: buraco no uplink do LOCAL", "Download de trecho (`/clip`)", "Números medidos (19 câmeras, 01/09/2026)", "Os números mudaram com as Intelbras em 1080p (11/09/2026)". Medições de 01/09 a 11/09/2026.
- [Intelbras — Manual do usuário VIP 3230 B SL G3 / D SL G3](https://backend.intelbras.com/sites/default/files/2022-07/manual-do-usuario-vip-3230-b-sl-g3-vip-3230-d-sl-g3-pt.pdf) (PDF, 07/2022) — seção RTMP (endereço personalizado, tipo de stream, RTMP Virtual Áudio), seção Vídeo (Intervalo do frame I, CBR/VBR), seção Exposição (obturador manual) — 12/09/2026
- [Intelbras — Datasheet VIP 3230 B SL G3 / D SL G3](https://backend.intelbras.com/sites/default/files/2023-02/Datasheet%20VIP%203230%20SL%20G3%20-%20V1.pdf) (PDF, 02/2023) — 1–30 FPS, obturador 1/3 s ~ 1/100000 s, RTMP na lista de protocolos, microSD 256 GB, PoE 802.3af, IP67 — 12/09/2026
- [Intelbras — Tutorial técnico "Transmissão ao vivo RTMP — Mibo Smart"](https://backend.intelbras.com/sites/default/files/2025-02/Mibo%20Smart%20-%20RTMP.pdf) (PDF, 02/2025) — exigência de áudio habilitado na linha Mibo — 12/09/2026
- [Monuv — Boas práticas RTMP](https://suporte.monuv.com.br/pt-BR/articles/6035926-boas-praticas-rtmp) — "o equipamento é totalmente responsável por sustentar essa conexão" e tipicamente precisa ser reiniciado após queda — 12/09/2026
- [Monuv — Como conectar uma câmera via RTMP](https://suporte.monuv.com.br/pt-BR/articles/5560403-como-conectar-uma-camera-via-rtmp) — exigência de H.264 e de desligar a compressão inteligente — 12/09/2026
- [NIC.br — ntp.br](https://ntp.br/) — servidores `a/b/c.ntp.br`
- [Tailscale — subnet routers para dispositivos que não rodam cliente](https://tailscale.com/kb/1019/subnets) e [TheRelay — How to Access IP Cameras Behind CGNAT](https://therelay.net/blog/ip-cameras-behind-cgnat) — base da nota de §7.4 — 12/09/2026
- [Dahua UK & Ireland — *Automatic Network Replenishment: ANR for 3 & 5 Series Cameras*](https://www.youtube.com/watch?v=n-fw8dHHCGY) e [Hikvision — *ANR Function of Hikvision NVR*](https://www.hikvision.com/en/support/how-to/how-to-video/anr-function-of-hikvision-nvr/) — ANR é função **do NVR**, habilitada nele, em protocolo proprietário — 12/09/2026
- [Amcrest — Recording to FTP vs. microSD](https://amcrest.com/forum/technical-discussion-f3/recording-to-ftp-vs-microsd-card-t473.html) — opção *"Emergency (Store on SD Card)"*, **sem backfill documentado** — 12/09/2026
- `docs/adr/0001-stack-e-arquitetura.md` — 3 Mbps, GOP 1–2 s, `c7g.large` em `sa-east-1`, `ffmpeg -listen` até 24 câmeras, `ingest_kind`, receita do passe de marca d'água, volumetria de referência
- `docs/plano-tecnico.md` — Spike U (§8.3)
- `docs/PRD.md` — janela de 22 s retroativos, gravação da sessão completa, página do parceiro e do grupo

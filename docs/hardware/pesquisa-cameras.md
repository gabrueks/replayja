# Pesquisa de câmeras — Replay já 2.0

> **Revisão de 12/09/2026** — reescrita para a arquitetura **sem PC na arena**: a câmera **empurra RTMP** direto para o nosso relay na AWS (sa-east-1), que grava 24/7 em fMP4 com `ffmpeg -c copy` e corta o clipe a partir do índice. Ver `spec-captura.md`.
> Preços em BRL, à vista/PIX, sem frete. Convenção: **[F]** = fonte direta (li a página/PDF) · **[S]** = snippet de busca · **[E]** = estimativa não verificada.

---

## 0. O que mudou nesta revisão

| Antes (arquitetura com PC de borda) | Agora (push RTMP para a nuvem) |
|---|---|
| Critério nº 1 era **RTSP + ONVIF**; o PC puxava | Critério nº 1 é **push RTMP nativo**. Quem disca é a câmera. |
| Substream RTSP independente era requisito de arquitetura | Substream deixa de ser requisito: o relay grava **um** stream e serve recorte |
| GOP de 1 s forçado via ONVIF pelo agente de borda | **GOP de 1–2 s configurado à mão na câmera** — define a granularidade do índice e do `/thumb` |
| microSD era irrelevante (o PC gravava tudo) | microSD vira **cópia de segurança obrigatória** para o buraco de uplink |
| Câmera 4 MP travada em 20 fps era o principal achado | O principal achado é outro: **quase nenhuma câmera Wi-Fi de consumo faz push a 30 fps com shutter controlável** |

A conclusão antecipada, porque muda o BOM: **a câmera recomendada continua sendo a Intelbras VIP 3230 B SL G3, e ela faz push RTMP nativo** — está no datasheet, na lista de protocolos, e tem página própria no manual do usuário. Não é preciso ponte RTSP→RTMP. Isso foi verificado nesta revisão e não era sabido antes.

---

## 1. Critérios, na nova ordem

| # | Requisito | Alvo | Por quê |
|---|---|---|---|
| **C1** | **Push RTMP nativo** para servidor arbitrário (URL + chave) | obrigatório | Não há PC na arena. A câmera precisa discar para fora, atravessar CGNAT e não exigir IP fixo nem port-forward. É o mesmo desenho já em produção no relay v2 do Sentinela. |
| C1b | *Alternativa*: RTSP/ONVIF + ponte externa (§6) | tolerado | Só se C1 falhar. Custa uma peça a mais por quadra e um ponto de falha alimentado no poste. |
| **C2** | **1080p a 30 fps real** no stream que é empurrado | obrigatório | Bola a 80 km/h anda 0,74 m por quadro a 30 fps. A 20 fps ela anda 1,1 m e o lance "pula". |
| **C3** | **Obturador controlável**, manual, ≤ 1/250 s (1/500 s em quadra clara) | obrigatório | Sem travar o shutter, o auto-exposure cai para 1/30 s à noite e a bola vira um risco borrado. Este é o requisito que mais elimina modelo. |
| **C4** | **GOP configurável**, alvo 1–2 s | obrigatório | O índice é fatiado em keyframe: **o GOP da câmera vira o quantum do acervo inteiro**, do `/thumb` e do tamanho do buraco quando um segmento se perde. Ver `spec-captura.md` §4.3. |
| C5 | **H.264** no stream de push, compressão inteligente **desligada** | obrigatório | RTMP/FLV clássico não carrega H.265. E H.264+/H.265+ mexem no bitrate sozinhos e bagunçam o índice. |
| C6 | IR **desligável**, Dia/Noite travado em Colorido | obrigatório | IR entrega vídeo P&B e um halo nos primeiros 8 m. Inútil num campo de 45 m. |
| C7 | WDR real (≥ 120 dB) | desejável | Quadra descoberta às 17h com sol atrás do gol. DWDR de 52–60 dB é cosmético. |
| C8 | **IP66/IP67**, −10 a +55 °C | obrigatório | Quadra descoberta no Brasil. |
| C9 | **PoE 802.3af** | fortemente desejável | Um cabo só até o poste, e a energia sai do rack (que fica no nobreak). Câmera Wi-Fi com fonte no poste é dois pontos de falha a mais. |
| C10 | **microSD** com gravação contínua local | obrigatório na nova arquitetura | É a **única** cópia do lance quando o uplink da arena abre um buraco. Ver §5 e `spec-captura.md` §7. |
| C10b | **ANR** (reenvio automático do trecho perdido) | desejável — **e nenhuma câmera entrega** dentro deste desenho | Fecharia sozinho o buraco de uplink. Verificado modelo a modelo em §5.3: só existe câmera ↔ NVR do mesmo fabricante. |
| C11 | Anatel, assistência e reposição no Brasil | obrigatório | O dono da arena precisa conseguir uma câmera de reposição na cidade dele. |

### 1.1 Por que C4 (GOP) virou requisito duro

Medido no relay v2 do Sentinela, com câmeras Mibo empurrando RTMP: mesmo com `-hls_time 2`, os segmentos saem em **4,000 s** na maioria das Mibo e em **2,002 s** numa delas — porque o muxer HLS do ffmpeg só fecha segmento em keyframe, e o keyframe é o que a câmera manda. Ou seja: **o GOP da câmera vira o quantum do índice inteiro**, e o app Mibo não expõe esse ajuste.

Consequência para o Replay já: o acervo inteiro passa a ser navegável só de 4 em 4 segundos. Isso degrada o `/thumb` (a lupa do scrub erra por até 4 s), quadruplica o material extra que o passe de marca d'água precisa decodificar antes do primeiro quadro entregue, e **quadruplica o tamanho do buraco quando um segmento se perde** — que, num produto cujo risco nº 1 é justamente buraco de uplink, é o que mais pesa. **Isso sozinho tira a linha Mibo do lugar de câmera principal.**

### 1.2 Por que C3 (obturador) elimina a categoria inteira das Wi-Fi de consumo

Câmera de consumo entrega "Íris eletrônica" e "Day & Night ajustável" e nada mais. Nenhuma das Mibo expõe tempo de exposição — o datasheet lista AGC, BLC, HLC, WDR "ajustável", DNR, e **não lista obturador** [F, datasheets iM7/iM7 S/iM5 S/iM5 S 4MP]. A câmera profissional lista: `Obturador eletrônico: Automático / Manual (1/3 s ~ 1/100000 s)` [F, datasheet VIP 3230 SL G3].

Sem isso, à noite, sob refletor de 100 lux, a câmera escolhe 1/30 s para clarear a imagem e a bola desaparece. É o defeito que o atleta percebe imediatamente e que faz a arena cancelar.

---

## 2. Verificação modelo a modelo — push RTMP

### 2.1 Intelbras — linha profissional VIP (PoE)

| Modelo | Push RTMP | Como se configura | Stream de push | Obturador | GOP | WDR | IP / PoE | microSD | **ANR** | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|
| **VIP 3230 B SL G3** (2 MP Starlight, 2.8 mm) | **Sim, nativo** | Web: *Rede > RTMP* → Habilitar, **Tipo de Stream** (principal ou extra), **Tipo de endereço = personalizado**, campo recebe `URL_da_Transmissão + / + Chave_do_stream` | 1080p, **1 a 30 fps**, CBR, H.264 | **Manual, 1/3 s ~ 1/100000 s** | **"Intervalo do frame I" configurável** | BLC / **DWDR 60 dB** / HLC | IP67, **PoE 802.3af** + 12 Vdc | **até 256 GB** | ❌ não citado (§5.3); tem **SFTP + "Emergência (cartão SD)"** | [F] datasheet V1 2023-02 + manual do usuário 2022-07 |
| **VIP 1230 B G5** (2 MP, 3.6 mm) | **Sim, nativo** (RTMP na lista de protocolos) | idem | 1080p, **1 a 30 fps** | **Manual, 1/3 s ~ 1/100000 s** | idem linha | WDR **digital 52 dB** | IP67, PoE 802.3af | sim | ❌ | [F] datasheet unificado V9 2025-04 |
| **VIP 3260 Z G2 / Z IA** (2 MP varifocal motorizada 2.7–13.5 mm) | **Sim, nativo** | idem | 1080p 30 fps | manual | configurável | **WDR real 120 dB** | IP67, PoE | até 256 GB | ❌ | [F] datasheet v8 2023-08 |
| VIP 5280 B IA, VIP 5500 F IA, VIP 1430 B/D, VIP 3240 Z/DZ G3 | Sim | idem | — | — | — | — | — | — | ❌ | [F] lista de compatibilidade Monuv |

**O detalhe que faz a diferença, e que só aparece no manual:** existe a opção **"RTMP Virtual Áudio"**, e o manual diz que ela *"só está disponível para o modelo Bullet"* [F, manual VIP 3230 SL G3 §RTMP]. Ela existe porque a bullet **não tem microfone** (a dome tem) e várias plataformas de streaming recusam um FLV sem trilha de áudio. Para nós isso é ótimo: **empurramos uma trilha de áudio fictícia e silenciosa**, o que resolve a compatibilidade RTMP *e* elimina de saída a questão de LGPD de áudio ambiente. Ver `spec-captura.md` §2.

> ⚠️ **Correção ao documento anterior:** a versão anterior afirmava que a VIP 3230 B SL G3 tinha "WDR real". **Não tem.** O datasheet diz `BLC/ DWDR (60 dB)/ HLC` [F]. WDR real de 120 dB só a partir da VIP 3260 Z G2. Para quadra descoberta com sol baixo atrás do gol, isso é um argumento concreto para a variante premium.

### 2.2 Intelbras — linha Mibo (Wi-Fi de consumo)

A lista oficial de modelos com RTMP está no tutorial técnico *"Transmissão ao vivo RTMP — Mibo Smart"* [F, PDF Intelbras 2025-02]: **iM1, iMX, iMX/iMX C, iM5 S/SC, iM5+ Full Color, iM5 S 4MP, iM6 Full Color, iM7 Full Color, iM7 S Full Color, iM7+ Zoom Full Color, iM7+ 3MP, iM9+ Full Color, iME 500 Full Color**.

**iM3 e iM4 não estão na lista.** Não use.

Caminho no app: **Mibo Cam → Configurações da câmera → Mais (ou Avançado) → Redes → RTMP → Habilitar → Configuração RTMP → Personalizado → colar a URL → Salvar.** O app usa **um campo só** (URL + `/` + chave concatenados), não dois — o "servidor + chave" do fluxo do Sentinela é a mesma coisa colada junta.

> ⚠️ **O tutorial oficial avisa: *"Para que o RTMP funcione corretamente será necessário deixar o áudio HABILITADO"*** [F]. Ou seja, a Mibo por push **captura áudio ambiente da quadra**. Isso é um problema de LGPD (conversa de terceiros) que a linha VIP resolve com o áudio virtual silencioso.

| Modelo | fps máx. | Codec | Lente / ângulo H | IP | Alimentação | microSD | Anatel | Fonte |
|---|---|---|---|---|---|---|---|---|
| **iM7 Full Color** | **20 FPS** ❌ | H.264 main | 4 mm / 86° | IP66 | **12 Vdc P4** (tem RJ45, **não é PoE**) | até 256 GB | 12641-21-10749 | [F] datasheet 2024-11 |
| **iM7 S Full Color** (PTZ 360°) | 30 FPS | **H.265** ❌ | 4.1 mm / 54° | IP66 | 12 Vdc P4 | até 256 GB | 05194-24-00160 | [F] datasheet 2024-11 |
| **iM7+ Zoom Full Color** | 30 FPS | — | 2.8 mm / 95° e 12 mm | IP66 | 12 Vdc P4 | até 256 GB | 05193-24-00160 | [F] datasheet 2024-11 |
| **iM5 S** | 30 FPS | **H.265** ❌ | 2.8 mm / **106°** | **IP67** | 12 Vdc | até 256 GB | 07292-19-00160 | [F] datasheet 2024-11 |
| **iM5 SC** | **20 FPS** ❌ | H.264 main | 2.8 mm / 106° | IP67 | 12 Vdc | até 256 GB | 12641-21-10749 | [F] datasheet 2024-11 |
| **iM5 S 4MP** | 30 FPS (a 1440p) | **H.265** ❌ | 3.6 mm / 92° | IP67, **−30 a +60 °C** | 12 Vdc | até 256 GB | 07375-21-06714 | [F] datasheet 2024-11 |

**Veredito da linha Mibo: reprovada como câmera principal.** Quatro motivos independentes, qualquer um deles bastaria:

1. **Sem controle de obturador.** Nenhum datasheet lista tempo de exposição. É o requisito C3, e é o que arruína o vídeo noturno de esporte.
2. **Sem controle de GOP.** Medido no relay do Sentinela: 4 s de keyframe na maioria das unidades. É o requisito C4.
3. **H.265 nos modelos de 30 fps.** RTMP/FLV clássico não carrega HEVC; os modelos que são H.264 (iM7 Full Color, iM5 SC) travam em **20 fps**. Não existe, na linha, um "1080p30 em H.264".
4. **Sem PoE.** Todas são 12 Vdc com plugue P4. Levar energia ao poste exige tomada no alto ou um splitter PoE→12 V — mais uma peça, mais uma falha.
5. **Bônus ruim:** o RTMP exige áudio ligado.

O que a linha Mibo **é**: o caminho mais barato e rápido para uma **prova de conceito**. O relay v2 já recebe Mibo em produção, o fluxo de cadastro já existe, e uma Mibo numa quadra fecha o ciclo ponta a ponta em uma tarde. Use para validar o produto, não para vender o kit.

### 2.3 Hikvision / HiLook

**Push RTMP existe, mas só em firmware especial, não na linha base.** O menu fica em *Network > Advanced > Platform Access*. Os relatos convergentes [S, IPCamTalk e use-ip.co.uk, tópicos de 2021–2024]:

- A Hikvision distribuiu um **"RTMP patch firmware"** para modelos selecionados (famílias AcuSense e ColorVu G2), **sem release oficial nem documentação de quais hardwares cobre**.
- **Só funciona em câmeras com microfone embutido ou entrada de áudio**, e **não funciona atrás de NVR**.
- A própria Hikvision indicou que **não sabe se a função entra no firmware de linha** — quem quiser manter RTMP fica preso ao firmware especial, fora do ciclo de atualização de segurança.
- No Brasil, a Monuv lista vários `DS-2CD*` como compatíveis **"mediante atualização de firmware, solicitada ao suporte Hikvision Brasil"** [F].

**Veredito: não.** Um produto que vendemos para 50 arenas não pode depender de um firmware não-catalogado que o fabricante não promete manter. Se a Hikvision entrar, entra por RTSP + ponte (§6).

### 2.4 Dahua / Amcrest

**Push RTMP nativo, sim, e bem documentado.** *Setup > Network > RTMP*, `Address Type = Customized`, campo único com `<Server URL>/<Stream key>` [F, Dahua Wiki *"How to use RTMP for Live broadcast"*]. A Amcrest é OEM Dahua e usa o mesmo firmware, com o mesmo menu [S, suporte Amcrest].

Isso não é coincidência: **a linha VIP da Intelbras é construída sobre a mesma plataforma Dahua** — daí o menu RTMP idêntico, o "Intervalo do frame I", o obturador `1/3 s ~ 1/100000 s` e o `H.264/H.264B/H.265/H.265+`. Na prática, escolher Intelbras VIP é escolher Dahua com nota fiscal, Anatel, manual em português e reposição em qualquer loja de CFTV do Brasil.

**Veredito: tecnicamente equivalente à Intelbras VIP; operacionalmente pior no Brasil** (importador, garantia irregular, preço volátil). Fica como segunda fonte se a Intelbras faltar.

### 2.5 Reolink

Push RTMP existe em parte da linha, com campos **Server** e **Stream Key** separados quando se escolhe *Custom* [S, comunidade e suporte Reolink]. Duas limitações citadas pelo próprio fabricante [F, suporte Reolink]:

- **"RTMP only supports videos encoded in H.264"** — e os modelos 8 MP/12 MP usam H.265 na resolução máxima, então **não saem por RTMP** sem baixar a resolução.
- **Câmeras 4G/LTE não suportam RTMP.**
- A página de introdução ao RTMP **não documenta onde fica a configuração** nem lista campo customizado — só formatos de URL. A evidência de "Custom" vem de fórum, não de documentação. Marcado **[S]**.

Somado ao que já sabíamos (importação, RMA lento, RTSP que oscila entre versões de firmware), **veredito: não.**

### 2.6 TP-Link Tapo / VIGI

RTSP e ONVIF: sim, documentado. **Push RTMP para servidor arbitrário: não encontrei documentação oficial.** As FAQs da TP-Link falam de RTSP, de adicionar câmeras de terceiros ao VIGI NVR por RTSP, e do servidor RTSP do NVR — nenhuma delas de RTMP de saída [F, tp-link.com/support/faq/4465 e /4181].

**Veredito: fora**, até que alguém mostre a tela. Se entrar, entra por RTSP + ponte (§6).

### 2.7 Axis

**Não faz push RTMP nativamente.** A AXIS OS entrega RTSP/RTP; o push RTMP vem de um ACAP de terceiros, o **CamStreamer**, que roda dentro da câmera e empurra para qualquer destino RTMP/SRT/HLS [F, camstreamer.com].

Ou seja: câmera cara (faixa de R$ 4–8 mil no Brasil [E]) **mais** licença de software por câmera. É a referência de qualidade de imagem e de longevidade de firmware do mercado, e é onde eu olharia se um dia vendêssemos para clube grande. **Fora do BOM de arena de bairro.**

### 2.8 Resumo da verificação

| Fabricante | Push RTMP nativo? | 1080p30 H.264 no push? | Obturador manual? | GOP ajustável? | ANR com push? | Veredito |
|---|:--:|:--:|:--:|:--:|:--:|---|
| **Intelbras VIP (3230 SL G3, 1230 G5, 3260 Z)** | **Sim [F]** | **Sim [F]** | **Sim [F]** | **Sim [F]** | ❌ | **Recomendada** |
| Dahua / Amcrest | Sim [F] | Sim | Sim | Sim | ❌ (só com NVR Dahua) | Equivalente; pior no BR |
| Intelbras Mibo | Sim [F] | Não (20 fps ou H.265) | **Não** | **Não** | ❌ | Só para prova de conceito |
| Hikvision / HiLook | Só firmware especial [S] | — | Sim | Sim | ❌ (só com NVR Hikvision) | Não |
| Reolink | Parcial [S] | Só abaixo do topo de linha | Parcial | Parcial | ❌ | Não |
| TP-Link Tapo / VIGI | Não documentado | — | — | — | ❌ | Não |
| Axis | Não (só via CamStreamer) [F] | Sim | Sim | Sim | ❌ | Fora de faixa de preço |

> **Nenhuma câmera do mercado faz ANR com push.** Isso não muda a escolha (nenhuma candidata ganha por esse critério), mas muda o que se promete ao cliente: **o buraco de uplink não tem conserto automático nesta arquitetura**, e a mitigação é o microSD com recuperação manual (§5.4).

---

## 3. Recomendação

### 3.1 Principal — **Intelbras VIP 3230 B SL G3** (bullet, 2 MP Starlight, 2.8 mm, PoE)

**Faz push RTMP nativo.** É a resposta curta à pergunta que abriu esta revisão.

| | |
|---|---|
| Preço | *ver `bom-e-custos.md` §1 — cotação de 12/09/2026* |
| Sensor / sensibilidade | 1/2.8" 2 MP Progressive CMOS, **0,005 lux @ F1.6** (Starlight) [F] |
| Obturador | Automático / **Manual 1/3 s ~ 1/100000 s** [F] |
| Vídeo | H.264/H.264B/H.265/MJPEG, **1 a 30 FPS**, CBR/VBR, 3 kbps a 6144 kbps, 2 streams [F] |
| Lente / ângulo | 2.8 mm fixa, F1.6, **107° H / 56° V** [F] |
| DORI | Detectar 43,9 m · Observar 17,5 m · Reconhecer 8,8 m · Identificar 4,4 m [F] |
| Compensação de luz | BLC / **DWDR 60 dB** / HLC [F] |
| Rede | RTMP, RTSP, ONVIF (S, T e G), NTP, HTTPS… · RJ-45 10/100 · throughput máx. 62 Mbps [F] |
| Armazenamento local | **microSD até 256 GB** [F] |
| Alimentação | **PoE 802.3af** ou 12 Vdc · consumo **< 4,6 W** [F] |
| Ambiente | **IP67**, −30 °C a +60 °C, case **metal** [F] |
| Áudio | **sem microfone** na bullet → usar **RTMP Virtual Áudio** [F] |

Por que ela e não outra: é a câmera mais barata do Brasil que fecha **C1 a C11 ao mesmo tempo**. Push nativo, 1080p30 H.264 de verdade, obturador manual, GOP ajustável, IP67, PoE, microSD, Anatel, reposição na esquina. O consumo de 4,6 W significa que um injetor PoE de 15 W por câmera basta — não precisa de switch PoE grande.

**A configuração que vai junto com ela** (detalhada em `spec-captura.md` §2): H.264 main, 1080p, 30 fps, CBR 3 Mbps, **Intervalo do frame I = 30–60** (1–2 s), compressão inteligente **desligada**, exposição **manual 1/250 s**, Dia/Noite **Colorido fixo**, **IR desligado**, OSD desligado, NTP `a.ntp.br`, fuso UTC, RTMP Virtual Áudio **ligado**, microSD em gravação contínua.

### 3.2 Econômica — **Intelbras VIP 1230 B G5** (2 MP, 3.6 mm, PoE)

Mesma plataforma, mesmo menu RTMP, mesmo obturador manual, mesmo 1~30 fps, IP67, PoE. Perde o Starlight (sem os 0,005 lux) e o WDR cai para **digital 52 dB**, e a lente de 3.6 mm cobre 86° H em vez de 107° — em society de 45 m isso obriga a recuar mais a câmera ou a aceitar cortar as pontas.

Use **apenas** em quadra coberta e bem iluminada, ou arena que só opera de dia, ou como resposta comercial a um concorrente de preço. Em pelada noturna sob refletor fraco, a diferença entre ela e a 3230 SL é a diferença entre o atleta compartilhar o vídeo e a arena cancelar o contrato.

### 3.3 Premium — **Intelbras VIP 3260 Z G2 / Z IA** (varifocal motorizada 2.7–13.5 mm)

Duas coisas que ela compra e as outras não:

1. **WDR real de 120 dB** [F] — é a única da lista que aguenta sol baixo atrás do gol numa quadra descoberta às 17h.
2. **Zoom e foco motorizados** — o enquadramento é ajustado pelo navegador, do escritório. Num produto vendido como "instale você mesmo", isso elimina a segunda viagem ao poste, que é o custo escondido da instalação remota.

É o upsell natural para arena que quer se diferenciar, e vira a padrão do kit se o piloto mostrar que o enquadramento leigo é o gargalo.

### 3.4 Prova de conceito — **Intelbras Mibo iM5 S** (Wi-Fi, 1080p30, 2.8 mm 106°, IP67)

Não entra no kit comercial (§2.2), mas é a peça certa para **fechar o ciclo ponta a ponta em uma tarde**: o relay v2 já recebe Mibo por RTMP em produção, o fluxo de cadastro já existe, e o app configura o push em dois toques. Serve para validar gatilho → clipe → página da arena antes de comprar qualquer VIP.

### 3.5 Rejeitadas explicitamente

Hikvision/HiLook (RTMP só em firmware não-catalogado), Reolink (H.265 no topo de linha bloqueia o RTMP + risco de RMA), TP-Link Tapo/VIGI (push RTMP não documentado), Axis (preço + licença de ACAP), action cams e câmeras 360° (sem push, sem duty cycle de 14 h/dia), USB/CSI + Raspberry Pi (volta a exigir computador no poste, que é justamente o que esta arquitetura eliminou).

---

## 4. Resposta à pergunta "e se nenhuma profissional fizesse push?"

Ela faz — a VIP 3230 B SL G3 faz, e está documentado no manual do fabricante. **Mas o plano de contingência precisa existir escrito**, porque há dois cenários realistas em que ele é acionado:

- a Intelbras remover o RTMP de um firmware futuro (aconteceu com a Hikvision, que nunca levou a função para a linha base);
- uma arena exigir um modelo que não tem push (câmera já instalada, herdada, ou de outra marca).

### 4.1 A ponte mínima RTSP → RTMP

Uma caixinha por arena (não por câmera) puxa RTSP da câmera e empurra RTMP para o relay, **sem recodificar**:

```bash
ffmpeg -nostdin -rtsp_transport tcp -timeout 5000000 \
  -i "rtsp://svc:SENHA@10.20.0.11:554/cam/realmonitor?channel=1&subtype=0" \
  -c:v copy -f lavfi -i anullsrc=r=16000:cl=mono -c:a aac -shortest \
  -f flv "rtmp://stream.replayja.com.br:19351/live/<chave>"
```

`-c:v copy` — não recodifica: o custo é de I/O e rede, não de CPU. O `anullsrc` gera a trilha de áudio silenciosa que o FLV quer, resolvendo o mesmo problema que o "RTMP Virtual Áudio" resolve na câmera.

| Opção de ponte | Custo | Quantas câmeras | Observação |
|---|---|---|---|
| **Raspberry Pi Zero 2 W** | *ver `bom-e-custos.md`* | 1–2 a 1080p30 `copy` | 4 núcleos Cortex-A53, Wi-Fi apenas (sem Ethernet) — precisa de adaptador USB-Ethernet, o que na prática já elimina a vantagem de preço |
| **Raspberry Pi 4 / 5 ou mini PC N100** | maior | 4–8 | Ethernet nativa, RTC, religa sozinho após queda de energia |
| **Roteador OpenWrt com ffmpeg** | menor | 1–2 | frágil, sem suporte, não recomendo vender |

**Implicações de adotar a ponte — e por isso ela é plano B, não plano A:**

1. Volta a existir **um computador na arena**, com sistema operacional, atualização, senha, watchdog e suporte remoto. É exatamente o custo que a nova arquitetura eliminou.
2. A ponte é um **ponto único de falha por arena**: se ela cai, caem todas as quadras. A câmera com push nativo falha sozinha.
3. Ela **não resolve o buraco de uplink** (§5.1) — o pacote continua saindo pelo mesmo link ruim.
4. Ela **resolve** dois problemas de graça, e vale registrar: pode reconectar sozinha em milissegundos (a câmera com push às vezes não reconecta — ver §5.2) e pode injetar o áudio silencioso.

**Decisão: não incluir a ponte no BOM padrão.** Manter a receita documentada, um Pi de bancada no estoque, e acionar caso a caso.

---

## 5. O que a nova arquitetura piorou, e o que a câmera precisa fazer a respeito

Isto não é teoria: está medido no relay v2 do Sentinela.

### 5.1 O buraco de uplink é real e é grande

Nas 24 h até 11/09/2026, **68 segmentos acima de 10 s**, todos em câmeras por push. Exemplo cru do disco: 74 s sem um único byte, e o segmento que atravessa o buraco declara **68 s com 323 KB** — contra ~780 KB de um segmento normal de 4 s. As câmeras por RTSP puxadas de dentro (`hik*`) tiveram **zero**: o `max(dur_ms)` delas foi 3,9 s e 3,4 s.

E chega em bando: **cinco câmeras do mesmo local abrindo buraco no mesmo minuto**, em 11/09 às 13:11 e de novo às 13:21. Não é GOP, não é o gravador, não é a máquina — **é o uplink do lugar caindo**.

Traduzido para o Replay já: **um buraco de 74 s durante uma pelada engole três a cinco lances**, e o atleta que apertou o botão não vai achar o vídeo. Esse é o risco número 1 da arquitetura sem PC, e ele não tem conserto no lado do servidor — o `-hls_time` não ajuda, `-force_key_frames` não existe em `copy`, e `split_by_time` corta fora de keyframe e quebra o vídeo.

### 5.2 Pior: a câmera pode não voltar sozinha

O RTMP é push, então **quem sustenta a conexão é a câmera** — o servidor não fica pedindo. A documentação brasileira de uma plataforma que vive disso é explícita: se a conexão cai, *"o equipamento deve executar uma nova solicitação de envio ao servidor"* e tipicamente *"precisa ser reiniciado"* [F, Monuv, "Boas práticas RTMP"].

Ou seja, na pior combinação (queda de link + firmware que não retenta), a quadra fica **fora do ar até alguém reiniciar a câmera**. Mitigações, em ordem de custo:

1. **Alarme no relay** quando uma câmera passa N minutos sem empurrar segmento (o relay v2 já tem cobertura por câmera; é reusar).
2. **Reboot agendado diário** da câmera na madrugada (a VIP tem agendamento de reinício nativo).
3. **Reboot remoto por PoE** — o injetor/switch PoE gerenciável desliga a porta por 10 s. Exige switch gerenciável, encarece o kit; avaliar se o item 1 mostrar reincidência.
4. **microSD** como rede de segurança do conteúdo (§5.4).

### 5.3 ANR — verificado modelo a modelo, e não resolve

**ANR** (*Automatic Network Replenishment*) seria o conserto perfeito: a câmera grava no microSD durante a queda e, **quando a rede volta, o gravador puxa o trecho faltante e emenda no acervo**. O buraco sumiria sozinho, sem ninguém agir. Foi verificado especificamente por causa disso.

| Fabricante / modelo | Tem ANR? | Funciona com **push RTMP**? | Fonte |
|---|---|---|---|
| **Dahua** séries 3 e 5 | **Sim**, divulgado pelo próprio fabricante | ❌ **Não** — é função **do NVR**: habilita-se no NVR, em *Armazenamento*, e o NVR puxa o trecho pelo **protocolo privado** do fabricante | [F/S] material da Dahua + relatos consistentes no IPCamTalk |
| **Hikvision** | **Sim** | ❌ **Não** — idem, função do NVR Hikvision, com câmera Hikvision | [F] página oficial "ANR Function of Hikvision NVR" |
| **Intelbras VIP 3230 B SL G3** | **A sigla "ANR" não aparece** em nenhum ponto do manual do usuário nem do datasheet | — | [F] busca no texto completo dos dois PDFs: **zero ocorrências** |
| Linha Mibo | Não | — | [F] idem, zero ocorrências nos datasheets |

**Conclusão, e ela é definitiva para esta arquitetura:** **ANR só existe entre câmera e NVR do mesmo fabricante, em protocolo proprietário.** Não há ANR sobre RTMP push, nem sobre RTSP para terceiros, nem sobre ONVIF. Usar ANR exigiria **um NVR Intelbras dentro da arena** — um computador na arena, que é justamente o que esta arquitetura eliminou, com o agravante de que o vídeo ficaria preso dentro dele.

**O que existe e é nosso:** a VIP aceita um destino **FTP/SFTP** com a opção *"**Emergência (cartão SD)**: a câmera irá gravar no cartão SD, se instalado, caso o servidor fique indisponível"* [F, manual VIP 3230 SL G3 §5.5]. Isso dá uma **segunda via de entrega** independente do RTMP, com queda automática para o cartão — mas **sem reenvio automático do trecho perdido**: quando o link volta, a câmera retoma dali para frente. É meio-ANR. Os detalhes, e por que ele fica **desligado no piloto** (dobra o tráfego de subida, que é o recurso escasso), estão em `spec-captura.md` §7.3.1.

### 5.4 microSD deixou de ser opcional

Com o PC de borda, o buraco de uplink não existia: o vídeo estava em disco na arena. Sem PC, **a única cópia local é o microSD da câmera**. Por isso C10 virou requisito.

- Cartão: **256 GB, TLC, linha de alta resistência** (SanDisk High Endurance / Samsung PRO Endurance). Cartão comum morre em semanas sob gravação contínua.
- Modo: **gravação contínua** (não por movimento), stream principal.
- Autonomia: a 3 Mbps são ~32 GB/dia em 24/7 → **~8 dias** em 256 GB. Cobre qualquer fim de semana prolongado.
- Recuperação **manual no piloto**: o suporte acessa a câmera, localiza o trecho pelo horário e baixa o arquivo. Automatizar só quando a frequência justificar (ver `spec-captura.md` §7).

---

## 6. Posição e altura de instalação por esporte

*(Seção mantida da revisão anterior — não depende da arquitetura de transporte. Os números foram conferidos contra o DORI da VIP 3230 B SL G3: Observar 17,5 m, Reconhecer 8,8 m [F].)*

Princípios gerais:
- **Nunca de frente para o poente.** Quadra leste-oeste → montar na lateral norte ou sul.
- **Altura mínima 4 m**, e **acima do alambrado** — tela de arame na frente da lente destrói o autofoco e aparece na imagem inteira.
- **Tilt de 15–25° para baixo.** Acima de 30° o fundo de quadra achata.
- **A câmera olha para o jogo, não para o gol.** Lateral no meio-campo ganha de atrás do gol em todos os esportes de quadra retangular.

| Esporte | Posição | Altura | Recuo | Lente | Tilt | Resultado |
|---|---|---|---|---|---|---|
| **Society** 25×45 m | lateral, meio-campo | **6–8 m** (poste de refletor) | 3–5 m | **2.8 mm** | 18–25° | campo inteiro em uma câmera, ~40 px/m |
| **Futevôlei** 16×8 m (areia) | lateral, na rede | 4,5–5,5 m | 4–6 m | **4 mm** | 22–28° | quadra + 2 m de margem, ~110 px/m |
| **Beach tennis** 16×8 m | idem futevôlei | 4,5–5,5 m | 4–6 m | 4 mm | 22–28° | bola de 6,7 cm → **trave o shutter em 1/500 s** |
| **Padel** 20×10 m | **atrás do fundo**, por cima do vidro | 4–5 m | 2–4 m | 2.8 mm | 15–20° | trave o foco manualmente: a grade "caça" o autofoco |

**Pixels por metro, para calibrar expectativa:** 1080p com 2.8 mm cobrindo ~48 m no meio do campo dá ~40 px/m; um jogador de 1,8 m ocupa ~72 px de altura e a bola de society (0,22 m) tem **9 px** — dá para ver o lance e o gol, não dá para ler o número da camisa. Se o cliente exigir mais detalhe, a resposta é **duas câmeras** (uma por metade do campo, 4 mm), não uma lente mais fechada.

⚠️ **Areia é abrasiva e o vento a joga na lente.** Limpeza da lente a cada 6 meses vira item do checklist da arena. Gota d'água na lente depois da chuva é o problema nº 1 de qualidade percebida: instalar com **caimento leve para baixo**, usar o para-sol da câmera e fazer **curva de gotejamento** no cabo.

---

## 7. Riscos e incertezas desta pesquisa

| Item | Status |
|---|---|
| **RTMP push da VIP 3230 B SL G3 contra o NOSSO relay** | Documentado no manual e no datasheet **[F]**, e há lista de compatibilidade de terceiro confirmando a família **[F]**. **Não foi testado em bancada contra `ffmpeg -listen 1 -f flv`.** É o primeiro teste a fazer, e é bloqueante para o BOM. |
| Versão de firmware que traz a tela RTMP | O manual é de **07/2022** e já documenta a função. O firmware mais recente publicado pela Intelbras para o modelo é **`Firmware_VIP_3230_SL_G3_17-06-24.zip`** (build de 17/06/2024, publicado em 02/2025) [F, página do produto]. **Ação: subir esse firmware na unidade de bancada, registrar a versão exata e congelá-la no kit** — firmware de CFTV quebra protocolo entre versões com frequência, e não se faz OTA em massa de câmera. |
| Comportamento de **reconexão** da VIP após queda de link | Desconhecido. A fonte que temos diz que câmera RTMP tipicamente precisa de reinício [F, Monuv]. **Medir: derrubar o link por 1, 5 e 30 min e cronometrar a volta.** Risco alto. |
| GOP mínimo aceito pela VIP no push | "Intervalo do frame I" é ajustável [F], faixa exata não lida. **Validar que 30 (=1 s) e 60 (=2 s) são aceitos e que o keyframe sai mesmo.** |
| `RTMP Virtual Áudio` funciona com `ffmpeg -f flv` | Plausível, **não validado**. Se falhar, o plano B é o relay aceitar FLV sem trilha de áudio (já aceita: `-an`). |
| Preços | Todos os preços foram para `bom-e-custos.md`. Nenhum preço aqui é de distribuidor: com CNPJ e 10–20 unidades espere **−15% a −30%**. |
| Reolink "Custom" com Server + Stream Key | **[S]** — veio de comunidade, não da documentação oficial, que não mostra a tela. Não usar como base de decisão. |
| Hikvision RTMP no Brasil | **[S]** — a Monuv afirma que o suporte Hikvision Brasil fornece o firmware. Não confirmei com a Hikvision. |

---

## Fontes

- [Intelbras — Tutorial técnico "Transmissão ao vivo RTMP — Mibo Smart"](https://backend.intelbras.com/sites/default/files/2025-02/Mibo%20Smart%20-%20RTMP.pdf) (PDF, 02/2025) — lista oficial de modelos Mibo com RTMP e o passo a passo do app — acessado 12/09/2026
- [Intelbras — Página do produto VIP 3230 B SL G3 (downloads e firmware)](https://www.intelbras.com/pt-br/camera-bullet-com-30-metros-de-ir-vip-3230-b-sl-g3) — firmware `Firmware_VIP_3230_SL_G3_17-06-24.zip` — 12/09/2026
- [Intelbras — Datasheet VIP 3230 B SL G3 / VIP 3230 D SL G3](https://backend.intelbras.com/sites/default/files/2023-02/Datasheet%20VIP%203230%20SL%20G3%20-%20V1.pdf) (PDF, 02/2023) — obturador manual, 1–30 fps, RTMP na lista de protocolos, IP67, PoE, microSD 256 GB — 12/09/2026
- [Intelbras — Manual do usuário VIP 3230 B SL G3 / D SL G3](https://backend.intelbras.com/sites/default/files/2022-07/manual-do-usuario-vip-3230-b-sl-g3-vip-3230-d-sl-g3-pt.pdf) (PDF, 07/2022) — seção RTMP (endereço personalizado = URL + / + chave, tipo de stream, RTMP Virtual Áudio) e seção Exposição (obturador manual) — 12/09/2026
- [Intelbras — Datasheet unificado VIP 1230 B G5 / D G5 (V9)](https://backend.intelbras.com/sites/default/files/2025-04/Datasheet%20UNIFICADO%20VIP%201230%20BD%20G5%20V9.pdf) (PDF, 04/2025) — 12/09/2026
- [Intelbras — Datasheet VIP 3260 Z G2 (v8)](https://backend.intelbras.com/sites/default/files/2023-08/Datasheet%20-%20VIP%203260%20Z%20G2%20(v8).pdf) (PDF, 08/2023) — WDR 120 dB, RTMP — 12/09/2026
- [Intelbras — Datasheet iM7 Full Color](https://backend.intelbras.com/sites/default/files/2024-11/Datasheet%20-%20iM7%20Full%20Color%20-%20C%C3%A2mera%20externa%20inteligente%20Full%20HD%20Wi-Fi%20Full%20Color.pdf) (PDF, 11/2024) — 20 FPS, H.264, 12 Vdc, IP66 — 12/09/2026
- [Intelbras — Datasheet iM7 S Full Color](https://backend.intelbras.com/sites/default/files/2024-11/Datasheet%20-%20iM7%20S%20Full%20Color%20-%20C%C3%A2mera%20externa%20inteligente%20Full%20HD%20Wi-Fi%20Full%20Color.pdf) (PDF, 11/2024) — 30 FPS, H.265 — 12/09/2026
- [Intelbras — Datasheet iM5 S / iM5 SC](https://backend.intelbras.com/sites/default/files/2024-11/Datasheet%20-%20iM5%20S%20e%20iM5%20SC%20-%20C%C3%A2mera%20externa%20inteligente%20Wi-Fi%20Full%20HD_0.pdf) (PDF, 11/2024) — 12/09/2026
- [Intelbras — Datasheet iM5 S 4MP](https://backend.intelbras.com/sites/default/files/2024-11/Datasheet%20-%20iM5%20S%204MP%20-%20C%C3%A2mera%20externa%20inteligente%20Wi-Fi.pdf) (PDF, 11/2024) — 12/09/2026
- [Intelbras — Datasheet iM7+ Zoom Full Color](https://backend.intelbras.com/sites/default/files/2024-11/Datasheet%20-%20iM7+%20Zoom%20-%20C%C3%A2mera%20externa%20inteligente%20Full%20HD%20Wi-Fi%20Full%20Color%201.pdf) (PDF, 11/2024) — 12/09/2026
- [Monuv — Como conectar uma câmera via RTMP](https://suporte.monuv.com.br/pt-BR/articles/5560403-como-conectar-uma-camera-via-rtmp) — lista de modelos Intelbras/Positivo/Hikvision compatíveis, exigência de H.264 e de desligar compressão inteligente — 12/09/2026
- [Monuv — Boas práticas RTMP](https://suporte.monuv.com.br/pt-BR/articles/6035926-boas-praticas-rtmp) — "o equipamento é totalmente responsável por sustentar essa conexão" e tipicamente precisa ser reiniciado após queda — 12/09/2026
- [Dahua Wiki — How to use RTMP for Live broadcast](https://dahuawiki.dahuasecurity.com/2021/04/15/how-to-use-rtmp-for-live-broadcast/) — `Address Type = Customized`, `<Server URL>/<Stream key>` — 12/09/2026
- [Amcrest — How to Setup an Amcrest IP Camera for RTMP Streaming](https://support.amcrest.com/hc/en-us/articles/24337594259981-How-to-Setup-an-Amcrest-IP-Camera-for-RTMP-Streaming-to-YouTube) — 12/09/2026
- [Reolink — Introduction to RTMP](https://support.reolink.com/articles/23528840063769-Introduction-to-Real-Time-Messaging-Protocol-RTMP/) — "RTMP only supports videos encoded in H.264"; 4G não suportado — 12/09/2026
- [IPCamTalk — RTMP Firmware: AcuSense & ColorVu Limited Support](https://ipcamtalk.com/threads/rtmp-firmware-acusense-colorvu-limited-support.55915/) — firmware especial Hikvision, sem release oficial — 12/09/2026
- [use-ip.co.uk — New RTMP Patch Firmware for Hikvision G3 Camera](https://www.use-ip.co.uk/forum/threads/new-rtmp-patch-firmware-for-hikvision-g3-camera-to-allow-for-streaming-to-youtube.6593/) — 12/09/2026
- [TP-Link — Tapo Camera ONVIF and RTSP Common Questions](https://www.tp-link.com/us/support/faq/4465/) — só RTSP/ONVIF documentados — 12/09/2026
- [CamStreamer — Connect a Network Camera to YouTube or other RTMP platforms](https://camstreamer.com/) — ACAP necessário para push RTMP em câmeras Axis — 12/09/2026
- Relay v2 do Sentinela — `C:\Users\gabri\Documents\monitoring\relay2\README.md`, seções "Câmera Intelbras por RTMP (push)", "Câmera por RTSP (pull)", "De onde vêm os segmentos longos: buraco no uplink do LOCAL", "Os números mudaram com as Intelbras em 1080p" — medições de 08/09 a 11/09/2026

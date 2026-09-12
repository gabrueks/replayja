# BOM e custos — kit Replay já 2.0

> **Revisão de 12/09/2026** — refeito para a arquitetura **sem PC na arena**. Saíram o mini PC, o SSD NVMe, o rack 5U e o switch de 8 portas; entraram o microSD nas câmeras e a ponte Zigbee de R$ 152. Ver `pesquisa-cameras.md`, `pesquisa-botao.md` e `spec-captura.md`.
>
> Cotações de **12/09/2026**, **varejo à vista/PIX**, sem frete, sem desconto B2B.
> **[F]** = abri a página e li o preço · **[S]** = snippet de busca · **[E]** = estimativa não cotada.
>
> ⚠️ **Todo preço aqui é de varejo.** Com CNPJ e 10–20 kits, espere **−15 % a −30 %** em câmeras, switches e cabo. O BOM está deliberadamente **conservador** — use como teto, não como meta.

---

## 0. O resultado, antes das tabelas

| | Antes (com PC de borda) | **Agora (push RTMP)** | Δ |
|---|---:|---:|---:|
| **4 quadras — hardware** | R$ 11.578 | **R$ 9.194** | **−21 %** |
| **4 quadras — instalado, por quadra** | R$ 3.144 – 3.294 | **R$ 2.548 – 2.699** | **−R$ 600/quadra** |
| **2 quadras — instalado, por quadra** | R$ 4.590 – 4.740 | **R$ 3.143 – 3.293** | **−R$ 1.450/quadra** |
| Variante econômica, 4 quadras | R$ 2.482/quadra | **R$ 1.560/quadra** | **−37 %** |
| Sem botão físico (só celular), 4 quadras | — | **R$ 2.067/quadra** | |

**O ganho é maior em arena pequena, e isso muda a estratégia comercial.** Na arquitetura antiga, o custo fixo de ~R$ 5.200 (PC + NVMe + rack) tornava arena de 1–2 quadras inviável. Agora o custo fixo caiu para **R$ 2.273**, e **arena de 2 quadras entrou na faixa em que a de 4 quadras estava antes**. O alvo comercial deixou de ser "só arena com 4+ quadras".

**Mas há um contrapeso que não estava no BOM antigo:** o custo de nuvem subiu, porque agora o vídeo inteiro sobe 24/7. Pela ADR, **R$ 301/quadra/mês no piloto** contra os R$ 40–90 estimados antes. Em escala (20 arenas) cai para **R$ 87/quadra/mês**. **A economia de CAPEX é real e a de OPEX é negativa** — §5.

---

## 1. Kit 4 quadras (recomendado)

| # | Item | Modelo de referência | Qtd | Unit. (BRL) | Total (BRL) | Conf. |
|---|---|---|---:|---:|---:|:--:|
| 1 | **Câmera IP PoE** | Intelbras **VIP 3230 B SL G3** (2 MP Starlight, 2.8 mm, IP67, RTMP push nativo) | 4 | 893,75 | **3.575,00** | **[F]** |
| 2 | **microSD de alta resistência** | Samsung **PRO Endurance 128 GB** (ou SanDisk High Endurance) | 4 | 256,44 | **1.025,76** | [S] |
| 3 | **Ponte Zigbee → webhook** | Sonoff **ZBBridge-P** com Tasmota | 1 | 152,00 | **152,00** | **[F]** |
| 4 | **Botão sem fio** | Sonoff **SNZB-01P** (4 + 1 reserva) | 5 | 110,00 | **550,00** | [E] |
| 5 | Encapsulamento do botão | Caixa IP66 BRBOX/Brum 150×110×70 + membrana de silicone + suporte de tela | 5 | 44,53 | **222,65** | **[F]** |
| 6 | **Switch PoE** | Intelbras **S1105G-P** (4× PoE+ 30 W, 56 W totais, **PoE Extender 250 m**, 1 uplink) | 1 | 371,60 | **371,60** | **[F]** |
| 7 | **Protetor de surto PoE** | Ubiquiti **ETH-SP-G2**, 1 por linha | 4 | 99,00 | **396,00** | **[F]** |
| 8 | **Cabo de rede externo** | CAT6 **outdoor CCU 100 % cobre**, dupla capa, proteção UV — caixa 305 m | 1 | 1.026,00 | **1.026,00** | **[F]** |
| 9 | Suporte de câmera | Intelbras **VBOX 3000 P** (alumínio + inox, cinta Ø80–150 mm) | 4 | 140,00 | **560,00** | [S] |
| 10 | Caixa de passagem | Intelbras **VBOX 1100 E** IP66 + conector RJ45 + capa | 4 | 23,72 | **94,88** | **[F]** |
| 11 | Nobreak (**opcional**, ver nota) | SMS 600–700 VA | 1 | 700,00 | **700,00** | [E] |
| 12 | Consumíveis de instalação | Conduíte, abraçadeiras UV, fita autofusão, RJ45, patch cords | 1 | 280,00 | **280,00** | [E] |
| 13 | Abrigo do switch e da ponte | Quadro de parede pequeno + régua + organizador | 1 | 150,00 | **150,00** | [E] |
| 14 | Embalagem e identidade | Caixa, espuma, etiquetas QR, guia impresso, adesivos | 1 | 90,00 | **90,00** | [E] |
| | | | | **TOTAL HARDWARE** | **R$ 9.193,89** | |
| | | | | **por quadra** | **R$ 2.298,47** | |

### Instalação

| Item | Base | Valor |
|---|---|---|
| Cabeamento PoE por poste (eletricista/cabista local) | R$ 250–400 por ponto [E]; referência de mercado para CFTV comum é R$ 150–300/câmera [S], e poste de 6–8 m com conduíte fica na ponta de cima | R$ 1.000 – 1.600 |
| **Total com instalação** | | **R$ 10.194 – 10.794** |
| **Custo por quadra instalado** | | **R$ 2.548 – 2.699** |

> **Premissa da instalação:** os **postes de refletor já existem**, com energia e 6–8 m de altura; o serviço é passar o cabo do quadro até o topo, fixar o suporte e conectar. **Se for preciso erguer poste novo, acrescente R$ 900–1.800 por poste [E]** — e isso muda a conversa comercial: vira obra, não instalação.

> **Sobre o nobreak (item 11).** Na arquitetura antiga ele protegia a gravação: sem energia, o PC morria e a sessão se perdia. **Agora ele não protege a gravação** — se falta energia na arena, a câmera apaga junto, e nenhum nobreak de R$ 700 alimenta quatro câmeras PoE por muito tempo. O que ele ainda faz é **atravessar o piscar de luz** (5–30 s), que é o evento mais comum e o que mais gera reconexão de push — e, com o achado de que **câmera RTMP às vezes não reconecta sozinha** (`pesquisa-cameras.md` §5.2), atravessar a queda curta vale mais do que parecia. **Mantido como opcional, recomendado.** Se sair, o kit cai para R$ 8.493,89 (**R$ 2.123/quadra**).

---

## 2. Kit 2 quadras

| # | Item | Qtd | Unit. (BRL) | Total (BRL) |
|---|---|---:|---:|---:|
| 1 | Câmera VIP 3230 B SL G3 | 2 | 893,75 | 1.787,50 |
| 2 | microSD PRO Endurance 128 GB | 2 | 256,44 | 512,88 |
| 3 | Ponte Sonoff ZBBridge-P | 1 | 152,00 | 152,00 |
| 4 | Botão SNZB-01P (2 + 1 reserva) | 3 | 110,00 | 330,00 |
| 5 | Caixa IP66 do botão | 3 | 44,53 | 133,59 |
| 6 | **Injetor PoE** TP-Link TL-POE150S (802.3af, gigabit) — 1 por câmera | 2 | 118,80 | 237,60 |
| 7 | DPS PoE Ubiquiti ETH-SP-G2 | 2 | 99,00 | 198,00 |
| 8 | Cabo CAT6 outdoor CCU 305 m | 1 | 1.026,00 | 1.026,00 |
| 9 | Suporte de poste VBOX 3000 P | 2 | 140,00 | 280,00 |
| 10 | Caixa de passagem VBOX 1100 E | 2 | 23,72 | 47,44 |
| 11 | Nobreak 600–700 VA (opcional) | 1 | 700,00 | 700,00 |
| 12 | Consumíveis | 1 | 140,00 | 140,00 |
| 13 | Abrigo de parede | 1 | 150,00 | 150,00 |
| 14 | Embalagem | 1 | 90,00 | 90,00 |
| | | | **TOTAL HARDWARE** | **R$ 5.785,01** |
| | | | **por quadra** | **R$ 2.892,51** |
| | Instalação (2 pontos) | | | R$ 500 – 800 |
| | **Total instalado** | | | **R$ 6.285 – 6.585** |
| | **Por quadra instalado** | | | **R$ 3.143 – 3.293** |

> **Por que injetor e não switch com 2 quadras:** dois injetores custam R$ 237,60 contra R$ 371,60 do switch, e cada câmera fica **eletricamente independente** — um injetor queimado derruba uma quadra, não as duas. A troca é: sem o **PoE Extender de 250 m** do switch Intelbras. **Se qualquer lance de cabo passar de 90 m, use o switch**, mesmo em 2 quadras. Meça antes de comprar (§7, passo 3).

---

## 3. Variantes do kit de 4 quadras

| Variante | Mudança | Total | Por quadra | Quando usar |
|---|---|---:|---:|---|
| **Só celular** | Remove ponte + botões + caixas (itens 3, 4 e 5) | **R$ 8.269,24** | **R$ 2.067** | **Piloto.** Vale a pena começar assim e acrescentar o botão físico depois de medir se o virtual basta (`pesquisa-botao.md` §2) |
| **Econômica** | Câmera → **VIP 1230 B G5** (R$ 330,10 **[F]**) · sem nobreak | **R$ 6.239,29** | **R$ 1.560** | Quadra **coberta e bem iluminada**, ou uso diurno, ou resposta comercial a concorrente de preço. **Não usar em pelada noturna** |
| **Padrão** | — | **R$ 9.193,89** | **R$ 2.298** | Default |
| **Premium** | Câmera → **VIP 3260 Z IA** varifocal motorizada, WDR real 120 dB (R$ 1.089,54 **[F]**) · microSD 256 GB | **R$ 10.631,29** | **R$ 2.658** | Quadra descoberta com sol baixo, ou arena que quer diferenciação. O zoom remoto **elimina a segunda visita ao poste** |

> ⚠️ **Uma alavanca de preço que eu desaconselho:** trocar o cabo CAT6 outdoor **CCU (cobre puro, R$ 1.026)** pelo **CCA (alumínio revestido, ~R$ 375)** economiza R$ 651 no kit — R$ 163/quadra. **Não faça.** CCA tem resistência maior, e PoE em lance longo é exatamente onde isso aparece: queda de tensão, câmera que reinicia sozinha sob carga, e um defeito intermitente que só se manifesta depois que o cabo já está dentro do conduíte. R$ 651 não paga uma revisita com escada.

---

## 4. A estrutura de custo — e o que ela implica comercialmente

Separando fixo de variável no kit de 4 quadras:

| | Valor |
|---|---:|
| **Custo fixo por arena** (ponte Zigbee, botão reserva + caixa, cabo, nobreak, abrigo, embalagem) | **R$ 2.272,53** |
| **Custo variável por quadra** (câmera, microSD, botão, caixa do botão, DPS, suporte, caixa de passagem) | **R$ 1.567,44** |
| Rede PoE (semi-fixo: injetores até 2 quadras, switch de 3 a 4, dois switches de 5 a 8) | R$ 118,80 a R$ 743,20 |
| Consumíveis | ~R$ 70/quadra |

| Nº de quadras | Custo total (hardware) | **Custo/quadra** |
|---:|---:|---:|
| 1 | R$ 4.029 | **R$ 4.029** |
| **2** | R$ 5.785 | **R$ 2.893** |
| **4** | R$ 9.194 | **R$ 2.298** |
| 6 | R$ 12.840 | **R$ 2.140** |
| 8 | R$ 16.115 | **R$ 2.014** |

**Três decisões comerciais saem daí — e duas mudaram:**

1. **Arena de 2 quadras virou viável.** R$ 2.893/quadra hoje é menos do que a arena de **4** quadras custava antes (R$ 2.894). O mercado endereçável cresceu sem nenhum trabalho de produto. **Isto é a principal consequência comercial da nova arquitetura.**
2. **Arena de 1 quadra continua inviável** em comodato (R$ 4.029 por uma quadra), mas a distância encolheu. Ou vende o equipamento, ou não atende.
3. **A curva achatou.** Antes, ir de 2 para 4 quadras cortava 33 % do custo por quadra; agora corta 21 %. O incentivo a empurrar arena grande diminuiu — **e o incentivo a empurrar arena com internet boa aumentou** (§5).

### Amortização (comodato 24 meses)

| Kit | CAPEX instalado | /24 meses | **/quadra/mês só de hardware** |
|---|---:|---:|---:|
| 4 quadras | R$ 10.494 | R$ 437 | **R$ 109** (era R$ 133) |
| 2 quadras | R$ 6.435 | R$ 268 | **R$ 134** (era R$ 191) |
| 6 quadras | R$ 14.640 [E] | R$ 610 | **R$ 102** |

---

## 5. O contrapeso: a nuvem ficou mais cara

O CAPEX caiu porque o PC saiu da arena. Mas o trabalho que ele fazia não sumiu — **mudou de lugar, e agora é fatura mensal.** Números da ADR (`docs/adr/0001-stack-e-arquitetura.md` §8):

| | Piloto (1 arena, 4 quadras) | 20 arenas (80 câmeras) |
|---|---:|---:|
| Nuvem, total | **R$ 1.205/mês** | R$ 6.932/mês |
| **Por quadra/mês** | **R$ 301** | **R$ 87** |

| Componente | R$/quadra/mês — piloto | R$/quadra/mês — 20 arenas |
|---|---:|---:|
| Amortização de hardware (24 m) | 109 | 109 |
| **Nuvem** | **301** | **87** |
| Suporte, RMA, provisão de perda (6 %) | 35 – 60 | 35 – 60 |
| **Custo total** | **445 – 470** | **231 – 256** |
| **Preço mínimo viável (margem bruta 50 %)** | **R$ 890 – 940** | **R$ 462 – 512** |

**A leitura honesta:** **no piloto, esta arquitetura é mais cara de operar que a anterior.** A conta só fecha com escala, porque o relay `c7g.large` atende **até 24 câmeras** (ADR) — seis arenas de 4 quadras dividindo a mesma máquina. **Uma arena sozinha paga o relay inteiro.**

Três consequências práticas:

1. **Não prometa preço de escala no primeiro contrato.** Ou o piloto é subsidiado de propósito (e isso é uma decisão consciente, com valor conhecido), ou o preço é o de piloto.
2. **Encher o relay é a alavanca de margem mais forte do produto.** Ir de 1 para 6 arenas no mesmo `c7g.large` derruba o custo de nuvem por quadra em ~70 % sem tocar em uma linha de código. **Vender a segunda arena vale mais que otimizar qualquer coisa.**
3. **A conta de nuvem é dominada pelo ingresso 24/7** (3,89 TB/mês por arena de 4 quadras a 3 Mbps — `spec-captura.md` §5), não pelos clipes. A alavanca técnica, se um dia precisar, é o **bitrate na câmera**, não o storage.

---

## 6. Onde o BOM é deliberadamente mais caro que o do provável concorrente

| Item | Custo | O que compra |
|---|---:|---|
| **Câmera Starlight com obturador manual** em vez de câmera comum | +R$ 2.255 (4 un.) | **Vídeo utilizável em pelada noturna** — que é quando a quadra fatura mais. É o item que mais protege contra churn, e o obturador manual é o que separa "bola" de "risco borrado" |
| **microSD de alta resistência** em todas as câmeras | R$ 1.026 | **A única cópia do lance quando o uplink cai.** Sem PC na arena, isto é a rede de segurança inteira (`spec-captura.md` §7) |
| **Cabo CCU (cobre puro) outdoor** em vez de CCA | +R$ 651 | PoE em lance de 80–140 m que funciona no calor de janeiro, não só no dia da instalação |
| **DPS PoE por linha** | R$ 396 | Raio no cabo do poste é a causa nº 1 de queima em CFTV externo no Brasil. R$ 99 evita uma câmera de R$ 894 mais uma visita |
| **Botão com telemetria** (Zigbee) em vez de RF burro | +R$ 200 [E] | Responder *"o botão da quadra 3 está funcionando?"* pelo painel, em vez de *"pede pra alguém apertar e me avisa"* |

Total desses cinco: **R$ 4.528 — 49 % do kit.** É o que separa "mais um replay de quadra" de um produto que sobrevive ao segundo mês.

### Comparação com o posicionamento dos concorrentes

⚠️ `concorrentes.md` é explícito: **nenhum concorrente publica preço**, todos orçam por WhatsApp. O que segue é estrutura, não preço.

| Player | Modelo | O que dá para inferir |
|---|---|---|
| **Chame o VAR** | Venda de equipamento + contrato 12 m **ou** comodato 24 m | O comodato de 24 m fecha com CAPEX de **R$ 2.000–4.000/quadra**. Nosso R$ 2.298 está confortavelmente dentro |
| **Meu Replay** | Aluguel de kit pré-configurado, instalação por vídeo/WhatsApp | Confirma que "kit pré-configurado + instalação remota" é **paridade**, não diferencial. Nossa instalação ficou mais simples ainda: sem PC, o guia caiu de 10 passos com rack para 10 passos sem rack (§7) |
| **z2play** | SaaS mensal embutido na gestão da arena | Empurra o hardware para dentro da mensalidade |
| **Clipei** | "~50 % mais barato" — preço como cunha | **É contra este que o BOM se defende.** A variante **Econômica a R$ 1.560/quadra** existe exatamente para responder sem destruir a proposta — e é **37 % mais barata** que a resposta que tínhamos antes |
| **FilmaEu** | Marca da arena no vídeo + IA paga pelo atleta | Valida o upsell de IA. Nossa arquitetura chega lá com **custo marginal de hardware zero**: a sessão completa já está na nuvem |

---

## 7. Guia de instalação em 10 passos (para o dono da arena)

> **Tempo estimado:** 3–4 h para 4 quadras, com um ajudante e uma escada/andaime.
> **Você precisa de:** furadeira, chave Phillips, escada que alcance 7 m (ou um eletricista para os passos 4–6), celular com internet.
> **Nosso suporte acompanha por videochamada nos passos 4 a 10.** Agende antes de começar.

### Passo 1 — Confira a caixa
Bipe o QR code da lista de conferência. Você deve ter: **4 câmeras com suporte**, 4 cartões de memória **já instalados nas câmeras**, 1 switch pequeno, 4 protetores de surto (as pecinhas cinza), 1 nobreak, 1 caixa de cabo, 5 botões nas caixinhas, 1 pecinha branca de tomada (a **ponte do botão**) e o saco de consumíveis.
**Não há computador no kit** — é assim mesmo. **Se faltar algo, pare e chame o suporte antes de furar qualquer parede.**

### Passo 2 — Escolha o lugar do quadro
Parede interna, coberta, ventilada, perto de uma tomada e **perto do seu roteador de internet**. Recepção, escritório ou depósito. **Não** no banheiro, **não** embaixo de telhado de zinco sem forro, **não** onde bate sol. Fixe o quadro a 1,5 m do chão.

### Passo 3 — Meça os cabos antes de comprar briga
Caminhe o trajeto de cada quadra até o quadro e **anote os metros**. Mande os quatro números para o suporte.
⚠️ **Acima de 90 m o cabo comum não funciona** — o suporte liga um modo especial no switch que resolve até 250 m, mas **precisa saber antes**. Descobrir isso com a câmera já no poste é a causa nº 1 de instalação refeita.

### Passo 4 — Marque a posição de cada câmera
- **Society:** na lateral, na altura do meio de campo, a **6–8 m** do chão (o poste do refletor é perfeito), 3–5 m recuada da linha.
- **Futevôlei / beach tennis:** na lateral, na altura da rede, a **4,5–5,5 m**, 4–6 m recuada.
- **Padel:** atrás do fundo da quadra, centralizada, a **4–5 m**, olhando **por cima** do vidro.

**Regra de ouro: nunca aponte a câmera para o pôr do sol.** Se a quadra é leste-oeste, monte na lateral norte ou sul. E a câmera precisa ficar **acima do alambrado** — tela de arame na frente da lente estraga a imagem inteira.
**Mande uma foto do lugar escolhido para o suporte antes de furar.**

### Passo 5 — Passe o cabo e monte a câmera
Do quadro até o topo de cada poste, por dentro de conduíte ou preso com abraçadeira UV. **Deixe 2 m de sobra em cada ponta.** Se o caminho passa perto de cabo de energia, mantenha **20 cm de distância** e nunca no mesmo conduíte.

Fixe o suporte no poste com a cinta metálica, encaixe a câmera e aponte para o centro da quadra, inclinada **uns 20° para baixo**. Conecte o cabo, coloque o conector dentro da caixinha de passagem e **enrole fita autofusão na emenda** — isso é o que impede a água de entrar, não pule.
**Deixe uma "curva de gotejamento"**: o cabo desce um pouco antes de entrar na câmera, para a água escorrer em vez de seguir o cabo para dentro.

### Passo 6 — Ligue tudo no switch, com o protetor no meio
No quadro: nobreak na tomada, switch no nobreak, e um cabo do **seu roteador** na porta marcada **INTERNET** (a colorida, do lado). Depois, cada cabo de quadra numa porta **PoE** (1 a 4) — e, **antes de cada um, encaixe o protetor de surto**, que fica entre o cabo do poste e o switch.
A câmera acende sozinha em ~30 s. **Anote qual porta é de qual quadra.**

### Passo 7 — Abra o painel e cadastre a primeira câmera
Escaneie o QR code da tampa do quadro com o celular, faça login e clique em **"Adicionar câmera"**. Dê o nome da quadra ("Society 1"). A tela vai mostrar **dois campos prontos, com um botão de copiar em cada**:

```
Servidor:  rtmp://stream.replayja.com.br:19351/live
Chave:     xxxxxxxxxxxxxxxxxxxxxxxx
```

**Guarde essa tela aberta** — é o que você vai colar no passo 8.

### Passo 8 — Cole os dois campos na câmera
Ainda no celular, conecte-se ao Wi-Fi da arena e abra o endereço da câmera que o painel indicar. Vá em **Rede → RTMP**, marque **Habilitar**, escolha **Personalizado** e **cole o Servidor e a Chave juntos, nessa ordem, separados por uma barra**:

```
rtmp://stream.replayja.com.br:19351/live/xxxxxxxxxxxxxxxxxxxxxxxx
```

Clique em **Salvar**. Em até 1 minuto o painel mostra **"Recebendo vídeo"** naquela quadra.
**Repita os passos 7 e 8 para cada câmera.** É a única digitação da instalação inteira — e são dois campos que o painel gera e você copia.
**Todo o resto da configuração da câmera** (qualidade, obturador, relógio, gravação no cartão) **o suporte aplica remotamente.** Não mexa nesses menus.

### Passo 9 — Instale e teste os botões
Ligue a **ponte do botão** (a pecinha branca) numa tomada do nobreak, perto do roteador. O painel vai mostrar **"Ponte conectada"**.

Prenda cada botão na **tela/alambrado da lateral, na altura do peito (1,3 m), no meio da quadra** — onde qualquer jogador alcança em 3 segundos, mas a bola não acerta direto. A tela vai pedir: **"aperte o botão da Society 1"**. Aperte. Repita para cada quadra.
Guarde o **botão reserva** na gaveta. Se um molhar ou parar, você mesmo troca em 2 minutos.

### Passo 10 — Teste final e libere
A tela mostra as 4 quadras ao vivo. Aperte cada botão uma vez. Em **até 30 segundos** os 4 vídeos aparecem na tela. Se os 4 aparecerem, está pronto: a página da sua arena já está no ar em `replayja.com.br/sua-arena`.

**Se algo não aparecer, não mexa em nada — mande print para o suporte.** Nós enxergamos as câmeras remotamente e na maioria dos casos resolvemos sem você subir no poste de novo.

**Manutenção da sua parte, e só:**
- **Limpar a lente das câmeras** com pano de microfibra a cada 6 meses, ou depois de vendaval de areia. É o que mais afeta a qualidade percebida.
- **Se a sua internet cair**, os lances daquele período **não** serão gravados na nuvem — mas ficam no cartão dentro da câmera por cerca de uma semana. **Nos avise no mesmo dia** e a gente recupera.
- **Não desligue a ponte do botão da tomada.**

---

## 8. Custos recorrentes por arena (não-BOM)

| Item | R$/mês [E] |
|---|---:|
| Reposição/RMA provisionado (6 % a.a. do CAPEX) | 52 |
| Troca de pilha de botão (CR2477, 5 anos de autonomia — rateado) | 2 |
| Limpeza de lente (2×/ano, feita pela arena) | 0 |
| **Nuvem, por arena de 4 quadras** (ver §5) | **1.205 no piloto · 347 em escala (20 arenas)** |
| Suporte remoto (rateado) | [definir com o time] |

**SLA de reposição proposto:** câmera ou botão morto → peça nova enviada em **48 h úteis**, com etiqueta de devolução. O dono troca sozinho: o botão é um clique no painel para remapear; a câmera é um cabo, dois parafusos e **os dois campos do passo 8**.

---

## 9. Incertezas e itens a cotar antes de comprar

| Item | Valor usado | O que fazer |
|---|---:|---|
| **Bloqueante: a VIP 3230 empurra RTMP para o nosso relay?** | — | **Comprar 1 unidade e testar em bancada contra `ffmpeg -listen 1 -f flv`.** Nada mais deve ser comprado antes disso (`spec-captura.md` T1) |
| **Bloqueante: homologação Anatel do ZBBridge-P e do SNZB-01P** | — | Consultar no painel da Anatel **pelo CNPJ do importador**. A marca tem homologações; estes modelos, não confirmados (`pesquisa-botao.md` §9) |
| Preço SNZB-01P | R$ 110,00 [E] | **Nenhuma fonte BR com preço** (esgotado onde apareceu). Ancorado no SNZB-01 anterior a R$ 68,85 [S]. Cotar |
| Preço do suporte VBOX 3000 P | R$ 140,00 [S] | Snippets vão de R$ 137 a R$ 159; há genéricos a R$ 25 que **não** são o VBOX. Cotar |
| Cabo CAT6 outdoor CCU 305 m | R$ 1.026,00 [F] | **Esgotado na loja cotada.** Achar segunda fonte — é o item mais caro do kit depois das câmeras |
| DPS Ubiquiti ETH-SP-G2 | R$ 99,00 [F] | Preço da loja oficial Ubiquiti BR; havia estoque esgotado em revenda. Alternativa: CLAMPER Série 800 Ethernet, R$ 173–250 [S] |
| microSD PRO Endurance 128 GB | R$ 256,44 [S] | ⚠️ **Não compre na KaBuM!**: lá o mesmo cartão está a R$ 1.050 por vendedor marketplace — cinco vezes o preço. Cotar em canal direto |
| Nobreak 600–700 VA | R$ 700,00 [E] | Modelos cotados estavam **esgotados**; faixa de mercado R$ 580–1.100 [E]. Cotar |
| Mão de obra de instalação | R$ 250–400/ponto [E] | Referência de mercado para CFTV comum: R$ 150–300/câmera [S]. Cotar em SP/RJ e no interior |
| Desconto B2B | 0 % | Nenhum preço aqui é de distribuidor. Com CNPJ e 20 unidades, espere **−15 % a −30 %** |

> ⚠️ **Alerta de canal de compra, recorrente nesta pesquisa:** vários "melhores preços" são **vendedores de marketplace com 3 meses de garantia** (o switch TP-Link na KaBuM!, o roteador Intelbras, os cartões de memória). Para equipamento que vai ficar num poste, **prefira loja direta com garantia de fábrica de 1 ano** mesmo pagando 10 % a mais. O custo de uma revisita com escada é maior que a diferença.

---

## Fontes

**Câmeras**
- [Tudo Forte — Câmera Bullet VIP 3230 B SL G3 Intelbras](https://www.tudoforte.com.br/camera-bullet-vip-3230-b-sl-g3-intelbras-de-2mp-com-30-metros-de-ir-e-tecnologia-starlight) — **R$ 893,75** PIX, estoque imediato, venda direta da loja — 12/09/2026 **[F]**
- [Netcom Segurança — VIP 3230 B SL G3](https://www.netcomseg.com.br/produto/camera-bullet-vip-3230-b-sl-g3-intelbras-full-hd-infravermelho-e-inteligencia-artificial/) — R$ 951,31 PIX (segunda fonte) — 12/09/2026 **[F]**
- [IGTech Grupo — Intelbras VIP 1230 B G5 PoE](https://www.igtechgrupo.com.br/cftv-cameras/cameras-de-seguranca/cameras-ip/camera-ip-intelbras-vip-1230-b-g5-full-hd-1080p-poe-2mp-infravermelho-30-metros) — **R$ 330,10** PIX — 12/09/2026 **[F]**
- [Processtec — Intelbras VIP 3260 Z IA (varifocal 2.7–13.5 mm, IR 60 m, PoE)](https://www.processtec.com.br/produto/camera-infra-ip-intelbras-vip-3260z-ia-ir-60m-2mp-lente-vf-2-7mm-a-13-5mm-poe) — **R$ 1.089,54** PIX, prazo de 4 dias úteis — 12/09/2026 **[F]**

**Botão**
- [MicroCWB — Sonoff ZBBridge-P (Zigbee Pro)](https://www.microcwb.com.br/produto/sonoff-bridge-p-zigbee-pro.html) — **R$ 152,00**, disponível — 12/09/2026 **[F]**
- [DJ Led Elétrica — Caixa de passagem hermética IP66 BRBOX 150×110×70](https://www.djledeletrica.com.br/) — **R$ 44,53** — 12/09/2026 **[F]**
- Sonoff SNZB-01P: preço não obtido em loja BR; [SNZB-01 (geração anterior) no Mercado Livre](https://produto.mercadolivre.com.br/MLB-1871875799-boto-de-aco-sem-fio-sonoff-zigbee-snzb-01-p-alexa-google-_JM) a R$ 68,85 [S] — 12/09/2026

**Rede e energia**
- [Intelcenter — Switch Intelbras S1105G-P (5 portas gigabit, 4 PoE+, uplink)](https://www.intelcenter.com.br/redes/switch-poe) — **R$ 371,60** PIX, em estoque — 12/09/2026 **[F]**
- [Intelbras — S1105G-P, especificações](https://www.intelbras.com/pt-br/switch-nao-gerenciavel-poe-5-portas-gigabit-ethernet-s1105g-p) — PoE+ 802.3af/at, até 30 W/porta, **56 W totais**, **PoE Extender** — 12/09/2026 **[F]**
- [LojaMundi — Injetor PoE Gigabit TP-Link TL-POE150S (802.3af)](https://www.lojamundi.com.br/energia/injetor-poe) — **R$ 118,80** PIX — 12/09/2026 **[F]**
- [Loja Ubiquiti Brasil — Protetor de Surto Ethernet ETH-SP-G2](https://br.store.ui.com/br/pt/products/ethernet-surge-protector) — **R$ 99,00** com impostos — 12/09/2026 **[F]**
- [Azul Light — Cabo CAT6 outdoor **CCU 100 % cobre**, SFTP, dupla capa, UV, 305 m](https://loja.azullight.com.br/produtos/cabo-de-rede-cat6-305-metros-ethernet-lan-giga-10-1000-ccu/) — **R$ 1.026,00** PIX (**esgotado**) — 12/09/2026 **[F]**
- [Azul Light — Cabo CAT6 outdoor CCA 305 m](https://loja.azullight.com.br/produtos/cabo-de-rede-cat6-outdoor/) — R$ 375,00 (alavanca desaconselhada, §3) — 12/09/2026 **[F]**

**Mecânica**
- [Tudo Forte — Caixa organizadora Intelbras VBOX 1100 E IP66](https://www.tudoforte.com.br/caixa-organizadora-intelbras-de-plugs-e-passagem-de-cabo-para-cftv-vbox-1100e-externa-ip66) — **R$ 23,72** PIX — 12/09/2026 **[F]**
- [Intelbras — Suporte de poste VBOX 3000 P](https://www.intelbras.com/pt-br/suporte-de-poste-para-cameras-de-cftv-vbox-3000-p) (alumínio + inox, cinta Ø80–150 mm, até 3 kg); preço R$ 137–159 em revendas [S] — 12/09/2026

**Armazenamento**
- [Samsung PRO Endurance microSDXC 128 GB no Mercado Livre](https://produto.mercadolivre.com.br/MLB-4038676437-carto-de-memoria-microsdxc-samsung-pro-endurance-128gb-_JM) — **R$ 256,44** [S] — 12/09/2026
- [SanDisk — High Endurance microSD, especificações oficiais](https://www.sandisk.com/products/memory-cards/microsd-cards/sandisk-high-endurance-uhs-i-microsd) — 12/09/2026

**Instalação**
- [FreelaSemCrise — Instalação de câmeras CFTV: quanto cobrar em 2026](https://www.freelasemcrise.com.br/quanto-cobrar/instalacao-cameras-cftv) e [Lárdii — Quanto custa instalar CFTV, preços 2026](https://lardii.com.br/blog/quanto-custa-instalar-cftv) — R$ 150–300 por câmera [S] — 12/09/2026

**Internos**
- `docs/adr/0001-stack-e-arquitetura.md` §8 — custo de nuvem (piloto R$ 1.205/mês; 20 arenas R$ 6.932/mês)
- `pesquisa-cameras.md` · `pesquisa-botao.md` · `spec-captura.md` · `pesquisa-computador-borda.md`
- `docs/concorrentes.md` — nenhum concorrente publica preço

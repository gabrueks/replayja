# Pesquisa de botão de gatilho — Replay já 2.0

> **Revisão de 12/09/2026** — reescrita para a arquitetura **sem PC na arena**. O botão não tem mais um hub de graça: ele precisa chegar até a nossa API por **webhook HTTPS**, com id do botão e carimbo de tempo. Ver `spec-captura.md` §4.
> **[F]** = fonte direta (abri a página) · **[S]** = snippet de busca · **[E]** = estimativa.

---

## 0. O que mudou, e os três achados que viram o documento do avesso

A versão anterior recomendava **Zigbee** com um dongle USB no PC de borda. Esse PC não existe mais. Com ele foram embora as três coisas que faziam o Zigbee ganhar: o coordenador de graça, a latência de rádio local e a independência da internet.

| | Antes | Agora |
|---|---|---|
| Para onde o botão fala | Dongle USB no PC da arena | **Nossa API na nuvem, por HTTPS** |
| Custo do hub | R$ 0 (aproveitava o PC) | **R$ 130–1.000 por arena**, se a tecnologia exigir hub |
| Latência | 100–400 ms (rádio local) | **250 ms – 10 s**, conforme a tecnologia |
| Funciona sem internet? | **Sim** — o clipe era cortado na arena | **Não.** Sem internet não há vídeo *nem* gatilho |
| Identidade do botão | Endereço IEEE, confiável na rede local | **Precisa provar quem é para um servidor público** — §6 |

### Os três achados da pesquisa

1. **O Shelly Button1 está descontinuado** — *"no longer produced and sold by Shelly Group"*, e a página do único revendedor brasileiro localizado retorna **404** [F]. Pior: mesmo se houvesse estoque, **a latência real medida na bateria é de 5 s, e de 9–10 s quando a URL usa hostname** (o DNS entra no caminho a cada acordar) [F, fórum oficial Shelly, medições de 2020]. O fabricante anuncia "< 2 s"; o campo diz outra coisa. **A opção "botão Wi-Fi pronto" simplesmente não existe hoje.**
2. **Praticamente nada pronto é IP65+.** Zigbee: nenhum modelo IP no Brasil. LoRaWAN: o Milesight WS101, vendido como *panic button*, é **IP30** [F]; o Dragino PB05-L é IP52. Celular: Soracom é IP54. **O padrão que funciona é rádio dentro de caixa IP66**, com o botão de contato do lado de fora.
3. **O hub voltou — e cabe num dongle de R$ 130–152.** O `Shelly BLU Gateway` (dongle USB, alimentado por qualquer porta USB de 5 V, **< 1 W**, interface web própria, **20 ações × 5 URLs**) e o `Sonoff ZBBridge-P` com Tasmota (comando `WebQuery`, que faz **POST HTTPS para URL arbitrária** — e HTTPS *só* funciona porque o ZBBridge-**P** é ESP32) resolvem o "hub sem PC" [F]. **Isso ressuscita o Zigbee**, que continua sendo a melhor física de rádio para o problema.

---

## 1. Requisitos, na nova ordem

| # | Requisito | Alvo | Notas |
|---|---|---|---|
| **B1** | Chegar à nossa API **sem um computador na arena** | obrigatório | Um dongle de < 1 W com firmware fechado não é um computador. Um Raspberry Pi é. |
| **B2** | Latência aperto → webhook na API | **< 1 s** ideal · **< 3 s** tolerável · **> 5 s reprova** | O clipe é retroativo, então a latência **não corta o lance** — ela entra no orçamento de erro do carimbo (`spec-captura.md` §4.3) e na sensação de "apertei e não aconteceu nada" |
| **B3** | Identidade comprovável | obrigatório | Endpoint público. §6 |
| **B4** | Alcance real cobrindo a quadra mais distante | obrigatório | É o item que mais falha em campo. Terreno típico de 4 quadras: 80 × 60 m |
| **B5** | Autonomia | **≥ 12 meses** | Trocar pilha é visita técnica |
| **B6** | **IP65+** | obrigatório | Bola de society a 70 km/h e chuva lateral |
| **B7** | Feedback ao atleta | confirmação de que o clipe existe | **Nenhum concorrente faz isso.** §7 |
| **B8** | Custo | **≤ R$ 400/quadra** instalado | |
| **B9** | **Anatel** | homologado | §9 — e as regras endureceram em 2025 |
| **B10** | Telemetria de bateria e "estou vivo" | desejável | Sem PC, é a única forma de saber que o botão está bem |

---

## 2. A decisão que antecede todas: qual é o gatilho principal do piloto?

**O botão virtual no celular.** Não é concessão — é a escolha certa, e o botão físico entra como complemento.

| | Botão virtual (celular) | Botão físico |
|---|---|---|
| Custo de hardware | **R$ 0** | R$ 230–310/quadra |
| Tempo até estar no ar | é código já no roadmap | compra + encapsulamento + instalação |
| Identidade | **o atleta está logado** → o clipe nasce com dono, grupo e e-mail | anônimo: só sabemos a quadra |
| Alimenta a "página do grupo" do PRD | **sim, de graça** | não |
| Latência | **200–280 ms a frio, 50–80 ms com conexão quente** [E, sobre RTT 4G de 45–60 ms no Brasil] | 0,25 s – 3 s |
| Quem consegue usar | quem já abriu o site | **qualquer um, inclusive o atleta novo** |
| Presença na quadra | nenhuma | **é o outdoor do produto** — "o que é isso aí?" |

Os dois **não competem**: o virtual dá identidade e custo zero; o físico dá adoção e presença física. **Virtual no dia 1; físico em pelo menos uma quadra do piloto, para medir adoção comparada.** Se o físico não for usado, ele sai do BOM e o custo por quadra cai **R$ 231** (`bom-e-custos.md` §3, variante "Só celular").

### 2.1 O relógio do celular é inutilizável — e isso é medido, não opinião

| Achado | Valor | Fonte |
|---|---|---|
| O Android **só corrige o relógio se o erro passar de ~5 s** — por design | limiar do AOSP | [F] AOSP / Mani et al., ACM IMC'16 |
| Sincronização SNTP: **1× por dia, 3 tentativas** | intervalo padrão 18 h | [F] IMC'16 |
| Offset medido **em celular** (referência corrigida por GPS) | **média 192 ms, desvio 55 ms, picos de 840 ms** | [F] IMC'16 |
| E o usuário pode desligar "data e hora automáticas" | — | — |

**Regra, portanto:** o carimbo do botão virtual é **sempre o da nossa API na chegada**. Para medir duração no cliente, `performance.now()` (monotônico), nunca `Date.now()`. Se um dia for preciso a hora do cliente, sincronize contra o nosso servidor por handshake — o erro cai para **½ RTT (25–40 ms em 4G brasileiro)** contra os 192 ms do relógio do sistema.

**E uma otimização barata:** pré-aqueça a conexão no `pointerdown`, não no clique (`preconnect`, HTTP/2 ou /3, keep-alive, TLS 1.3). Isso leva o POST de 200–280 ms para **50–80 ms** — o ganho não está em otimizar a requisição, está em ela já estar aberta.

---

## 3. As famílias de solução

### 3.1 Zigbee com hub de R$ 152 — **Sonoff ZBBridge-P + Tasmota** ⭐

A ponte Zigbee↔Wi-Fi da Sonoff é um **ESP32 + coordenador CC2652P** [F]. Com o firmware de fábrica ela fala com a nuvem da eWeLink — inútil para nós. Com **Tasmota**, ela fala direto com a nossa API.

**A distinção que decide o projeto** [F, documentação Tasmota]:

| Comando | URL arbitrária? | Métodos | HTTPS? |
|---|---|---|---|
| `WebSend` | ❌ concatena `cm?cmnd=` — feito para falar com outro Tasmota | GET | ❌ só HTTP |
| **`WebQuery`** | ✅ **URL completa** | **GET/POST/PUT/PATCH** | ✅ *"`https:` is only supported on ESP32s"* |

```
Rule2 ON ZbReceived#0xABCD#Power DO Backlog
  WebQuery https://api.replayja.com.br/v1/triggers POST
  [Authorization:Bearer <token-da-arena>] {"button":"0xABCD"} ENDON
```

> ⛔ **A armadilha que quebra o projeto:** o **ZBBridge não-Pro é ESP8266** → sem TLS, só HTTP. **Comprar o modelo errado inviabiliza tudo.** Só o **ZBBridge-P** (Pro) serve.

| Critério | Avaliação |
|---|---|
| Preço do hub | **R$ 152,00**, disponível [F, MicroCWB, 12/09/2026] |
| É um computador? | Não. Dispositivo de parede, firmware único, sem SO a atualizar |
| **Latência press → API** | **~250–600 ms típico, ~1,5 s na cauda** [E]: debounce/wake 30–100 ms + Zigbee 1 salto 20–50 ms + regra no ESP32 10–30 ms + TLS+POST 150–400 ms |
| Alcance | Zigbee 2,4 GHz: 50–100 m ao ar livre com visada; **mesh** — uma tomada Zigbee alimentada vira repetidor se precisar |
| Bateria do botão | **SNZB-01P: CR2477, 5 anos** [F, manual Sonoff] ✅✅ |
| ACK e telemetria | **Sim** — ACK de camada de enlace e `battery: %` reportado ✅✅ |
| **IP do botão** | ❌ **SNZB-01P não tem grau IP** (*indoor only*, −10 a +60 °C) — **exige caixa IP66** |
| **Anatel** | ✅ **Sonoff tem homologação no Brasil** (ex.: DIY MINI 07033-20-12621, MINI R2 08664-19-12621; "Shenzhen Sonoff Technologies" com dezenas de certificações) [S] — **confirmar o número do ZBBridge-P e do SNZB-01P especificamente** |
| Preço do botão | **[E] R$ 90–130** (SNZB-01P não encontrado com preço em loja BR; o SNZB-01 da geração anterior está a **R$ 68,85** [S]) |

**Veredito: é o Plano A.** Recupera tudo o que fazia o Zigbee ganhar — 5 anos de pilha, ACK, telemetria, latência de rádio — sem o PC, por R$ 152 de hub para a arena inteira.

**O preço a pagar, dito com todas as letras:** é **firmware de terceiro reflasheado por nós** num produto de consumo. Perde-se a garantia, e a atualização do Tasmota é nossa responsabilidade. Para 1–20 arenas isso é gerenciável; para 200, vira um produto a manter. O caminho de saída, quando a escala justificar, é montar a própria ponte (ESP32 + CC2652P) — que é o mesmo hardware, com o nosso nome e a nossa homologação.

### 3.2 Bluetooth com gateway de fábrica — **Shelly BLU Button1 + Shelly BLU Gateway**

O caminho sem reflash: dois produtos de prateleira, firmware original, webhook nativo.

| Critério | Avaliação |
|---|---|
| Botão — preço BR | **R$ 115,00** (R$ 109,25 no Pix), 8 unidades em estoque [F, 4Tronics, 12/09/2026] |
| Gateway — preço BR | **R$ 130,00** (R$ 123,50 no Pix) [F, 4Tronics] |
| **Precisa de PC?** | **Não.** Dongle USB-A, 5 Vdc, **< 1 W**, interface web própria em `192.168.33.1`, funciona **sem nuvem** [F, base de conhecimento Shelly] |
| Webhooks | **20 ações × até 5 URLs cada**, HTTPS com validação de cadeia de CA, **URL de até 300 caracteres**, eventos `single_push` / `double_push` / `long_push` [F] |
| Bateria | **CR2032, até 2 anos** [F] |
| Latência | *"immediate response time of fewer than 1 second"* [S, fabricante] |
| **Alcance BLE** | **10 m interno / 30 m externo** [F, documentação oficial] ❌ — **este é o problema** |
| **Grau IP do botão** | **Não especificado na documentação oficial** [F] ❌ |
| **Anatel** | ❌ **Nenhum número localizado.** As próprias lojas brasileiras **não alegam homologação** — e lojas que vendem produto homologado fazem questão de estampar o número (o caso Sonoff comprova). O padrão mais provável é importação paralela. ⚠️ |

**Veredito: Plano B, com uma ressalva pesada.** Os 30 m de alcance ao ar livre significam, numa arena de 4 quadras em 80 × 60 m, **um gateway por quadra** — R$ 130 cada, mais uma tomada USB alimentada perto de cada quadra. Isso o encarece e traz hardware alimentado para perto do campo. Funciona bem em **arena compacta ou de 1–2 quadras**.

A falta de Anatel é o bloqueio maior: **impede instalar em cliente com nota fiscal** (§9).

### 3.3 O caminho de menor latência — **Shelly i4 / Plus i4 DC + botão cogumelo IP65**

Módulo alimentado com **4 entradas de contato seco** e webhook nativo. Sem bateria, sem deep sleep, sem rádio de botão: o cogumelo IP65 fecha um contato e o módulo dispara o POST.

| Produto | Preço BR | Estoque hoje | Alimentação | Entradas |
|---|---|---|---|---|
| Shelly i4 Gen3 | **R$ 120,00** (Pix R$ 114,00) | ❌ **esgotado** | 110–240 V~ | 4 |
| Shelly Plus i4 DC | **R$ 135,00** (Pix R$ 128,25) | ❌ **esgotado** | **5–24 Vdc** | 4 |

[F, 4Tronics, 12/09/2026] · consumo < 1 W, Wi-Fi + BLE, 20 ações × 5 URLs

**Latência da ordem de centenas de milissegundos** [E] — é a melhor da lista, porque não há acordar nem associar: o módulo já está conectado.

**Por que não é o Plano A:** exige **energia e cabo até o botão**, na quadra. Onde já há um poste com energia e o botão fica nele, é a melhor solução do documento. Onde o botão vai no alambrado, no meio da lateral, não é. E ambos estão **esgotados hoje**, e sem Anatel.

> 💡 **Combinação que vale considerar no piloto:** a câmera já tem um cabo PoE chegando ao poste. Um **splitter PoE→12 V** alimentaria um `Plus i4 DC` na base do poste, com o cogumelo IP65 cabeado até a altura do peito. Custo semelhante ao Zigbee, latência muito melhor, zero pilha para trocar. **Exige teste em bancada e resolve só a quadra que tem poste com câmera** — que é justamente toda quadra nossa.

### 3.4 ESP32 próprio em caixa IP66 — **a latência é pior do que parece**

| Etapa | Tempo medido | Fonte |
|---|---|---|
| Boot pós-deep-sleep | **270 ms** | [F] medição publicada |
| Associação WPA2 com **IP estático + BSSID + canal salvos** | **900 ms** (o WPA2 sozinho custa ~700 ms) | [F] idem |
| Associação sem otimização (varredura + DHCP) | **mediana 3,9 s** | [F] benchmark ESP8266 |
| Associação com BSSID/canal salvos + `persistent` | **mediana 197 ms, mas P90 de 1.201 ms** | [F] idem |
| **Handshake TLS no ESP32-S3** | **~3.100 ms** (com *global CA store*) a **~5.900 ms** (com *CA bundle*) | [F] issue oficial do ESP-IDF |
| HTTP puro no mesmo cenário | 100–300 ms | [F] idem |

**Orçamento consolidado** [E]:

| Cenário | Total |
|---|---|
| Ingênuo (varredura + DHCP + DNS + TLS completo) | **8–10 s** ❌ |
| Otimizado (BSSID/canal na RTC, IP estático, IP fixo do servidor, TLS completo) | **2,1–2,8 s** ⚠️ |
| Otimizado + *session resumption* de TLS | **~1,4–1,5 s** ⚠️ |
| **P90 do otimizado** (quando o caminho rápido falha e cai para varredura) | **~3,1 s** |
| **ESP-NOW para um gateway** | **< 20 ms até 300 m** ao ar livre [F, medição de campo da Espressif] ✅✅ |

> 🔴 **Corrijo aqui o que eu mesmo assumia:** o gargalo do ESP32 **não é acordar nem associar — é o TLS**. Um handshake completo de 0,8 a 3 s domina tudo. O caminho para latência boa com ESP32 **não é Wi-Fi direto**: é **ESP-NOW até um gateway** (que aí mantém uma conexão TLS quente) — e um gateway é exatamente o que o ZBBridge-P já é, com o Zigbee fazendo o mesmo papel do ESP-NOW e com pilha de 5 anos.

**Energia — o consumo de repouso mata, não o aperto:**

| Peça | Deep sleep medido |
|---|---|
| **ESP32-DevKitC V4** | **3,8 mA** (!) [F] |
| ESP32 FireBeetle DFR0478 | **10 µA** [F] |
| XIAO ESP32-S3 | 13,4 µA [F] |

A 200 apertos/dia, os apertos custam ~13 mAh/dia; **um DevKitC ocioso custa 91 mAh/dia — sete vezes mais.** Ou seja: **a escolha da placa importa mais que o firmware.** Com módulo nu a ~20 µA e uma 18650, a autonomia fica em torno de **150 dias** [E, coerente com medição publicada de 152 dias] — ainda abaixo de B5, e muito abaixo dos 5 anos do Zigbee.

**BOM do protótipo** [E, preços de 12/09/2026]: ESP32-WROOM-32U com pigtail **R$ 64,90** [F, Eletrogate] + caixa IP66 BRBOX 150×110×70 **R$ 44,53** [F, DJ Led] + cogumelo IP65 **R$ 61,00** [S] + 18650 com carga ~R$ 50 [E] = **~R$ 220/quadra**.

**Veredito: não no piloto.** Custa quase o mesmo que o Zigbee, entrega latência pior, autonomia 12× menor, e vira um produto de hardware para manter — com homologação própria a pagar (§9). Vira Plano A **no dia em que houver volume**, e aí com ESP-NOW, não Wi-Fi.

### 3.5 LoRa / LoRaWAN — para quadra longe de tudo

| Critério | Avaliação |
|---|---|
| Alcance | **2–5 km urbano denso, 10–20 km com visada** [F] ✅✅ |
| **Latência** | **0,3–0,6 s em SF7–SF9** [E, sobre tempo-no-ar calculado: 46 ms em SF7, 165 ms em SF9] ✅ |
| ⚠️ Regra brasileira | O Ato Anatel 14448/2017 limita a **ocupação média de 0,4 s em janela de 20 s por canal** → **SF11 e SF12 são inviáveis**; projete o enlace para fechar em **SF10 ou melhor** [S] |
| ⚠️ Confirmação | **Uplink confirmado soma +5 s** (RX1 delay do plano LA915) [F] — **use uplink não-confirmado** |
| Bateria | **5 anos** [F, Milesight] ✅✅ |
| **IP dos botões prontos** | Milesight WS101 = **IP30** [F] ❌ · Dragino PB05-L = IP52 ❌. **A rota certa é o Dragino LDS03A / CPL01 / CPL03-LS** (invólucro *outdoor*, **entrada de contato seco**) + cogumelo IP67 cabeado — US$ 60–68,50 [F] |
| Gateway | **exige gateway próprio.** Dragino LPS8N US$ 157 · **RAK7268V2 com LTE US$ 234–244** [F] — a versão com LTE resolve "sem Wi-Fi e sem PC no local" de uma vez |
| **Rede pública** | ❌ **Não conte com ela.** A TTN tem **39 comunidades no Brasil e zero gateways conectados** [F]. A ATC/Algar cobre 286 municípios (49,8 % da população) mas vende B2B sem preço público. O caminho ProIoT/RoboCore foi **descontinuado** [F] |
| Network server | **The Things Stack Discovery: 10 dispositivos + 10 gateways, grátis, com SLA e uso comercial permitido** [F] — cobre o piloto inteiro sem custo |
| ⚠️ Armadilha de plano de canais | A TTN usa **AU915 FSB2** (canais 8–15); a Everynet/LA915 usa os **8 primeiros**. Botão configurado num não fala com o outro [F] |

**Veredito: Plano C, e só no cenário que o justifica** — complexo grande, quadras a mais de 100 m da recepção, sem Wi-Fi utilizável na ponta. Aí o gateway se paga porque a alternativa é puxar infraestrutura nova.

### 3.6 Celular — LTE-M, NB-IoT, 4G

| Critério | Avaliação |
|---|---|
| **Cobertura no Brasil** | 🔑 **LTE-M cobre 98,3 % da população** (Claro 96,6 %, Vivo 87,1 %); NB-IoT, 99,8 % [F, Teleco, mai/2026]. **É o dobro da cobertura LoRaWAN pública.** |
| **Latência** | **LTE-M: 10–100 ms de rádio** → 0,3–1,5 s fim a fim com o rádio já conectado [E]. **NB-IoT: 1,6 s a 10+ s** [F] ❌ **desqualificado** |
| ⚠️ | **PSM economiza bateria e destrói a latência** (3–10 s saindo do PSM). Use **eDRX curto**, não PSM profundo |
| Custo recorrente | **Chip M2M pré-pago Arqia de 2 MB: R$ 2,07/mês** [S] — e 2 MB cobrem **4.000–10.000 acionamentos** [E]. Multioperadora 20 MB: R$ 14,70 [F]. **Muito mais barato do que eu supunha** |
| **Produto pronto** | ❌ **Não existe com caminho comercial no Brasil.** O Soracom LTE-M Button "Powered by AWS" foi **descontinuado e parou de funcionar em 15/12/2024**; o sucessor diz *"may not be available for your region"* e é **IP54**. O Blues Notecard lista o **Brasil entre os países NÃO incluídos** no SIM embutido. A Particle **não recomenda** o B524 no Brasil [F, documentação dos próprios fabricantes] |

**Veredito: a arquitetura certa para escalar nacionalmente, sem produto para comprar hoje.** Guardar como o destino de longo prazo — ESP32 + módulo LTE-M com eDRX, chip M2M de R$ 2/mês, e nenhum hub em arena nenhuma. **Não no piloto.**

### 3.7 O que morreu

**RF 433 MHz.** Era o campeão de alcance e latência na versão anterior. Sem hub, o botão 433 não fala com ninguém — e um receptor 433→HTTPS é um gateway que teríamos de construir. **Fora.**

---

## 4. Comparação consolidada

| Opção | Custo/quadra (4 quadras) | Latência aperto → API | Sem PC? | IP66 viável? | Bateria | Anatel | Veredito |
|---|---:|---|:--:|:--:|---|:--:|---|
| **Botão virtual (celular)** | **R$ 0** | **50–280 ms** [E] | ✅ | n/a | n/a | n/a | 🏆 **gatilho principal** |
| **ZBBridge-P + SNZB-01P + caixa IP66** | **~R$ 231** [E] | **250–600 ms** [E] | ✅ | ✅ | **5 anos** | ✅ Sonoff | 🏆 **botão físico do piloto** |
| Shelly BLU Button1 + BLU Gateway | R$ 245+ [F] | < 1 s [S] | ✅ | ⚠️ sem IP | 2 anos | ❌ | Plano B |
| Shelly i4 / Plus i4 DC + cogumelo | R$ 120–135 + botão [F] | **centenas de ms** [E] | ✅ | ✅ | n/a (alimentado) | ❌ | ⭐ melhor latência; esgotado; exige energia |
| ESP32 Wi-Fi próprio IP66 | ~R$ 220 [E] | **1,4–3,1 s** [E] | ✅ | ✅ | ~150 dias | ⚠️ produto final | roadmap, e com ESP-NOW |
| LoRaWAN + gateway próprio | botão US$ 30–68 + GW US$ 157–244 | 0,3–0,6 s (SF7–9) [E] | ✅ | ✅ (contato seco) | 5 anos | ⚠️ | Plano C (quadra distante) |
| LTE-M | sem produto pronto no BR | 0,3–1,5 s [E] | ✅ | — | — | ⚠️ | destino de longo prazo |
| **Shelly Button1 Wi-Fi** | — | **5–10 s** [F] | ✅ | IPX5 | 3.000 acion. | ❌ | ⛔ **descontinuado** |

---

## 5. Recomendação

### 5.1 Plano A — **botão virtual no celular** (principal) + **Zigbee com ponte de R$ 152** (físico)

**Composição por arena de 4 quadras:**

| Item | Qtd | Unit. | Total | Conf. |
|---|---:|---:|---:|:--:|
| Ponte Zigbee **Sonoff ZBBridge-P** (com Tasmota) | 1 | R$ 152,00 | R$ 152,00 | [F] |
| Botão Zigbee **Sonoff SNZB-01P** (4 + 1 reserva) | 5 | R$ 110,00 | R$ 550,00 | [E] |
| Caixa IP66 (BRBOX/Brum 150 × 110 × 70) + membrana de silicone + suporte de tela | 5 | R$ 44,53 | R$ 222,65 | [F] |
| **Total** | | | **R$ 924,65** | |
| **Por quadra** | | | **R$ 231** | |

Cabe em B8 com folga.

**Onde cada peça fica:**
- **A ponte** vai na recepção, ao lado do roteador, numa tomada. Não vai para a quadra.
- **O botão** vai na **tela/alambrado da lateral, à altura do peito (1,3 m), no meio da quadra** — alcançável em 3 s de qualquer ponto, fora da trajetória direta da bola, e **visível** (é marketing: o atleta novo pergunta o que é aquilo).

**Encapsulamento:** o SNZB-01P não tem grau IP. Ele vai dentro da caixa IP66 com a tampa substituída por uma **membrana de silicone de 2 mm** que transmite o toque. Simples, testado em campo por muita gente, e **a caixa custa menos que o botão**.

**O que confirmar antes de comprar volume** — nesta ordem:
1. **Que o modelo é o ZBBridge-P (Pro).** O não-Pro é ESP8266 e não faz HTTPS. É o erro que mata o projeto.
2. **Que o `WebQuery` do Tasmota chega na nossa API** com POST + cabeçalho `Authorization`. Teste de bancada de 30 minutos.
3. **Homologação Anatel** do ZBBridge-P e do SNZB-01P especificamente (§9).
4. **Levantamento de RF na arena.** É o maior risco técnico desta escolha — ver §11.

### 5.2 Plano B — **Shelly BLU Button1 + BLU Gateway** (sem reflash)

Se o time decidir que não quer reflashear firmware no piloto: dois produtos de prateleira, R$ 245 para a primeira quadra, firmware original, webhook nativo com HTTPS e validação de CA.

**Os dois pesos contra:** alcance BLE de **30 m ao ar livre** (provável um gateway por quadra, com tomada) e **ausência de homologação Anatel localizável** — o que impede instalar em cliente com nota fiscal. Bom para arena compacta, de 1–2 quadras, ou para bancada.

### 5.3 Plano C — **LoRaWAN**, só no cenário que o justifica

Quadra a mais de 100 m da recepção, sem Wi-Fi que chegue. Botão **Dragino LDS03A/CPL01** (contato seco, invólucro outdoor) + cogumelo IP67 + gateway **RAK7268V2 com LTE**, e a rede rodando no plano grátis do The Things Stack Discovery (10 dispositivos, uso comercial permitido, com SLA).

### 5.4 Roadmap — **ESP32 + ESP-NOW**, depois **LTE-M**

Quando o volume justificar montagem em lote e homologação própria. Ganha-se LED de confirmação no próprio botão, dois botões (salvar lance / salvar gol), telemetria rica e custo marginal de peças menor. **Com ESP-NOW até um gateway, não Wi-Fi direto** — é a diferença entre 20 ms e 3 s. O destino final é LTE-M, que dispensa hub em qualquer arena.

### 5.5 Rejeitados, com o motivo

| | Motivo |
|---|---|
| **Shelly Button1 Wi-Fi** | Descontinuado, e 5–10 s de latência real na bateria [F] |
| **Zigbee com dongle USB em PC** (recomendação anterior) | O PC não existe mais. A ponte de R$ 152 substitui o dongle |
| **RF 433 MHz** | Precisaria de um receptor→HTTPS construído por nós |
| **NB-IoT** | 1,6 a 10 s de latência [F] |
| **Milesight WS101** | **IP30** — não serve em quadra descoberta |
| **Botão 4G pronto** | Soracom/AWS descontinuado; Blues e Particle não cobrem o Brasil |

---

## 6. Como o botão prova que é ele

Endpoint público. Sem isso, qualquer um com a URL dispara clipe em qualquer quadra o dia inteiro.

### 6.1 Com hub, a identidade muda de dono — e isso precisa ser dito

| Desenho | Quem assina | Força |
|---|---|---|
| **Botão próprio (ESP32)** | o próprio botão, com chave HMAC única gravada na NVS | **Forte.** Botão comprometido = um botão revogado |
| **Com hub (Zigbee/BLE)** | **a ponte**, com um segredo por arena | **Média.** A ponte *atesta* que o aperto veio do botão `0xABCD`; nós confiamos nela. Comprometer a ponte compromete a arena |

Isso é aceitável — a ponte fica trancada na recepção, o segredo viaja por TLS, e o pior caso é um clipe a mais, não um vazamento de dados. **Mas é uma diferença real e vale registrar**, porque é o principal argumento técnico a favor do ESP32 no futuro.

### 6.2 O contrato

```
POST /v1/triggers
Content-Type: application/json
Authorization: Bearer <segredo-da-ponte-da-arena>      ← 32 bytes aleatórios, único por ponte
webhook-id: 01924f3a-7c10-7b2e-9d41-0a1b2c3d4e5f       ← chave de idempotência
webhook-timestamp: 1789243872
```

```json
{
  "button_ref": "0x00124b0029b1c3d7",
  "arena_id": "arena-calabouco",
  "t_device_utc_ms": 1789243872180,
  "battery_pct": 64,
  "lqi": 148
}
```

### 6.3 As seis regras

| # | Regra | Por quê |
|---|---|---|
| **1** | **Um segredo por ponte** (ou por botão, quando o botão assina), 32 bytes, gerado no provisionamento. **Nunca** um segredo compartilhado entre arenas | *"Static signing secrets — a single long-lived HMAC key shared between sender and receiver — remain the default for most providers, but they are a liability at scale"* [S] |
| **2** | **`webhook-id` é a chave de idempotência** — guardado por 5 min (Redis basta). Repetição → no-op | É o mecanismo anti-replay do padrão **Standard Webhooks**, e é **o certo para dispositivo com relógio ruim** [F] |
| **3** | Janela de tolerância de **5 minutos** no timestamp | Tolerância de 0 desativa a verificação de recência; 5 min é o padrão da indústria [F, Stripe] |
| **4** | Onde o dispositivo conseguir assinar (ESP32 próprio): **HMAC-SHA256 sobre `webhook-id . timestamp . corpo`**, formato `v1,<base64>` | É o **Standard Webhooks** — mais limpo que o formato do Stripe para uma frota de muitos dispositivos, porque o `id` já está dentro do assinado |
| **5** | **Comparação em tempo constante**; rate limit por `button_ref` e por IP (§8); **lista de IPs permitidos** onde a arena tiver IP estável — as duas coisas, não uma | [F, Stripe: assinatura **e** allowlist] |
| **6** | **Nunca confiar só no TLS do dispositivo.** Tasmota e ESP32 têm validação de cadeia de certificados limitada — o token no cabeçalho é o que autentica de verdade | [E], e é o motivo de o `Authorization` existir mesmo sobre HTTPS |

**Por que Standard Webhooks e não Stripe-style aqui:** o formato do Stripe (`t=…,v1=…`, assinando `timestamp . corpo`) depende de o emissor ter relógio confiável. **A ponte Tasmota não tem** — e o botão Zigbee muito menos. O Standard Webhooks põe um **`webhook-id` único** no assinado e usa esse id como chave de idempotência, o que dá proteção contra replay **sem depender de janela de tempo apertada**. O RFC 9421 é o padrão formal e seria o caminho se houvesse integração com terceiros; para firmware nosso falando com API nossa, ele adiciona canonicalização de cabeçalhos que custa flash e bug sem ganho.

### 6.4 Mapeamento botão → quadra

No banco, não em arquivo: `button_ref (IEEE) → court_id → camera_id`. Trocar um botão queimado é **editar uma linha no painel** — sem visita técnica. Um `button_ref` desconhecido gera evento `unmapped_button` com o endereço, que é exatamente o fluxo de *"aperte o botão novo e me diga qual quadra"*. **Botão novo entra por fluxo explícito de provisionamento**, nunca por "o primeiro que aparecer".

---

## 7. Feedback ao atleta — o diferencial barato (B7)

**Nenhum concorrente confirma o clipe ao atleta.** O padrão do mercado é apertar e torcer.

| Opção | Custo | Efeito |
|---|---|---|
| **LED no próprio botão** | R$ 0 marginal — **mas só existe no ESP32 próprio** | Confirmação no lugar onde a pessoa está olhando. É o argumento mais forte a favor do ESP32 no roadmap |
| **Buzzer + strobo perto da ponte / na recepção** | [E] R$ 90 | Funciona em 1 quadra, não em 4 espalhadas |
| **Buzzer/strobo no poste da câmera** | [E] R$ 90 + energia + receptor no poste | **Ficou caro sem o PC.** Descartado no piloto |
| **Notificação no celular** | R$ 0 | Só para quem já está logado — mas cobre 100 % de quem usou o botão virtual |

**Decisão para o piloto:** **nenhum feedback físico no botão Zigbee.** O SNZB-01P não tem LED utilizável de fora da caixa, e montar um custa mais que o botão. O feedback do piloto é: **o clipe aparecendo no celular de quem usou o botão virtual**, e um **painel na recepção** mostrando os últimos clipes por quadra. Se a medição mostrar que a falta de confirmação derruba a confiança, isso vira o gatilho para o ESP32 próprio — e aí o LED vem de graça.

⚠️ **E a regra que vale sempre, quando houver confirmação:** um `200` que significa *"recebi o gatilho"* vira mentira exatamente nos momentos em que o link caiu — que é quando a confiança importa. **A API só responde `200` depois de o relay confirmar que existe material na janela pedida**; se não existir, responde `202` e o evento é registrado como gatilho órfão (`spec-captura.md` §7.5). Custa 200–400 ms e vale cada um deles.

---

## 8. Debounce, cooldown e proteção

| Parâmetro | Valor | Justificativa |
|---|---|---|
| Dedupe no servidor | mesmo `webhook-id` → no-op | Retry da ponte |
| Debounce | mesmo `button_ref` em **400 ms** → descarta | Zigbee pode duplicar; a rede também |
| Cross-source | mesma quadra, fontes diferentes, em **1,5 s** → um clipe | O atleta aperta o físico e o amigo aperta o virtual |
| **Cooldown** | **8 s** por quadra; apertos na janela viram `trigger_suppressed` + métrica | Dois clipes em < 8 s têm > 60 % de sobreposição. **8 s é chute calibrável** — se `suppressed/ok > 0,25` no piloto, o número está errado |
| Quarentena | > 6 disparos do mesmo botão em 60 s → suspende 10 min + alerta | **Botão molhado ou travado é o modo de falha mais provável** em quadra de areia sob chuva |
| Limite diário | 200 clipes/quadra/dia (*soft*) → alerta, não bloqueia | |
| Rate limit do endpoint | 30 req/min por `button_ref`, 300/min por ponte | Endpoint público |
| **Monitoração do botão** | `battery_pct < 20` → P2 · sem nenhum aperto em 48 h de operação → P2 | A telemetria do Zigbee é o que permite responder *"o botão da quadra 3 está funcionando?"* sem pedir para alguém ir lá apertar |

---

## 9. Anatel — as regras endureceram em 2025

### 9.1 O que a lei diz

| Norma | Conteúdo |
|---|---|
| **Res. CD-ANATEL 715/2019, art. 55** | *"A homologação é **pré-requisito obrigatório para a utilização e a comercialização**, no País"* [F] |
| Lei 9.472/1997 (LGT), art. 162 §2º | *"É vedada a utilização de equipamentos emissores de radiofrequência sem certificação"* [S] |
| **Res. 780/2025** (DOU 04/08/2025) | Altera o regulamento e cria **responsabilidade solidária de marketplaces** [S] |

**Não existe "isenção por baixa quantidade" para empresa.** A isenção de uso próprio vale para **uma unidade, pessoa física, vedada revenda** [F, gov.br/anatel]. Vender ou instalar 10 unidades não homologadas é infração igual a 10.000.

> ⚠️ **E o comodato não salva.** O art. 55 diz "utilização **e** comercialização". Ceder equipamento em comodato é colocá-lo em uso — a exposição diminui, não desaparece.

### 9.2 🔴 Módulo homologado **não** dispensa homologar o produto final

Este é o achado que muda o plano de escala:

> A **Res. 780/2025 revogou expressamente o art. 20 §2º da Res. 715/2019**, que era a via de reaproveitamento de certificação de módulo. *"Em regra, o produto final integrador precisa de homologação própria."* [F]

Ainda pode valer caso a caso, com OCD designado, se a certificação do módulo estiver inalterada e antena, encapsulamento, parâmetros de RF e firmware preservados. Na prática: o módulo homologado **reduz o escopo de ensaios** (não se refaz o teste de RF do rádio), mas **ainda se abre processo de homologação do produto final**.

**Consequência direta para o roadmap:** o ESP32 próprio (§3.4) carrega um custo de homologação que o Plano A não tem. **Orce isso antes de decidir montar hardware.**

### 9.3 Status por fabricante

| Fabricante | Homologado? | Evidência |
|---|---|---|
| **Sonoff** (ITEAD/Coolkit) | ✅ **Sim** | DIY MINI **07033-20-12621**, MINI R2 **08664-19-12621**; dezenas de certificações em nome de "Shenzhen Sonoff Technologies"; lojas BR estampam o número [S] |
| **Espressif ESP32-WROOM-32D** | ✅ **Sim** | **02152-20-11541**, certificado emitido pela UL do Brasil [S] |
| **Shelly** (Allterco) | ❌ **Não encontrado** | Nenhum número localizado, e as próprias lojas BR **não mencionam** Anatel [F] |
| **Milesight** | ❌ **Não encontrado** | Há distribuidor BR, sem alegação de homologação [S] |

> **A ausência de alegação é sinal forte.** Lojas que vendem produto homologado fazem questão de estampar o número — o caso Sonoff comprova —, e desde a Res. 780/2025 o código é exigido em anúncios de marketplace.
>
> **É por isso que o Plano A é Sonoff e o Plano B é Shelly**, e não o contrário: o Shelly é o produto melhor acabado, e o Sonoff é o que pode ser instalado com nota fiscal.

### 9.4 Como consultar

| O quê | Onde |
|---|---|
| Painel de consulta (por fabricante, modelo, CNPJ) | `informacoes.anatel.gov.br/paineis/certificacao-de-produtos/consulta-de-produtos` |
| Sistema SCH (por número de homologação, tempo real) | `sistemas.anatel.gov.br/sch/` |
| **Novo sistema Certifica** | **Em operação desde 08/09/2026**; o SCH *"deixará de receber novos requerimentos"* [F] |

**Formato do código:** `HHHHH-AA-FFFFF` — os 5 últimos dígitos são do **requerente**, não do fabricante. Buscar por "Shelly" ou "Milesight" tende a falhar: a homologação, quando existe, está no nome do **importador brasileiro**. **Busque pelo CNPJ do importador.**

**Custo de homologar um produto próprio:** [E] R$ 15–40 mil e 2–4 meses. É um número que entra no plano de escala, não uma surpresa no mês 6.

---

## 10. Gatilhos futuros

### 10.1 Comando de voz ("Replay!")

Sem PC na arena, a detecção de palavra-chave teria que rodar **na nuvem sobre o áudio do stream** — e decidimos **não capturar áudio** (`spec-captura.md` §2.6, D7: trilha silenciosa via *RTMP Virtual Áudio*). Reabrir isso é reabrir a LGPD de conversa de terceiros. **Não antes de 2 anos**, e a decisão é de privacidade, não técnica.

### 10.2 Detecção por IA

**É o diferencial estratégico**, e a nova arquitetura o deixou **mais fácil**: o vídeo completo já está na nuvem, 24/7, sem precisar subir nada. O modelo roda sobre o acervo do relay e produz candidatos; o corte usa exatamente o mesmo caminho de `spec-captura.md` §4, só que com `ts` vindo do detector em vez do botão.

- **Onde roda:** na nuvem, sobre o acervo. Nunca na borda — não há borda.
- **A IA não substitui o botão, acrescenta.** Se errar, o custo é um clipe a mais, não um clipe a menos.
- **O bônus que começa hoje:** **cada aperto é um rótulo humano gratuito** de "aqui aconteceu algo interessante". Registrar desde o dia 1 — `t_trigger`, quadra, esporte, **e se o clipe foi baixado ou compartilhado depois**, que é o rótulo de *qualidade*, não só de *evento*. É dataset de treino sendo construído de graça, e é a coisa mais valiosa que o piloto produz além do contrato.

---

## 11. Incertezas abertas

| Item | O que falta |
|---|---|
| **Se o atleta usa o botão virtual** | **A incerteza mais cara deste documento.** Se usar, o botão físico sai do BOM e o custo por quadra cai ~R$ 231. Se não usar, o físico é obrigatório. **Medir na primeira semana, com as duas opções no ar.** |
| **Alcance Zigbee real na arena** | **O maior risco técnico do Plano A.** Um levantamento de RF de 20 min na visita comercial resolve — e é **obrigatório antes de prometer botão físico**. Se falhar, não insista com repetidores em terreno aberto: vá para o Plano C. |
| **Preço BR do SNZB-01P** | Não encontrado com preço em loja brasileira (esgotado onde apareceu). [E] R$ 90–130, ancorado no SNZB-01 da geração anterior a R$ 68,85 [S]. **Cotar.** |
| **Homologação Anatel do ZBBridge-P e do SNZB-01P** | A marca tem homologações; **estes modelos, não confirmados.** Consultar por CNPJ do importador. **Bloqueante para instalar com nota.** |
| **`WebQuery` do Tasmota contra a nossa API** | Documentado [F], **não testado**. POST + `Authorization` + TLS. Bancada de 30 min. Bloqueante. |
| **Latência real ponta a ponta do Plano A** | Os 250–600 ms são soma de partes [E]. Medir com 100 apertos cronometrados. |
| Grau IP do Shelly BLU Button1 | Não especificado na documentação oficial [F]. |
| Disponibilidade do Shelly i4 / Plus i4 DC | **Esgotados** em 12/09/2026. Se voltarem, a combinação "splitter PoE→12 V no poste + i4 DC + cogumelo IP65" merece bancada — é a melhor latência do documento. |
| Cooldown de 8 s | Chute herdado. Calibrar por `suppressed/ok`. |
| Custo e prazo de homologação de produto próprio | [E] R$ 15–40 mil, 2–4 meses. Confirmar com consultoria **antes** de decidir montar hardware. |

---

## Fontes

**Shelly**
- [The Pi Hut — Shelly Button1](https://thepihut.com/products/shelly-button1) — *"Discontinued item"*; bateria 400 mAh; 45 × 45 × 16 mm — 12/09/2026
- [Base de conhecimento Shelly — Button1](https://kb.shelly.cloud/knowledge-base/shelly-button-1) — > 3.000 acionamentos por carga; tempo de resposta anunciado < 2 s na bateria — 12/09/2026
- [Fórum Shelly — "Shelly Button1 click reporting delay"](https://shelly-forum.com/thread/3531-shelly-button1-click-reporting-delay/) — **5 s na bateria; 9–10 s com hostname na URL; ~1 s no USB** — posts de 24/06/2020 e 08/07/2020
- [Base de conhecimento Shelly — BLU Button1](https://kb.shelly.cloud/knowledge-base/shellyblu-button1) — CR2032, até 2 anos, **10 m interno / 30 m externo**, AES-CCM — 12/09/2026
- [Base de conhecimento Shelly — BLU Gateway](https://kb.shelly.cloud/knowledge-base/shellyblu-gateway) — dongle USB 5 Vdc < 1 W, web local `192.168.33.1`, 20 ações × 5 URLs — 12/09/2026
- [Shelly — documentação de Webhook (Gen2)](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Webhook/) — HTTPS com validação de CA, 20 hooks (10 em dispositivo a bateria), URL de 300 caracteres — 12/09/2026
- [Shelly Guide — Webhooks / HTTP(S) requests](https://shelly.guide/webhooks-https-requests/) — *"No cloud needed – works completely locally"* — 12/09/2026
- [4Tronics — Shelly BLU Button1](https://loja.4tronics.com.br/produtos/shelly-blu-button1/) R$ 115,00 · [BLU Gateway](https://loja.4tronics.com.br/produtos/shelly-blu-gateway/) R$ 130,00 · [i4 Gen3](https://loja.4tronics.com.br/produtos/shelly-i4-gen3/) R$ 120,00 · [Plus i4 DC](https://loja.4tronics.com.br/produtos/shelly-plus-i4-dc-5-24-vdc-modulo-inteligente-para-controle-de-acoes-e-cenas-4-canais-de-entrada/) R$ 135,00 — 12/09/2026

**Sonoff / Tasmota / Zigbee**
- [MicroCWB — Sonoff ZBBridge-P](https://www.microcwb.com.br/produto/sonoff-bridge-p-zigbee-pro.html) — R$ 152,00, disponível — 12/09/2026
- [Tasmota — Commands (`WebQuery` vs `WebSend`)](https://tasmota.github.io/docs/Commands/) — *"`https:` is only supported on ESP32s"* — 12/09/2026
- [Tasmota — Zigbee](https://tasmota.github.io/docs/Zigbee/) — ZBBridge-P = ESP32 + CC2652P — 12/09/2026
- [Sonoff — manual do SNZB-01P](https://support.sonoff.tech/snzb-01p-usermanual/) — CR2477, 5 anos, **sem grau IP**, −10 a +60 °C — 12/09/2026
- [SmartHomeScene — Aliexpress Zigbee smart buttons tested](https://smarthomescene.com/reviews/aliexpress-zigbee-smart-buttons-tested/) — offset relativo de 357–570 ms entre modelos — 07/07/2026

**ESP32**
- [TvE's Blog — ESP32 Deep-Sleep with Periodic Wake-up](https://blog.voneicken.com/2018/lp-wifi-esp32-2/) — boot 270 ms; associação WPA2 com BSSID/canal/IP estático 900 ms; overhead do WPA2 ~700 ms
- [johnmu.com — ESP8266 Wi-Fi speed benchmark](https://johnmu.com/2022-esp8266-wifi-speed/) — mediana 197 ms com BSSID/canal salvos, **P90 de 1.201 ms**; 3,9 s sem otimização — 30/10/2022
- [espressif/esp-idf issue #10523](https://github.com/espressif/esp-idf/issues/10523) — handshake TLS de ~3.100 ms (global CA store) a ~5.900 ms (CA bundle) no ESP32-S3 — 11/01/2023
- [Espressif — ESP-NOW for outdoor applications](https://developer.espressif.com/blog/esp-now-for-outdoor-applications/) — **< 20 ms até 300 m** — 20/12/2024
- [lucidar.me — Power consumption of ESP32](https://lucidar.me/en/esp32/power-consumption-of-esp32/) — DevKitC V4 em deep sleep: **3,8 mA**; FireBeetle: 10 µA — 26/12/2023
- [Eletrogate — ESP32-WROOM-32U com antena e pigtail](https://www.eletrogate.com/) R$ 64,90 · [Curto Circuito — DOIT ESP32 WROOM-32D (Anatel 02152-20-11541)](https://curtocircuito.com.br/placa-doit-esp32-esp32-wroom-32d-wifi-bluetooth.html) R$ 62,00 (esgotado) — 12/09/2026
- [DJ Led Elétrica — caixa hermética IP66 BRBOX 150×110×70](https://www.djledeletrica.com.br/) R$ 44,53 — 12/09/2026

**LoRaWAN**
- [Milesight — WS101](https://www.milesight.com/iot/product/lorawan-sensor/ws101) e [The Things Network — device repository: WS101](https://www.thethingsnetwork.org/device-repository/devices/milesight-iot/ws101/) — **IP30**, bateria 5 anos — 12/09/2026
- [Dragino — botões LoRaWAN (PB01, PB05-L, LDS03A, CPL01, CPL03-LS)](https://shop.dragino.com/index.php?rt=product/category&path=78) e [gateways](https://shop.dragino.com/index.php?rt=product/category&path=74) — 12/09/2026
- [RAK Wireless — RAK7268V2](https://store.rakwireless.com/products/rak7268-8-channel-indoor-lorawan-gateway) — US$ 154, com LTE US$ 234–244 — 12/09/2026
- [The Things Network — spreading factors](https://www.thethingsnetwork.org/docs/lorawan/spreading-factors/) e [duty cycle](https://www.thethingsnetwork.org/docs/lorawan/duty-cycle/) — 12/09/2026
- [Everynet — plano de canais LA915A](https://ns.docs.everynet.io/channel_plans/LA915A.html) — RX1 delay de 5 s — 12/09/2026
- [The Things Industries — planos](https://www.thethingsindustries.com/stack/plans/) — Discovery: 10 dispositivos + 10 gateways, grátis, uso comercial — 12/09/2026
- [The Things Network — Brasil](https://www.thethingsnetwork.org/country/brazil/) — 39 comunidades, **zero gateways conectados** — 12/09/2026
- [Anatel — Ato 14448/2017](https://informacoes.anatel.gov.br/legislacao/atos-de-certificacao-de-produtos/2017/1139-ato-14448) — faixas 902–907,5 e 915–928 MHz; ocupação média ≤ 0,4 s em janela de 20 s

**Celular**
- [Teleco — cobertura LPWA no Brasil](https://teleco.com.br/lpwa_cobertura.asp) — LTE-M 98,3 % da população; NB-IoT 99,8 %; LoRaWAN 49,8 % — dados de mai/2026
- [Com4 — LTE-M vs NB-IoT](https://www.com4.no/en/blog/lte-m-vs-nb-iot-understanding-the-differences-and-choosing-the-right-iot-network) — LTE-M 10–100 ms; NB-IoT 1,6 s a 10+ s — atualizado 17/07/2026
- [Soracom — descontinuação do LTE-M Button "Powered by AWS"](https://changelog.soracom.io/discontinuation-of-soracom-lte-m-button-powered-by-aws-hHswo) e [LTE-M Smart Button](https://soracom.io/ltem-cellular-smart-button/) — IP54, ~2.000 cliques
- [Blues — Notecard datasheet](https://dev.blues.io/datasheets/notecard-datasheet/note-nbgl/) — Brasil na lista de países **não** incluídos
- [Particle — cellular overview](https://docs.particle.io/getting-started/hardware/cellular-overview/) — B524 não recomendado no Brasil
- [Arqia — plano pré-pago M2M 2 MB](https://marketplaceiot.arqia.com.br/loja/arqiamob/produto/m2m60-2mb/plano-pre-pago-m2m) R$ 2,07/mês [S] · [IoT Conect — chip M2M multioperadora](https://iotconect.com.br/chip-m2m-arqia-multioperadora/) R$ 14,70 (20 MB)

**Relógio e webhooks**
- [Mani et al., ACM IMC'16 — "Characterizing Smartphone Clock Behavior"](https://ix.cs.uoregon.edu/~ram/papers/IMC-2016.pdf) — offset médio de 192 ms em celular, picos de 840 ms; sync 1×/dia
- [Android — Time sources](https://source.android.com/docs/core/connect/time-source) — limiar de correção e prioridade NTP a partir do Android 12
- [nPerf — Barômetro Brasil 2026](https://media.nperf.com/files/publications/BR/BR-Barometre-Mobile-connections-nPerf-2026_7914.pdf) — latência móvel: Vivo 45,11 ms, TIM 56,05 ms, Claro 59,25 ms (abr/2025–mar/2026)
- [Standard Webhooks — especificação](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) — `webhook-id`/`webhook-timestamp`/`webhook-signature`; assinado = `msg_id.timestamp.payload`; `webhook-id` como chave de idempotência
- [Stripe — verificação de assinatura de webhook](https://docs.stripe.com/webhooks) — tolerância de 5 min, comparação em tempo constante, allowlist de IP
- [RFC 9421 — HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html) — avaliado e não adotado

**Anatel**
- [Res. CD-ANATEL 715/2019](https://www.legisweb.com.br/legislacao/?id=383825) — art. 55
- [Anatel — importação para uso próprio](https://www.gov.br/anatel/pt-br/regulado/certificacao-de-produtos/importacao-para-uso-proprio) — isenção de 1 unidade, pessoa física, vedada revenda
- [DocManagement — novo sistema Certifica em operação desde 08/09/2026](https://docmanagement.com.br/09/08/2026/homologacao-e-certificacao-de-produtos-de-telecomunicacoes-passam-a-ser-realizadas-no-sistema-certifica/)
- [YesCert — reaproveitamento de certificação de módulos IoT em 2026](https://yescert.com.br/blog/anatel/modulos-iot-2026-wifi-bluetooth-zigbee-lora-reaproveitamento/) — **a Res. 780/2025 revogou o art. 20 §2º da Res. 715/2019**

**Internos**
- `docs/PRD.md` — botão virtual no site/app; página do grupo
- `spec-captura.md` §4 — contrato do gatilho, relógio, janela e cooldown

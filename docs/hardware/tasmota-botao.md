# Botão físico — Tasmota no ZBBridge-P + Sonoff SNZB-01P

> **Para que serve:** transformar um aperto de botão sem fio, na beira da quadra,
> em um `POST` HTTPS para a nossa API — **sem computador nenhum na arena**.
>
> **A cadeia inteira:**
> `SNZB-01P` --(Zigbee)--> `ZBBridge-P com Tasmota` --(Wi-Fi + HTTPS)-->
> `https://replayja.com.br/api/triggers/b/<TOKEN>` --> clipe
>
> Contexto e por que este caminho e não outro: `pesquisa-botao.md` §3.1 e §5.1
> (decisão **D-11**). Testes de aceite: `bancada-runbook.md` **T6**.

---

## 0. Antes de tudo, três avisos

1. **O modelo tem de ser o `ZBBridge-P` (Pro).** O ZBBridge comum é ESP8266 e
   **não faz HTTPS** — o `WebQuery` dele só fala `http:`. Comprar o modelo
   errado inviabiliza o projeto. Confira na caixa: **Zigbee Bridge Pro**, com
   porta **USB-C** e chip **ESP32**.
2. **Você vai perder a garantia.** Reflashear firmware de terceiro num produto
   de consumo é uma decisão assumida (`pesquisa-botao.md` §5.1): a partir daí a
   atualização do Tasmota é responsabilidade nossa. Para 1–20 arenas isso é
   gerenciável.
3. **O botão virtual continua sendo o gatilho principal.** Se esta seção inteira
   falhar, o piloto vai para a arena assim mesmo, com o botão do celular. O
   físico é complemento — não é caminho crítico.

---

## 1. O que você precisa

- [ ] Sonoff **ZBBridge-P** (Pro)
- [ ] Sonoff **SNZB-01P** (pilha CR2477 já instalada, com a lingueta plástica)
- [ ] **Adaptador USB↔serial de 3,3 V** (CP2102, CH340 ou CH341A) com jumpers
- [ ] Chave Phillips pequena
- [ ] Notebook com **Chrome** ou **Edge** (o instalador web do Tasmota usa
      WebSerial, que o Firefox e o Safari **não** têm)
- [ ] O **token do botão**, pego no painel: **Painel → Botões** → criar botão na
      quadra 1. A URL aparece **uma vez só** — copie antes de fechar a tela.

> ⚠️ **Só 3,3 V.** Alimentar a placa com 5 V pelos pinos seriais **queima** o
> módulo. Se o seu adaptador tem jumper de tensão, confirme que está em 3V3
> antes de encostar em qualquer coisa.

---

## 2. Gravar o Tasmota no ZBBridge-P

### 2.1 Abrir

- [ ] Vire a ponte. **Sob os quatro pés de borracha** há quatro parafusos.
- [ ] Retire os parafusos e abra a carcaça.
- [ ] Localize os **pads seriais** na placa: `3V3`, `RX`, `TX`, `GND`, e um pad
      de `GPIO0` (às vezes rotulado `IO0`).

### 2.2 Ligar em modo de gravação

- [ ] Ligue o adaptador USB-serial:

| Adaptador | Placa |
|---|---|
| `GND` | `GND` |
| `TX` | `RX` |
| `RX` | `TX` |
| `3V3` | `3V3` |

> **`TX` vai no `RX` e `RX` vai no `TX`** — é o erro mais comum e o sintoma é
> "não conecta", sem mais explicação.

- [ ] **Com o cabo já ligado ao computador**, encoste uma chave de fenda ou um
      jumper entre **`GPIO0` e `GND`** e, mantendo o curto, ligue a energia da
      placa. Segure uns 3 s e solte.

> O ESP32 só entra em modo de gravação se o `GPIO0` estiver em `GND`
> **no instante em que ele liga**. Curto depois de ligado não adianta.

### 2.3 Gravar

- [ ] Abra **https://tasmota.github.io/install/** no Chrome/Edge.
- [ ] Escolha **"Tasmota32 Sonoff-ZigbeeBridgePro"**
      (arquivo `tasmota32-zbbrdgpro.factory.bin`).
- [ ] **Connect** → escolha a porta serial → **Install**.
- [ ] Espere terminar sem desconectar nada (2–4 min).

> **Não use o Tasmotizer**: ele não funciona com ESP32. O instalador web é o
> caminho.
>
> Se o instalador web não enxergar a porta, o caminho alternativo é a linha de
> comando: `esptool.py write_flash 0x0 tasmota32-zbbrdgpro.factory.bin`.

### 2.4 Sair do modo de gravação

- [ ] Desligue a energia.
- [ ] **Tire o curto do `GPIO0`** (se esqueceu, a ponte reinicia direto em modo
      de gravação e parece que o flash falhou).
- [ ] Desconecte o adaptador serial.
- [ ] Feche a carcaça e ligue a ponte na tomada pela **USB-C**.

### 2.5 Primeira configuração

- [ ] A ponte cria um Wi-Fi chamado **`tasmota-XXXX`**. Conecte o celular nele.
- [ ] Abra `http://192.168.4.1` e informe o **Wi-Fi da bancada** (2,4 GHz —
      o ESP32 não fala 5 GHz).
- [ ] A ponte reinicia e entra na sua rede. Descubra o IP dela pelo roteador ou
      pelo app **Tasmota Device Manager**. Anote: `________________`
- [ ] Abra `http://<ip-da-ponte>` no navegador.
- [ ] **Configuration → Auto-configuration** → escolha
      **"Sonoff Zigbee Bridge Pro"** na lista e aplique. É isso que liga o
      rádio Zigbee nos pinos certos. Sem esse passo, a ponte sobe mas **não
      enxerga Zigbee nenhum**.
- [ ] Reinicie (**Configuration → Restart**).

### 2.6 Higiene, antes de seguir

Abra **Console** e cole (uma linha por vez):

```
Backlog SetOption3 0; MqttHost ""
```

> `SetOption3 0` **desliga o MQTT**. Não temos broker, e a ponte fica tentando
> reconectar a cada poucos segundos para sempre — enche o log e atrapalha
> justamente quando você está tentando ler o que o botão mandou.

```
Backlog Timezone -3; NtpServer1 a.ntp.br
```

> O relógio da ponte é o que carimba o gatilho (`spec-captura.md` §4.2: a ponte
> tem NTP, o botão não tem relógio nenhum). Aqui o fuso é **−03:00 mesmo** — é
> horário para humano ler no log, não é o carimbo do vídeo.

```
Backlog FriendlyName1 replayja-ponte; Hostname replayja-ponte
```

---

## 3. Parear o SNZB-01P

- [ ] No **Console** da ponte:

```
ZbPermitJoin 1
```

> Isso abre a rede para pareamento por **60 segundos**. Para uma janela maior,
> `ZbPermitJoin 99` deixa aberta até você mandar `ZbPermitJoin 0`. **Feche
> depois** — rede Zigbee aberta aceita qualquer dispositivo.

- [ ] Puxe a lingueta plástica da pilha do SNZB-01P (se ainda estiver lá).
- [ ] No **SNZB-01P**, segure o **botão de pareamento** por **~5 s**, até o LED
      piscar. No SNZB-01**P** esse botão é **separado** do botão principal —
      é um furinho/botão na traseira, diferente da geração anterior.
- [ ] No Console, deve aparecer algo como:

```
{"ZbState":{"Status":30,"IEEEAddr":"0x00124B00...","ShortAddr":"0x1234","DeviceName":"","Endpoints":[1]}}
```

- [ ] **Anote o `ShortAddr`**: `0x________`
- [ ] Feche a rede:

```
ZbPermitJoin 0
```

- [ ] **Dê um nome ao botão** (passo que quase todo mundo pula e depois se
      arrepende):

```
ZbName 0x1234,botao_q1
```

> **Por que nomear:** o `ShortAddr` (`0x1234`) é sorteado pela rede Zigbee e
> **muda se o botão sair e voltar** — troca de pilha, ponte reiniciada, botão
> levado longe demais. Uma regra escrita contra o endereço curto para de
> funcionar naquele dia, **em silêncio**. O nome amigável sobrevive.

---

## 4. Descobrir o que o botão manda (não pule)

**Isto não é opcional, e é o motivo de este documento existir em vez de uma
linha de comando pronta.** Botão Zigbee de fabricante não usa um atributo
padrão: cada modelo (e às vezes cada revisão de firmware) reporta de um jeito.
Para o SNZB-01 aparecem na comunidade `0006!01`, `0006!02` e `0006!FD` com
valor `00`/`01`/`02` — e o **SNZB-01P é uma revisão diferente**, que ninguém
documentou para o Tasmota. **Você vai ler o que o SEU botão manda.**

- [ ] Deixe o **Console** da ponte aberto na tela.
- [ ] **Dê um toque simples** no botão. Copie a linha que apareceu:

```
_______________________________________________________________________
```

- [ ] **Dê dois toques rápidos.** Copie:

```
_______________________________________________________________________
```

- [ ] **Segure por 2 s.** Copie:

```
_______________________________________________________________________
```

A linha vai ter esta cara:

```
{"ZbReceived":{"botao_q1":{"0006!FD":"00","Endpoint":1,"LinkQuality":78}}}
```

Aqui:
- `botao_q1` → o nome que você deu (ou o `0x1234` se não deu)
- `0006!FD` → **o nome do atributo que vai na regra**
- `"00"` → o valor; costuma ser `00` = toque simples, `01` = duplo, `02` = longo

- [ ] **Escreva aqui o atributo do toque simples**, exatamente como apareceu:

```
atributo = ______________________   valor = __________
```

> ⚠️ **O `#Click` que aparece em rascunhos antigos deste projeto não é um nome
> real de atributo do Zigbee2Tasmota.** Use o que você acabou de ler.

---

## 5. A regra

A sintaxe do Tasmota, confirmada na documentação oficial:

```
WebQuery <url> <método> [<cabeçalhos>] <corpo>
```

- métodos: `GET`, `POST`, `PUT`, `PATCH`
- cabeçalhos entre colchetes, separados por `|`
- **`https:` só funciona em ESP32** — é exatamente por isso que a ponte tem de
  ser a Pro

### 5.1 A regra, com o nosso endpoint

No **Console**, uma linha só (troque o atributo pelo que você leu no §4 e o
token pelo do painel):

```
Rule1 ON ZbReceived#botao_q1#0006!FD DO WebQuery https://replayja.com.br/api/triggers/b/SEU_TOKEN_AQUI POST [Content-Type:application/json] {} ENDON
```

- [ ] Ligue a regra:

```
Rule1 1
```

- [ ] Confira que ela ficou gravada:

```
Rule1
```

> **Por que mandamos `{}` como corpo**, se a nossa API aceita corpo vazio (e ela
> aceita — está escrito no código da rota: *"corpo vazio é válido"*): porque há
> relatos recorrentes de `WebQuery` com `POST` **sem corpo** se comportando de
> forma inconsistente. Mandar `{}` custa dois bytes e tira essa dúvida do
> caminho. **Se o seu teste mostrar que sem corpo funciona, simplifique.**

> **Por que não há `Authorization`:** o segredo está **no caminho da URL**, de
> propósito. Um botão de pilha não faz HMAC. A defesa é o dano baixo (alguém
> dispara um clipe numa quadra pública), o cooldown de 8 s, o limite de taxa e a
> **revogação em um clique** no painel. Está escrito na própria rota da API.

### 5.2 Se o botão distingue simples / duplo / longo

Se o mesmo atributo vier com valores diferentes, compare o valor:

```
Rule1 ON ZbReceived#botao_q1#0006!FD=00 DO WebQuery https://replayja.com.br/api/triggers/b/SEU_TOKEN_AQUI POST [Content-Type:application/json] {} ENDON
```

O `=00` faz a regra disparar **só** no toque simples. Deixe o duplo e o longo
sem ação por enquanto: eles são o espaço reservado para "estender lance" (±8 s)
quando essa função existir.

### 5.3 Limites que vão te morder

- **Uma regra tem ~511 caracteres** no total. A URL com o token (24–48
  caracteres) cabe folgado, mas se você empilhar quatro botões numa `Rule1` só,
  vai estourar. Use `Rule1`, `Rule2` e `Rule3` (são três).
- **Tasmota tem 3 regras.** Quatro quadras numa ponte exigem juntar mais de um
  `ON ... ENDON` na mesma regra — cabe, veja §8.

---

## 6. Testar sem apertar o botão

Três formas, da mais direta para a mais completa.

### 6.1 Só o `WebQuery` (prova que a rede e o token estão certos)

No **Console**:

```
Backlog WebQuery https://replayja.com.br/api/triggers/b/SEU_TOKEN_AQUI POST [Content-Type:application/json] {}
```

**O que esperar no Console:**

```
{"WebQuery":"Done"}
```

e, em seguida, a resposta do servidor. Nossa API responde **`202`** sempre — até
quando recusa (o botão não tem como tratar erro). **`404` significa token
inexistente ou digitado errado.**

- [ ] Confirme no painel (**Painel → Botões**) que o **último sinal** mudou para
      agora, e que apareceu um clipe.

### 6.2 A regra inteira, sem o rádio (prova que a regra está certa)

Acrescente um gatilho de teste à regra, dispare por comando, e depois tire:

```
Rule2 ON Event#testebotao DO WebQuery https://replayja.com.br/api/triggers/b/SEU_TOKEN_AQUI POST [Content-Type:application/json] {} ENDON
Rule2 1
Backlog Event testebotao
```

Se isso funciona e o botão não, o problema está no **§4** (o atributo) e não na
URL nem na rede.

- [ ] Depois de testar, desligue: `Rule2 0`

### 6.3 Simular a mensagem Zigbee (prova a cadeia toda menos o rádio)

```
Backlog ZbInfo botao_q1
```

mostra os últimos valores conhecidos do botão — útil para confirmar que a ponte
ainda o enxerga sem precisar apertar nada.

---

## 7. Bateria e "estou vivo"

O SNZB-01P usa **CR2477** e o fabricante anuncia **5 anos**. Sem PC na arena,
a telemetria da ponte é a única forma de saber que o botão está bem.

```
ZbStatus3 botao_q1
```

Procure na resposta:

| Campo | O que é |
|---|---|
| `BatteryPercentage` | carga em % (cluster `0x0001`, atributo `0x0021`) |
| `BatteryVoltage` | tensão da pilha (atributo `0x0020`) |
| `LinkQuality` | qualidade do rádio, 0–255. **Abaixo de ~40 o alcance está no limite** |
| `LastSeen` | segundos desde a última mensagem |

Também dá para ver tudo de uma vez:

```
ZbInfo
```

> **Botão a pilha não reporta bateria o tempo todo** — ele dorme. O valor
> aparece quando o botão acorda (ao ser apertado) ou quando o Tasmota consegue
> perguntar. Se `BatteryPercentage` vier vazio depois do pareamento, **aperte o
> botão uma vez e pergunte de novo**. Vários botões Zigbee simplesmente não
> reportam percentual, só tensão — se for o caso, use a tensão: **CR2477 nova
> ≈ 3,0 V; abaixo de ~2,5 V, troque.**
>
> Para o painel: o campo "bateria" de **Painel → Botões** é alimentado pelo que
> a nossa API recebe. No piloto ele fica vazio — a ponte não manda bateria junto
> com o gatilho. Fechar esse laço é trabalho futuro, não bloqueia a bancada.

---

## 8. Dois botões, duas quadras

**O que muda:** nada no hardware da ponte. **Uma ponte atende a arena inteira** —
Zigbee faz malha e alcança 50–100 m ao ar livre com visada. O que muda é que
cada quadra tem **o seu próprio token** e a regra precisa distinguir os botões.

- [ ] **8.1** Crie o segundo botão no painel, **na quadra 2**. Token diferente.
- [ ] **8.2** Pareie o segundo SNZB-01P (§3) e **dê nome**: `ZbName 0x5678,botao_q2`
- [ ] **8.3** Escreva as duas na mesma regra, uma depois da outra:

```
Rule1 ON ZbReceived#botao_q1#0006!FD DO WebQuery https://replayja.com.br/api/triggers/b/TOKEN_DA_Q1 POST [Content-Type:application/json] {} ENDON ON ZbReceived#botao_q2#0006!FD DO WebQuery https://replayja.com.br/api/triggers/b/TOKEN_DA_Q2 POST [Content-Type:application/json] {} ENDON
```

- [ ] **8.4** `Rule1 1`
- [ ] **8.5** **Teste os dois e confira em qual quadra o clipe apareceu.** Este é
      o teste que importa: um token trocado entre quadras não dá erro nenhum —
      só entrega o lance da quadra 1 para quem está jogando na 2. É o tipo de bug
      que só aparece quando um cliente reclama.

**Se estourar os 511 caracteres da regra:** distribua entre `Rule1`, `Rule2` e
`Rule3` (uma quadra em cada) e ligue as três (`Rule1 1`, `Rule2 1`, `Rule3 1`).
Acima de três quadras por ponte, a saída é encurtar o caminho — ver §10.

**Identificação por quadra, resumindo:** o que separa uma quadra da outra é
**o token na URL**, não o botão. Botão trocado de lugar entre quadras exige
reescrever a regra — então **etiquete os botões fisicamente** com a quadra.

---

## 9. Tabela de sintomas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Instalador web não vê a porta | driver do adaptador, ou GPIO0 não estava em GND ao ligar | §2.2, refaça o curto **antes** de energizar |
| Grava, mas a ponte não sobe Wi-Fi | firmware errado (não o `zbbrdgpro`) | regrave com o binário certo |
| Ponte sobe, mas `ZbPermitJoin` dá erro | faltou **Auto-configuration** | §2.5 |
| Botão pareia e some | fora de alcance, ou rede fechou antes | reaproxime, `ZbPermitJoin 99`, repareie |
| Console não mostra nada ao apertar | botão não pareado, ou pilha sem contato | `ZbInfo`; tire e recoloque a pilha |
| `{"WebQuery":"Done"}` mas o painel não registra | token errado, ou revogado | recrie o botão no painel |
| Resposta `404` | token inexistente | idem |
| Nada acontece e o Console mostra erro de TLS | ponte **não** é a Pro (ESP8266) | não tem conserto: é o modelo errado |
| Funciona no `Backlog` mas não no botão | o atributo da regra está errado | volte ao §4 e use o que apareceu |
| Funcionou por semanas e parou | `ShortAddr` mudou depois de trocar a pilha | é por isso que se usa `ZbName` (§3) |
| Segundo toque em 8 s não gera clipe | **cooldown**, de propósito | não é falha |
| Latência acima de 2 s | DNS a cada acordar, ou Wi-Fi fraco na ponte | aproxime a ponte do roteador e repita as 20 medições |

---

## 10. O que não consegui confirmar

| Item | Situação |
|---|---|
| **O atributo exato do SNZB-01P no Zigbee2Tasmota** | **Não confirmado.** Fontes da comunidade divergem entre `0006!01`, `0006!02` e `0006!FD` com valor `00/01/02`, e todas se referem ao **SNZB-01** (geração anterior), não ao **01P**. Por isso o §4 manda você ler no Console em vez de copiar uma regra pronta. |
| **`WebQuery ... POST` sem corpo** | A documentação diz que o corpo é opcional, mas há relatos de comportamento inconsistente com `POST`. Mandamos `{}`. **Teste sem corpo na bancada e simplifique se funcionar.** |
| **Pads seriais do ZBBridge-P, rotulagem e posição exata** | Fonte da comunidade (parafusos sob os pés de borracha, curto `GPIO0`–`GND` ao energizar, só 3,3 V). O guia oficial do fabricante não existe — é reflash de terceiro. Confira os rótulos da **sua** placa. |
| **Se o chip Zigbee (CC2652P) precisa de atualização própria** | O Tasmota tem atualização do firmware do CC2652P, mas **não foi confirmado** se é necessária no ZBBridge-P recém-comprado. Se o pareamento funcionar de primeira, não mexa. |
| **Homologação Anatel do ZBBridge-P e do SNZB-01P** | A Sonoff tem homologações no Brasil; **estes dois modelos, não confirmados por número**. **Bloqueante para instalar em cliente com nota fiscal** (`pesquisa-botao.md` §9), não para a bancada. |
| **Alcance real na arena** | 50–100 m ao ar livre é o número do padrão Zigbee, não uma medição nossa. `LinkQuality` no §7 é a medida honesta. |
| **Latência ponta a ponta** | Os 250–600 ms de `pesquisa-botao.md` são soma de estimativas. **T6 mede.** |
| **Bateria chegando ao painel** | A ponte não envia bateria junto com o gatilho. O campo do painel fica vazio no piloto. |

---

## Fontes

- [Tasmota — Commands (`WebQuery`, `WebSend`, `Rule`)](https://github.com/tasmota/docs/blob/master/docs/Commands.md) — sintaxe `WebQuery <url> <método> [<cabeçalhos>] <corpo>`, cabeçalhos separados por `|`, *"https: is only supported on ESP32s"*
- [Tasmota — Zigbee](https://tasmota.github.io/docs/Zigbee/) — `ZbPermitJoin`, `ZbName <shortaddr>,<nome>`, `ZbInfo`, `ZbStatus`, `BatteryPercentage` (0x0001/0x0021) e `BatteryVoltage` (0x0001/0x0020), sintaxe `Rule<x> on ZbReceived#<id>#<atributo> do <ação> endon`
- [Tasmota — Rules](https://tasmota.github.io/docs/Rules/) — limite de tamanho de regra, `Rule1/2/3`, `Event`, `Backlog`
- [Tasmota Web Installer](https://tasmota.github.io/install/) — "Tasmota32 Sonoff-ZigbeeBridgePro" → `tasmota32-zbbrdgpro.factory.bin`
- [blakadder — Sonoff ZBBridge-P template](https://templates.blakadder.com/sonoff_ZBBridge-P.html) — **Configuration → Auto-configuration** após o flash
- [Tasmota Discussion #18515 — Flashing Zigbee Bridge Pro (ESP32 based) with Tasmota](https://github.com/arendst/Tasmota/discussions/18515) — Tasmotizer não serve para ESP32; usar o instalador web
- [Tasmota Discussion #24483 — Flashing the Sonoff Zigbee Bridge Pro Using a CH341A Programmer](https://github.com/arendst/Tasmota/discussions/24483) — curto `GPIO0`–`GND` ao energizar, **só 3,3 V**
- [stephengrier.com — Flashing Tasmota on a Sonoff Zigbee Bridge Pro](https://www.stephengrier.com/flashing-tasmota-on-a-sonoff-zigbee-bridge/) — quatro parafusos sob os pés de borracha, pads UART
- [Tasmota Discussion #14377 / #13538 — regras com botões Zigbee multipress](https://github.com/arendst/Tasmota/discussions/14377) — `0006!FD`, `Endpoint`, uso de `Var`/`Event` para combinar botão + tipo de toque
- [Sonoff — manual do SNZB-01P](https://support.sonoff.tech/snzb-01p-usermanual/) — CR2477, 5 anos, sem grau IP, botão de pareamento próprio
- Documentos internos: `docs/hardware/pesquisa-botao.md`, `docs/hardware/bancada-runbook.md`, `docs/hardware/spec-captura.md`, `web/app/api/triggers/b/[buttonToken]/route.ts`

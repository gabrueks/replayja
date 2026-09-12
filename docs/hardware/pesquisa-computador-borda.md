# Plano B: quando faz sentido um PC na arena — Replay já 2.0

> **Revisão de 12/09/2026.** A arquitetura mudou: **não há computador na arena**. A câmera empurra RTMP direto para o relay na AWS (sa-east-1), que grava 24/7 e corta o clipe pelo índice — ver `spec-captura.md`. O botão tem internet própria e dispara webhook HTTPS — ver `pesquisa-botao.md`.
>
> Este documento deixou de ser uma pesquisa de plataforma e virou **uma página só**: em que condições o PC de borda volta à mesa, e qual é a configuração mínima que já está pesquisada.
> **Nenhuma pesquisa nova foi feita aqui nesta revisão.** Os preços são de 12/09/2026 e não foram recotados; trate-os como ordem de grandeza.

---

## 1. Por que o PC saiu

| O que o PC de borda fazia | Quem faz agora |
|---|---|
| Ingest RTSP das câmeras | A própria câmera, empurrando RTMP |
| Buffer circular de 40 s + índice | O relay na AWS, gravando fMP4 contínuo com índice em SQLite |
| Corte do clipe de 22 s | O relay, com `-c copy` a partir do índice (é o `/clip` que já existe em produção no Sentinela) |
| Gravação da sessão completa | O relay, com retenção em dias configurável |
| Receber o gatilho do botão (Zigbee/433 por USB) | A nuvem, por webhook HTTPS direto do botão |
| Ser o hub da rede das câmeras | Injetor ou switch PoE burro + o roteador da arena |

O que se ganhou: **R$ ~3.500 por arena** (PC + NVMe + rack), zero sistema operacional para atualizar em campo, zero imagem de disco para manter, zero suporte remoto a máquina que ninguém vê.

O que se perdeu, e não é pouco: **a cópia local do vídeo**. Sem PC, quando o uplink da arena abre um buraco de 74 s — medido no relay v2 do Sentinela, e em bando, cinco câmeras no mesmo minuto — aquele vídeo simplesmente não existe. A rede de segurança virou o **microSD na câmera** (`pesquisa-cameras.md` §5.3), que é uma rede de segurança mais fraca e de recuperação manual.

---

## 2. Os três gatilhos que trazem o PC de volta

Trate cada um como uma condição de saída, verificável, e não como opinião.

### G1 — Internet ruim de verdade

Não "o dono reclama da internet": **medida**. O PC volta quando, num teste de 7 dias na arena, qualquer uma destas for verdadeira:

| Condição | Limite |
|---|---|
| Upload sustentado real | **< 6 Mbps** para 2 quadras, ou **< 12 Mbps** para 4 (ver `spec-captura.md` §8) |
| Tempo total com o link fora do ar | **> 0,5 % do horário de operação** (≈ 4 min/dia em 14 h) |
| Buracos acima de 20 s no vídeo | **> 5 por semana por câmera** |
| Perda de pacote no uplink em horário de pico | **> 1 %** |

Acima desses limites o produto não é confiável sem gravação local, e nenhuma configuração de bitrate resolve.

### G2 — Muitas quadras no mesmo local

O ponto de virada é **6 quadras**. Abaixo disso, o custo fixo do PC (~R$ 3,5 mil) não se dilui e o upload agregado ainda cabe num link comum. Acima disso:

- 6 câmeras a 3 Mbps = **18 Mbps** sustentados de upload, 24/7. Poucas arenas têm isso com folga.
- O PC passa a fazer sentido no papel de **concentrador**: grava tudo local, sobe **só os clipes** (que são minúsculos) e a sessão em substream fora do pico. O mainstream fica na arena e sobe sob demanda.
- Custo do PC dividido por 6+ quadras cai para menos de R$ 600/quadra.

### G3 — IA local com latência de tempo real

Enquanto a IA rodar **na nuvem sobre a sessão completa** (que é o plano — ver `pesquisa-botao.md` §7), não há motivo para hardware na arena. O PC só volta quando o requisito for **reagir na quadra em tempo real**: highlight instantâneo num telão, chamada automática de ponto, placar. Aí é Jetson ou RK3588, não N100 — e é outro produto, com outro preço.

---

## 3. A configuração mínima, já pesquisada

Se um dos gatilhos disparar, esta é a lista. Não pesquise de novo.

| Componente | Especificação | Preço 12/09/2026 | Conf. |
|---|---|---:|:--:|
| **Computador** | Mini PC **Intel N100/N150, 16 GB RAM**, sem Windows se possível | R$ 2.336,84 (GEEKOM Mini Air12) · faixa de varejo R$ 2.337–2.998 | [F] |
| **Disco** | NVMe **1 TB TLC** (evitar QLC), 10 % sem particionar | R$ 1.169,99 (Kingston NV3 1 TB) | [F] |
| **Switch PoE** | Intelbras **S1010F-P** (8× PoE+ 30 W, **PoE Extend 250 m**) | R$ 450–600 | [E] |
| **Nobreak** | SMS Tech 600 VA | R$ 568,17 | [S] |
| Alternativa de switch (≤ 2 quadras) | TP-Link TL-SG1008P (4× PoE+, **53 W totais**) | R$ 416,77 | [F] |

**Por que N100 e não Raspberry Pi ou RK3588** (resumo da pesquisa anterior, que continua válida):

- **Pi 5:** custa mais que um x86 mais capaz no Brasil (R$ 1.890,50 só a placa [F], ~R$ 2.400 com HAT/fonte/case), **não tem encoder H.264 por hardware**, e **não religa sozinho após queda de energia** sem hardware extra. Em arena brasileira isso é eliminatório.
- **Orange Pi 5 / RK3588:** melhor silício da lista (encode multi-stream + NPU de 6 TOPS), mas kernel vendor, FFmpeg com `rkmpp` exigindo build próprio, e **esgotado nas duas lojas brasileiras na data da pesquisa**. Não se monta cadeia de suprimento sobre isso.
- **Jetson Orin Nano:** R$ 3.500–5.000 [E] no Brasil. Só entra por G3.
- **N100:** Quick Sync, `Restore on AC Power Loss = Power On` na BIOS, watchdog de chipset `iTCO_wdt`, NVMe + baia SATA, Debian/Ubuntu padrão, reposição em qualquer lugar. É a única que fecha tudo.

**Os três ajustes que não podem ser esquecidos** (são o que separa "funciona na bancada" de "funciona 6 meses sem ninguém olhar):

1. BIOS: `Restore on AC Power Loss = Power On`.
2. `/dev/watchdog` do chipset habilitado, timeout 120 s.
3. Sistema de arquivos com journaling e a sessão gravada em **fMP4** — arquivo truncado por queda de energia continua reproduzível; MP4 clássico perde o `moov` e o segmento inteiro vira lixo.

**Onde o PC fica:** indoor, na recepção, em rack de parede pequeno e ventilado, perto do roteador. Nunca no poste, nunca em caixa selada ao ar livre. Isso resolve de graça térmico, poeira, umidade, surto e furto.

**O papel dele na arquitetura nova é diferente do antigo.** Ele **não** substitui o relay: ele vira uma **ponte com memória** — recebe RTSP das câmeras, grava local e empurra RTMP para o relay, segurando o que não coube no link. A receita de ponte sem memória está em `pesquisa-cameras.md` §4.1; com memória, é a mesma coisa mais um disco e uma fila.

---

## 4. Armazenamento, se o PC voltar

Premissa: 1080p30 H.264 a **3 Mbps** (era 4 Mbps na revisão anterior — o push a 2–3 Mbps já se mostrou suficiente na frota do Sentinela).

| Fluxo | Por câmera/hora | 4 câmeras, 14 h/dia |
|---|---|---|
| Mainstream 3 Mbps | 1,35 GB | **75,6 GB/dia** |
| Substream 512 kbps | 0,23 GB | 12,9 GB/dia |
| Clipes (23 s, ~8/h/quadra) | ~0,09 GB | ~5,0 GB/dia |

NVMe de 1 TB, reservando 150 GB para sistema/clipes/fila → **~11 dias** de sessão completa local com 4 quadras. Endurance: 75,6 GB/dia × 365 = 27,6 TB/ano contra ~320 TBW do Kingston NV3 1 TB → **~11 anos**. Folgado.

⚠️ **Nunca cartão SD para gravação contínua no PC.** Morre em semanas. (Na câmera é diferente: lá o cartão é de alta resistência, o volume é de uma câmera só, e ele é cópia de segurança, não fonte primária.)

---

## 5. Switch PoE — a nota que continua valendo mesmo sem PC

Vale para o kit sem PC também, porque as câmeras continuam sendo PoE.

| Cenário (VIP 3230 B SL G3, **< 4,6 W** cada [F datasheet], IR desligado) | Típico | Pior caso 802.3af |
|---|---|---|
| 2 câmeras | ~10 W | 26 W |
| 4 câmeras | ~20 W | **52 W** |
| 4 + 2 futuras | ~30 W | 78 W |

O **PoE Extend 250 m** do S1010F-P é o motivo de escolher Fast Ethernet em 2026: Ethernet padrão morre em **100 m**, e um poste no fundo de um terreno de 4 quadras fica facilmente a 80–140 m do rack contando a subida. O modo Extend derruba a porta para 10 Mbps — e **10 Mbps ainda cabem 3 Mbps de push**. As alternativas (fibra + conversor + fonte no poste, ou extensor PoE no meio do caminho) custam mais e acrescentam um ponto de falha alimentado no alto.

> ⚠️ **Medir o comprimento real dos cabos no levantamento, antes de enviar o kit.** É a informação que mais frequentemente derruba uma instalação remota.

---

## Fontes

*(Cotações de 12/09/2026, não recotadas nesta revisão.)*

- [Kabum / Buscapé — mini PC N100](https://www.buscape.com.br/busca/mini+pc+n100) — R$ 2.336,84 (GEEKOM Mini Air12)
- [Kabum — SSD Kingston NV3 1 TB NVMe](https://www.kabum.com.br/produto/621162/ssd-kingston-nv3-1-tb-m-2-2280-pcie-4-0-x4-nvme-leitura-6000-mb-s-gravacao-4000-mb-s-azul-snv3s-1000g) — R$ 1.169,99 PIX
- [Kabum — TP-Link TL-SG1008P](https://www.kabum.com.br/produto/202788/switch-8-portas-10-100-1000-gigabit-4-portas-poe-mesa-tl-sg1008p-tp-link) — R$ 416,77 PIX, 53 W PoE
- [Intelbras — Switch S1010F-P (8 portas PoE+, Extend 250 m)](https://www.intelbras.com/pt-br/switch-10-portas-fast-ethernet-com-8-portas-poe-s1010f-p)
- [Kabum — Nobreak SMS Tech 600 VA](https://www.kabum.com.br/produto/466272/nobreak-sms-tech-600va-6-tomadas-de-saida-115v-0029300) — R$ 568,17
- [Orix Tecnologia — Raspberry Pi 5 8 GB Anatel](https://www.orix.tec.br/raspberry-pi-5-model-b-8gb-anatel) — R$ 1.890,50 PIX
- [Curto Circuito — Orange Pi 5 Plus 32 GB/256 GB](https://curtocircuito.com.br/placa-orange-pi-5-plus-32gb-ram-256gb-emmc.html) — R$ 2.900,00 (esgotado)
- [RoboCore — NVIDIA Jetson Orin Nano Super Developer Kit](https://www.robocore.net/sbc/nvidia-jetson-orin-nano-super-developer-kit)
- Relay v2 do Sentinela — `C:\Users\gabri\Documents\monitoring\relay2\README.md`, seção "De onde vêm os segmentos longos: buraco no uplink do LOCAL"

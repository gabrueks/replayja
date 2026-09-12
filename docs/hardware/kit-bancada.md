# Kit de bancada — lista de compra (aprovado pelo Gabriel em 2026-09-12)

> Objetivo: validar em casa/escritório o caminho câmera → push RTMP → relay → clipe, e o botão físico, antes de comprar o kit da arena. Preços do `bom-e-custos.md` (varejo, 12/09/2026; [F] lido na página, [S] snippet, [E] estimativa). Compra é sua; eu não executo pagamento.

| # | Item | Modelo | Qtd | Unit. | Obs. |
|---|---|---|---|---|---|
| 1 | Câmera IP PoE | **Intelbras VIP 3230 B SL G3** | 1 | R$ 893,75 [F] | Confirmar na página do produto: "RTMP" na lista de protocolos e firmware ≥ 17-06-24. Não comprar a VIP 3230 sem "SL G3" |
| 2 | microSD alta resistência | Samsung PRO Endurance 128 GB (ou SanDisk High Endurance) | 1 | R$ 256,44 [S] | Para testar a gravação de emergência no cartão |
| 3 | Injetor PoE | Intelbras **PoE 200 AT** ou similar 802.3af/at, 1 porta | 1 | ≈ R$ 119 [F] | Na bancada não precisa do switch S1105G-P |
| 4 | Ponte Zigbee | Sonoff **ZBBridge-P** (modelo **Pro**, ESP32) | 1 | R$ 152,00 [F] | O não-Pro é ESP8266 e não faz HTTPS. Vai receber Tasmota |
| 5 | Botão Zigbee | Sonoff **SNZB-01P** | 1 | R$ 110,00 [E] | Segundo opcional para testar identificação por quadra |
| 6 | Patch cords CAT6 | 2 m e 5 m | 2 | ≈ R$ 30 | — |
| | | | | **≈ R$ 1.560** | sem frete |

## Teste de aceite do kit (o que a bancada precisa provar)
1. Câmera configurada em 1080p30, 3 Mbps, GOP 1–2 s, IR desligado, "RTMP Virtual Áudio" ligado, empurrando para o relay de teste.
2. Relay grava em fMP4 e `/clip` devolve MP4 de 22–25 s que abre no WhatsApp.
3. **T5 (bloqueante):** derrubar a rede por 2 min e por 15 min; a câmera precisa reconectar sozinha nos dois casos. Se não reconectar, testar reboot agendado.
4. Botão SNZB-01P → Tasmota → `POST /triggers/b/{token}` em < 1 s; medir latência de 20 acionamentos.
5. Emergência no microSD: com a rede derrubada, a câmera grava localmente; recuperar o trecho depois.

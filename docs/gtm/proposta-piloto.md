# Proposta comercial do piloto — Replay já 2.0

> Task D1 do `PLANO.md`. **Revisão 3 — 12/09/2026.** Decide a **decisão em aberto nº 1** do Gabriel (modelo comercial e preço-alvo).
>
> **Histórico das revisões:** a **rev. 1** foi calculada sobre a arquitetura com PC de borda. A **rev. 2** refez tudo para o BOM sem PC (CAPEX −19 %) e para a nuvem de relay (OPEX ×5,8 no piloto). A **rev. 3** incorpora a decisão do fundador de reaproveitar **Vercel e Neon já pagos por outro produto**, sem Supabase e sem Sentry — e a tabela de custos da ADR §9, que traz **um corolário que muda a disciplina de preço: depois do primeiro relay cheio, este modelo não tem economia de escala.**
>
> **Convenção de fonte:** **[F]** fonte direta · **[R]** relato · **[E]** estimativa minha.
>
> ⚠️ Nenhum concorrente publica preço — todos orçam por WhatsApp (`concorrentes.md`). Tudo sobre preço de concorrente aqui é **âncora indireta**, não benchmark.

---

## 0. O que mudou na revisão 3

| | Rev. 1 (PC de borda) | Rev. 2 (relay, stack cheia) | **Rev. 3 (relay, stack enxuta)** |
|---|---:|---:|---:|
| CAPEX instalado, 4 quadras | R$ 12.878 | R$ 10.494 | **R$ 10.494** |
| Nuvem — **piloto** | R$ 656 | R$ 1.205 | **R$ 329** (enxuto) · R$ 942 (confortável) |
| Nuvem — **6 arenas** | ~R$ 200 [E] | R$ 487 [E] | **R$ 444** [F] |
| Nuvem — **20 arenas** | R$ 149 | R$ 347 | **R$ 478** (R$ 362 com retenção de 3 d) |
| **Custo de servir, 4 q — piloto** | R$ 1.372 | R$ 1.802 | **R$ 926** |
| **Custo de servir, 4 q — 6 arenas** | — | R$ 1.084 | **R$ 1.041** |
| **Custo de servir, 4 q — 20 arenas** | R$ 774 | R$ 944 | **R$ 1.075** (R$ 959 com 3 d) |

### As três consequências

**1. 🔴 A economia de escala acabou — e isso é a notícia mais importante desta revisão.** A rev. 2 dizia que a margem se resolvia vendendo da arena 2 à 6, porque a nuvem caía de R$ 1.205 para R$ 487 por arena. **Não cai mais.** A ADR §9 é explícita: *"depois do primeiro relay cheio, este modelo não tem economia de escala relevante — disco e saída de dados crescem em linha reta com o número de câmeras, e o custo estaciona em ~R$ 450 por arena por mês."* Pior: o **piloto enxuto (R$ 329) é mais barato por arena que qualquer regime** (R$ 444–478), porque `t4g.medium` com 3 dias de retenção custa menos que a fatia de um `c7g.xlarge` com 7 dias.
>
> **A disciplina de preço que sai daí:** o preço tem que fechar a conta **a R$ 450/arena de nuvem, para sempre**. Não existe mais "depois melhora". Qualquer preço justificado por escala futura é um preço errado.

**2. 🟢 O piloto virou operacionalmente lucrativo.** Com a stack enxuta, a nuvem do piloto custa **R$ 329/mês** em vez de R$ 1.205. Contra os R$ 690 que cobramos, **o piloto gera R$ 201/mês de contribuição** — antes perdia R$ 106. O único investimento passa a ser o CAPEX de R$ 10.494, e ele **encolhe R$ 402 durante as 8 semanas** em vez de crescer.

**3. 🟡 Os preços da rev. 2 continuam de pé, mas por um motivo diferente.** A rev. 2 justificava R$ 1.890 com "42,6 % agora, 50,1 % a 20 arenas". Esse segundo número morreu. O que sustenta R$ 1.890 hoje é o custo **presente e permanente** de R$ 1.041/mês, não uma promessa de diluição. §4.1 responde à pergunta direta: **não dá para voltar a R$ 1.390.**

---

## Sumário para quem vai decidir

| | |
|---|---|
| **Recomendação** | **Modelo C — SaaS mensal tudo incluso, sem entrada e sem fidelidade.** Mantida nas três revisões (§4) |
| **Piloto (8 semanas), 4 quadras** | **R$ 690/mês** — mantido. Agora **cobre o próprio custo e sobra R$ 201/mês** |
| **Fundador pós-piloto, 4 quadras** | **R$ 1.490/mês**, 12 meses — subiu de R$ 1.390 (§4.1) |
| **Lista de regime, 4 quadras** | **R$ 1.890/mês** (R$ 473/quadra) · **piso interno documentado: R$ 1.740** |
| **Lista de regime, 2 quadras** | **R$ 1.190/mês** (R$ 595/quadra) · piso R$ 1.110 · piloto R$ 490 · fundador R$ 950 |
| **Quadra adicional (5ª a 8ª)** | **R$ 390/mês** |
| **Caixa nosso no mês 0** | **R$ 10.494** (4 quadras) · **R$ 6.435** (2 quadras) |
| **Payback** | **8,2 meses** (4 quadras) · **8,1 meses** (2 quadras) |
| **Pré-requisito de venda** | **Spike U: 48 h de medição de uplink antes de assinar, com veto** (§5.1) |
| **Alavanca de margem** | **Retenção da sessão (7 → 3 dias) e bitrate.** Já não é volume |

---

## 1. A base de custo

### 1.1 CAPEX — BOM sem PC na arena

Fonte: `docs/hardware/bom-e-custos.md`, revisão de 12/09/2026 (varejo à vista, sem desconto B2B). **Inalterado desde a rev. 2.**

| Kit | Hardware | Instalação | **Instalado** | **Por quadra** |
|---|---:|---:|---:|---:|
| **4 quadras (Padrão)** | R$ 9.194 | R$ 1.000–1.600 | **R$ 10.194 – 10.794** (uso **R$ 10.494**) | R$ 2.548 – 2.699 |
| **2 quadras (Padrão)** | R$ 5.785 | R$ 500–800 | **R$ 6.285 – 6.585** (uso **R$ 6.435**) | R$ 3.143 – 3.293 |
| 4 quadras, variante Econômica | R$ 6.239 | idem | R$ 7.239 – 7.839 | R$ 1.810 – 1.960 |
| 4 quadras, "só celular" (sem botão físico) | R$ 8.269 | idem | R$ 9.269 – 9.869 | R$ 2.317 – 2.467 |
| 1 quadra | R$ 4.029 | ~R$ 300 | R$ 4.329 | **R$ 4.329** |

Estrutura: **custo fixo por arena R$ 2.273** · **custo variável por quadra R$ 1.567**.

> **Sobre a variante "só celular":** o BOM recomenda começar o piloto sem botões físicos, para medir se o virtual basta. Economiza R$ 925 (9 % do CAPEX). **Minha posição: manter os botões no piloto.** O botão é a peça mais visível do kit, é paridade com todos os concorrentes, e tirá-lo introduz um confundidor exatamente na métrica-norte — se ninguém apertar, não saberemos se o produto falhou ou se o botão virtual não serve. Guardar a variante como resposta comercial a arena sensível a preço.

> Todo o BOM é varejo à vista. Com CNPJ e lote de 10–20 kits: **−15 % a −30 %**, e todos os paybacks melhoram na mesma proporção.

### 1.2 OPEX — a tabela nova

Fonte: `docs/adr/0001-stack-e-arquitetura.md` §9 (USD 1 = R$ 5,10, PTAX 11/09/2026). **Vercel e Neon são contas já pagas por outro produto do fundador — entra só o incremental. Não há Supabase nem Sentry.**

| | **Piloto enxuto** | Piloto confortável | **6 arenas** (1 relay cheio) | **20 arenas** (4 relays) |
|---|---:|---:|---:|---:|
| Câmeras · retenção da sessão | 4 · **3 dias** | 4 · 7 dias | 24 · 7 dias | 80 · 7 dias |
| Instância | `t4g.medium` | `c7g.large` | `c7g.xlarge` | 4× `c7g.xlarge` |
| **Total/mês** | **≈ R$ 329** | ≈ R$ 942 | ≈ R$ 2.662 | ≈ R$ 9.561 |
| **R$ por arena** | **R$ 329** | R$ 942 | **R$ 444** | **R$ 478** · *R$ 362 com 3 d* |

**Decomposição — o que compõe cada real** [F, derivado das linhas da ADR §9]:

| Linha | Piloto enxuto | 6 arenas (por arena) | Escala com |
|---|---:|---:|---|
| Instância + IPv4 | R$ 133 | R$ 94 | **arena** (uma sozinha paga o relay inteiro) |
| Disco (gp3 boot + st1 mídia) | R$ 133 | **R$ 212** | **câmera × dias de retenção** |
| Saída AWS (clipes → R2) | R$ 0 *(dentro dos 100 GB grátis)* | R$ 78 | câmera |
| Cloudflare R2 | R$ 9 | R$ 8 | câmera |
| **Plataforma compartilhada — Neon + Vercel + Resend + domínio, só o incremental** | **R$ 54** | **R$ 51** | empresa |
| **Total** | **R$ 329** | **R$ 444** | |

> 🔑 **Onde o dinheiro está, e não é onde parece.** A ADR mede: *"guardar é barato — US$ 0,086 por GB-mês; o que custa no piloto é que uma instância e um IP custam o mesmo servindo 4 câmeras ou 24."* No perfil enxuto, **instância + IP + Neon são 56 % da conta** e seriam idênticos com seis arenas. Já em regime, o **disco vira a maior linha (48 %)** e escala em linha reta com câmeras × dias de retenção. É por isso que a alavanca de margem trocou de lugar (§1.3).

**Custo mensal de servir uma arena de 4 quadras:**

| Componente | Piloto enxuto | Piloto confortável | 6 arenas | 20 arenas (7 d) | 20 arenas (3 d) |
|---|---:|---:|---:|---:|---:|
| Amortização do hardware (R$ 10.494 / 24) | 437 | 437 | 437 | 437 | 437 |
| Nuvem | **329** | 942 | **444** | **478** | **362** |
| Suporte, RMA (6 % a.a.), pilha de botão | 160 | 160 | 160 | 160 | 160 |
| **Custo total de servir** | **R$ 926** | R$ 1.539 | **R$ 1.041** | **R$ 1.075** | **R$ 959** |
| **Por quadra** | R$ 232 | R$ 385 | R$ 260 | R$ 269 | R$ 240 |

🔴 **Repare na forma da curva: ela não desce.** R$ 1.041 a seis arenas, R$ 1.075 a vinte. **O regime é o pior cenário, não o melhor** — porque sair de `t4g.medium`/3 dias para `c7g.xlarge`/7 dias custa mais do que diluir a instância economiza. **Piso absoluto: nenhum contrato de 4 quadras abaixo de R$ 1.200/mês se paga com folga em regime.** Informação interna.

### 1.3 A alavanca de margem mudou de lugar

| Alavanca | Efeito | O que custa |
|---|---|---|
| 🔴 ~~Vender da arena 2 à 6 para encher o relay~~ | **−R$ 498/arena/mês** só se o piloto estiver no perfil **confortável**. Contra o perfil enxuto (R$ 329), encher o relay **aumenta** o custo por arena em R$ 115 | **Era a tese da rev. 2. Está errada.** Continuar vendendo, obviamente — mas por receita, não por margem |
| 🟢 **Retenção da sessão: 7 → 3 dias** | **−R$ 116/arena/mês** a 20 arenas (US$ 456/mês no total). Leva o custo de servir de R$ 1.075 para R$ 959 | A sessão completa **não tem nenhum leitor hoje**. A ADR chama de *"o primeiro parafuso a girar se a margem apertar"*. ⚠️ Confirmar contra o prazo publicado na Política de Privacidade |
| 🟢 Bitrate da câmera: 3 → 2 Mbps | −R$ 70/arena/mês [E] (o disco cai ~⅓) | Qualidade visivelmente pior no fundo de quadra (`spec-captura.md` §8.4). Vender só onde o uplink obriga |
| 🟡 **Plano B: PC de borda** | OPEX de **R$ 478 → ~R$ 120/arena/mês** a 20 arenas, contra +R$ 2.800–3.500 de CAPEX | ADR §9: payback de **12 a 18 meses por arena**. **Com a curva de custo plana, este vira o caminho de margem depois do ano 1** — não mais uma contingência. Manter como opção por arena, priorizando as de uplink ruim |
| 🟡 Manter relays no perfil enxuto o máximo possível | O `t4g.medium` serve até ~5 câmeras / ~300 clipes-dia | ADR §9 dá o gatilho de troca: `CPUCreditBalance` que não se recupera à noite. **Configurar crédito em `standard`, nunca `unlimited`** |

> **A frase que precisa circular internamente:** *a margem deste negócio não vem mais de vender mais arenas — vem de guardar menos vídeo.*

---

## 2. Calibração externa (WebSearch, 12/09/2026)

### 2.1 Quanto a arena fatura

| Referência | Valor | Fonte |
|---|---|:--:|
| Aluguel de quadra de **society**, média Brasil | **R$ 100 – 250/hora** | [R] [Na Quadra](https://naquadra.com.br/alugar-quadra-de-futebol-society-em-sao-paulo-sp) |
| Aluguel de **beach tennis / futevôlei** | **R$ 70 – 120/hora** | [R] [Tecnofit](https://www.tecnofit.com.br/blog/quanto-lucra-uma-quadra-de-beach-tennis/) |
| Hora avulsa, Praia do Futuro (Fortaleza) | **R$ 59,90/hora** | [F] [Polo de Varejo Praia do Futuro](https://pvpraiadofuturo.com.br/o-guia-completo-para-jogar-beach-tennis-na-praia-do-futuro/) |
| Mensalidade de aluno em arena carioca | **R$ 149,99 – 199,99/mês** | [F] [Jornal do Estado do Rio](https://www.jornaldoestadodorio.com.br/rio-open-2026-descubra-os-melhores-lugares-para-jogar-tenis-beach-tennis-e-pickleball-no-rj/) |

**Derivação [E]:** 4 quadras × 6 h vendidas/dia × 26 dias × R$ 150 = **R$ 93.600/mês bruto**. Cenário conservador (50 %): **≈ R$ 47.000/mês**. Para 2 quadras: **≈ R$ 23.400/mês**.

| Oferta | % do faturamento conservador | Equivale a | Por quadra |
|---|---:|---|---|
| 4 quadras, piloto R$ 690 | 1,5 % | 4,6 h de quadra/mês | 1,2 h |
| 4 quadras, fundador R$ 1.490 | 3,2 % | 9,9 h de quadra/mês | 2,5 h |
| **4 quadras, lista R$ 1.890** | **4,0 %** | **12,6 h de quadra/mês** | **3,2 h** |
| 4 quadras, piso interno R$ 1.740 | 3,7 % | 11,6 h/mês | 2,9 h |
| **2 quadras, lista R$ 1.190** | **5,1 %** | 7,9 h de quadra/mês | **4,0 h** |

> A frase de fechamento é **"cerca de 3 horas de quadra por quadra por mês"**. A da rev. 1 ("menos de 2 horas") morreu e não volta.
>
> A arena de 2 quadras paga proporcionalmente mais (5,1 % contra 4,0 %) porque o custo fixo por arena não some. **Explicar, não esconder.**

### 2.2 Âncora de percepção — "isso é câmera de segurança?"

| Referência | Valor | Fonte |
|---|---|:--:|
| Kit CFTV **4 câmeras instalado** (DVR + cabos + HD 1 TB + mão de obra) | **R$ 1.800 – 3.200** | [R] [Cronoshare](https://www.cronoshare.com.br/quanto-custa/instalar-camera-seguranca), [BJSEG](https://blog.bjseg.com.br/post/quanto-custa-camera-de-seguranca-guia-2026) |
| Kit 4 câmeras IP + NVR + nobreak, pequeno comércio | **≈ R$ 2.900** | [R] [Wifisul](https://wifisul.com.br/blog/posts/quanto-custa-instalar-cameras-seguranca) |

🔴 **Continua sendo o maior risco de percepção, e continua fatal no Modelo A** — nosso kit custa R$ 10.494 instalado contra R$ 2.900 de um kit "parecido": 3,6× de diferença.

**A estratégia não muda:** nunca destacar o preço do hardware. No SaaS e no comodato o CAPEX desaparece dentro da mensalidade e a pergunta vira "vale R$ 1.890/mês?" em vez de "por que R$ 13.900 se a loja cobra R$ 2.900?".

Quando for preciso justificar: câmera Starlight **com obturador manual e GOP configurável** (a linha de consumo não expõe nenhum dos dois, e quadra à noite é o pior caso do produto — ADR §9), microSD de alta resistência em cada câmera, cabo CCU de cobre puro, DPS por linha, botão com telemetria — **R$ 4.528, 49 % do kit** (`bom-e-custos.md` §6).

### 2.3 Âncora de preço do concorrente (indireta) — o risco nº 1

| Referência | O que diz | Fonte |
|---|---|:--:|
| **Chame o VAR** | Compra com contrato de **12 meses** **ou** comodato de **24 meses** | [F] [chameovar.com.br](https://chameovar.com.br/) |
| **Chame o VAR** | *"um patrocinador pode zerar o custo do sistema"*; venda de vídeo com "receita 100 % da quadra" | [F] chameovar.com.br |
| Cota de patrocínio em arena | **R$ 500 – 2.000 por patrocinador/mês**; 4–8 cotas | [R] [Kiplay](https://kiplay.com.br/blog/como-aumentar-receita-quadra-beach-tennis) — blog de fornecedor |

**A inferência:** se o líder vende com *"um patrocinador zera o custo"* [F] e uma cota vale R$ 500–2.000/mês [R], a mensalidade dele está na ordem de **R$ 500 a R$ 2.000 por arena** [E].

🔴 **R$ 1.890 encosta no teto dessa faixa**, e a curva de custo plana significa que **não temos para onde recuar com o tempo**. O piso de R$ 1.740 (§4.1) é o quanto podemos ceder — e é pouco. É por isso que a premissa 7.1 continua sendo o risco nº 1, com a mesma ação de 40 minutos associada.

**Sobre o Clipei ("~50 % mais barato"):** se o mercado está em R$ 1.000–1.500, ele ataca em R$ 500–750 [E]. Não brigamos nessa faixa com a variante Padrão. A **variante Econômica caiu para R$ 1.810–1.960/quadra instalada**, e só serve em quadra coberta e bem iluminada — vender assim, com a limitação dita na cara.

---

## 3. Comparativo dos três modelos — arena de 4 quadras

Premissas: CAPEX **R$ 10.494**; nuvem + suporte = **R$ 604/mês** no estágio de 6 arenas (o número que vale para sempre, §0); sem impostos (§7.5).

### Modelo A — Venda do kit + mensalidade de software

| Dimensão | Número |
|---|---|
| **Entrada** | **R$ 12.900 – 15.900** (uso **R$ 13.900**) — margem de hardware R$ 3.406 (24,5 %) |
| **Mensalidade de software** | **R$ 1.190/mês.** Precisa cobrir R$ 604/mês de custo real — não é mais a taxa simbólica que era na rev. 1 (R$ 790) |
| **Payback do hardware** | **Imediato** — a arena paga o CAPEX |
| **Margem bruta mensal** | R$ 1.190 − R$ 604 = **R$ 586 (49,2 %)**, e **não melhora com escala** · mais R$ 3.406 na entrada |
| **Caixa nosso no mês 0** | **+R$ 3.406.** Giro de ~R$ 10.494 por 30–60 dias (~R$ 5.200 se cobrar 50 % na assinatura) |
| **Risco de churn** | Baixo no ativo, médio na receita. Se a arena parar de pagar, ficamos com hardware instalado **que não é nosso**. Kill-switch contratual: sem mensalidade, sem relay |
| **O que a arena sente** | 🔴🔴 **Fricção altíssima.** A oferta é **R$ 13.900 de entrada mais R$ 1.190/mês** — pior nos dois eixos. Contra o Modelo C, a arena só sai ganhando depois de **19,9 meses**, e é uma conta que o dono faz em trinta segundos |
| **Escala para 20 arenas** | **Capital: R$ 35 – 50 mil** [E] — de longe o mais leve. Regime: receita R$ 23.800/mês, custo R$ 12.760 → **margem R$ 11.040/mês (46,4 %)**, mais R$ 68 mil de margem de hardware na rampa |

> 🔑 **A arquitetura sem PC estragou o Modelo A e a rev. 3 não o resgata.** Vender o kit transfere o CAPEX — a metade *menor* da conta — e nos deixa com o OPEX, que é a maior **e que não dilui**.

### Modelo B — Comodato com fidelidade

| Dimensão | 12 meses | 24 meses |
|---|---|---|
| **Entrada** | Taxa de instalação **R$ 1.500** (cobrar sempre) | idem |
| **Mensalidade** | **R$ 2.190** | **R$ 1.590** (R$ 398/quadra) |
| **Contribuição mensal** | R$ 1.586 | R$ 986 |
| **Payback do hardware** | **5,7 meses** | **9,1 meses** |
| **Margem bruta** | Caixa 72 % · contábil (depreciação R$ 875/mês em 12 m): **R$ 711 (32 %)** | Caixa 62 % · contábil (R$ 437/mês): **R$ 549 (35 %)** |
| **Caixa nosso no mês 0** | **R$ 8.994** | **R$ 8.994** |
| **Risco de churn** | Saída no mês 6 do contrato de 24 m: recebemos ~R$ 9.540 e **o buraco de CAPEX já está praticamente fechado**. A multa de saldo não amortizado continua recomendada, mas protege pouco valor | idem |
| **O que a arena sente** | 🟡 R$ 2.190/mês assusta | 🟡 "Zero de entrada" é forte; **24 meses de fidelidade assusta** |
| **Escala para 20 arenas** | **Capital: R$ 180 mil.** Pico com rampa de 12 meses: **R$ 110 – 125 mil** [E]. Regime (24 m): receita R$ 31.800/mês, **caixa R$ 19.040/mês**, contábil R$ 10.300 (32 %) | |

> 🔑 **B protege um CAPEX que virou minoria (46 % do custo de 24 meses) pela mesma fricção de 24 meses.**

### Modelo C — SaaS mensal tudo incluso, sem entrada e sem fidelidade

| Dimensão | Número |
|---|---|
| **Entrada** | **R$ 0.** Instalação inclusa. Cancelamento com **60 dias de aviso**; equipamento volta |
| **Mensalidade** | **R$ 1.890** (R$ 473/quadra) · piso interno R$ 1.740 · quadra adicional R$ 390 |
| **Contribuição mensal** | R$ 1.286 |
| **Payback do hardware** | **8,2 meses** (7,5 meses enquanto o relay estiver no perfil enxuto). Com churn de 4 %/mês fecha com folga; com 8 %/mês ainda fecha |
| **Margem bruta mensal** | Caixa **68 %** · contábil (depreciação em 24 m): R$ 849 = **44,9 %**, estável em 43,1 % a 20 arenas |
| **Caixa nosso no mês 0** | **R$ 10.494** — o pior dos três, e sem garantia contratual |
| **Risco de churn** | Alto e sem proteção jurídica, mas a janela de exposição é de 8,2 meses. Mitigação econômica: pagamento anual antecipado com **−15 %** |
| **O que a arena sente** | 🟢 **Fricção mínima.** "Sem entrada, sem fidelidade, cancela quando quiser". Ciclo de 1–3 conversas [E], mais **1 semana de Spike U** (§5.1), que é fricção nova mas vendável como cuidado |
| **Escala para 20 arenas** | **Capital: ~R$ 224 mil** (CAPEX R$ 209.880 + ~R$ 14 mil de provisão de churn [E]). Pico: **R$ 135 – 155 mil** [E]. Exige logística reversa (~1 desinstalação/mês a 5 % de churn). Regime: receita R$ 37.800/mês, **caixa R$ 25.040/mês**, contábil R$ 16.300 (43,1 %) — **R$ 18.620 (49,3 %) com retenção de 3 dias** |

### Resumo lado a lado

| | **A — Venda + software** | **B — Comodato 24 m** | **C — SaaS sem fidelidade** |
|---|---|---|---|
| Entrada da arena | R$ 13.900 | R$ 1.500 | **R$ 0** |
| Mensalidade | R$ 1.190 | R$ 1.590 | R$ 1.890 |
| Caixa nosso no mês 0 | **+R$ 3.406** | −R$ 8.994 | −R$ 10.494 |
| Payback | imediato | 9,1 meses | 8,2 meses |
| Margem bruta caixa | 49 % | 62 % | **68 %** |
| Fricção de venda | 🔴🔴 altíssima | 🟡 média | 🟢 mínima |
| Capital para 20 arenas | **R$ 35–50 mil** | R$ 180 mil | R$ 224 mil |

---

## 4. Recomendação

> **Modelo C — SaaS mensal tudo incluso, sem entrada e sem fidelidade.** Mantida nas três revisões.

**Por quê, em cinco linhas:**

1. **O Modelo A é "R$ 13.900 de entrada *mais* R$ 1.190/mês"** — pior nos dois eixos, e a arena só sai ganhando depois de 20 meses; o Modelo B protege um CAPEX que virou minoria pela mesma fricção de 24 meses.
2. **O ponto fraco do C — caixa exposto — está no menor patamar de todas as revisões:** R$ 10.494, recuperado em 8,2 meses.
3. **A arena nº 1 não assina 24 meses** de um produto que não existe, e nós não executaríamos multa contra o nosso primeiro case — proteção de mentira custa fricção real.
4. **Com a curva de custo plana, o valor precisa ser provado mês a mês, e não prometido para depois** — é exatamente o que um contrato sem fidelidade obriga, e o que um comodato de 24 meses permite adiar.
5. **O piloto agora se paga** (§4.2), então a única razão que ainda restava para preferir um modelo de entrada alta — precisar de caixa cedo — desapareceu.

### 4.1 A pergunta direta: dá para voltar a R$ 1.390?

**Não.** O custo de servir a R$ 1.041/mês (6 arenas, e é o número permanente) não comporta:

| Preço, 4 quadras | Margem bruta a 6 arenas | Veredicto |
|---|---:|---|
| R$ 1.390 (preço da rev. 2 para fundador) | **25,1 %** | ❌ Muito abaixo dos 40 % |
| R$ 1.590 | 34,5 % | ❌ |
| **R$ 1.740** | **40,2 %** | ✅ **É o piso exato de 40 %** |
| **R$ 1.890 (lista)** | **44,9 %** | ✅ |
| R$ 2.082 | 50,0 % | — |

**Mesmo puxando a alavanca de retenção** (3 dias, nuvem R$ 326, custo de servir R$ 923), R$ 1.390 entrega só **33,6 %**. Não existe cenário em que ele chegue a 40 %.

**Então R$ 1.890 é necessário?** Tecnicamente não — **R$ 1.740 é o necessário.** Mas a resposta prática é manter a lista em **R$ 1.890 e documentar R$ 1.740 como piso**, por três razões:

1. **Autoridade de desconto explícita.** Uma lista de R$ 1.890 com piso de R$ 1.740 dá a quem vende **R$ 150 de margem de negociação com regra escrita**. Uma lista de R$ 1.740 dá zero, e a primeira arena que empurrar quebra o modelo sem ninguém perceber.
2. **Não existe recuperação futura.** Com a curva plana, um desconto concedido hoje é permanente. Descontos precisam ser decisões conscientes, não o ponto de partida.
3. **R$ 150 de diferença não move a agulha comercial** — 4,0 % contra 3,7 % do faturamento da arena. Não é aqui que a venda é ganha ou perdida.

**O que efetivamente muda na rev. 3:** o **preço de fundador sobe de R$ 1.390 para R$ 1.490**. Na rev. 2 eu justifiquei R$ 1.390 dizendo que a margem de 22 % subiria a 32 % com escala. **Essa justificativa não existe mais.** A R$ 1.490 a margem é 30,3 % — fina, mas é uma conta que se sustenta para sempre, que é o teste que importa agora.

**Para 2 quadras, a resposta é mais folgada.** Custo de servir R$ 662/mês a 6 arenas (nuvem R$ 294 [E], amortização R$ 268, suporte R$ 100):

| Preço, 2 quadras | Margem a 6 arenas | Veredicto |
|---|---:|---|
| R$ 890 (rev. 2, fundador) | 25,6 % | ❌ |
| R$ 950 | 30,3 % | 🟡 novo preço de fundador |
| **R$ 1.110** | **40,3 %** | ✅ piso |
| **R$ 1.190 (lista)** | **44,4 %** | ✅ mantido |

### 4.2 O piloto se paga

| | Rev. 2 | **Rev. 3** |
|---|---:|---:|
| Nuvem do piloto | R$ 1.205 | **R$ 329** |
| Suporte | R$ 160 | R$ 160 |
| **Custo incremental mensal** | R$ 796 | **R$ 489** |
| Preço do piloto | R$ 690 | **R$ 690** |
| **Resultado mensal** | **−R$ 106** | **+R$ 201** |
| **Investimento total nas 8 semanas** | R$ 10.706 | **R$ 10.092** (só o CAPEX, menos R$ 402 de contribuição) |

**Mantenho R$ 690**, e não baixo para os R$ 490 da rev. 1, por dois motivos. Primeiro, a R$ 490 o piloto fica exatamente no zero a zero e a escada até o fundador vira 3,0× — foi o problema que motivou a mudança na rev. 2. A R$ 690 a escada é 2,2×, que é conversa e não briga. Segundo, agora podemos dizer algo novo e verdadeiro na mesa: **o piloto cobre o próprio custo desde o primeiro mês.** Isso tira qualquer cheiro de caridade e torna o preço mais fácil de sustentar, não mais difícil.

### Tabela de preços

#### Arena de 4 quadras

| Item | Preço | Piso interno | Observação |
|---|---:|---:|---|
| **Piloto — 8 semanas, tudo incluso** | **R$ 690/mês** | R$ 590 | Contribuição de R$ 201/mês. Sai quando quiser, avisando |
| **Fundador — 12 meses após o piloto** | **R$ 1.490/mês** | R$ 1.390 | Margem 30,3 %. Subiu de R$ 1.390 (§4.1) |
| **Lista de regime** | **R$ 1.890/mês** | **R$ 1.740** | R$ 473/quadra. Margem 44,9 %, estável em 43,1 % a 20 arenas |
| **Quadra adicional (5ª a 8ª)** | **R$ 390/mês** | R$ 320 | Custo marginal R$ 180/mês → margem 54 %, payback do hardware em **5,7 meses** |
| **Pagamento anual antecipado** | **−15 %** (R$ 1.607/mês equiv.) | — | A mitigação de churn que substitui a fidelidade |

#### Arena de 2 quadras

| Item | Preço | Piso interno | Observação |
|---|---:|---:|---|
| **Piloto — 8 semanas** | **R$ 490/mês** | R$ 420 | Custo incremental ~R$ 358/mês [E] → contribuição de R$ 132 |
| **Fundador — 12 meses** | **R$ 950/mês** | R$ 890 | Margem 30,3 % |
| **Lista de regime** | **R$ 1.190/mês** | **R$ 1.110** | R$ 595/quadra. Margem 44,4 % |
| **CAPEX / payback** | R$ 6.435 / **8,1 meses** | | Contribuição de R$ 796/mês |
| **3ª e 4ª quadras** | **R$ 490/mês cada** | R$ 420 | Mais caro que a quadra adicional da arena de 4 porque a rede PoE precisa virar switch (`bom-e-custos.md` §2) |

> **A conversa honesta com a arena de 2 quadras:** ela paga **R$ 595 por quadra** contra R$ 473 da arena de 4, porque o custo fixo por arena não some. Vai aparecer se ela falar com outro dono. **Dizer antes que perguntem** — e oferecer o caminho: a 3ª quadra entra por R$ 490 e derruba a média para R$ 560.

#### Arena de 1 quadra

**Fora, e só por Modelo A.** R$ 4.329 de CAPEX para uma quadra não amortiza. Oferta: venda do kit por R$ 5.900 + R$ 690/mês de software. Não perseguir; atender se aparecer.

### Quando mudar de modelo

| Gatilho | Ação |
|---|---|
| **Arena nº 5**, ou CAPEX imobilizado > R$ 60 mil | Reavaliar. A partir daí **B (comodato 24 m)** vira o default |
| Churn > 6 %/mês nas primeiras 10 arenas | Migrar para B imediatamente e cobrar instalação |
| **Fim do ano 1, com produto validado** | 🆕 **Reavaliar o plano B (PC de borda) como caminho de margem, não como contingência.** Com a curva plana, a nuvem custa R$ 478/arena para sempre contra ~R$ 120 com PC local (ADR §9); payback de 12–18 meses. Começar pelas arenas de uplink ruim, onde já faz sentido técnico |
| Arena reprovada no Spike U mas que queremos muito | Plano B agora, com contrato de 24 meses para amortizar o PC |
| Arena de 1 quadra | Só Modelo A |
| Arena de 6–8 quadras | Manter C, **sem esperar ganho de margem por tamanho** — a nuvem é por câmera |

---

## 5. A proposta — pronta para mandar ao dono da arena

> Tom direto, pt-BR, 1 página. Trocar `[ARENA]`, `[NOME]` e datas. Versão de 4 quadras; para 2 quadras, trocar pelos números da tabela acima.

---

### Replay já — proposta de piloto para a [ARENA]

**[NOME], obrigado pela conversa.** Segue o que estou propondo, sem letra miúda.

**O que é.** Uma câmera fixa em cada quadra e um botão no alambrado. Quem faz o lance aperta o botão e os últimos 22 segundos viram um vídeo pronto para o WhatsApp e o Instagram. O atleta não paga nada e não precisa instalar aplicativo nenhum — é pelo navegador do celular.

**Antes de qualquer coisa: o teste de internet.** Nosso sistema manda o vídeo da câmera direto para a nuvem, sem computador dentro da arena. Isso significa que **a internet de vocês é a peça mais crítica da instalação** — e eu não vou vender algo que não vai funcionar. Então, antes de assinar qualquer papel, eu deixo um equipamento medindo o upload da [ARENA] por **48 horas**, incluindo pelo menos uma noite de movimento. É gratuito e não atrapalha nada. Se o resultado não passar, **eu digo não** e explico por quê — e se der para resolver com um upgrade de link, eu digo exatamente qual.

**O que a [ARENA] recebe**

- **O kit completo instalado**, em 4 quadras: 4 câmeras com visão noturna de verdade (pelada das 21h fica assistível), cartão de memória em cada câmera que guarda o lance mesmo se a internet cair, 4 botões + 1 reserva, proteção contra raio em cada linha. Nós compramos, nós instalamos, nós mantemos. **O equipamento é nosso e continua nosso.**
- **Uma página só da [ARENA]** em `replayja.com.br/[arena]`, com o nome e a marca de vocês em destaque e os dados de contato. É a página que o atleta manda no grupo — e ela leva o nome da arena junto.
- **Marca d'água da [ARENA] nos vídeos**, discreta, no canto. Se vocês não mandarem o logo, entra o nosso.
- **Página de grupo com link fixo.** A turma da segunda às 20h salva `replayja.com.br/[arena]/fut-segunda` uma vez e nunca mais garimpa horário: os lances aparecem organizados por semana, sozinhos. Ninguém no mercado faz isso hoje.
- **Painel de gestão:** câmeras online ou offline, lances por quadra por dia, quantos foram assistidos, quantos foram compartilhados e por qual canal.
- **Suporte com pessoa de verdade** no WhatsApp, e peça de reposição em até 48 horas úteis.

**O que a [ARENA] paga**

**R$ 690 por mês durante as 8 semanas do piloto.** Tudo incluso: equipamento, instalação, nuvem, suporte. **Sem entrada, sem taxa de instalação, sem fidelidade.**

Para comparar: é o equivalente a **cerca de 4,5 horas de quadra vendidas no mês inteiro**, somando as quatro.

**O que peço em troca durante o piloto**

Não é cortesia — é o que faz o piloto funcionar para os dois lados:

1. **As 48 horas de medição de internet**, antes de assinar, na semana que vocês escolherem.
2. **Internet e energia** no ponto do switch, e **upload livre de pelo menos 27 Mbps no horário de pico** com as 4 quadras ligadas (o teste diz se vocês têm; se não tiverem, ajustamos a qualidade ou o número de quadras antes de instalar, e isso fica escrito no contrato).
3. **Acesso aos postes de refletor** para montar as câmeras, caminho livre para o cabo de rede até cada uma, e meio dia de alguém da equipe acompanhando a instalação.
4. **A placa de aviso de gravação em cada quadra.** Nós fornecemos impressa, sem custo; vocês instalam e mantêm visível. **Não ligamos câmera em quadra sem a placa instalada** — é exigência da lei de proteção de dados, não escolha nossa (detalhes no Anexo de Privacidade).
5. **Os horários de escolinha e aula infantil**, para bloquearmos a gravação nesses períodos.
6. **Divulgação para os clientes de vocês**: aviso no grupo de WhatsApp de cada turma, cartaz na recepção, link nas redes da arena. **Sem isso o piloto não mede nada.**
7. **15 minutos de conversa a cada duas semanas** comigo — o que está bom, o que irrita, o que os atletas falaram.
8. **Permissão para usar o nome e a marca da [ARENA] como case.** Se o material tiver vídeo com gente reconhecível, eu peço autorização individual de cada pessoa antes — de novo, exigência da lei. Vocês aprovam tudo antes de publicar.
9. **Acesso a 3 a 5 atletas frequentes** para uma conversa de 20 minutos ao fim do piloto.

**Duração e saída**

**8 semanas**, contadas da instalação. **Vocês encerram a qualquer momento, sem multa e sem justificativa** — basta avisar. Recolhemos o equipamento em até 10 dias úteis, sem custo, e deixamos os furos tapados.

**O que acontece depois**

Sentamos com os números na mesa e vocês escolhem, sem compromisso prévio:

- **Continuar** — o preço de lista é R$ 1.890/mês pelas 4 quadras. Como vocês foram a primeira arena, **travo R$ 1.490/mês por 12 meses**. Continua sem fidelidade: 60 dias de aviso para sair, e o equipamento continua sendo nosso problema, não de vocês. Quem paga o ano inteiro adiantado tem 15 % de desconto.
- **Encerrar** — recolhemos o equipamento, sem custo, sem discussão.
- **Ampliar** — quadras 5 a 8 entram por R$ 390/mês cada.

---

#### Por que isso é receita, e não custo, para vocês

**1. O atleta vira divulgador da arena, de graça e em escala.** Cada lance compartilhado sai com a marca da [ARENA] no vídeo e com o link da página de vocês junto. Um jogador posta para os amigos dele — que são exatamente as pessoas que alugam quadra. É o único canal de marketing em que o **cliente faz a postagem por você**, no momento em que está mais empolgado. *Nós medimos isso: quantos vídeos foram compartilhados e por qual canal aparece no painel desde o primeiro dia.*

**2. Segurar quem já joga aqui custa menos que arrumar cliente novo.** Uma turma fixa de 12 pessoas na segunda à noite é receita de quadra recorrente. Quando essa turma tem um link com o histórico dos lances dela — que só existe aqui — trocar de arena passa a ter um custo que não existia. *Não estou prometendo que a agenda enche; estou dizendo que a turma que já vem fica mais difícil de perder, e o piloto vai mostrar se isso aparece nos números.*

**3. Quando existir patrocinador, o espaço é de vocês e a receita é de vocês.** O sistema já grava a partida inteira e o vídeo já sai com marca aplicada, então acrescentar uma segunda marca — do açaí da esquina, da loja de material esportivo, do posto ao lado — é uma mudança pequena, e no mercado uma cota dessas circula entre R$ 500 e R$ 2.000 por mês ([relato de mercado](https://kiplay.com.br/blog/como-aumentar-receita-quadra-beach-tennis), não verificado por nós). **Sendo honesto: isso não está no piloto e nós ainda não vendemos patrocínio nenhum.** É o passo seguinte, e quando existir, a cota é vendida por vocês, com a receita inteira de vocês. Eu entrego a ferramenta, não a promessa.

**— Gabriel · Replay já · [telefone] · [e-mail]**

---

### 5.1 Os cinco pré-requisitos contratuais

Todos vêm da arquitetura sem PC e da análise de LGPD. **Nenhum é negociável**, e três bloqueiam a ativação da câmera.

| # | Pré-requisito | Origem | Consequência se faltar |
|---|---|---|---|
| **PR1** | **Spike U — 48 h de medição de uplink antes de assinar**, cobrindo uma noite de pico, com **poder de veto nosso** | `spec-captura.md` §8.3 | **Não se assina contrato.** Speedtest não substitui: mede pico instantâneo, e o que derruba é a estabilidade sustentada às 20h de terça |
| **PR2** | **Cláusula de upload sustentado livre ≥ 2 × N × B Mbps** no pico (4 quadras a 3 Mbps = **27 Mbps**) | `spec-captura.md` §8.2 | Sem ela, respondemos por lance não gravado por falha de link que não é nossa |
| **PR3** | **Placa de sinalização visível em cada quadra**, padrão nosso, fornecida por nós | `legal/contrato-arena-anexo-lgpd.md` cl. 4 | **A câmera daquela quadra não é ativada** até recebermos **fotografia datada** da placa instalada |
| **PR4** | **Horários de escolinha e aula infantil informados**, para bloqueio de gravação | `legal/contrato-arena-anexo-lgpd.md` cl. 9 | Não há base legal confortável para captar imagem de criança (LGPD art. 14) |
| **PR5** | **Caminho livre de cabo até cada câmera**, do switch ao topo do poste | `bom-e-custos.md` §7 | Poste novo custa **+R$ 900–1.800** e vira obra, não instalação. **Descobrir na vistoria, nunca no dia** |

> **Como vender o Spike U sem que pareça burocracia:** é o único momento da venda em que **nós dizemos não**. Usar isso — *"eu não vendo pra arena onde não vai funcionar"* — é o argumento de credibilidade mais barato que temos, e nenhum concorrente que instala e sai correndo consegue copiar.

---

## 6. Riscos comerciais e nossa posição

| Risco | O que a arena vai pedir | **Nossa posição** |
|---|---|---|
| **Exclusividade territorial** | "Só eu no meu bairro" | 🟡 **Conceder estreito e barato:** exclusividade **de bairro, 12 meses, condicionada a contrato ativo, sem custo**. Nunca por cidade, estado ou prazo indeterminado. Cai com encerramento ou 30 dias de inadimplência |
| **Exclusividade de fornecedor** | — | 🟢 **Não pedir.** Arena que quer testar dois sistemas é arena engajada |
| **Cobrar do atleta** | "Posso vender o vídeo?" | 🔴 **Não no piloto.** O PRD define não-objetivo explícito ("modelo B2B: arena paga") e todo o valor depende de volume de compartilhamento — paywall mata a métrica-norte e o marketing orgânico que é o argumento nº 1 da própria arena. **Resposta:** "no piloto é grátis porque é assim que a gente descobre se funciona; depois, a monetização do atleta que faz sentido é análise por IA — coisa nova, não pedágio no que já é grátis" |
| **Vídeos brutos / sessão completa** | "Quero um HD com tudo" | 🟡 **Dentro da janela de retenção — 7 dias, não 14.** ⚠️ Corrigir em qualquer proposta já enviada. 🆕 **E a janela pode virar 3 dias:** é a maior alavanca de margem que temos (§1.3), e a sessão completa não tem leitor hoje. **Não prometer 7 dias por escrito antes de decidir isso.** Bônus a usar na venda: como a sessão fica em disco, **"estender o lance" é quase de graça e nenhum concorrente tem** |
| **Retenção do clipe: 30 ou 90 dias?** | Vai ser perguntado | 🔴 **CONFLITO ABERTO, não vender nenhum dos dois.** `PLANO.md` decisão 5 diz 90; ADR e `api/README.md` §6 (mensagem de erro visível ao usuário) dizem 30; a Política de Privacidade já foi escrita com 90. Publicar prazo que o sistema não cumpre é violação do art. 6º, V. **Decidir antes da primeira assinatura** |
| **"O equipamento é meu no fim?"** | Comum | 🔴 **Não.** No Modelo C o equipamento é nosso do primeiro ao último dia. Quem quiser ser dono compra pelo Modelo A e paga R$ 13.900. Ter os dois caminhos transforma a objeção em escolha |
| **Guerra de preço (Clipei, "−50 %")** | "Fulano me cobra metade" | 🟡 **Não cobrir preço com a variante Padrão** — e agora há **piso escrito: R$ 1.740** (§4.1). A **variante Econômica (R$ 1.810–1.960/quadra instalada)** é a resposta, e só serve em quadra coberta e bem iluminada. Reancorar no que o barato não tem: vídeo utilizável à noite, cartão que salva o lance na queda de internet, página do grupo, marca d'água. **Se a arena decidir por preço puro, deixar ir** |
| **Uplink insuficiente no Spike U** | "Mas eu tenho 500 mega!" | 🟡 **Três saídas, nenhuma é "vamos tentando"**: (a) contrato com **2 Mbps por câmera** e/ou menos quadras; (b) upgrade de link **pago pela arena** como pré-condição; (c) **plano B com PC de borda** e contrato de 24 meses. Explicar que "500 mega" é download |
| **Inadimplência** | Arena atrasa | 🟡 Aviso no dia 5, suspensão no dia 15 (⚠️ **sem PC na arena, suspender o relay significa parar de gravar** — o microSD da câmera guarda dias, não semanas), recolhimento a partir do dia 45 |

### 6.1 LGPD — controladoria conjunta

🔴 **A rev. 1 estava errada.** Ela dizia *"a arena é controladora e nós somos operadores"*. A `analise-lgpd.md` §5 rejeitou essa construção, com razão. **Se o contrato for assinado com a cláusula errada, ele precisa ser aditado depois.**

**Por que não se sustenta:** controlador é quem toma as decisões do tratamento (art. 5º, VI). Quem decide que a gravação é contínua, que o gatilho salva 22 s, quanto tempo tudo fica guardado, **que qualquer usuário logado do Brasil inteiro pode ver o clipe**, que existe download e compartilhamento, e onde os dados ficam? **Nós.** A arena não nos instrui: ela contrata um produto pronto cujas regras são nossas.

> **Posição correta: controladoria conjunta** (art. 5º, VI c/c art. 42, § 1º, I) para a captação e a disponibilização de imagem; **Replay já como controlador único** para conta, autenticação, grupos, telemetria e segurança; **arena como controladora única** para o que ela faz por fora.

| | |
|---|---|
| 🔴 **Responsabilidade solidária** perante o titular (art. 42, § 1º, I) | **Não é negociável por contrato perante o titular.** O contrato só distribui o regresso. Explicar verbalmente, não enterrar |
| **Obrigações próprias da arena** | Instalar e manter a sinalização (PR3), exibir o aviso curto na reserva, **encaminhar pedido de titular em até 24 h**, informar horários de escolinha (PR4), **não usar clipe em publicidade sem autorização escrita e individual**, comunicar incidente em 24 h |
| **O que nós fornecemos** | Sinalização impressa, canal público ao titular, execução técnica da remoção, registro de operações, RIPD, resposta à ANPD, **encarregado (DPO) nominal** com canal publicado — `privacidade@replayja.com.br` |
| **Base legal** | **Legítimo interesse** (art. 7º, IX) com LIA documentado — **não consentimento**, que seria impossível de coletar de 20 pessoas em quadra e que, se inválido, derruba a operação de uma vez |
| ⚠️ **Marca d'água** | **Discreta, em canto, nunca sobre a pessoa, nunca com chamada comercial.** Súmula 403 do STJ: uso de imagem com fim econômico sem autorização gera dano moral **presumido**. Limita o que podemos prometer no pitch |
| ⚠️ **"Usar como case"** | Nome e marca da arena: livre. **Peça com pessoa identificável exige consentimento individual** (art. 7º, I + CC art. 20) |
| **Menores** | Sem base confortável (art. 14). **Bloquear a escolinha é a mitigação** (PR4). Pedido de responsável: **24 h**, prioridade máxima, sem verificação adicional |
| 🆕 **Ganho colateral da câmera escolhida** | A VIP 3230 B SL G3 permite empurrar **trilha de áudio silenciosa** ("RTMP Virtual Áudio"), o que **elimina a captura de áudio ambiente** — na linha Mibo o áudio é obrigatório para o RTMP funcionar, e isso seria um problema de LGPD (ADR §9). **Um risco a menos, de graça** |

> ⚠️ Os documentos existem em `docs/legal/`. O que falta é **revisão por advogado** — a própria análise marca vários pontos com `[REVISAR COM ADVOGADO]`. **Não assinar o primeiro contrato antes disso.**

---

## 7. Premissas — e quais delas mudariam a decisão

| # | Premissa | Grau | Impacto se estiver errada |
|---|---|---|---|
| **7.1** | **O mercado pratica R$ 500–2.000/arena/mês** [F chameovar × R Kiplay] | 🔴🔴 **Risco nº 1** | R$ 1.890 encosta no teto, **e a curva de custo plana significa que não temos para onde recuar com o tempo** — o piso é R$ 1.740 e acabou. **Ação de 40 minutos: pedir orçamento por WhatsApp a 3 concorrentes, como dono de arena de 4 quadras.** Continua sendo o maior retorno por esforço do documento |
| **7.2** | **Nuvem: R$ 329 no piloto enxuto, R$ 444 a 6 arenas, R$ 478 a 20** | 🟢 [F] ADR §9 | Muito mais sólido que na rev. 2, que dependia de uma interpolação minha. **A incerteza que resta é operacional:** se o `t4g.medium` não aguentar (ADR dá o gatilho: `CPUCreditBalance` que não se recupera), o piloto vai para R$ 942 e a contribuição de R$ 201/mês vira −R$ 412 |
| **7.3** | **Custo de suporte/RMA de R$ 160/arena/mês** | 🟡 [E] não observado | Se dobrar, a margem a 6 arenas cai de 44,9 % para 36,4 % — **e agora não há escala para compensar**. Virou mais importante que era |
| **7.4** | **Nuvem de R$ 294/mês para arena de 2 quadras** | 🟡 [E] minha, derivada das linhas da ADR | Se for R$ 400, a margem a R$ 1.190 cai de 44,4 % para 35,5 % e o piso da oferta de 2 quadras sobe para R$ 1.250 |
| **7.5** | **Impostos fora da conta** | 🔴 Vazio conhecido | Simples Anexo III (~6 a 11,2 %): R$ 1.890 vira ~R$ 1.700 líquidos e o payback vai de 8,2 para **9,1 meses**. Não muda o modelo, **mas precisa entrar antes de assinar**. Risco extra: o comodato pode ser reclassificado como locação de bens móveis |
| **7.6** | **Recuperação de 50–60 % do kit em desinstalação** | 🔴 [E] chute | Importa menos: a janela de exposição é de 8,2 meses. Se for 25 %, o gatilho de migração para B vira a arena nº 4 |
| **7.7** | **CAPEX de R$ 10.494 (4 q) e R$ 6.435 (2 q)** | 🟢 Conservador | Varejo à vista. Com CNPJ e lote, −15 a −30 %: payback vai de 8,2 para ~6,4 meses |
| **7.8** | **O piloto tem uma arena, não duas** | 🟡 Decisão | **Mudou de sinal outra vez.** Na rev. 2, a segunda arena dividia o relay e derrubava o custo. Com o perfil enxuto, **a segunda arena custa quase um relay a mais** (ou força a subida para `c7g.large`). Duas arenas continuam valendo pela qualidade do aprendizado — separar "problema do produto" de "problema daquela arena" —, **mas não mais por economia** |
| **7.9** | **A arena passa no Spike U** | 🔴 Não testada | Se uma fração relevante reprovar, o funil encolhe antes de começar. **Rodar o Spike U em 3 arenas candidatas**, para saber a taxa de aprovação antes de desenhar o funil |
| **7.10** | 🆕 **A retenção de 7 dias da sessão é mantida** | 🟡 Decisão em aberto | **É a maior alavanca de margem do produto** (R$ 116/arena/mês a 20 arenas). Se for cortada para 3 dias, a margem a R$ 1.890 sobe de 43,1 % para 49,3 % em regime. **Não prometer 7 dias a nenhuma arena por escrito enquanto isso não estiver decidido** |

---

## Fontes

- [Chame o VAR — site oficial](https://chameovar.com.br/) — compra 12 m / comodato 24 m, "um patrocinador pode zerar o custo do sistema", 12/09/2026 [F]
- [Kiplay — como aumentar a receita da quadra de beach tennis](https://kiplay.com.br/blog/como-aumentar-receita-quadra-beach-tennis) — cota de patrocínio R$ 500–2.000/mês [R, blog de fornecedor]
- [Na Quadra](https://naquadra.com.br/alugar-quadra-de-futebol-society-em-sao-paulo-sp) — society R$ 100–250/hora [R]
- [Tecnofit](https://www.tecnofit.com.br/blog/quanto-lucra-uma-quadra-de-beach-tennis/) — beach tennis R$ 70–120/hora [R]
- [Polo de Varejo Praia do Futuro](https://pvpraiadofuturo.com.br/o-guia-completo-para-jogar-beach-tennis-na-praia-do-futuro/) — R$ 59,90/hora [F]
- [Jornal do Estado do Rio](https://www.jornaldoestadodorio.com.br/rio-open-2026-descubra-os-melhores-lugares-para-jogar-tenis-beach-tennis-e-pickleball-no-rj/) — planos de arena R$ 149,99–199,99/mês [F]
- [Cronoshare](https://www.cronoshare.com.br/quanto-custa/instalar-camera-seguranca) · [BJSEG](https://blog.bjseg.com.br/post/quanto-custa-camera-de-seguranca-guia-2026) · [Wifisul](https://wifisul.com.br/blog/posts/quanto-custa-instalar-cameras-seguranca) — CFTV 4 câmeras instalado R$ 1.800–3.200 [R]
- [ANPD — Guia Orientativo sobre Legítimo Interesse (fev/2024)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf) [F]
- `docs/adr/0001-stack-e-arquitetura.md` §9 — **tabela de custos da rev. 3**, corolário da ausência de economia de escala, comparação com o plano B, gatilhos do `t4g.medium`
- `docs/hardware/bom-e-custos.md` — CAPEX sem PC de borda, variantes, estrutura fixo/variável
- `docs/hardware/spec-captura.md` §8 — banda por arena, cláusula de uplink, Spike U
- `docs/legal/analise-lgpd.md` §5 · `docs/legal/contrato-arena-anexo-lgpd.md` — papéis, obrigações da arena, escolinha, sinalização
- `docs/concorrentes.md` · `docs/PRD.md` · `docs/PLANO.md`

# Métricas e operação do piloto — Replay já 2.0

> Task D5 do `PLANO.md`. **Revisão 2 — 12/09/2026.** Define **como saberemos se o piloto deu certo** em 8 semanas, o roteiro de onboarding da arena e os roteiros de entrevista.
>
> ⚠️ **O que mudou na revisão 3:** a stack ficou mais enxuta (Vercel e Neon já pagos por outro produto; sem Supabase, sem Sentry) e a nuvem do piloto caiu para **R$ 329/mês**, o que torna o piloto operacionalmente lucrativo. Aqui isso muda apenas os **preços testados nas entrevistas** (C1 e §5.2: fundador de R$ 1.390 → **R$ 1.490**), o **piso do critério de encerrar**, e a premissa P5 — a retenção da sessão virou alavanca de margem viva. **Nenhum alvo de métrica mudou.**
>
> ⚠️ **O que mudou na revisão 2:** a arquitetura passou a ser **sem PC na arena** (câmera empurra RTMP para um relay em EC2). Consequências diretas aqui: **o uplink da arena virou o caminho crítico sem nenhum fallback local**, e por isso ganhou guarda-corpos próprios (G5, G6); o **Spike U** entrou como porta de entrada antes do contrato (S0/S1); a **sinalização com foto datada** virou trava de ativação (S2); e os preços testados nas entrevistas subiram (`gtm/proposta-piloto.md` §4).
>
> **Convenção de fonte:** **[F]** fonte direta · **[R]** relato · **[E]** estimativa. Todo alvo numérico aqui é **[E]** — não existe baseline público do segmento e não temos dados próprios do 2.0. Estão calibrados contra a volumetria de planejamento da ADR e contra os aprendizados do Replay já 1.0. **São hipóteses a serem falsificadas, não metas de OKR.**

---

## 0. Premissas registradas

| # | Premissa | Grau | Origem |
|---|---|---|---|
| P1 | Arena piloto tem **4 quadras** e opera ~12 h/dia, 26 dias/mês. **Se for de 2 quadras** (agora uma oferta viável), as métricas *por quadra* valem sem mudança; as *por arena* — M5, M6, M7 — caem pela metade | 🟡 [E] | `PLANO.md`; `proposta-piloto.md` §4 |
| P2 | A volumetria de planejamento da ADR — **200 clipes/dia na arena de 4 quadras** (50/quadra/dia) — é *capacidade dimensionada*, **não previsão**. Como previsão, ela é otimista | 🔴 [E] | ADR §1. Por isso o alvo de clipes gerados é 40/quadra/dia e o piso é 20 |
| P3 | O piloto dura **8 semanas contadas do go-live**, não da assinatura | 🟢 decisão | `PLANO.md` Fase 2 |
| P4 | A instrumentação de eventos (task **B8**) está pronta **no go-live**. Sem ela, metade deste documento é planilha manual | 🔴 risco real | `PLANO.md` B8 está `☐` |
| P5 | Retenção: **sessão completa 7 dias** (não 14). 🆕 **E pode virar 3 dias** — é a maior alavanca de margem do produto (R$ 116/arena/mês a 20 arenas, ADR §9). **Clipe: 30 ou 90 dias está em conflito aberto** entre `PLANO.md` (90), ADR/`api/README.md` (30) e a Política de Privacidade já escrita (90) | 🔴 **bloqueante** | ADR §9; `legal/analise-lgpd.md` §I-1. Publicar prazo que o sistema não cumpre é violação do art. 6º, V. **Não prometer 7 dias a nenhuma arena por escrito antes de decidir** |
| P6 | Não há vínculo automático atleta↔lance no piloto. Toda métrica por atleta é **por conta logada**, não por pessoa filmada | 🟢 decisão | `PLANO.md` decisão 6 |
| P7 | A arena divulga para os clientes dela (contrapartida contratual). **Se ela não divulgar, as métricas de adoção medem a divulgação, não o produto** — e o piloto perde validade | 🔴 | `gtm/proposta-piloto.md` §5 |
| **P8** | **Não há buffer local.** Sem PC na arena, uma janela de uplink ruim é um lance que não existe — o microSD da câmera é a única rede de segurança, e ela é de recuperação, não de tempo real | 🔴 **risco nº 1 do projeto** | ADR §8; `spec-captura.md` §7 |
| **P9** | A arena **passou no Spike U** antes de assinar (48 h de medição, com veto) | 🟡 premissa nova | `spec-captura.md` §8.3. Se ela não passou e assinamos assim mesmo, **G5 e G6 vão medir a decisão errada, não o produto** |
| **P10** | Métrica por quadra só começa a contar **depois da foto datada da placa de sinalização** daquela quadra — câmera sem placa não é ativada | 🟢 contratual | `legal/contrato-arena-anexo-lgpd.md` cl. 4 |
| **P11** | **Horários de escolinha ficam com a gravação bloqueada.** Esses horários saem do denominador de toda métrica por hora de operação | 🟢 contratual | `legal/contrato-arena-anexo-lgpd.md` cl. 9 |

---

## 1. Métrica-norte

> ## 🎯 **Lances compartilhados por quadra por dia** — média móvel de 7 dias
>
> **Alvo na semana 8: 12** · **Piso de viabilidade: 6** · **Sinal de sucesso claro: 20+**

**Por que esta e não outra:**

- É a **única métrica que sobe apenas quando as três partes ganham ao mesmo tempo**. Para ela subir, o botão precisa funcionar (produto), o atleta precisa achar o lance e logar (jornada), e o lance precisa ser bom o suficiente para valer um envio (qualidade). Qualquer uma das três quebrada derruba o número.
- É **o produto que a arena compra**. Todo o pitch comercial da §5 da proposta é marketing orgânico com a marca da arena no vídeo — e um compartilhamento é literalmente uma unidade desse produto sendo entregue. Clipe gerado que ninguém manda para o grupo não vale nada para a arena.
- Ela **não é inflacionável por vaidade**: não sobe com pageview, não sobe com cadastro, não sobe com o dono da arena apertando o botão para testar.

**Por quanto ficou de fora:**

| Candidata | Por que não |
|---|---|
| Clipes gerados/dia | Mede aperto de botão, não valor. Sobe com criança brincando no alambrado |
| Atletas ativos/semana | Boa, mas reflete divulgação da arena tanto quanto produto. Fica como suporte (M6) |
| Visualizações | Vaidade. Um compartilhamento gera N visualizações sem trabalho nosso |
| Receita / renovação | Certa no fim, mas com **n = 1 arena** não é métrica, é um evento binário |

**Alvo derivado (para dar escala mental):** 12 × 4 quadras × 7 = **≈ 336 lances compartilhados por semana** na arena piloto.

---

## 2. Métricas de suporte

Todas medidas na **média móvel de 7 dias**, comparando a **semana 8 contra a semana 3** (semanas 1–2 são operação assistida e estão contaminadas).

| # | Métrica | Alvo (semana 8) | Piso | Como é medida |
|---|---|---|---|---|
| **M1** | **Lances gerados por quadra por dia** | **40** | 20 | Evento `clip_created` na confirmação de upload (borda → API). Painel, por `court_id` |
| **M2** | **% de lances gerados que são assistidos ≥ 1× em 48 h** | **70%** | 50% | `clip_viewed` distinto por `clip_id` ÷ `clip_ready` com janela de 48 h. Query no Postgres, card no painel |
| **M3** | **Taxa de conversão do gate de login** (viu o gate → sessão criada) | **55%** | **40%** | Funil `login_gate_shown` → `login_started` → `login_completed`, com `method ∈ {otp, google}`. Evento de produto |
| **M4** | **Compartilhamentos por canal** — mix e volume | WhatsApp ≥ 60% do total; **≥ 2,5 compartilhamentos por atleta ativo/semana** | 1,2 | `clip_shared {channel ∈ whatsapp, instagram, download, copy_link, native_share}`. Nota: Web Share API não confirma o destino — `native_share` é uma categoria própria, **não estimar o canal dentro dela** |
| **M5** | **Grupos criados e membros** | **8 grupos** com ≥ 5 membros cada; **≥ 50% dos compartilhamentos originados em página de grupo** | 3 grupos; 20% | `group_created`, `group_member_joined`, e `referrer_surface` no evento `clip_shared`. Esta é a métrica do **diferencial que ninguém tem** (`concorrentes.md`) |
| **M6** | **Atletas únicos ativos por semana** e **retenção** | **120 atletas/semana**; **≥ 35%** ativos em 2+ semanas distintas | 60; 20% | Contas com ≥ 1 `clip_viewed` na semana. Coorte semanal por `user_id` |
| **M7** | **E-mails únicos capturados no piloto** | **250** | 120 | `user` criados com `partner_id` de origem. É o ativo que fica para a arena e para nós |

### Guarda-corpos técnicos (não são metas — são condições de validade)

| # | Métrica | Alvo | Piso | Como é medida |
|---|---|---|---|---|
| **G1** | **Uptime das câmeras** no horário de operação (todas as 4 empurrando) | **99,0%** | **97,0%** | Segmentos chegando no relay + `detect_offline_devices`. Relatório semanal. ⚠️ Sem PC na arena, "online" agora significa **"chegando na nuvem"** — não há mais estado local que salve |
| **G2** | **Latência botão → lance disponível** | **p50 ≤ 45 s · p90 ≤ 120 s** | p90 ≤ 180 s | `clip_created.pressed_at` → `clip_ready.at`. Histograma no painel interno |
| **G3** | **Lances perdidos** (botão apertado, clipe não existe ou saiu errado) | **< 1%** | < 3% | Contagem de `clip_failed` + reclamações registradas na planilha de incidentes |
| **G4** | **Qualidade noturna** — % de lances entre 19h e 23h classificados como "assistível" | **≥ 90%** | 80% | **Amostragem manual**: 20 clipes noturnos por semana, avaliados por nós em 1–5, "assistível" = ≥ 3. Planilha |
| **G5** 🆕 | **Buracos de ingestão** — janelas em que a câmera parou de entregar | **≤ 5 janelas > 10 s por 48 h**, por câmera | ≤ 15 | `long_segments_24h` no índice do relay (ADR §8, alarme nº 3). **É a mesma métrica do Spike U**, o que permite comparar o que foi medido antes de assinar com o que aconteceu de verdade |
| **G6** 🆕 | **Lances perdidos por uplink** — botão apertado dentro de uma janela de buraco | **0 por semana** | ≤ 2 | Cruzar `clip_failed` e `pressed_at` com as janelas de G5. **Separar isto de G3 é o ponto inteiro**: falha nossa e falha de link da arena têm donos diferentes e conversas diferentes |
| **G7** 🆕 | **Recuperação pelo microSD** — % dos lances perdidos por uplink que foram resgatados do cartão da câmera | **≥ 80%** | 50% | Planilha, com o registro de cada resgate. É a rede de segurança do P8 — se ela não funcionar na prática, o risco nº 1 não tem mitigação nenhuma |

### Métricas comerciais (planilha, não instrumentação)

| # | Métrica | Alvo | Como |
|---|---|---|---|
| **C1** | Intenção declarada de renovar **a R$ 1.490/mês** (4 quadras) ou **R$ 950/mês** (2 quadras), perguntada na semana 4 e na semana 8 | "sim" nas duas | Entrevista do dono (§5.2). ⚠️ Preços de fundador da revisão 3 (`proposta-piloto.md` §4.1) |
| **C2** | Menções orgânicas da arena vindas de lances (posts, stories, marcações) | ≥ 15 identificadas no piloto | Busca manual + o que a arena reportar. **Reconhecidamente subestimado** — WhatsApp é invisível |
| **C3** | Solicitações espontâneas de quadra adicional, ou de outra arena que soube pelo boca a boca | ≥ 1 | Planilha |

### Onde cada coisa é medida

| Instrumento | Cobre | Status |
|---|---|---|
| **Eventos de produto** (task B8) | Norte, M1–M7, G2 | 🔴 `☐` no `PLANO.md` — **bloqueante**, precisa estar de pé no go-live |
| **Painel do parceiro** (task B6/C9) | M1, M2, M4 (visão da arena), G1 | 🔴 `☐` |
| **Índice do relay** (`/stats`, `long_segments_24h`) | **G1, G5, G6** | 🟢 já existe no relay herdado (ADR §8) — **é o instrumento novo da revisão 2 e ele vem pronto** |
| **Queries diretas no Postgres** | M5, M6, coortes | 🟢 vem de graça com o modelo de dados |
| **Planilha do piloto** (nós preenchemos) | G3, G4, **G7**, C1–C3, incidentes, transcrições | 🟢 fazer na semana 0 |

> **Instrumentação mínima para o piloto ser mensurável** — se der para fazer só uma coisa da B8, é esta lista: `clip_created`, `clip_ready`, `clip_viewed`, `clip_shared{channel, referrer_surface}`, `login_gate_shown`, `login_completed{method}`, `group_created`, `group_member_joined`. Oito eventos. Sem eles, o piloto vira anedota.

---

## 3. Critérios de decisão ao fim das 8 semanas

Avaliados na **semana 8**, sobre a média móvel de 7 dias, comparando com a semana 3.

### 🟢 RENOVAR — seguir para o contrato de regime e buscar as arenas 2–5

Exige **todas** as quatro:

1. **Métrica-norte ≥ 10** lances compartilhados/quadra/dia, **e em tendência de alta ou estável** entre as semanas 5 e 8.
2. **M3 (gate de login) ≥ 45%** — o funil não está vazando na porta de entrada.
3. **G1 ≥ 98% de uptime**, **G3 < 2% de lances perdidos** e **G6 ≤ 2 lances perdidos por uplink na semana** — o produto é operável sem nós dentro dele, **e a aposta de não ter buffer local se sustentou**.
4. **O dono da arena diz "sim" para R$ 1.490/mês** (ou R$ 950 se for de 2 quadras) quando perguntado de frente, sabendo que pode sair com 60 dias de aviso (C1, semana 8).

### 🟡 AJUSTAR — estender o piloto por 4 semanas, com uma hipótese nomeada

Quando **a norte está entre 6 e 10** *ou* qualquer critério de renovação falha isoladamente **e a causa é identificável**. A extensão só é válida com **uma hipótese escrita e uma mudança única**:

| Sintoma | Hipótese provável | Mudança a testar |
|---|---|---|
| Norte baixa, M1 alta, M2 alta | O lance é achado e assistido, mas não vale um envio | Qualidade/enquadramento; duração de 22 s; corte automático melhor |
| Norte baixa, **M3 < 40%** | O gate de login está matando o funil (risco nº 1 do `PLANO.md`) | Thumbnails visíveis antes do login; Google em primeiro; OTP sem senha |
| Norte baixa, **M1 < 20** | Ninguém aperta o botão | Posição/altura do botão; strobo de confirmação; cartaz na quadra; a arena não divulgou (P7) |
| Norte ok, **M5 baixa** | O grupo não pegou — o diferencial não se provou | Criação de grupo sugerida ativamente após o 2º acesso; convite pelo dono |
| **G2 p90 > 180 s** | Internet da arena, não o produto | Medir upstream; priorizar clipe sobre sessão completa na fila |
| **G5/G6 ruins, Spike U tinha passado** | O Spike U não previu o que ia acontecer — **a porta de entrada do funil comercial está furada** | Repetir a medição com as 4 câmeras reais; baixar bitrate para 2 Mbps; **se persistir, é caso de plano B (PC de borda) e o modelo de custo inteiro muda** |
| **G7 < 50%** | O microSD não está salvando o que deveria | É o único fallback que existe (P8). Tratar como bug de severidade máxima, não como métrica |
| Norte alta, dono frio | Estamos entregando ao atleta e não à arena | Painel com alcance e marcações; relatório mensal impresso para ele |

**Regra dura: uma extensão, uma hipótese, quatro semanas. Nunca duas extensões.**

### 🔴 ENCERRAR — recolher o equipamento e repensar a tese

Qualquer uma basta:

1. **Métrica-norte < 6** na semana 8 **com M1 ≥ 25** — ou seja, o botão é usado, os lances existem, e mesmo assim **ninguém compartilha**. Este é o resultado mais importante do piloto, porque falsifica a tese central do PRD (compartilhamento social é o uso principal), e não é consertável com preço nem com feature.
2. **M3 < 30%** e sem melhora após uma iteração no funil de login — o modelo "vídeo só para logado" não se sustenta e isso muda o produto, não o piloto.
3. **G1 < 95%** ou **G3 > 5%** de forma persistente — o hardware ou a ingestão não estão prontos, e escalar isso para 20 arenas cria uma operação impagável.
4. **G6 > 5 lances perdidos por uplink por semana numa arena que passou no Spike U** — 🆕 este critério não existia na revisão 1 e é o mais importante dos novos. Significa que **a decisão de não ter buffer local não sobrevive à internet brasileira de arena**, e isso não é um ajuste de piloto: é a ADR que precisa ser reaberta, com o PC de borda voltando como caminho principal e o modelo de custo inteiro sendo refeito.
5. **O dono não paga R$ 1.490/mês** e não apresenta contraproposta acima de **R$ 1.390** — que é o piso do preço de fundador. Abaixo disso o unit economics não fecha: o custo de servir é de **R$ 1.041/mês** e, pelo corolário da ADR §9, **ele não melhora com escala** (`proposta-piloto.md` §0 e §4.1). ⚠️ O piso subiu duas vezes: era R$ 600 na rev. 1 e R$ 1.100 na rev. 2.

> **Encerrar não é fracasso do projeto — é o piloto funcionando.** O investimento é de **~R$ 10.100** (o CAPEX de R$ 10.494 menos os R$ 402 que a mensalidade do piloto contribui nas 8 semanas), e 8 semanas para descobrir que a tese não se sustenta é barato. O caro é descobrir na arena nº 12.

---

## 4. Roteiro de onboarding da arena — 6 semanas

**Dois relógios, e eles não coincidem.** O onboarding começa na assinatura; o piloto de 8 semanas começa no **go-live** (semana 2). Deixar isso claro com a arena na primeira reunião evita a confusão de "já acabou?".

| Semana do onboarding | Semana do piloto |
|---|---|
| **S−1 Spike U** · S0 contrato · S1 preparação · **S2 go-live** | — |
| S3 · S4 · S5 · S6 (retro) | Piloto 1 · 2 · 3 · 4 |
| S7–S10 | Piloto 5 · 6 · 7 · **8 → decisão** |

---

### **S−1 — Spike U: a porta de entrada** 🆕 · responsável: Gabriel · **antes de qualquer assinatura**

Novo na revisão 2, e é a mudança mais importante do roteiro. Sem PC na arena, o uplink é o caminho crítico (P8) — e **speedtest não serve**: ele mede pico instantâneo, e o que nos derruba é estabilidade sustentada às 20h de terça (`spec-captura.md` §8.3).

- **Deixar uma câmera VIP de bancada empurrando para o relay por 48 h**, cobrindo pelo menos uma noite de pico. Combinar a janela com o dono para pegar o dia mais cheio.
- Ler no índice do relay exatamente o que vira G5/G6 depois: **p5 de upload sustentado** (alvo ≥ 2 × N × B Mbps — 27 Mbps para 4 quadras a 3 Mbps), disponibilidade, maior janela sem resposta, **nº de janelas > 10 s (alvo ≤ 5 por 48 h)**.
- Pedir também, como complemento: **gráfico de 7 dias do roteador e contagem de reconexões PPPoE**. É grátis, é histórico, e costuma revelar mais que o nosso teste.
- Perguntar em uma linha: **o link é franquiado?** (móvel, satélite). 4 quadras empurram ~3,9 TB/mês — franquia inviabiliza o produto e evita uma venda ruim.

**Três saídas possíveis, e nenhuma é "vamos tentando"** (`spec-captura.md` §8.3): passa em tudo → contrato a 3 Mbps · falha só no p5 → contrato a 2 Mbps e/ou menos quadras, ou upgrade de link pago pela arena como pré-condição · falha feio → **não vender**, ou plano B com PC de borda e contrato de 24 meses.

> **Rodar o Spike U em 3 arenas candidatas, não em uma** (premissa 7.9 da proposta). Precisamos saber a **taxa de aprovação** antes de desenhar o funil comercial — se metade reprovar, o modelo de negócio inteiro precisa ser refeito.

**Saída:** laudo de 1 página com as quatro medidas, e a decisão de vender ou não vender.

### **S0 — Contrato e pré-requisitos** · responsável: Gabriel

- Proposta assinada (`gtm/proposta-piloto.md` §5) + **Anexo de LGPD** (`legal/contrato-arena-anexo-lgpd.md`). 🔴 **Não assinar antes da revisão por advogado** — a `analise-lgpd.md` marca vários pontos com `[REVISAR COM ADVOGADO]`, incluindo a escolha entre controladoria conjunta e controladores independentes.
- **Explicar verbalmente as três cláusulas duras**, não deixar o dono descobrir lendo: **responsabilidade solidária** perante o titular (art. 42, §1º, I), **restrição ao uso publicitário dos vídeos** (nada com pessoa identificável sem autorização individual escrita), e **bloqueio da escolinha**.
- **Formulário preenchido pelo dono**: nº de quadras e esportes, horário de funcionamento, horários de pico, **horários de escolinha/aula infantil (PR4)**, operadora e plano de internet, onde fica o roteador, altura dos postes, **caminho livre de cabo até cada câmera (PR5)**, logo em PNG com fundo transparente, WhatsApp do ponto focal, **canal de comunicação de titular da arena** (exigência da Resolução CD/ANPD nº 2/2022).
- **Combinar as contrapartidas com data**: quem acompanha a instalação, quando sai o aviso nos grupos, quando entra o cartaz, **quando as placas são instaladas**.
- Abrir a **planilha do piloto** (incidentes, G3, G4, G7, C1–C3) e o grupo de WhatsApp com o ponto focal.
- Slug da arena reservado e `partner` criado.

**Saída:** contrato + anexo assinados, formulário preenchido, data de instalação marcada.

### **S1 — Vistoria técnica e preparação** · Gabriel + técnico

- **Videochamada de 30 min percorrendo as quadras com o celular.** Confirmar: posição de cada câmera (`bom-e-custos.md` §7 passo 4 — regra de ouro: nunca apontar para o pôr do sol), altura dos postes, caminho do cabo até cada uma, **e medir cada lance**. ⚠️ **Acima de 90 m o kit de 2 quadras precisa trocar injetor por switch**; acima de 100 m (250 m com Extender) não fecha de jeito nenhum.
- 🔴 **Confirmar que nenhum poste precisa ser erguido.** Poste novo custa R$ 900–1.800 e transforma instalação em obra (PR5). **Descobrir aqui, nunca no dia.**
- Montar e testar o kit na bancada, com o slug já provisionado. Aplicar a marca d'água e **mandar um clipe de exemplo pelo WhatsApp para o dono** — primeiro momento em que ele vê o produto com a marca dele. ⚠️ A marca precisa estar **discreta, em canto, sem chamada comercial** (restrição da Súmula 403 do STJ — `proposta-piloto.md` §6.1).
- Imprimir: cartaz da recepção, adesivo de "aperte aqui", e **a placa de aviso de gravação para cada quadra** (padrão `legal/sinalizacao-quadra.md`, fornecida por nós sem custo).

**Saída:** kit testado, enquadramentos aprovados por foto, metragem de cada lance de cabo conhecida, material impresso pronto.

### **S2 — Instalação e go-live** · Gabriel presencial (a arena nº 1 é presencial, sem discussão)

- Instalação pelos 10 passos do `bom-e-custos.md` §7 — 3 a 4 h para 4 quadras. **Não há computador no kit** — é assim mesmo.
- 🔴 **Trava de ativação (PR3):** a câmera de uma quadra **só é ligada depois de recebermos fotografia datada da placa de sinalização instalada naquela quadra**. Não é burocracia nossa: é a condição que sustenta a base legal de legítimo interesse. **Tirar as fotos no próprio dia, com o dono junto**, e arquivar.
- **Configurar o bloqueio dos horários de escolinha (PR4)** e conferir com o dono, quadra por quadra.
- **Teste de aceitação, item por item, antes de ir embora:** os 4 botões disparam; os 4 clipes aparecem em < 60 s; o strobo pisca; a marca d'água está correta e discreta; a página `/[arena]` fica bonita no preview do WhatsApp; o painel mostra as 4 câmeras entregando; **um clipe noturno de verdade foi gravado e assistido**; 🆕 **`long_segments_24h` limpo nas primeiras 24 h** (G5) — é o primeiro sinal de que o Spike U não mentiu.
- **Treinar 3 pessoas da equipe** (recepção incluída) em 20 minutos: como explicar o botão, como achar o lance, o que responder a "não achei meu lance" — **e o que fazer se alguém pedir para remover um vídeo em que aparece** (encaminhar ao nosso canal em até 24 h, obrigação contratual da arena).
- Afixar cartaz e adesivos. A arena dispara o aviso nos grupos de WhatsApp **no mesmo dia**.

**Saída:** go-live. **A partir de hoje conta a semana 1 do piloto.**

### **S3 — Semana assistida** (piloto semana 1) · presença nossa em 2 noites

- Ficar na quadra em **dois horários de pico**, calados, olhando. Ninguém aprende mais do que vendo um atleta tentar e falhar.
- Anotar todo atrito bruto: quem não achou o botão, quem não achou o lance, quem desistiu no login, quem perguntou "é pago?".
- **Correção diária de enquadramento.** ⚠️ A câmera Padrão (VIP 3230 B SL G3) é de **focal fixa de 2,8 mm** — reenquadrar de verdade exige subir no poste. Só a variante Premium (varifocal motorizada) permite ajuste remoto. **Se a arena tem enquadramento difícil, decidir isso na S1, não na S3.**
- Contato diário com o ponto focal.
- 🔴 **Esta semana está contaminada por nós e não entra em nenhuma comparação.**

### **S4 — Ativação dos grupos e divulgação** (piloto semana 2)

- **Criar as 3 primeiras páginas de grupo com o dono, na mão**, para as turmas mais fiéis dele. Não esperar que aconteça sozinho — semear.
- Mandar o link de cada grupo para o WhatsApp da turma, pelo dono (vem dele, não de nós).
- Segunda onda de divulgação: story da arena, post com um lance bom da semana.
- Primeira leitura do funil M3: **se o gate de login estiver abaixo de 35% aqui, agir agora**, não na semana 8.

### **S5 — Operação sem apoio** (piloto semana 3) · 🔴 **nós saímos de cena**

- **Zero presença nossa na arena. Zero intervenção proativa.** Só suporte reativo, e registrado.
- **Esta é a primeira semana de dado limpo — é ela que vira a baseline de comparação da semana 8.**
- Ao fim: primeiro relatório de métricas, mandado ao dono em uma página.

### **S6 — Retro de meio de piloto** (piloto semana 4) · 60 min com o dono

1. **Números na mesa primeiro** (15 min): norte, M1–M7, G1–G4, com a comparação S5 → S6. Sem maquiagem: mostrar o que está ruim antes do que está bom.
2. **Entrevista estruturada com o dono** (20 min, roteiro §5.2).
3. **Pergunta de intenção (C1)** (5 min): *"hoje, sabendo o que você sabe, você pagaria R$ 1.490 por mês por isso?"* (R$ 950 se for arena de 2 quadras) — e ficar em silêncio esperando a resposta.
4. **Decidir juntos 1 a 3 ajustes** para as semanas 5–8, escritos, com responsável e data (20 min).

**Saída:** relatório de meio de piloto, lista de ajustes, resposta de C1 registrada.

### Depois do onboarding — semanas 7 a 10 do calendário (piloto 5–8)

- **Piloto 5–7**: operação em regime, ajustes acordados em produção, contato quinzenal.
- **Piloto 7–8**: rodar as **3 a 5 entrevistas com atletas** (§5.1).
- **Piloto 8**: relatório final, aplicar os critérios da §3, e a conversa de renovação com o preço de fundador na mesa.

---

## 5. Roteiros de entrevista

### 5.1 Atleta — 20 minutos, 3 a 5 pessoas

**Recrutamento:** pedir ao dono 5 nomes de perfis **diferentes de propósito** — um da turma fixa de segunda, um que joga avulso, um que **nunca usou** o sistema (o mais valioso dos cinco), uma mulher (o produto não é só masculino e o beach tennis/futevôlei muda o perfil), e um "influente" do grupo de WhatsApp. Fazer na quadra, antes ou depois do jogo. Oferecer algo pequeno — um consumo no bar bancado por nós.

**Regras para quem conduz:** perguntar sobre **o que a pessoa fez**, nunca sobre o que ela acha que faria. Ao ouvir "seria legal se tivesse X", responder *"quando foi a última vez que você precisou disso?"*. Gravar com autorização. Silêncio depois da resposta — a segunda frase é sempre a verdadeira.

| Bloco | Tempo | Perguntas |
|---|---|---|
| **Aquecimento** | 2 min | Há quanto tempo joga aqui? Com que frequência? Vem sempre com a mesma turma? |
| **Antes de nós** | 3 min | Antes de existir a câmera, alguém filmava jogo aqui? Como? O que acontecia com o vídeo depois? |
| **O último lance** | 5 min | **Me conta a última vez que você apertou o botão.** O que aconteceu depois? Me mostra no seu celular onde foi parar? *(observar em silêncio a pessoa navegando — este é o momento mais valioso da entrevista inteira)* |
| **O atrito** | 4 min | Teve alguma vez que você quis o vídeo e não conseguiu? O que aconteceu? O login: você lembra como entrou? Incomodou? Você chegou a desistir alguma vez? |
| **O compartilhamento** | 3 min | Para onde você mandou? Para quantas pessoas? Por que aquele lance e não outro? Alguém de fora da quadra viu? |
| **O grupo** | 2 min | *(mostrar a página do grupo se ele não conhecer)* Isso aqui te serve? Você usaria no lugar de procurar por horário? |
| **Fechamento** | 1 min | Se isso acabasse amanhã, você sentiria falta? **Você jogaria em outra arena que tem isso, em vez de uma que não tem?** Se tivesse que pagar, pagaria quanto? *(a resposta a essa última é fraca como dado — registrar, não decidir com ela)* |

**O que estamos tentando descobrir, e que não está em métrica nenhuma:** (a) o lance compartilhado é o do próprio atleta ou o do amigo? (b) o gate de login é irritação ou barreira? (c) o produto é lembrado sem estímulo? (d) "jogaria em outra arena por causa disso" é a única pergunta que testa se existe retenção de verdade — que é o que a arena está comprando.

### 5.2 Dono da arena — 20 minutos, na S6 e de novo no piloto 8

| Bloco | Tempo | Perguntas |
|---|---|---|
| **O negócio dele** | 3 min | Quantas horas por quadra você vende por dia hoje? Mudou alguma coisa nas últimas 4 semanas? Quanto disso você atribuiria à câmera — e quanto seria sazonalidade? *(ouvir a resposta como sinal, nunca como dado)* |
| **Operação** | 4 min | Quantas vezes sua equipe teve que explicar o sistema? Quantas reclamações de "não achei meu lance"? Alguém da recepção reclamou? **O que deu trabalho pra você que eu não fiquei sabendo?** |
| **Percepção de valor** | 4 min | Quando você fala do sistema com um cliente, o que você diz? E com outro dono de arena? Algum cliente comentou espontaneamente? Alguém veio jogar aqui por causa disso? |
| **Marca e divulgação** | 3 min | Você viu vídeos com a marca da arena circulando? Onde? Você usou a página `replayja.com.br/[arena]` em alguma divulgação sua? |
| **O que falta** | 3 min | Se eu pudesse fazer **uma** coisa nas próximas 4 semanas, qual seria? E o que você pediu que eu não fiz? |
| **Dinheiro** | 3 min | **Hoje, você pagaria R$ 1.490 por mês por isso?** *(silêncio)* Se não, quanto? O que precisaria acontecer para valer R$ 1.490? Você preferiria **pagar R$ 1.590 e assinar 24 meses, ou R$ 1.890 sem prazo nenhum**? *(teste direto do Modelo B contra o C)* E se fosse **R$ 13.900 de entrada mais R$ 1.190/mês**, com o equipamento seu? *(teste do Modelo A — a resposta a esta é o dado mais valioso das três)* Se eu oferecesse quadra adicional por R$ 390, você colocaria? E **15 % de desconto pagando o ano inteiro adiantado**, faria sentido pra você? *(testa a mitigação de churn que substitui a fidelidade)* |
| **Internet** 🆕 | 2 min | Você percebeu alguma vez o sistema falhando por causa da internet? A internet daqui te dá dor de cabeça em outras coisas — maquininha, Wi-Fi dos clientes? **Se eu dissesse que precisa de um plano melhor de internet para funcionar direito, você faria o upgrade?** *(é a pergunta que dimensiona o custo real de aquisição das próximas arenas)* |

**Perguntas que não devemos fazer:** "você gostou?", "ficou bom?", "recomendaria?" — todas têm resposta social garantida e não informam nada. Substituir por comportamento observado e por dinheiro.

---

## 6. Relatório semanal — o formato (uma página, toda sexta)

Para nós e, a partir da S5, para o dono também.

```
REPLAY JÁ · [ARENA] · Semana N do piloto ([datas])

🎯 NORTE   Lances compartilhados/quadra/dia .... XX,X   (sem. anterior: XX,X · alvo 12)

ADOÇÃO
   Lances gerados/quadra/dia ................... XX     (alvo 40 · piso 20)
   % assistidos em 48h ......................... XX%    (alvo 70%)
   Conversão do gate de login .................. XX%    (alvo 55% · piso 40%)
   Atletas ativos na semana .................... XXX    (alvo 120)
   E-mails capturados (acumulado) .............. XXX    (alvo 250 no piloto)

DIFERENCIAL
   Grupos ativos / membros ..................... X / XX (alvo 8 grupos, 5+ membros)
   % dos compartilhamentos vindos de grupo ..... XX%    (alvo 50%)
   Mix de canal: WhatsApp XX% · IG XX% · download XX% · link XX% · nativo XX%

SAÚDE
   Uptime das câmeras .......................... XX,X%  (alvo 99,0% · piso 97%)
   Latência botão→lance p50 / p90 .............. XXs / XXs
   Lances perdidos (falha nossa) ............... X,X%   (alvo < 1%)
   Qualidade noturna (amostra de 20) ........... XX%    (alvo 90%)

UPLINK  ← novo na revisão 2; sem buffer local, isto é o risco nº 1
   Janelas > 10s por câmera / 48h .............. X      (alvo ≤ 5)
   Lances perdidos por uplink .................. X      (alvo 0 · piso 2)
   Resgatados do microSD ....................... XX%    (alvo ≥ 80%)
   Comparação com o Spike U .................... melhor / igual / PIOR

INCIDENTES DA SEMANA
   1. ...

O QUE VAMOS FAZER NA PRÓXIMA SEMANA
   1. ...
```

---

## 7. As premissas mais frágeis deste documento

1. **Os alvos numéricos são todos [E] sem baseline.** Não existe benchmark público do segmento e o Replay já 1.0 tinha modelo diferente (celular do usuário, sem arena). Se a norte der 4 na semana 8, não sabemos se isso é fracasso do produto ou se 4 já é o teto do mercado. **Mitigação: o que realmente decide não é o valor absoluto, é a tendência entre as semanas 5 e 8 e a resposta de C1.** Os alvos servem para orientar a operação, não para julgar o piloto sozinhos.
2. **A instrumentação (B8) não existe ainda** e está marcada `☐`. Se ela escorregar, o piloto roda às cegas e este documento inteiro vira uma planilha manual com números duvidosos. **É a dependência mais urgente da Fase 1** — mais que qualquer feature.
3. **P8/P9 — a aposta de não ter buffer local nunca foi testada em arena real.** 🆕 Esta é a premissa nova e a mais frágil de todas. A evidência que temos é do relay do Sentinela, que registrou **buracos de 74 s e 68 segmentos acima de 10 s em 24 h** — **todos** em câmeras que empurram vídeo, nenhum nas que são puxadas de dentro da LAN (ADR §8). Ou seja: o modo de falha já foi observado, só não na nossa arena. Se G5/G6 confirmarem isso no piloto, **não é um ajuste — é a ADR reaberta**, com o PC de borda voltando como caminho principal e o modelo de custo de `proposta-piloto.md` refeito do zero.
4. **P7 — a arena precisa divulgar.** Com n = 1, não conseguimos separar "produto ruim" de "arena que não avisou ninguém". Se a adoção vier baixa, a primeira coisa a verificar é se o aviso saiu nos grupos de WhatsApp e se o cartaz está na recepção — **e essa verificação precisa estar registrada semana a semana**, ou a retro vira discussão de quem tem razão.
5. **P5 — a retenção do clipe ainda não foi decidida** (30 ou 90 dias). Não é uma premissa deste documento apenas: é um **bloqueante legal**, porque a Política de Privacidade já publicada diz 90 e a mensagem de erro da API diz 30. Decidir antes da primeira assinatura.

---

## Referências internas

- `docs/gtm/proposta-piloto.md` — modelo comercial, preços, contrapartidas da arena, riscos comerciais
- `docs/PLANO.md` — fases, tasks B6/B8/C9/D4, riscos de produto, decisões em aberto
- `docs/PRD.md` — escopo do produto e uso principal (compartilhamento social)
- `docs/adr/0001-stack-e-arquitetura.md` §8 — arquitetura de relay, volumetria, retenção, custo, alarmes (`long_segments_24h`)
- `docs/hardware/spec-captura.md` §7, §8 — microSD como fallback, banda por arena, cláusula de uplink, **Spike U**
- `docs/hardware/bom-e-custos.md` §7 — os 10 passos de instalação usados em S1/S2
- `docs/legal/contrato-arena-anexo-lgpd.md` cl. 4 e 9 — sinalização (trava de ativação) e escolinha
- `docs/legal/analise-lgpd.md` §5, §8, §I-1 — controladoria conjunta, retenção, conflito de prazos
- `docs/concorrentes.md` — onboarding do atleta no mercado e oportunidades de diferenciação

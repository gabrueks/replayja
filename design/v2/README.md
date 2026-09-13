# Replay já — direção visual v2: "Luz de quadra"

**Canvas:** https://claude.ai/code/artifact/423ba6ef-08fa-4f1b-9018-6ecabed99667

**Fonte:** `replay-ja-luz-de-quadra.html` (arquivo publicado) + os `*.dc.html` e o `canvas.json` desta pasta.
Para atualizar: editar os `.dc.html` / `canvas.json`, regerar com o skill `design` e republicar na mesma URL.

A v1 (escuro, laranja `#FF6B1F`, Archivo + Barlow) continua em `design/` e em produção. Esta pasta é a **proposta**, não o que está no ar.

---

## A direção em 5 linhas

1. **App claro, player escuro.** Todo app de consumo brasileiro é claro (Zé, iFood, Rappi, Mercado Livre). Escuro lê como ferramenta de dev — foi metade do feedback do fundador. O escuro fica só onde trabalha a favor: **player, botão virtual e onboarding**.
2. **Fundo quente, card branco, zero borda.** Neutros quentes (`#F6F3EF` / `#FFFFFF` / `#16130F`) e sombra no lugar da linha de 1px. O card vira objeto tocável em vez de retângulo desenhado.
3. **Laranja em dois tons.** `#FF6B1F` é a marca (sobre escuro); `#D93C06` é a ação (branco em cima passa AA, 4,6:1 — o laranja atual não passava). Mais um amarelo `#FFC83D` só para premium, e um verde `#0A7A3D` só para "ao vivo".
4. **Foto é o herói.** Capa fotográfica na página da arena, thumbnail grande na busca, display pesado (Bricolage Grotesque 800) contra uma UI neutra (Archivo). O horário — o dado que o atleta procura — vira o título do card.
5. **Chassi de app de verdade.** Barra inferior de 4 abas sempre presente, CTA fixo no rodapé em toda tela de ação, estados vazios ilustrados, e voz em primeira pessoa ("a gente guarda", "achou o golaço?").

---

## Artboards

O canvas tem três páginas (menu de páginas na barra do editor). Abre na página 1.

### Página 1 — Diagnóstico

| Arquivo | O que é |
|---|---|
| `AntesDepois.dc.html` | A busca de lances lado a lado: o que está em produção hoje × a direção nova. Mesmos dados, mesma arquitetura. |
| `Diagnostico.dc.html` | Os **12 sinais** concretos que dão cara de protótipo gerado, com o que muda em cada um, + o bloco "o que NÃO muda". |

### Página 2 — Telas (mobile 390px, pt-BR, dados reais da Arena Vasco)

| # | Arquivo | Tela |
|---|---|---|
| 1 | `Main.dc.html` | Home logada = escolher arena. Busca no topo, "você jogou aqui", cards grandes com foto da quadra, "gravando agora", barra inferior. |
| 2 | `Arena.dc.html` | Página da arena deslogada: capa fotográfica, brasão sobreposto, abas Lances/Grupos/Sobre, prévia protegida, CTA fixo no rodapé. |
| 3 | `Busca.dc.html` | Busca de lances: chips de quadra, atalhos de horário, início/fim em display grande, grade com horário em destaque, ponte para o grupo. |
| 4 | `Player.dc.html` | Player (escuro): vídeo com marca d'água, horário em 44px, WhatsApp/Instagram/Baixar/Copiar, "estender lance" como PRO visível. |
| 5 | `BotaoVirtual.dc.html` | Botão virtual — tratado como tela-herói: escuro com brilho laranja, botão circular de 206px, confirmação com horário, salvos da pelada. |
| 6 | `Grupo.dc.html` | Página do grupo: cabeçalho preto, semanas como **rodadas**, membros, convidar, rodada sem lance com ilustração. |
| 7 | `Login.dc.html` | Login em duas etapas (e-mail → código), lado a lado, com faixa de marca no topo e "o que acontece depois". |
| 8 | `Onboarding.dc.html` | 3 telas na primeira abertura: "A câmera já tá lá" → "Marcou? Aperta o botão." → "Entre e ache seu lance." |

### Página 3 — Sistema

| Arquivo | O que é |
|---|---|
| `Sistema.dc.html` | Tokens: cor, tipografia, raio, sombra, espaço, ícones, ilustração. |
| `Componentes.dc.html` | Botões, chips, status, campo, cards, estado vazio, barra inferior, toasts, e a folha de **voz** (hoje → direção nova). |

---

## Diagnóstico — os 12 sinais (resumo)

O artboard `Diagnostico.dc.html` traz cada um com o "hoje" e o "muda". Em uma linha cada:

1. **Card com borda de 1px sobre fundo quase igual** — `#15171A` sobre `#0B0C0E` são 3% de luminância. → Fundo quente, card branco, zero borda, separação por sombra.
2. **Nenhuma imagem em lugar nenhum** — produto de vídeo sem uma foto. → Foto da quadra como herói (placeholder desenhado até a arena subir a dela).
3. **Tudo do mesmo tamanho** — seção 17px, item 17px, aba 17px. → Escala com salto: 54/44/38/34/30/24/20/17/15/13/11.
4. **O horário é legenda** — `20:47` numa pílula de 12px, igual à duração. → Horário vira o título do card, 20px/800, tabular.
5. **Sem navegação persistente** — toda tela é um beco. → Barra inferior de 4 abas (Arenas · Lances · Grupos · Perfil) com badge.
6. **A ação principal rola junto com a página** — "Entrar pra liberar a busca" some no scroll. → CTA fixo no rodapé + microcopy.
7. **A arena que paga é um quadradinho de 2 letras** — e a grade borrada da Arena Vasco ainda carrega a marca d'água *ARENA CALABOUÇO* do fixture. → Capa + brasão de 74px + nome em 30px + marca d'água correta.
8. **O acento é usado para tudo** — mesmo laranja no botão, chip, link, número, aba, ícone. → Laranja = marca e ação. Verde = ao vivo. Amarelo = premium. Preto = seleção.
9. **Tipografia sem contraste de caráter** — Archivo e Barlow são quase idênticos em tela. → Display com personalidade contra UI neutra.
10. **Microcopy correta e morta** — "Buscar lances", "Receber código". → "Bora achar seu lance.", "Achou o golaço? Manda pro grupo."
11. **Estados vazios são frases, não telas** — e o login é um formulário solto no topo de uma página vazia. → Set próprio de ilustração + causa provável + ação.
12. **Ritmo de espaçamento uniforme** — 16/20 em tudo. → Dois níveis: 12–14 dentro de um grupo, 24–28 entre grupos.

**O que não muda:** toda a arquitetura de informação. Gate na ação e não na chegada, página da arena pública, atalhos de horário antes do seletor, sessão vira grupo, botão como link, abas como URL, alvo ≥44px, contraste AA. É troca de pele, não de esqueleto.

---

## Tokens

Mesmos **nomes** de `web/app/globals.css` — a troca é de valor, não de vocabulário.

### Cor

| Token | Valor | Uso |
|---|---|---|
| `--cor-fundo` | `#F6F3EF` | fundo de toda tela clara (neutro quente, não cinza frio) |
| `--cor-superficie` | `#FFFFFF` | card, campo, barra inferior, folha |
| `--cor-superficie-2` | `#F0EBE4` | chip neutro, botão secundário, ladrilho de ícone |
| `--cor-linha` | `#EAE3DA` | **só divisor**. Nunca contorno de card. |
| `--cor-texto` | `#16130F` | principal — 17:1 |
| `--cor-texto-2` | `#6B6259` | secundário — 6,0:1 |
| `--cor-texto-3` | `#786F66` | rótulo e apoio — 4,7:1 |
| `--cor-texto-4` | `#A79D92` | **só sobre fundo escuro.** No claro ele dá 2,6:1 — placeholder e desabilitado usam `--cor-texto-3` |
| `--cor-marca` | `#FF6B1F` | marca sobre escuro, brilho, anel do botão virtual. **Nunca texto sobre claro** (2,8:1) |
| `--cor-acao` | `#D93C06` | botão cheio, link, número em destaque — branco em cima 4,6:1 ✓ |
| `--cor-acao-fraca` | `#FFEDE2` | chip ativo, pílula da aba ativa |
| `--cor-pro` | `#FFC83D` | premium e "cortando…". A cor mais rara do sistema. |
| `--cor-ao-vivo` | `#0A7A3D` / `#35D67F` no escuro | câmera gravando, confirmação |
| `--cor-erro` | `#B5122E` / `#FF6B6B` no escuro | erro de formulário, toast de falha |
| `--cor-noite` | `#0F1419` | fundo do player e do botão virtual |
| `--cor-tinta` | `#16130F` | fundo do onboarding, do toast e do cabeçalho do grupo |
| `--quadra-clara` / `--quadra-escura` | `#2C9256` → `#0E4224` | gradiente de grama |
| `--refletor` | `#FFE2AC` | brilho de refletor na arte da quadra |
| `--whatsapp` | `#25D366` | só o botão do WhatsApp |

### Tipografia

- **Bricolage Grotesque 800** — display: título de tela, horário grande, rótulo de botão, número que domina. Fallback: `Archivo Black`, Helvetica Neue, Arial.
- **Archivo 400 / 700** — corpo, rótulo, UI. Fallback: Helvetica Neue, Arial.
- Escala: `54 / 44 / 38 / 34 / 30 / 24 / 20 / 17 / 16 / 15 / 14 / 13 / 12 / 11`. Nenhum tamanho fora dela em nenhum artboard — foi conferido.
- Título: `letter-spacing: -.035em`, `line-height: .98`. Rótulo: 11px / 700 / `+.11em` / caixa alta.
- **Todo horário, duração e contador em `font-variant-numeric: tabular-nums`.** Sem exceção.
- Contraste de peso é **binário** (400 + 700, mais 800 no display) — não uma rampa de cinco pesos.

Por que trocar Barlow: Archivo e Barlow são dois grotescos neutros quase idênticos em tela, então o título lê como "o corpo em negrito". Todas as referências brasileiras (Zé, iFood, Nubank, Rappi) rodam **um display expressivo + um texto neutro**. Bricolage Grotesque é o equivalente disponível no Google Fonts: eixos de largura e tamanho óptico, contra-formas fechadas, e 800 de verdade. **Archivo fica** como face de UI — só uma fonte nova entra.

### Raio

**Seis valores, conferidos artboard por artboard.** `8` selo de duração · `14` miniatura dentro de card · `16` campo, botão, ladrilho · **`18` O raio do card** · `26` folha e moldura · `999` chip, avatar, status.

O app de hoje usa doze. A repetição do 18 é metade do efeito — em Globoplay o mesmo raio aparece em 174 elementos.

### Sombra

| Token | Valor | Uso |
|---|---|---|
| `--sombra-1` | `0 1px 2px rgba(38,28,18,.05), 0 6px 16px -10px rgba(38,28,18,.3)` | campo, chip branco, card em repouso |
| `--sombra-2` | `0 2px 4px rgba(38,28,18,.06), 0 14px 30px -12px rgba(38,28,18,.26)` | card de arena, card com foto |
| `--sombra-acao` | `0 10px 22px -10px rgba(<marca>,.65)` | o CTA brilha na própria cor — **derivada da cor de ação, não fixa**, senão trocar a marca deixa um halo laranja em volta de um botão verde |
| `--sombra-barra` | `0 -1px 0 rgba(38,28,18,.07), 0 -12px 30px -16px rgba(38,28,18,.35)` | barra inferior e CTA fixo (para cima) |

**Regra: borda OU sombra, nunca as duas no mesmo elemento.** Ter borda de 1px não é o problema — ter borda *e* sombra, é.

### Espaço e toque

- Escala: `4 · 8 · 12 · 14 · 20 · 24 · 28 · 40`.
- **Dois níveis:** 12–14 dentro de um grupo, 24–28 entre grupos. `20` é a margem lateral de toda tela.
- Toque: `44` mínimo · `52` padrão · `56` ação principal · `76` barra inferior. Vale para chip, aba, botão redondo de voltar/fechar e ação de texto — não só para o botão principal.

### Ícones

Um set só: contorno, grade de 24, traço 2 (2,4 quando ativo), pontas e cantos arredondados, todos SVG inline. **Sem emoji.** O ícone ativo da barra ganha preenchimento no miolo — não é outro desenho.
Continua sendo compatível com `lucide-react` (mesma grade e mesmo traço); o que muda é o peso quando ativo.

### Ilustração

Quatro peças vetoriais e só elas: **câmera · botão · quadra · apito.** Traço grosso, formas cheias, dois neutros + a cor de ação. Vivem em estado vazio e onboarding.
Emoji de esporte foi considerado e descartado: emoji renderiza diferente em cada aparelho, não aceita a paleta, e nenhuma das referências usa emoji como iconografia de produto.

### Voz

1. **O produto fala em primeira pessoa.** "A gente guarda", "a gente cola pra você".
2. **Título é situação, não funcionalidade.** "Marcou?" no lugar de "Salvar lance".
3. **A mesma ação tem UMA frase, repetida.** "Entrar pra ver meus lances" é sempre essa, em toda tela.

Sem gíria forçada: "bora", "cola", "manda", "a gente" são fala comum de quadra. "Rolê", "mandou bem demais" e emoji ficam de fora.

---

## Mapa: componente → arquivo que muda

`web/components/ui/` — 21 componentes hoje. Classificação do esforço:

| Componente | O que muda | Esforço |
|---|---|---|
| `Button` | só `Button.module.css`: fundo `--cor-acao`, texto branco, raio 16, rótulo no display, sombra na cor | **CSS** |
| `Input` | `Input.module.css`: fundo `--cor-superficie-2`, sem borda, foco por anel, raio 16 | **CSS** |
| `CodeInput` | 6 caixas brancas com sombra em vez de campos com borda; dígito no display 28px | **CSS** |
| `Chip` / `ChipFaixa` | 44px (já era), fundo neutro quente, ativo = preto cheio ou `--cor-acao-fraca`; ganha o `×` no chip selecionado | **CSS** + 1 prop (`removivel`) |
| `Card` / `Secao` | raio 18, sem borda, `--sombra-1`/`-2`; variante "painel" some | **CSS** |
| `ClipCard` | **horário vira o título** (era badge sobre a thumb); duração desce pro canto; estado "cortando…" ganha cara própria | **CSS + markup** |
| `ClipGrid` | só o `gap` e o `minmax` | **CSS** |
| `PartnerHeader` | capa fotográfica de 230px + folha branca sobreposta + brasão de 74px + abas com barra de 3px | **CSS + markup** — e precisa de `capaUrl` chegando (hoje o prop existe, nenhuma tela envia) |
| `LoginGate` | vira o par **prévia protegida + CTA fixo de rodapé** — deixa de ser um card no meio do scroll | **componente reescrito** |
| `ShareBar` | WhatsApp vira botão cheio verde com glifo; Instagram vira ladrilho com gradiente; Baixar/Copiar viram ladrilhos neutros | **CSS + markup** |
| `Player` | fundo `--cor-noite`; horário em 44px abaixo do vídeo; "estender lance" vira cartão PRO amarelo em vez de botão desabilitado | **CSS + markup** |
| `TimeRangePicker` | início/fim em display 22px dentro de blocos de 62px; botão de busca vira quadrado de 62px ao lado | **CSS + markup** |
| `EmptyState` | ganha **ilustração SVG** e o padrão "causa provável + horários vizinhos + falar com a arena" | **CSS + markup + 4 SVG novos** |
| `WeekSection` | "Semana" vira **"Rodada N"**, com contagem de lances à direita | **CSS + 1 string** |
| `MemberAvatars` | cores de avatar da paleta nova, borda na cor do fundo do cabeçalho | **CSS** |
| `InviteSheet` | folha com raio 26 e alça; `<dialog>` continua | **CSS** |
| `VirtualButton` | **reescrito como tela-herói**: 206px, gradiente radial, anel de onda, fundo escuro com brilho | **componente reescrito** |
| `StatusDot` | pílulas com fundo tingido (`#E4F4EA` / `#F0EBE4` / `#FFF3D6`) em vez de ponto + texto solto | **CSS** |
| `Toast` | preto sobre app claro (é a única superfície escura fora do player), ícone em círculo colorido | **CSS** |
| `Logo` | quadrado laranja com raio 12 + palavra no display | **CSS + SVG** |
| `AvisoDeExemplo` | tarja no neutro quente | **CSS** |
| **`BottomNav`** | **não existe** — 4 abas, 76px, pílula `#FFEDE2` no ativo, badge de contagem | **componente novo** |
| **`CtaFixo`** | **não existe** — barra branca fixa no rodapé com sombra pra cima + linha de microcopy | **componente novo** |
| **`ArenaCard`** | **não existe** — card grande com foto, status ao vivo, brasão, cidade | **componente novo** |
| **`ArteQuadra`** | **não existe** — o placeholder desenhado de quadra à noite, até haver foto real | **componente novo** |

---

## Estimativa de código

| Camada | O que é | Tamanho |
|---|---|---|
| **Só CSS/tokens** | `app/globals.css` reescrito inteiro + 14 `*.module.css`. Como todo hex de tema já vive num arquivo só e os nomes de token não mudam, isso é substituição de valor. Entram: `next/font` para Bricolage Grotesque, `color-scheme: light`, `theme-color` e `manifest.ts` para `#F6F3EF`, e `components/og.tsx` (que tem hex literal por design). | **~70% da mudança** |
| **CSS + markup em componente existente** | `ClipCard`, `PartnerHeader`, `ShareBar`, `Player`, `TimeRangePicker`, `EmptyState`, `Chip`. Estrutura interna muda, API pública quase não. | 7 componentes |
| **Componente reescrito** | `LoginGate` (vira prévia + CTA fixo) e `VirtualButton` (vira tela-herói). | 2 componentes |
| **Componente novo** | `BottomNav`, `CtaFixo`, `ArenaCard`, `ArteQuadra`, + o set de 4 ilustrações SVG. | 4 + 4 SVG |
| **Layout** | `app/layout.tsx` passa a renderizar `BottomNav` no mobile (o `design-system.md` §6.3 registra que a navegação já foi pro rodapé — aqui ela vira um componente de verdade, com abas nomeadas). Telas imersivas (player, botão virtual, onboarding, login) escondem a barra. | 1 arquivo + um flag por rota |
| **Telas novas** | `/app` como **escolha de arena** (hoje a home logada não tem essa cara) e `/entrar/comecar` como **onboarding de 3 telas** na primeira abertura. | 2 rotas |
| **Testes** | `tests/ui/` referencia classes e rótulos; os testes de `Chip`, `ClipCard`, `EmptyState`, `LoginGate` e `VirtualButton` mudam junto. `/dev/ui` precisa ganhar `BottomNav`, `CtaFixo`, `ArenaCard`. | ~6 arquivos |

**Fora de escopo desta direção, mas destravado por ela:**
- Upload de **capa e logo da arena** no painel (`C9`) — sem isso `PartnerHeader` mostra a arte desenhada para sempre, e o maior ganho visual fica na mesa.
- **Thumbnail real do relay** — o `ClipCard` desenha grama em CSS quando não há `thumbnailUrl`. Com fundo claro, a diferença entre thumbnail real e desenhada fica muito mais visível do que era no escuro.

---

## Decisões que foram além do briefing

1. **Laranja virou dois tokens, por acessibilidade e não por estética.** `#FF6B1F` sobre branco dá 2,8:1 — reprova em qualquer texto, e reprovaria em qualquer botão que usasse branco por cima. Em vez de abandonar a marca ou aceitar texto preto sobre laranja num app claro, a família ganhou `--cor-acao: #D93C06` (4,6:1 com branco). `#FF6B1F` continua sendo a marca, e continua aparecendo — sobre escuro, onde ele é lindo: o anel do botão virtual, o brilho do onboarding, o logo.
2. **Um artboard de VOZ, não só de cor.** Metade do "cheiro de IA" é texto, não pixel — e nenhuma folha de tokens captura isso. O bloco de voz em `Componentes.dc.html` traz as três regras e nove pares "hoje → direção nova" prontos para copiar. A regra nº 3 (uma frase por ação, repetida em toda tela) é o oposto do que um gerador faz, que é variar o rótulo a cada tela.
3. **O diagnóstico virou artefato de produto, não desabafo.** Cada um dos 12 sinais tem o valor exato do que está em produção (`#15171A` sobre `#0B0C0E`, chip de 40px, horário de 12px) e o que muda — e o artboard fecha com um bloco **"o que NÃO muda"**, listando tudo o que a v1 acertou. Isso muda o que o fundador aprova: não é "refazer o app", é "trocar a pele e manter o esqueleto" — e o `AntesDepois` prova isso com a mesma tela e os mesmos dados dos dois lados.

---

## Placeholders e pendências — o que conferir antes de virar código

- **A "foto" da quadra é desenhada em CSS/SVG** (céu, refletor com bloom, grama com listras de corte, linhas em perspectiva). É o *lugar* da foto, não a foto. Depende de `C9` (upload de capa).
- **Cidade da Arena Vasco.** O cadastro em produção não tem cidade; a página mostra "Piloto do Replay já · 2 quadras com câmera". Onde a direção precisa de cidade, o card é o da **Arena Calabouço (Vila Prudente · São Paulo)**, que é fixture existente. Definir o campo de cidade no cadastro.
- **"PRO" no estender lance.** A direção assume que é recurso do plano da arena. O PRD não define — decidir antes de mostrar o selo.
- **O contador "3 lances" da página pública exclui o clipe que ainda está sendo cortado.** Os artboards mostram **4** (20:47, 20:51, 21:03 e 21:12), com o quarto como `Cortando…` — a direção nova prefere mostrar o clipe em processamento a sumir com ele, porque sumir faz o atleta concluir que o produto comeu o lance dele.
- **Bug real, encontrado ao olhar produção:** a grade borrada da `/arena-vasco` deslogada carrega a marca d'água `ARENA CALABOUÇO` (fixture). Corrigir independente desta direção.
- **A barra inferior tem 4 abas porque o briefing pediu 4.** No Zé Delivery a ordem das 5 abas veio de analytics (promoveram "Cupons" porque era o 2º destino mais visitado dentro do Perfil, e tiraram a busca do cabeçalho porque 20% das sessões usavam busca). Vale medir antes de congelar: se "Grupos" for pouco usado e "Perfil" for onde o atleta acha os lances dele, a ordem muda.
- **Sem chrome falso de celular** nos artboards: nenhuma barra de status nem teclado desenhado. Na tela real o sistema desenha isso por cima.

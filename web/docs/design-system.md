# Design system do Replay já 2.0

O canvas de design virou código, e este documento é o mapa entre os dois: onde
cada artboard foi parar, quais tokens existem, o que ficou diferente do desenho e
por quê, e o que ainda falta.

> **Leia a seção 12 primeiro.** As seções 1 a 11 descrevem a **v1** (`design/`),
> que era escura e está registrada aqui como história — a arquitetura de
> informação, as decisões de acessibilidade e a razão de cada componente
> continuam valendo, palavra por palavra. O que mudou de VALOR — paleta,
> tipografia, raio, espaço — está na **seção 12**, que descreve a direção **v2
> "Luz de quadra"** (`design/v2/`), aprovada pelo fundador e no ar. Onde as duas
> divergirem, a 12 manda.

Catálogo visual de todos os componentes em todos os estados: **`/dev/ui`**
(só fora de produção — em produção a rota devolve 404).

---

## Sumário

1. [Como é organizado](#1-como-é-organizado)
2. [Por que CSS Modules e não Tailwind](#2-por-que-css-modules-e-não-tailwind)
3. [Tokens](#3-tokens)
4. [Componentes](#4-componentes)
5. [Artboard → tela → componentes](#5-artboard--tela--componentes)
6. [O que ficou diferente do canvas, e por quê](#6-o-que-ficou-diferente-do-canvas-e-por-quê)
7. [Acessibilidade](#7-acessibilidade)
8. [Open Graph e PWA](#8-open-graph-e-pwa)
9. [Dados de exemplo](#9-dados-de-exemplo)
10. [Medições](#10-medições)
11. [O que falta](#11-o-que-falta)
12. [Visual v2 — "Luz de quadra"](#12-visual-v2--luz-de-quadra) ← **a direção atual**

---

## 1. Como é organizado

```
web/
  app/globals.css            TODOS os tokens. Único arquivo com hex literal de tema.
  components/ui/
    <Componente>.tsx         o componente
    <Componente>.module.css  o estilo dele
    tipos.ts                 modelos de VISÃO (Clipe, Quadra, Status)
    index.ts                 o barril — importe sempre daqui
  components/og.tsx          a arte das imagens de Open Graph
  app/dev/ui/                o catálogo visual (404 em produção)
  app/**/<pagina>.module.css estilo específico de tela, quando não é componente
  lib/fixtures.ts            dados de EXEMPLO, marcados como tal na interface
```

Regra prática: **se aparece em duas telas, vira componente em `components/ui/`.**
Se é layout de uma tela só, fica num `*.module.css` ao lado da página.

Importe sempre do barril:

```tsx
import { Button, ClipGrid, EmptyState } from "@/components/ui";
```

---

## 2. Por que CSS Modules e não Tailwind

Decisão tomada nesta task, e vale registrar o raciocínio.

O produto tem ~20 componentes e nenhuma superfície de conteúdo arbitrário. O ganho
real do Tailwind — velocidade em telas descartáveis, muitas variações pontuais —
não se paga aqui. O custo, sim: mais uma etapa de build, um segundo vocabulário
competindo com os tokens como fonte da verdade, e o risco concreto de alguém
escrever `bg-[#FF6B1F]` em vez de `var(--cor-acento)`.

Com CSS Modules + variáveis, **o hex literal de tema só existe em
`app/globals.css`** — e isso é verificável com um grep:

```bash
grep -rnE '#[0-9a-fA-F]{6}' app components --include='*.css' --include='*.tsx' \
  | grep -v 'app/globals.css'
```

As duas exceções legítimas que esse grep encontra estão documentadas:

| Onde | Por quê |
|---|---|
| `components/og.tsx` | `ImageResponse` renderiza fora do navegador e não enxerga variável CSS. |
| `app/layout.tsx` (`themeColor`) | metadado do navegador, não aceita `var()`. |
| `app/painel/page.tsx` | as três cores ALTERNATIVAS de marca do canvas, mostradas como amostra do que a arena poderá escolher. Não são tokens. |

**Não misture os dois.** Se um dia entrar Tailwind v4 com `@theme`, ele substitui
`globals.css` — não convive com ele.

---

## 3. Tokens

Todos em `app/globals.css`, em `:root`. Tema escuro fixo (`color-scheme: dark`),
sem alternância: a interface é dominada por grama, e um tema claro faria o
conteúdo brigar com o fundo.

### Cor

| Token | Valor | Uso |
|---|---|---|
| `--cor-fundo` | `#0B0C0E` | fundo de todas as telas |
| `--cor-fundo-player` | `#08090A` | só o player — o vídeo tem de ser a coisa mais clara |
| `--cor-superficie` | `#15171A` | cards, campos, barras |
| `--cor-superficie-2` | `#1D2025` | chips neutros, avatar, linha selecionada |
| `--cor-borda` | `#2A2E34` | contorno de 1px e divisor |
| `--cor-borda-forte` | `#3A3F47` | hover e foco, onde a borda normal some |
| `--cor-acento` | `#FF6B1F` | ação primária, chip ativo, marca |
| `--cor-acento-claro` | `#FF8A4D` | hover de link e de botão primário |
| `--cor-acento-texto` | `#0B0C0E` | o que se escreve EM CIMA do laranja |
| `--cor-acento-fraco` / `-borda` | laranja 14% / 42% | chip de atalho ativo |
| `--cor-ok` / `--cor-ao-vivo` | `#00C46A` | câmera online, WhatsApp, confirmação |
| `--cor-erro` / `--cor-gravando` | `#FF4D4D` | gravando, câmera offline |
| `--cor-texto` | `#F2F4F6` | principal |
| `--cor-texto-2` | `#9AA1AA` | secundário |
| `--cor-texto-3` | `#848B94` | apoio — **divergência do canvas, ver §6** |
| `--cor-quadra-clara` / `-escura` | `#1E7A42` → `#0E3E23` | gradiente de grama |
| `--cor-quadra-marca` | `#0F3D23` | o brasão verde da arena |
| `--cor-veu` / `-forte` | preto 75% / 88% | badge sobre a miniatura |
| `--cor-marca` | branco 72% | a marca d'água no canto |

**Por que laranja:** a interface é dominada por verde (grama). Verde-limão
brigaria com o próprio conteúdo; laranja é complementar, então botão e chip ativo
saltam de qualquer miniatura. Também separa a marca de um segmento dominado por
verde e azul, e texto preto sobre o laranja passa AA em botão grande.

**Ao vivo ≠ gravando.** São dois estados diferentes e têm cores diferentes: a
câmera está *online* (verde, condição saudável) enquanto a sessão pode estar
*gravando* (vermelho, evento em andamento). Só o "gravando" pulsa — se tudo
pisca, nada chama.

### Tipografia

`Archivo` 700/800 (títulos, abas, botões, números grandes) e `Barlow` 400–700
(corpo e UI), ambas por `next/font/google`: baixadas no build e servidas do nosso
domínio, sem requisição ao Google e sem FOUT de rede no 4G da quadra.

Escala: `--texto-40 / 32 / 27 / 22 / 19 / 17 / 16 / 15 / 14 / 13 / 12 / 11`.
Rótulo maiúsculo usa `--rotulo-espacamento: .09em`; título usa
`--titulo-espacamento: -.025em`.

**Todo horário, contador e duração usa `font-variant-numeric: tabular-nums`**
(classes globais `.tempo`, `.contador`, elemento `<time>`). Horário é a
informação que o atleta procura; com fonte proporcional, a coluna dança a cada
dígito.

### Forma, espaço e toque

- Raios: `--raio-6 / 10 / 12 / 14 / 18 / 24 / --raio-pilula`.
- Espaços: `--e-4 / 8 / 12 / 16 / 20 / 24 / 32`.
- Toque: `--toque-min: 44px` (mínimo WCAG 2.5.5), `--toque: 52px` (padrão),
  `--toque-principal: 56px` (ação principal). O produto é usado de pé, com o
  celular na mão, às vezes com a mão suada — é o contexto que justifica ficar
  acima do mínimo em vez de nele.
- `--transicao: 140ms ease`, `--foco: 2px solid var(--cor-acento)`.

### Classes globais

`.pagina`, `.pagina-estreita`, `.pagina-painel`, `.pilha`, `.rotulo`, `.apoio`,
`.apoio-3`, `.erro`, `.ok`, `.tempo`, `.grama`, `.apenas-leitor`,
`.pular-para-conteudo`.

---

## 4. Componentes

Todos em `components/ui/`. Props e comentários em pt-BR.

| Componente | O que resolve | Estados |
|---|---|---|
| `Button` | ação e navegação com a mesma aparência (`href` → `<Link>`) | primário/secundário/fantasma/perigo · 44/52/56 · carregando · ícone antes/depois · desabilitado legível |
| `Input` | campo com rótulo obrigatório, dica e erro amarrados por `aria-describedby` | erro, ícone, sufixo, desabilitado |
| `CodeInput` | os 6 dígitos do login | avanço automático, colar em qualquer caixa, autopreencher do iOS, Backspace que volta, setas, erro |
| `Chip` + `ChipFaixa` | quadra e atalho de horário | selecionado (laranja cheio), suave (laranja translúcido), com ponto, desabilitado |
| `Card` + `Secao` | a superfície elevada e o cabeçalho de seção | padrão / painel (raio 18) / nu · clicável |
| `ClipCard` | a unidade de conteúdo do produto | pronto · processando (não clicável) · parcial · denso |
| `ClipGrid` | a grade, como `<ul>` de verdade | denso · borrado (`aria-hidden` + `inert`) · vazio |
| `PartnerHeader` | capa, brasão, nome, estado e abas | abas como links com `aria-current` |
| `LoginGate` | o convite por cima da prévia borrada, com contador | com/sem contador |
| `ShareBar` | Baixar · WhatsApp · Instagram · Copiar link | Web Share com arquivo → Web Share com link → `wa.me`/clipboard · deslogado vira link de login |
| `Player` | `<video controls>` nativo + navegação + estender lance | sem arquivo, marca de referência em 4 cantos, ±8 s desabilitado com explicação visível |
| `TimeRangePicker` | data + início/fim, com atalhos ANTES | agora · última hora · ontem à noite · aviso de janela > 6 h · aviso de janela invertida |
| `EmptyState` | vazio propositivo | ações, horários vizinhos, causa provável |
| `WeekSection` | uma semana da página do grupo | com lances, sem lances, cabeçalho grudado |
| `MemberAvatars` | quem está no grupo | iniciais + "+N" |
| `InviteSheet` | convite por link/WhatsApp/e-mail | `<dialog>` nativo (trava de foco, Esc, backdrop) |
| `VirtualButton` | "Salvar lance" | pronto · salvando · cooldown com anel e contagem · confirmação com horário · desabilitado com motivo |
| `StatusDot` | online/offline/gravando | pílula, rótulo visível ou só em `aria-label` |
| `Toast` + `ToastProvider` + `useToast` | aviso passageiro | ok · erro (`role="alert"`) · info |
| `Logo` | a marca em SVG inline | com e sem palavra |
| `Voltar` | a SAÍDA de toda tela com cabeçalho | seta/× · claro/escuro · com e sem rótulo ao lado |
| `AvisoDeExemplo` | a tarja "isto é dado de exemplo" | — |

Decisões que valem repetir:

- **`Button` também é link.** Metade das "ações" do produto é navegação. Renderizar
  navegação como `<button onClick={router.push}>` quebra abrir em nova aba, copiar
  o endereço e a pré-busca — num produto que vive de link compartilhado.
- **Abas são links, não `role="tablist"`.** Cada aba é um endereço (`?aba=sobre`):
  a arena manda a aba no WhatsApp, o botão voltar funciona e a página continua
  renderizada no servidor.
- **`InviteSheet` usa `<dialog>` nativo.** Trava de foco, Esc, `inert` no resto da
  página e camada de topo, de graça.
- **`Player` usa `<video controls>` nativo.** Tela cheia, PiP, velocidade e o
  gesto de arrastar no tempo já existem; um player próprio seria pior em
  acessibilidade para um clipe de 22 s.
- **`Voltar` é um `<a href>`, não um `<button>`.** A saída tem de existir antes de
  o JavaScript hidratar: no 4G da quadra, um botão não hidratado é uma tela sem
  saída. O `href` é o destino de quem chegou por link externo; o JavaScript só
  intercepta para voltar no histórico quando existe tela nossa atrás. A regra
  inteira, e por que ela não pode sair do navegador, está em `README.md` §13.

---

## 5. Artboard → tela → componentes

| Artboard | Rota | Componentes |
|---|---|---|
| `Main` | `/` | `Logo`, `Card`, `StatusDot`, `Button` |
| `Login` | `/entrar` (etapa 1) | `Logo`, `Input`, `Button` |
| `LoginCodigo` | `/entrar` (etapa 2) | `CodeInput`, `Button` |
| `Parceiro` | `/[arenaSlug]` (aba Lances, deslogado) | `PartnerHeader`, `LoginGate`, `ClipGrid` borrado, `StatusDot` |
| `ParceiroSobre` | `/[arenaSlug]?aba=sobre` | `PartnerHeader`, `Secao`, `Card`, `StatusDot` |
| — | `/[arenaSlug]?aba=grupos` | `PartnerHeader`, `Card`, `EmptyState` |
| `Main` | `/app` (logado) — a escolha da arena | `Secao`, `StatusDot`, `EmptyState` |
| `Busca` | `/app/buscar?arena=…` (a arena é obrigatória) | `Chip`, `ChipFaixa`, `TimeRangePicker`, `Button`, `ClipGrid` |
| `BuscaVazia` | `/app/buscar` (sem resultado) | `EmptyState` com sugestões |
| `Player` | *ainda sem rota* — catálogo `/dev/ui` | `Player`, `ShareBar`, `ClipGrid` denso |
| `Sessao` | `/[arenaSlug]/s/[sessionSlug]` | `Card`, `Button`, `ClipGrid`, `ShareBar`, `EmptyState` |
| `CriarGrupo` | `/[arenaSlug]/grupos/novo` | `Input`, `Chip`, `ChipFaixa`, `Button` |
| `Grupo` | `/[arenaSlug]/[groupSlug]` | `MemberAvatars`, `InviteSheet`, `ShareBar`, `WeekSection` |
| `BotaoVirtual` | `/app` (bloco, desabilitado) | `VirtualButton`, `StatusDot` |
| `Painel` | `/painel` e `/painel/cameras` | KPIs, `StatusDot`, gráfico em CSS, `MarcaDagua`, `Card` |
| `Sistema` | `/dev/ui` | o catálogo inteiro |

---

## 6. O que ficou diferente do canvas, e por quê

1. **`--cor-texto-3` passou de `#6E757E` para `#848B94`.** É a única divergência
   de COR. O valor do canvas dá 3,8:1 sobre a superfície e 4,1:1 sobre o fundo —
   abaixo do mínimo AA de 4,5:1 — e é justamente a cor dos rótulos pequenos e
   maiúsculos ("ONDE VOCÊ JOGOU?", "Início", "Fim"). O Lighthouse pegou na home.
   O novo valor passa nas três superfícies (5,6:1 / 5,2:1 / 4,7:1) e mantém os
   três níveis de hierarquia.
2. **Chip tem 44px de altura, o canvas desenha 40.** A régua do próprio design
   manda 44 de alvo mínimo; o chip é tocado com o polegar enquanto a faixa rola.
3. **A navegação do app foi para o RODAPÉ no celular.** O canvas não desenha
   navegação persistente; num celular de 6,7", o topo não é alcançável com o
   polegar. No desktop ela volta para cima.
4. **A grade de lances é responsiva (`auto-fill minmax(150px, 1fr)`)**, não duas
   colunas fixas. O mesmo componente serve a busca (390px) e a sessão no desktop.
5. **A marca d'água do player é um overlay de REFERÊNCIA.** A marca de verdade é
   queimada no arquivo pelo relay — é ela que sobrevive a um download e a um
   repost. O overlay some quando o vídeo já vem marcado (`marcaQueimada`).
6. **Estado "processando" e "parcial" do clipe não existem no canvas.** Vieram do
   modelo de dados: o corte demora alguns segundos e pode sair mais curto que 22 s
   quando a câmera teve lacuna. Sem esses rótulos, o atleta conclui que o produto
   comeu o lance dele.
7. **O botão "estender lance ±8 s" nasce desabilitado com explicação em TEXTO**,
   não em `title` — `title` não existe no toque, e o produto é de celular.
8. **A busca de arenas da home está desenhada e inerte** (`readOnly`, com o
   caminho alternativo escrito ao lado). `readOnly` e não `disabled` de propósito:
   `disabled` tira do Tab e some do leitor de tela.
9. **Sem Storybook.** O catálogo é a rota `/dev/ui`, que renderiza os componentes
   no ambiente real (mesmas fontes, mesmos tokens, mesmo bundler) e devolve 404 em
   produção.
10. **Ícones vêm de `lucide-react`**, exceto o glifo do Instagram — a v1 da
    biblioteca removeu os ícones de marca, então ele é um SVG desenhado à mão em
    `ShareBar.tsx`.

---

## 7. Acessibilidade

O que é garantido pelo sistema, não por disciplina de quem escreve tela:

- **Foco visível global.** `:focus-visible` com contorno no acento, definido uma
  vez em `globals.css`. Sem isso, a navegação por Tab é invisível sobre `#0B0C0E`.
- **"Pular para o conteúdo"** é a primeira parada do Tab em toda página
  (`app/layout.tsx`); toda `<main>` tem `id="conteudo"`.
- **Contraste ≥ 4,5:1** em todo texto — inclusive o desabilitado, que troca de
  cor em vez de receber `opacity: .5` (o botão "estender lance" nasce desabilitado
  e precisa ser lido).
- **Alvos ≥ 44px** em botão, chip, aba, item de navegação e ação de barra.
- **Cor nunca é o único sinal.** `StatusDot` sempre emite texto (visível ou em
  `aria-label`); a aba ativa tem cor *e* sublinhado *e* `aria-current`.
- **A grade borrada do gate é `aria-hidden` + `inert`:** quem usa leitor de tela
  ouve o convite, não seis lances fantasma, e o foco não some atrás do desfoque.
- **Erro de formulário é `role="alert"`** e fica no campo; o toast só carrega o
  que é dispensável depois de lido.
- **`prefers-reduced-motion`** desliga animação e transição globalmente — e por
  isso nenhuma informação depende de movimento.
- O gráfico do painel é decorativo (`aria-hidden`) com a série completa em texto
  `.apenas-leitor` ao lado; a tabela de câmeras tem `<caption>`, `<th scope>` e
  rola dentro do próprio container.

---

## 8. Open Graph e PWA

**Open Graph** — `components/og.tsx` desenha a arte (fundo escuro, laranja, nome
da arena) e três rotas a usam: `app/[arenaSlug]/opengraph-image.tsx`,
`.../s/[sessionSlug]/opengraph-image.tsx` e `.../[groupSlug]/opengraph-image.tsx`.

A ADR §4.1 diz que imagem de OG é produzida na INGESTÃO e nunca em runtime. Isso
continua valendo para a arte que a arena envia: quando `og_image_object_key`
existe, `generateMetadata` declara `openGraph.images` e a rota nem roda. O que
estas rotas cobrem é o **fallback de identidade** — arena sem arte, sessão e grupo,
que nunca terão imagem por upload. Sem isso, o link no WhatsApp aparece como um
retângulo cinza, que é o pior resultado possível para um produto que vive de link
compartilhado. O custo é contido por três decisões: `revalidate` de 1 dia, arte
só com caixas e texto (sem foto, sem fonte customizada) e **nenhum dado pessoal
na imagem** — nunca thumbnail.

**PWA** — `app/manifest.ts` (servido como `/manifest.webmanifest`),
`public/icone.svg` e os PNG 192/512 gerados por `pnpm icones`
(`scripts/gerar-icones.mjs`, encoder PNG puro com `zlib`, sem dependência
nativa). `theme-color: #0B0C0E` e `viewport` já vinham do layout — e
`maximumScale` continua destravado, porque travar zoom é barreira real de
acessibilidade.

**Sem service worker**, de propósito: o conteúdo é vídeo servido por CDN assinada
com URL de vida curta. Um cache offline ou guardaria nada de útil ou guardaria
imagem de pessoa no aparelho — e a segunda hipótese é um problema de LGPD que não
compensa.

---

## 9. Dados de exemplo

`lib/fixtures.ts`. Arena Calabouço, quatro quadras, clipes com horários de pelada
de verdade (20:47, 20:51, 20:58…).

Três regras impedem que isso vaze para produção como se fosse real:

1. Todo `id` de fixture começa com `exemplo-`.
2. Toda tela que usa fixture **mostra na interface** que aquilo é exemplo, pelo
   componente `AvisoDeExemplo`.
3. Quando a consulta real existir, a página deixa de importar o arquivo — e
   `grep -rn "lib/fixtures" app/` diz exatamente quantas telas ainda faltam.

Hoje usam fixture: `/` (a arena sugerida) e a **grade borrada do gate** de
`/[arenaSlug]`, `/[arenaSlug]/s/[sessionSlug]` e `/[arenaSlug]/[groupSlug]` —
essa última por decisão de privacidade, não por falta de consulta: mostrar
thumbnail real a quem não está logado é exatamente o que a regra proíbe.

A sessão, o grupo e a busca passaram a ler o banco de verdade nesta task
(`clipesDaArena` e `clipesDoGrupoPorSessao`), e por isso deixaram de importar
`AvisoDeExemplo`.

---

## 10. Medições

`pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` passam. Os testes de
componente vivem em `tests/ui/` e declaram `@vitest-environment jsdom` no próprio
arquivo — o padrão da suíte continua sendo Node.

Lighthouse 12, Chrome headless, perfil mobile, contra `next start` (build de
produção, `http://localhost:3100`):

| Rota | Performance | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| `/` | **97** | **100** | 100 | 91 |
| `/entrar` | **99** | **100** | 100 | 54 |

- O SEO 91 da home é a auditoria `meta-description`: a página é dinâmica (lê a
  sessão), então o Next transmite o `<meta>` depois do corpo. A tag existe no
  documento final.
- O SEO 54 de `/entrar` é esperado e correto: a tela de login é `noindex`.
- **A página do parceiro não foi medida**: ela depende do banco e não há
  `DATABASE_URL` no ambiente local, então responde 404. Ela usa os mesmos
  componentes e o mesmo CSS das duas medidas, sem imagem bitmap e sem script
  adicional — mas a medição precisa ser refeita quando houver uma arena semeada.

Reproduzir:

```bash
pnpm build
pnpm start -p 3100
npx lighthouse http://localhost:3100/ --form-factor=mobile \
  --only-categories=performance,accessibility --chrome-flags="--headless=new"
```

---

## 11. O que falta

| Pendência | Onde | Quem resolve |
|---|---|---|
| ~~Rota do player de um clipe~~ | **feito** — `/[arenaSlug]/c/[clipId]`, com URL assinada de 6 h | — |
| ~~Consulta da busca~~ | **feito** — `/app/buscar` consulta `clipesDaArena`, no fuso da arena | — |
| ~~Lances de uma sessão e de uma semana~~ | **feito** — a sessão usa a mesma `clipesDaArena` da busca; o grupo usa `clipesDoGrupoPorSessao`, com as semanas derivadas do filtro recorrente | — |
| ~~Criar grupo~~ | **feito** — `/[arenaSlug]/grupos/novo`, com preview do slug e selo de disponibilidade conferido no servidor | — |
| Editar/sair do grupo | só criar e entrar existem; o banco já tem a trava de dono e a promoção do membro mais antigo | D4 |
| Aviso semanal por e-mail | `notify_weekly` tem coluna e não tem remetente | depende de G-4 (Resend) |
| ~~Métricas do painel~~ | **feito** — KPIs e gráfico saem de `clip`/`trigger_event` | — |
| Upload de logo, cor da arena e marca d'água | botões desenhados e desabilitados | C9 / backend |
| "Estender lance ±8 s" | botão desabilitado com dica | backend (recorte a partir do segmento bruto) |
| ~~Botão virtual ao vivo~~ | **feito** — `/app/botao?arena=&quadra=`, com `POST /api/triggers` e polling até ficar pronto. O gate de "sessão ao vivo" virou o estado REAL da câmera, que é o sinal certo: o que decide se dá para salvar um lance é haver gravação, não haver horário marcado | — |
| Preview de vídeo real e thumbnail do relay | `ClipCard` desenha grama em CSS quando não há `thumbnailUrl` | ingestão |
| ~~`<a download>` entre origens~~ | **feito** — `GET /api/clips/{id}/download` redireciona para uma URL assinada de 15 min com `response-content-disposition=attachment` | — |
| Capa da arena | `PartnerHeader` aceita `capaUrl`, nenhuma tela envia | C9 |
| Patrocínio no player | nem no PRD nem no canvas | produto |
| Lighthouse da página do parceiro | agora há seed (`pnpm seed:piloto`) | medir depois do E2E |
| Estado do clipe no `ClipCard` | `processando` nasce sem `href` e sem miniatura (o relay ainda não subiu a thumb): o card fica com a grama em CSS por alguns segundos | ingestão |
| `VirtualButton` engole o erro do gatilho | ele deixou de confirmar e de iniciar o cooldown quando `onSalvar` lança — quem mostra a frase é quem chamou (a `ShareBar` do toast). Se um dia houver um segundo chamador, a mensagem precisa sair de um lugar só | — |

---

## 12. Visual v2 — "Luz de quadra"

O fundador aprovou a direção nova (`design/v2/`) e ela está no ar. Esta seção é o
delta: o que mudou em relação a tudo o que está escrito acima, o que ficou
diferente do canvas da v2 e o que continua pendente.

**A direção em cinco linhas.** App claro, player escuro. Fundo quente, card
branco, zero borda. Laranja em dois tons. Foto é o herói. Chassi de app de
verdade: barra de abas, CTA fixo, estados vazios ilustrados e voz em primeira
pessoa.

Nada da arquitetura de informação mudou. Gate na ação e não na chegada, página da
arena pública, atalhos de horário antes do seletor, sessão vira grupo, botão como
link, abas como URL, alvo ≥44px, contraste AA. **Foi troca de pele, não de
esqueleto.**

### 12.1 Tokens — o que mudou de valor

| Token | v1 | v2 | Por quê |
|---|---|---|---|
| `--cor-fundo` | `#0B0C0E` | `#F6F3EF` | Todo app de consumo brasileiro é claro. Escuro lia como ferramenta de dev. |
| `--cor-superficie` | `#15171A` | `#FFFFFF` | O card virou objeto tocável, separado por sombra e não por borda. |
| `--cor-linha` (era `--cor-borda`) | `#2A2E34` | `#EAE3DA` | **Só divisor.** Nunca contorno de card. |
| `--cor-marca` | — | `#FF6B1F` | A marca. Sobre escuro, e só. |
| `--cor-acao` (era `--cor-acento`) | `#FF6B1F` | `#D93C06` | Branco em cima passa AA (4,57:1); o laranja da marca dava 2,8:1. |
| `--cor-acao-escrita` | — | `#C23604` | O laranja como TEXTO. Ver 12.4. |
| `--cor-texto-3` | `#848B94` | `#726961` | Ver 12.4 — o valor do canvas reprovava. |
| `--cor-pro` | — | `#FFC83D` | Premium e "cortando…". A cor mais rara do sistema. |
| `--cor-noite` / `--cor-tinta` | — | `#0F1419` / `#16130F` | As duas superfícies escuras que sobraram. |
| `--fonte-titulo` | Archivo | **Bricolage Grotesque 800** | Archivo e Barlow são dois grotescos neutros quase idênticos em tela: o título lia como "o corpo em negrito". |
| `--fonte-corpo` | Barlow | **Archivo 400/700** | Só uma fonte nova entra; Archivo fica como face de UI. |
| Escala de raio | doze valores | **seis** (8/14/16/18/26/pílula) | `18` é O raio do card e se repete em quase toda superfície — a repetição é metade do efeito. |
| Escala de texto | 40/32/27/22/19/17… | **54/44/38/34/30/24/20/17/16/15/14/13/12/11** | Salto de verdade entre níveis; antes seção, item e aba tinham todos 17px. |
| Espaço | 4/8/12/16/20/24/32 | **4/8/12/14/20/24/28/40** | Dois níveis: 12–14 dentro de um grupo, 24–28 entre grupos. `20` é a margem lateral de toda tela. |

**Os nomes da v1 continuam valendo.** `--cor-acento`, `--cor-borda`, `--raio-12`,
`--texto-32`, `--e-16` e companhia viraram **apelidos** apontando para os valores
novos, num bloco marcado "compatível" no fim de `:root`. É o que faz as sete telas
do painel — entregues no mesmo dia, e fora do escopo desta rodada — herdarem a
paleta clara sem uma linha editada. A lista encolhe conforme os módulos migram;
nada de novo deve usar um apelido.

### 12.2 As duas superfícies escuras

`.noite` e `.tinta` são classes globais que **redefinem os mesmos tokens** em vez
de introduzir um vocabulário paralelo — assim `Button`, `Chip`, `StatusDot` e
`ShareBar` funcionam nas duas superfícies sem uma variante "escura" por
componente.

| Classe | Cor | Onde | Por quê escuro |
|---|---|---|---|
| `.noite` | `#0F1419` (azulado) | player, botão virtual | O vídeo tem de ser a coisa mais clara da tela; e o botão é usado na beira da quadra, à noite. |
| `.tinta` | `#16130F` (preto quente) | onboarding, cabeçalho do grupo, faixa do login, toast | São cartazes, não salas escuras. |

É uma classe e não um `@media (prefers-color-scheme)`: o modo escuro aqui é
decisão de TELA, não do aparelho. `themeColor` acompanha por rota (`viewport`
próprio em `/bem-vindo`, `/app/botao` e `/[arena]/c/[clipId]`) — sem isso o
Android desenha a barra de status em `#F6F3EF` por cima de uma tela `#0F1419` e a
emenda denuncia "isto é um site dentro de um navegador".

### 12.3 Componentes

**Novos.** `BottomNav` (4 abas, 76px, ativa com três sinais), `CtaFixo` (rodapé
fixo com safe-area), `ArenaCard` (capa, "gravando agora", brasão), `ArteQuadra`
(a quadra à noite desenhada em CSS, o lugar da foto), `Ilustracao` (as quatro
peças: câmera · botão · quadra · apito).

**Reescritos.** `LoginGate` (deixou de carregar o botão e faz uma coisa só: a
prova de que há conteúdo) e `VirtualButton` (tela-herói de 206px com anel de
onda).

**Markup alterado.** `ClipCard` (o horário virou o TÍTULO do card e o clipe em
corte ganhou cara própria), `PartnerHeader` (capa de 230px + folha branca de raio
26 + brasão de 74), `ShareBar` (WhatsApp vira botão verde cheio, os outros três
viram ladrilhos de 58), `Player` (horário em 44px, cartão PRO), `TimeRangePicker`
(blocos de 62 com o horário no display e a lupa ao lado), `EmptyState`
(ilustração + causa provável + horários vizinhos em pílulas), `Chip` (prop
`removivel`), `WeekSection` ("Rodada N" no lugar de "Semana").

**Só CSS.** `Button` (+ variante `preto`), `Input`, `CodeInput`, `Card`,
`ClipGrid`, `StatusDot` (+ estado `cortando`), `Toast`, `Logo`, `MemberAvatars`,
`InviteSheet`, `AvisoDeExemplo`.

**Rotas novas.** `/app/lances` e `/app/perfil` — a barra de quatro abas exige que
as quatro levem a algum lugar, e "Lances" apontando para uma busca que recusa
rodar sem arena seria uma aba que pisca e volta. `/bem-vindo` — as três telas da
primeira abertura.

### 12.4 O que ficou diferente do canvas da v2, e por quê

1. **`--cor-texto-3` é `#726961`, e não `#786F66`.** O canvas anota "4,7:1", que é
   o contraste contra o BRANCO. Contra `--cor-fundo` ele dá **4,45:1** e contra
   `--cor-superficie-2` **4,15:1** — reprova nas duas, e é justamente a cor dos
   rótulos ("SEU E-MAIL", "Início", "Fim") e das linhas de apoio. O Lighthouse
   pegou em `/entrar` e em `/arena-vasco`. `#726961` passa nas três (4,86 / 5,37 /
   4,53).
2. **Existe um terceiro laranja: `--cor-acao-escrita` (`#C23604`).** O canvas
   validou `--cor-acao` como FUNDO (branco por cima, 4,57:1 ✓). Como TEXTO sobre
   as superfícies claras ele dá 4,13 e 3,85 — reprova. A regra virou: **`--cor-acao`
   pinta, `--cor-acao-escrita` escreve.** O apelido `--cor-acento` aponta para o
   tom de escrita, porque o painel ainda escreve em laranja com ele.
3. **A aba ativa da barra inferior não tem "miolo preenchido".** O canvas desenha
   os ícones da barra com o centro preenchido quando ativos. O produto usa
   `lucide-react` — um set só, mesma grade, mesmo traço — e a lucide não tem
   versão preenchida dos quatro ícones. Os três sinais viraram **pílula + cor +
   traço 2,4** (contra 2), que continua sendo três, e `aria-current="page"` diz o
   mesmo para o leitor de tela. Trocar a lucide por um set desenhado à mão para
   ganhar o preenchimento custaria mais do que entrega.
4. **Os horários com lance NÃO aparecem na arena deslogada.** O artboard mostra
   "20:47 · 20:51 · 21:03" em pílulas para quem não entrou. O contador é uma
   contagem agregada, mas uma lista de horários diz a qualquer um que passou
   alguém naquela quadra naquele minuto — e a regra do produto é que nada que
   aponte para um vídeo específico existe sem login (`api/README.md` §3). Ficou de
   fora, e está em 12.6 como decisão de produto a tomar.
5. **`Secao` recebe o título como `<span className="rotulo">`.** Os artboards
   usam rótulos de 11px em caixa alta onde o componente tinha um `<h2>` de 22px. O
   `<h2>` continua existindo na árvore (o sumário do leitor de tela não muda); o
   que mudou foi a pele.
6. **O e-mail do código ficou claro.** Não está no canvas — o canvas não cobre
   e-mail. A v1 mandava um cartão preto, que num cliente de e-mail claro chega
   como um bloco escuro no meio da caixa de entrada: aparência de spam
   promocional.
7. **Sem emoji.** O briefing desta rodada pedia "estados vazios ilustrados / com
   emoji"; o canvas da v2 descarta emoji explicitamente, e por três razões que
   continuam valendo: ⚽ renderiza diferente em cada aparelho, não aceita a paleta
   e nenhuma referência brasileira usa emoji como iconografia de produto. Ficaram
   as quatro peças vetoriais.

### 12.5 Os dois bugs que o design encontrou

1. **A marca d'água da fixture na página de outra arena.** A grade borrada do gate
   vinha de `lib/fixtures.ts`, e a fixture carrega `ARENA CALABOUÇO` queimada —
   então `/arena-vasco` deslogada exibia, borrada mas legível, a marca de outra
   arena. `LoginGate` ganhou a prop `marca`, que sobrescreve o que vier na
   amostra; sem ela a prévia sai sem marca nenhuma, em vez de mentir.
2. **O contador escondia o lance que estava saindo do forno.**
   `lancesDeHojeNaArena` contava só `ready` e `partial`, e o `ClipCard` de
   `processando` era um card apagado com um selo. Quem acabou de apertar o botão
   abre a página nos 30 segundos seguintes e concluía que o produto comeu o lance
   dele. Agora a consulta conta o mesmo conjunto que `clipesDaArena` mostra
   (`pending`, `cutting`, `processing`, `uploading`) e o card desenha um ladrilho
   preto com o relógio amarelo e "Cortando… fica pronto em ~30 s". **Duas
   contagens da mesma coisa sempre divergem, e a que mente é sempre a que o
   usuário vê primeiro.**

### 12.6 Medições da v2

Lighthouse mobile (Chrome headless 152, `next start` sobre o build de produção,
banco do piloto):

| Rota | Performance | Acessibilidade | Boas práticas |
|---|---|---|---|
| `/` | 100 | **100** | 100 |
| `/entrar` | 97 | **100** | 100 |
| `/arena-vasco` (deslogada) | 98 | **100** | 100 |
| `/bem-vindo` | 97 | **100** | 100 |

`/` é medido com `--disable-storage-reset` e o `localStorage` semeado: uma
primeira abertura de verdade é redirecionada para `/bem-vindo`, que está medida
na linha de baixo. Capturas das seis telas principais no celular (390×844,
`deviceScaleFactor: 2`): `web/docs/capturas/v2/`.

**Hex fora de `globals.css`:** três arquivos, todos por impossibilidade técnica e
todos comentados no próprio arquivo — `components/og.tsx` (Satori não tem CSSOM),
`lib/email.ts` (cliente de e-mail não tem CSSOM) e o gradiente do Instagram em
`ShareBar.module.css` (marca de terceiro, que não é cor do nosso sistema). Mais
`public/icone.svg`, que é um asset, e os `themeColor` por rota, que são metadados
do Next e não aceitam variável.

### 12.7 O que a v2 deixou pendente

| Pendência | Onde | Quem resolve |
|---|---|---|
| Capa da arena | `PartnerHeader` aceita `capaUrl` e a página manda a imagem de OG quando existe; um campo de capa próprio ainda não existe | C9 (upload no painel) |
| Thumbnail real do relay | com fundo claro a diferença entre a grama desenhada e o frame real ficou muito mais visível do que era no escuro | ingestão |
| Horários com lance na arena deslogada | ver 12.4 nº 4: é decisão de privacidade, não esquecimento | produto |
| Cidade no cadastro da arena | os cards de arena caem no `tagline` quando não há cidade | cadastro |
| "PRO" no estender lance | o cartão amarelo assume que é recurso do plano da arena; o PRD não define | produto |
| Badge da aba "Grupos" | `BottomNav` aceita `badge`, nenhuma tela calcula "grupos com lance novo" | produto + consulta |
| Ordem das quatro abas | veio do briefing, não de analytics — vale medir antes de congelar | produto |
| Ícone ativo preenchido na barra | ver 12.4 nº 3 | só com um set próprio |

### 12.8 O que a rodada de 2026-09-13 mudou no sistema

Três regras novas saíram dos seis bugs que o fundador achou em produção. A causa
e a correção de cada um estão em `README.md` §13; aqui ficam só as que qualquer
componente novo tem de respeitar.

**O recuo de uma faixa rolável é do CONTAINER, não do componente.** `ChipFaixa`
sangra e devolve `--faixa-recuo`, e quem embala é quem declara o valor — a página
diz 20 (a margem de toda tela), o cartão branco da busca diz 14 (a margem interna
dele). Um valor fixo dentro do componente foi o bug 1. Vale para `scroll-padding`
também, senão a rolagem por teclado desfaz o que o `padding` desenhou. E o
`padding-block` não é enfeite: `overflow-x: auto` obriga o eixo vertical a `auto`,
então a sombra das pílulas cabe ou é cortada — não há terceira opção.

**Um `<dialog>` herda os tokens do pai no DOM, mesmo na camada de topo.** A folha
de convite é aberta de dentro do cabeçalho `.tinta` do grupo e recebia
`--cor-superficie: rgba(255,255,255,0.07)` — ela aparecia transparente (bug 4).
Toda superfície que tem de ser clara em qualquer contexto veste a classe global
**`.luz`**, que é o MESMO bloco de `:root` com o seletor compartilhado (não uma
segunda lista de hex). `tests/../chassi.test.ts` falha se alguém escurecer um
token em `.noite`/`.tinta` sem ele ter valor claro em `.luz`.

**Toda tela do atleta tem barra inferior ou um `Voltar` que funciona.** Não as
duas, nunca nenhuma. As telas fora de `/app` renderizam `BottomNav` por conta
própria quando há sessão, e `CtaFixo` quando não há — `com-barra` e `com-cta`
reservam o mesmo espaço e não podem aparecer juntas. `abaAtivaDe` sabe ler as
rotas de arena; a tabela completa está no README.

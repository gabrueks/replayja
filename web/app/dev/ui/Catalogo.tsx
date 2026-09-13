"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Search, Share2, Video } from "lucide-react";
import {
  ABAS_DO_ATLETA,
  ArenaCard,
  ArteQuadra,
  BottomNav,
  Button,
  Card,
  Chip,
  ChipFaixa,
  ClipCard,
  ClipGrid,
  CodeInput,
  CtaFixo,
  EmptyState,
  Ilustracao,
  Input,
  InviteSheet,
  LoginGate,
  Logo,
  MemberAvatars,
  PartnerHeader,
  Player,
  Secao,
  ShareBar,
  StatusDot,
  TimeRangePicker,
  Toast,
  ToastProvider,
  VirtualButton,
  Voltar,
  WeekSection,
  useToast,
  type Intervalo,
} from "@/components/ui";
import {
  ARENA_EXEMPLO,
  CLIPES_BORRADOS_EXEMPLO,
  CLIPES_EXEMPLO,
  MEMBROS_EXEMPLO,
  QUADRAS_EXEMPLO,
  SEMANAS_EXEMPLO,
  SUGESTOES_EXEMPLO,
} from "@/lib/fixtures";
import css from "./catalogo.module.css";

/*
 * ─── O CSS DE ANTES, PARA A CAPTURA COMPARATIVA ────────────────────────────
 *
 * `/dev/ui?antes=1` devolve às faixas de chips e à folha de convite as regras
 * que estavam em produção antes da rodada de correções de 2026-09-13. Serve
 * para uma coisa só: fotografar o "antes" e o "depois" da MESMA marcação, na
 * mesma largura, sem precisar reverter o repositório.
 *
 * `/dev/ui?convite=1` abre a folha já montada, porque o Chrome sem cabeça não
 * clica em nada — e `?so=<id>` esconde todas as vitrines menos uma, para que a
 * que interessa caiba no alto de uma janela de 390×844 sem ninguém rolar a
 * página (o Chrome sem cabeça também não rola).
 *
 * Isto vive em `/dev/ui`, que responde 404 em produção.
 */
const CSS_DE_ANTES = `
  [aria-label="Quadra no cartão"],
  [aria-label="Atalhos no cartão"] {
    padding: 4px 20px !important;
    margin: -4px -20px !important;
    scroll-padding-inline: 0 !important;
  }
  dialog {
    --cor-superficie: rgba(255, 255, 255, 0.07) !important;
    isolation: auto !important;
  }
  dialog::backdrop { background: rgba(22, 19, 15, 0.55) !important; }
`;

function useModoDeCaptura(abrirConvite: (v: boolean) => void) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("convite") === "1") abrirConvite(true);

    const so = q.get("so");
    const regras = [
      q.get("antes") === "1" ? CSS_DE_ANTES : "",
      so
        ? `main > header, main > section { display: none !important; }
           main > section#${CSS.escape(so)} { display: flex !important; }
           main { padding-top: 0 !important; }
           /* O Chrome sem cabeça monta a página na largura padrão da janela e
              só DEPOIS recorta a captura em 390 — o que decepa o texto no meio.
              Travar o corpo em 390 faz o layout acontecer na largura do celular,
              que é a que a captura precisa mostrar. */
           html, body { width: 390px !important; min-width: 0 !important; }`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (!regras) return;

    const tag = document.createElement("style");
    tag.id = "modo-de-captura";
    tag.textContent = regras;
    document.head.append(tag);
    return () => tag.remove();
  }, [abrirConvite]);
}

/** Uma vitrine: título, nota e os estados lado a lado. */
function Vitrine({
  titulo,
  nota,
  children,
  fundoEscuro,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
  fundoEscuro?: boolean;
}) {
  return (
    <section className={css.vitrine} id={titulo.toLowerCase().replace(/\W+/g, "-")}>
      <header className={css.vitrineCabecalho}>
        <h2 className={css.vitrineTitulo}>{titulo}</h2>
        {nota ? <p className={css.vitrineNota}>{nota}</p> : null}
      </header>
      {/*
        `noite` é a classe GLOBAL de `globals.css`, e é ela que troca os tokens
        da subárvore — sem ela o palco ficaria escuro com componentes claros por
        cima, que é exatamente o defeito que a classe existe para evitar.
      */}
      <div
        className={[css.palco, fundoEscuro ? `${css.palcoEscuro} noite` : null]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </section>
  );
}

function Linha({ children }: { children: React.ReactNode }) {
  return <div className={css.linha}>{children}</div>;
}

function BotaoDeToast() {
  const { mostrar } = useToast();
  return (
    <Linha>
      <Button variante="secundario" tamanho={44} onClick={() => mostrar("Link copiado", "ok")}>
        Disparar ok
      </Button>
      <Button variante="secundario" tamanho={44} onClick={() => mostrar("Sem conexão. Tente de novo.", "erro")}>
        Disparar erro
      </Button>
      <Button
        variante="secundario"
        tamanho={44}
        onClick={() => mostrar("Baixe o vídeo e poste pelo app do Instagram.", "info")}
      >
        Disparar info
      </Button>
    </Linha>
  );
}

export default function Catalogo() {
  const [codigo, setCodigo] = useState("");
  const [codigoErrado, setCodigoErrado] = useState("1234");
  const [quadra, setQuadra] = useState("exemplo-q2");
  const [intervalo, setIntervalo] = useState<Intervalo>({
    data: "2026-09-08",
    inicio: "20:00",
    fim: "21:00",
  });
  const [convite, setConvite] = useState(false);

  useModoDeCaptura(setConvite);

  const primeiro = CLIPES_EXEMPLO[0];
  const processando = CLIPES_EXEMPLO[3];
  const parcial = CLIPES_EXEMPLO[4];
  const primeiraSemana = SEMANAS_EXEMPLO[0];

  return (
    <ToastProvider>
      <main className={css.pagina}>
        <header className={css.topo}>
          <Logo />
          <div>
            <h1 className={css.titulo}>Catálogo de UI</h1>
            <p className={css.subtitulo}>
              Todos os componentes de <code>components/ui</code> em todos os estados. Rota de
              desenvolvimento: em produção ela devolve 404.
            </p>
          </div>
        </header>

        <Vitrine
          titulo="Cor"
          nota="Os tokens de `globals.css`. Fora dele só existem dois hex no produto: `components/og.tsx` (Satori não lê variável CSS) e o gradiente do Instagram na ShareBar (marca de terceiro)."
        >
          <div className={css.amostras}>
            {[
              ["--cor-fundo", "fundo"],
              ["--cor-superficie", "superfície"],
              ["--cor-superficie-2", "superfície 2"],
              ["--cor-linha", "linha (só divisor)"],
              ["--cor-marca", "marca (só no escuro)"],
              ["--cor-acao", "ação"],
              ["--cor-acao-fraca", "ação fraca"],
              ["--cor-pro", "pro / cortando"],
              ["--cor-ao-vivo", "ao vivo"],
              ["--cor-erro", "erro"],
              ["--cor-noite", "noite (player)"],
              ["--cor-tinta", "tinta (toast, grupo)"],
              ["--quadra-clara", "grama clara"],
              ["--quadra-escura", "grama escura"],
            ].map(([token, rotulo]) => (
              <div key={token} className={css.amostra}>
                <span className={css.amostraCor} style={{ background: `var(${token})` }} />
                <span className={css.amostraRotulo}>{rotulo}</span>
                <code className={css.amostraToken}>{token}</code>
              </div>
            ))}
          </div>
        </Vitrine>

        <Vitrine
          titulo="Tipografia"
          nota="Bricolage Grotesque 800 no display; Archivo 400/700 em corpo e UI. Escala: 54 / 44 / 38 / 34 / 30 / 24 / 20 / 17 / 16 / 15 / 14 / 13 / 12 / 11."
        >
          <div className={css.pilhaTexto}>
            <p
              style={{
                font: "800 var(--texto-44)/var(--titulo-altura) var(--fonte-titulo)",
                letterSpacing: "var(--titulo-espacamento)",
              }}
            >
              Marcou? Já tá gravado.
            </p>
            <h2>Título de seção (20)</h2>
            <h3>Subtítulo (17)</h3>
            <p>Corpo em Archivo 16 — a medida do texto de leitura do produto.</p>
            <p className="apoio">Apoio 14 · cinza secundário</p>
            <p className="rotulo">Rótulo 11 maiúsculo</p>
            <p
              className="tempo"
              style={{ font: "800 var(--texto-34)/1 var(--fonte-titulo)", letterSpacing: "-0.04em" }}
            >
              20:47 · 21:04 · 0:22
            </p>
            <p className="apoio-3">
              Horário, duração e contador sempre em tabular-nums — sem exceção.
            </p>
          </div>
        </Vitrine>

        <Vitrine
          titulo="Ilustração"
          nota="Quatro peças e só elas: câmera, botão, quadra e apito. A variante `vazia` apaga a cor e acrescenta o X — é a versão de estado vazio, não um desenho diferente."
        >
          <Linha>
            <Ilustracao nome="camera" tamanho={90} />
            <Ilustracao nome="botao" tamanho={90} />
            <Ilustracao nome="quadra" tamanho={90} />
            <Ilustracao nome="apito" tamanho={90} />
          </Linha>
          <Linha>
            <Ilustracao nome="camera" tamanho={70} variante="vazia" />
            <Ilustracao nome="botao" tamanho={70} variante="vazia" />
            <Ilustracao nome="quadra" tamanho={70} variante="vazia" />
            <Ilustracao nome="apito" tamanho={70} variante="vazia" />
          </Linha>
        </Vitrine>

        <Vitrine titulo="Button" nota="Três variantes, três alturas de toque, carregando, com ícone e desabilitado.">
          <Linha>
            <Button tamanho={56}>Ver meus lances</Button>
            <Button tamanho={52}>52 padrão</Button>
            <Button tamanho={44}>44 mínimo</Button>
          </Linha>
          <Linha>
            <Button variante="preto">Convidar</Button>
            <Button variante="secundario">Compartilhar</Button>
            <Button variante="fantasma">Trocar de e-mail</Button>
            <Button variante="perigo">Sair do grupo</Button>
          </Linha>
          <Linha>
            <Button icone={<Video size={20} />}>Com ícone</Button>
            <Button variante="secundario" iconeDepois={<ArrowRight size={16} />}>
              Quero ver
            </Button>
            <Button carregando>Enviando…</Button>
            <Button disabled>Desabilitado</Button>
          </Linha>
          <Linha>
            <Button href="/dev/ui" variante="secundario">
              Como link (`href`)
            </Button>
          </Linha>
          <Button largura="total" tamanho={56} icone={<Search size={20} />}>
            Entrar pra ver meus lances
          </Button>
        </Vitrine>

        <Vitrine titulo="Input e CodeInput" nota="Rótulo obrigatório, dica e erro amarrados por aria-describedby.">
          <Input rotulo="Seu e-mail" type="email" placeholder="voce@email.com" />
          <Input
            rotulo="Nome do grupo"
            defaultValue="Fut de segunda"
            dica="Aparece no cabeçalho da página do grupo."
          />
          <Input
            rotulo="Arena"
            placeholder="Arena, quadra ou cidade"
            icone={<Search size={20} />}
          />
          <Input rotulo="E-mail" defaultValue="nao-e-email" erro="Confira o e-mail: falta o @." />
          <Input rotulo="Campo desabilitado" defaultValue="somente leitura" disabled />

          <div className={css.pilhaTexto}>
            <p className="rotulo">CodeInput — vazio, parcial, completo e com erro</p>
            <CodeInput valor={codigo} onChange={setCodigo} />
            <CodeInput valor={codigoErrado} onChange={setCodigoErrado} erro="Código inválido ou expirado." />
            <p className="apoio-3">
              Digite, cole 6 dígitos em qualquer caixa e apague com Backspace — os três caminhos
              estão cobertos por teste.
            </p>
          </div>
        </Vitrine>

        <Vitrine titulo="Chip" nota="Seleção é PRETO cheio — o laranja fica só para marca e ação. O atalho de horário usa a versão suave, porque ele diz \’este é o recorte\’ e não \’este é o filtro\’. O × aparece no chip selecionado. A faixa sangra pelo valor de `--faixa-recuo`, que é a margem interna de QUEM A EMBALA — o cartão abaixo declara 14, a página declara 20.">
          {/*
            O CARTÃO DA BUSCA, que é onde o bug apareceu no celular do fundador:
            com a faixa sangrando 20 dentro de um cartão de 14, "Acabei de jogar"
            nascia colado na borda e "Quadra 1 · society" era fatiado pela quina.
          */}
          <div className={css.cartaoDeBusca}>
            <span className="rotulo">Quadra</span>
            <ChipFaixa rotulo="Quadra no cartão">
              <Chip selecionado>Todas</Chip>
              <Chip>Quadra 1 · society</Chip>
              <Chip>Quadra 2 · Society</Chip>
              <Chip>Areia</Chip>
            </ChipFaixa>
            <span className="rotulo">Quando</span>
            <ChipFaixa rotulo="Atalhos no cartão">
              <Chip suave selecionado ponto>
                Acabei de jogar
              </Chip>
              <Chip suave>Última hora</Chip>
              <Chip suave>Ontem à noite</Chip>
            </ChipFaixa>
          </div>

          <ChipFaixa rotulo="Quadra">
            <Chip selecionado={quadra === "todas"} onClick={() => setQuadra("todas")}>
              Todas
            </Chip>
            {QUADRAS_EXEMPLO.map((q) => (
              <Chip
                key={q.id}
                selecionado={quadra === q.id}
                removivel
                onClick={() => setQuadra(quadra === q.id ? "todas" : q.id)}
              >
                {q.nome}
                {q.id === "exemplo-q2" ? " · Society" : ""}
              </Chip>
            ))}
          </ChipFaixa>
          <Linha>
            <Chip suave selecionado ponto>
              Acabei de jogar
            </Chip>
            <Chip suave>Última hora</Chip>
            <Chip suave>Ontem à noite</Chip>
            <Chip disabled>Areia · sem câmera</Chip>
          </Linha>
        </Vitrine>

        <Vitrine titulo="StatusDot" nota="Cor nunca é o único sinal: sempre há texto (visível ou em aria-label).">
          <Linha>
            <StatusDot status="online" pilula />
            <StatusDot status="gravando" rotulo="Gravando agora" pilula />
            <StatusDot status="offline" rotulo="Câmera offline" pilula />
            <StatusDot status="cortando" rotulo="Cortando…" pilula />
            <StatusDot status="offline" rotulo="Offline há 2h" />
            <StatusDot status="online" rotulo={false} />
          </Linha>
        </Vitrine>

        <Vitrine titulo="Card e Secao">
          <Card titulo="Lances hoje" acessorio="atualizado há 2 min">
            <p className="apoio">Raio 18, zero borda, separação por sombra.</p>
          </Card>
          <Card variante="painel" titulo="Bloco do painel">
            <p className="apoio">Mais respiro e a sombra 2 — os blocos de destaque.</p>
          </Card>
          <Card href="/dev/ui" titulo="Card clicável">
            <p className="apoio">Vira link e sobe 1px no hover — sobre fundo claro, é a sombra que desenha a forma.</p>
          </Card>
          <Secao titulo="Seção com ação" acao={<Button variante="fantasma" tamanho={44}>Ver tudo</Button>}>
            <p className="apoio">O título sai como h2 de verdade — nada de h3 fantasiado.</p>
          </Secao>
        </Vitrine>

        <Vitrine
          titulo="ClipCard"
          nota="O horário virou o TÍTULO do card — era uma pílula de 12px, do mesmo tamanho da duração. O clipe em processamento tem cara própria e APARECE: sumir com ele faz o atleta concluir que o produto comeu o lance dele."
        >
          <div className={css.trio}>
            {primeiro ? <ClipCard clipe={primeiro} /> : null}
            {processando ? <ClipCard clipe={processando} /> : null}
            {parcial ? <ClipCard clipe={parcial} /> : null}
          </div>
        </Vitrine>

        <Vitrine titulo="ClipGrid" nota="Lista de verdade (ul/li). Denso e borrado são modos.">
          <ClipGrid clipes={CLIPES_EXEMPLO} rotulo="Lances encontrados" />
          <p className="rotulo" style={{ marginTop: "var(--e-16)" }}>
            Denso
          </p>
          <ClipGrid clipes={CLIPES_EXEMPLO.slice(0, 4)} denso />
          <p className="rotulo" style={{ marginTop: "var(--e-16)" }}>
            Borrado (decorativo, aria-hidden e inert)
          </p>
          <ClipGrid clipes={CLIPES_BORRADOS_EXEMPLO} borrada denso />
        </Vitrine>

        <Vitrine titulo="PartnerHeader" nota="Capa, brasão, nome, estado e abas — as abas são links, não tablist.">
          <div className={css.mobile}>
            <PartnerHeader
              nome={ARENA_EXEMPLO.nome}
              iniciais={ARENA_EXEMPLO.iniciais}
              subtitulo="Piloto do Replay já"
              semente={ARENA_EXEMPLO.slug}
              estado={<StatusDot status="gravando" rotulo="2 quadras gravando" pilula />}
              acoes={
                <Button variante="secundario" tamanho={44} icone={<Share2 size={16} />}>
                  Compartilhar
                </Button>
              }
              abas={[
                { id: "lances", rotulo: "Lances", href: "#", contagem: 132 },
                { id: "grupos", rotulo: "Grupos", href: "#", contagem: 4 },
                { id: "sobre", rotulo: "Sobre", href: "#" },
              ]}
              abaAtiva="lances"
            />
          </div>
        </Vitrine>

        <Vitrine
          titulo="LoginGate + CtaFixo"
          nota="O par do gate. A prévia prova que há conteúdo; a AÇÃO fica no rodapé fixo, onde ela não rola para fora da tela — que era o defeito da v1. `marca` sobrescreve a marca d'água da amostra, senão a arena mostra a marca da fixture."
        >
          <div className={css.mobile}>
            <LoginGate amostra={CLIPES_BORRADOS_EXEMPLO} marca="ARENA VASCO">
              <p className="apoio-3">
                A página da Arena Vasco é pública. O login só é pedido pra ver, baixar e
                compartilhar vídeo.
              </p>
            </LoginGate>
          </div>
          <div className={css.barraFalsa}>
            <CtaFixo apoio="Leva 20 segundos. Sem senha, sem cadastro." semSombra>
              <Button tamanho={56} largura="total">
                Entrar pra ver meus lances
              </Button>
            </CtaFixo>
          </div>
        </Vitrine>

        <Vitrine
          titulo="BottomNav"
          nota="Quatro abas, 76px. A ativa tem três sinais — pílula, cor e traço 2,4 — e `aria-current`. Some no botão virtual, no player e no onboarding."
        >
          <div className={css.barraFalsa}>
            <BottomNav caminho="/app" />
          </div>
          <div className={css.barraFalsa}>
            <BottomNav
              caminho="/app/grupos"
              abas={ABAS_DO_ATLETA.map((a) =>
                a.id === "grupos" ? { ...a, badge: 2 } : a,
              )}
            />
          </div>
        </Vitrine>

        <Vitrine
          titulo="ArenaCard e ArteQuadra"
          nota="Enquanto a arena não sobe a capa dela (task C9), `ArteQuadra` desenha a quadra à noite em CSS puro — o ângulo da grama vem de uma semente estável, senão dois cards lado a lado leem como o mesmo card repetido."
        >
          <div className={css.mobile}>
            <ArenaCard
              href="#"
              nome="Arena Vasco"
              iniciais="AV"
              apoio="Piloto do Replay já · 2 quadras"
              gravando
              selo="4 lances hoje"
            />
          </div>
          <div className={css.mobile}>
            <ArenaCard
              href="#outra"
              nome={ARENA_EXEMPLO.nome}
              iniciais={ARENA_EXEMPLO.iniciais}
              apoio={`${ARENA_EXEMPLO.cidade} · ${ARENA_EXEMPLO.estado}`}
              selo="4 quadras"
              altura={128}
            />
          </div>
          <div className={css.mobile}>
            <ArteQuadra altura={116} semente="terceira" simples />
          </div>
        </Vitrine>

        <Vitrine titulo="ShareBar" nota="Web Share API quando existe; wa.me, download e clipboard como fallback.">
          <ShareBar
            url="https://replayja.com.br/arena-calabouco/s/2026-09-08-20h-21h"
            titulo="Lance das 20:47"
            chamada="Achou o golaço? Manda pro grupo."
            urlDoArquivo="#"
            nota="Vai em alta, com a marca da Arena Calabouço no canto."
          />
          <p className="rotulo" style={{ marginTop: "var(--e-16)" }}>
            Deslogado — as quatro ações viram link de login
          </p>
          <ShareBar
            url="https://replayja.com.br/arena-calabouco"
            titulo="Lance das 20:47"
            hrefDeLogin="/entrar"
            nota="Assistir é público. Baixar e compartilhar pedem login."
          />
        </Vitrine>

        <Vitrine titulo="Player" nota="Vídeo nativo, horário em 44px e o cartão PRO de estender lance — visível e desabilitado, porque dois botões cinza com ‘em breve’ embaixo leem como software quebrado." fundoEscuro>
          <div className={css.mobile}>
            <Player
              horario="20:47"
              dia="Hoje"
              contexto="Quadra 2 · Society · 0:22"
              posicao="Lance 12 de 18"
              arena={ARENA_EXEMPLO.nome}
              iniciaisDaArena={ARENA_EXEMPLO.iniciais}
              duracao="0:22"
              hrefAnterior="#"
              hrefProximo="#"
            >
              <ShareBar
                url="https://replayja.com.br/arena-calabouco"
                titulo="Lance das 20:47"
                chamada="Achou o golaço? Manda pro grupo."
                urlDoArquivo="#"
              />
            </Player>
          </div>
        </Vitrine>

        <Vitrine titulo="TimeRangePicker" nota="Atalhos primeiro; data e horário nativos; aviso de janela > 6h.">
          <div className={css.mobile}>
            <TimeRangePicker
              valor={intervalo}
              onChange={setIntervalo}
              agora={new Date("2026-09-08T21:07:00")}
            />
          </div>
          <p className="apoio-3">
            Valor atual: {intervalo.data} · {intervalo.inicio}–{intervalo.fim}
          </p>
        </Vitrine>

        <Vitrine titulo="EmptyState" nota="Ilustração + causa provável + os horários VIZINHOS que têm lance. A v1 mostrava uma frase com um ícone cinza de 24px — que lê como erro de sistema, não como uma tela do produto.">
          <div className={css.mobile}>
            <EmptyState
              ilustracao="quadra"
              titulo="Nada entre 20h e 21h."
              descricao="A câmera estava gravando, mas ninguém apertou o botão nessa janela. Às vezes é a bateria do botão."
              sugestoes={SUGESTOES_EXEMPLO.map((s) => ({ ...s, href: "#" }))}
              acoes={
                <Button variante="preto" largura="total">
                  Falar com a arena
                </Button>
              }
              nota="Achou que devia ter lance aqui? Confere se a arena é essa mesma."
            />
          </div>
        </Vitrine>

        <Vitrine titulo="WeekSection" nota="\’Rodada 12\’, e não \’Semana\’ — é a palavra que a turma usa no WhatsApp. Rodada sem lance continua aparecendo, com a ilustração: sumir com ela faria o atleta achar que o produto perdeu o jogo dele.">
          <div className={css.mobile}>
            {primeiraSemana ? <WeekSection semana={{ ...primeiraSemana, rodada: 12 }} /> : null}
            <WeekSection
              semana={{ id: "vazia", titulo: "25 ago", rodada: 10, clipes: [], total: 0 }}
            />
          </div>
        </Vitrine>

        <Vitrine titulo="MemberAvatars">
          <Linha>
            <MemberAvatars membros={MEMBROS_EXEMPLO} total={10} />
          </Linha>
          <Linha>
            <MemberAvatars membros={MEMBROS_EXEMPLO.slice(0, 2)} />
          </Linha>
        </Vitrine>

        <Vitrine titulo="InviteSheet" nota="dialog nativo: trava de foco, Esc e backdrop de graça. O botão abre de dentro de um bloco `.tinta` de propósito — é a situação real (o cabeçalho preto do grupo) em que a folha aparecia TRANSPARENTE, porque um dialog herda as variáveis do pai no DOM mesmo estando na camada de topo. A classe `luz` é o que devolve a paleta clara à folha.">
          <div className={`${css.palcoTinta} tinta`}>
            <Button variante="secundario" onClick={() => setConvite(true)}>
              Abrir convite
            </Button>
            <InviteSheet
              aberto={convite}
              onFechar={() => setConvite(false)}
              url="https://replayja.com.br/arena-calabouco/fut-segunda"
              nomeDoGrupo="Fut de segunda"
              validadeEmDias={14}
            />
          </div>
        </Vitrine>

        <Vitrine titulo="Voltar" nota="A saída. `router.back()` quando existe tela nossa atrás; o destino de `para` quando a pessoa caiu de um link do WhatsApp. É um `<a href>` e não um `<button>`: a saída tem de existir antes de o JavaScript hidratar.">
          <Linha>
            <Voltar para="/app/grupos" rotulo="Voltar" />
            <Voltar para="/app/buscar?arena=arena-vasco" rotulo="Fechar o lance" icone="fechar" />
            <Voltar para="/app" rotulo="Voltar para as arenas">
              Arenas
            </Voltar>
          </Linha>
        </Vitrine>

        <Vitrine titulo="Voltar sobre o escuro" nota="O mesmo componente no tom escuro — no player e no cabeçalho do grupo `--sombra-1` vira `none`, e sem o véu de 12% de branco o círculo desapareceria." fundoEscuro>
          <Linha>
            <Voltar para="/app/grupos" rotulo="Voltar" tom="escuro" />
            <Voltar
              para="/app/buscar?arena=arena-vasco"
              rotulo="Fechar o lance"
              icone="fechar"
              tom="escuro"
            />
          </Linha>
        </Vitrine>

        <Vitrine titulo="VirtualButton" nota="Tela-herói de 206px com anel de onda. Cooldown de 5 s aqui para dar para ver; no produto é o valor da arena. Sobre `.noite`, porque é lá que ele vive." fundoEscuro>
          <div className={css.mobile}>
            <VirtualButton cooldownSegundos={5} hrefDoUltimoLance="#" />
          </div>
          <div className={css.mobile}>
            <VirtualButton
              disabled
              motivo="O botão virtual aparece só durante uma sessão ao vivo da sua quadra."
            />
          </div>
        </Vitrine>

        <Vitrine titulo="Toast">
          <BotaoDeToast />
          <div className={css.pilhaTexto}>
            <Toast texto="Link copiado" tom="ok" />
            <Toast texto="Sem conexão. Tente de novo." tom="erro" />
            <Toast texto="Baixe o vídeo e poste pelo app do Instagram." tom="info" onFechar={() => {}} />
          </div>
        </Vitrine>
      </main>
    </ToastProvider>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight, Calendar, Search, Share2, Video } from "lucide-react";
import {
  Button,
  Card,
  Chip,
  ChipFaixa,
  ClipCard,
  ClipGrid,
  CodeInput,
  EmptyState,
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
      <div className={[css.palco, fundoEscuro ? css.palcoEscuro : null].filter(Boolean).join(" ")}>
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
          nota="Os tokens de `globals.css`. Nenhum componente escreve hex literal."
        >
          <div className={css.amostras}>
            {[
              ["--cor-fundo", "fundo"],
              ["--cor-superficie", "superfície"],
              ["--cor-superficie-2", "superfície 2"],
              ["--cor-borda", "borda"],
              ["--cor-acento", "acento"],
              ["--cor-ok", "ok / ao vivo"],
              ["--cor-erro", "erro / gravando"],
              ["--cor-quadra-clara", "grama clara"],
              ["--cor-quadra-escura", "grama escura"],
            ].map(([token, rotulo]) => (
              <div key={token} className={css.amostra}>
                <span className={css.amostraCor} style={{ background: `var(${token})` }} />
                <span className={css.amostraRotulo}>{rotulo}</span>
                <code className={css.amostraToken}>{token}</code>
              </div>
            ))}
          </div>
        </Vitrine>

        <Vitrine titulo="Tipografia" nota="Archivo 700/800 em título; Barlow 400–700 em corpo.">
          <div className={css.pilhaTexto}>
            <p style={{ font: "800 var(--texto-40)/1.04 var(--fonte-titulo)", letterSpacing: "var(--titulo-espacamento)" }}>
              Marcou? Já tá gravado.
            </p>
            <h2>Título de seção (22)</h2>
            <h3>Subtítulo (17)</h3>
            <p>Corpo em Barlow 16 — a medida do texto de leitura do produto.</p>
            <p className="apoio">Apoio 14 · cinza secundário</p>
            <p className="rotulo">Rótulo 11 maiúsculo</p>
            <p className="tempo" style={{ fontSize: "var(--texto-27)", fontWeight: 800 }}>
              20:47 · 21:04 · 0:22
            </p>
            <p className="apoio-3">Horário sempre em tabular-nums: as colunas alinham.</p>
          </div>
        </Vitrine>

        <Vitrine titulo="Button" nota="Três variantes, três alturas de toque, carregando, com ícone e desabilitado.">
          <Linha>
            <Button tamanho={56}>Ver meus lances</Button>
            <Button tamanho={52}>52 padrão</Button>
            <Button tamanho={44}>44 mínimo</Button>
          </Linha>
          <Linha>
            <Button variante="secundario">Secundário</Button>
            <Button variante="fantasma">Fantasma</Button>
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
            Buscar lances
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

        <Vitrine titulo="Chip" nota="Quadras e atalhos de horário. Ativo em laranja cheio; atalho em laranja suave.">
          <ChipFaixa rotulo="Quadra">
            <Chip selecionado={quadra === "todas"} onClick={() => setQuadra("todas")}>
              Todas
            </Chip>
            {QUADRAS_EXEMPLO.map((q) => (
              <Chip key={q.id} selecionado={quadra === q.id} onClick={() => setQuadra(q.id)}>
                {q.nome}
                {q.id === "exemplo-q2" ? " · Society" : ""}
              </Chip>
            ))}
          </ChipFaixa>
          <Linha>
            <Chip suave selecionado ponto>
              Agora
            </Chip>
            <Chip suave>Última hora</Chip>
            <Chip suave>Ontem à noite</Chip>
            <Chip disabled>Desabilitado</Chip>
          </Linha>
        </Vitrine>

        <Vitrine titulo="StatusDot" nota="Cor nunca é o único sinal: sempre há texto (visível ou em aria-label).">
          <Linha>
            <StatusDot status="online" pilula />
            <StatusDot status="gravando" pilula />
            <StatusDot status="offline" pilula />
            <StatusDot status="online" rotulo="ao vivo" pilula />
            <StatusDot status="offline" rotulo="Offline há 2h" />
            <StatusDot status="online" rotulo={false} />
          </Linha>
        </Vitrine>

        <Vitrine titulo="Card e Secao">
          <Card titulo="Lances hoje" acessorio="atualizado há 2 min">
            <p className="apoio">Superfície padrão, raio 14.</p>
          </Card>
          <Card variante="painel" titulo="Bloco do painel">
            <p className="apoio">Raio 18 e mais respiro — os blocos do painel do parceiro.</p>
          </Card>
          <Card href="/dev/ui" titulo="Card clicável">
            <p className="apoio">Vira link e ganha realce de borda no hover.</p>
          </Card>
          <Secao titulo="Seção com ação" acao={<Button variante="fantasma" tamanho={44}>Ver tudo</Button>}>
            <p className="apoio">O título sai como h2 de verdade — nada de h3 fantasiado.</p>
          </Secao>
        </Vitrine>

        <Vitrine titulo="ClipCard" nota="Pronto, processando e parcial. Horário, duração, quadra e marca já na miniatura.">
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
              subtitulo={ARENA_EXEMPLO.tagline}
              estado={<StatusDot status="gravando" rotulo="2 quadras gravando agora" pilula />}
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

        <Vitrine titulo="LoginGate" nota="O convite por cima da prévia borrada, com o contador de hoje.">
          <div className={css.mobile}>
            <LoginGate
              lancesHoje={132}
              amostra={CLIPES_BORRADOS_EXEMPLO}
              rodape="A página da Arena Calabouço é pública. O login só é pedido pra buscar, baixar e compartilhar vídeo."
            >
              <Button largura="total" tamanho={52}>
                Continuar com Google
              </Button>
              <Button largura="total" tamanho={52} variante="secundario">
                Entrar com e-mail
              </Button>
            </LoginGate>
          </div>
        </Vitrine>

        <Vitrine titulo="ShareBar" nota="Web Share API quando existe; wa.me, download e clipboard como fallback.">
          <ShareBar
            url="https://replayja.com.br/arena-calabouco/s/2026-09-08-20h-21h"
            titulo="Lance das 20:47"
            urlDoArquivo="#"
            nota="1080p com a marca da Arena Calabouço. Quem receber o link assiste sem precisar entrar."
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

        <Vitrine titulo="Player" nota="Vídeo nativo, marca d'água de referência no canto e estender lance desabilitado." fundoEscuro>
          <div className={css.mobile}>
            <Player
              horario="20:47"
              contexto="Quadra 2 · Society · seg, 8 set"
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

        <Vitrine titulo="EmptyState" nota="Estado vazio propositivo: ações, horários vizinhos e a causa provável.">
          <div className={css.mobile}>
            <EmptyState
              icone={<Calendar size={24} />}
              titulo="Nenhum lance nesse horário"
              descricao="A Quadra 3 não registrou nenhum acionamento do botão entre 06:00 e 07:00 de ontem."
              acoes={
                <>
                  <Button variante="secundario" largura="total">
                    Ampliar para o dia todo
                  </Button>
                  <Button variante="secundario" largura="total">
                    Buscar em todas as quadras
                  </Button>
                </>
              }
              sugestoes={SUGESTOES_EXEMPLO.map((s) => ({ ...s, href: "#" }))}
              nota="Achou que devia ter lance aqui? Fale com a arena: o botão da quadra pode ter ficado sem bateria."
            />
          </div>
        </Vitrine>

        <Vitrine titulo="WeekSection" nota="A pilha de semanas da página do grupo, com cabeçalho grudado.">
          <div className={css.mobile}>
            {primeiraSemana ? <WeekSection semana={primeiraSemana} /> : null}
            <WeekSection semana={{ id: "vazia", titulo: "Segunda, 25 ago", clipes: [], total: 0 }} />
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

        <Vitrine titulo="InviteSheet" nota="dialog nativo: trava de foco, Esc e backdrop de graça.">
          <Button variante="secundario" onClick={() => setConvite(true)}>
            Abrir convite
          </Button>
          <InviteSheet
            aberto={convite}
            onFechar={() => setConvite(false)}
            url="https://replayja.com.br/arena-calabouco/fut-segunda"
            nomeDoGrupo="Fut de segunda"
          />
        </Vitrine>

        <Vitrine titulo="VirtualButton" nota="Cooldown de 5 s aqui para dar para ver; no produto é o valor da arena.">
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

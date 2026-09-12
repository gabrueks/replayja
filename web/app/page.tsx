import { ArrowRight, Clock, Download, Link2, Search } from "lucide-react";
import { Button, Card, Logo, StatusDot } from "@/components/ui";
import { getSession } from "@/lib/session";
import { ARENA_EXEMPLO } from "@/lib/fixtures";
import css from "./home.module.css";

/**
 * `/` — a home pública.
 *
 * ─── A PROMESSA VEM ANTES DA BUSCA ─────────────────────────────────────────
 *
 * "Marcou? Já tá gravado." é a frase do canvas e continua sendo a primeira coisa
 * da tela. Quem chega aqui quase nunca conhece o produto: chegou por um link do
 * WhatsApp ou pelo Instagram da arena. A busca vem logo abaixo porque quem já
 * conhece vai direto nela.
 *
 * ─── A BUSCA DE ARENAS AINDA NÃO EXISTE ────────────────────────────────────
 *
 * O campo está desenhado e DESABILITADO, com o caminho alternativo explícito
 * (abrir `replayja.com.br/sua-arena`). Um campo que aceita texto e não responde é
 * pior que um campo que diz que ainda não funciona — a consulta é da task C2.
 */

export default async function Home() {
  const sessao = await getSession();

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.topo}>
        <Logo />
        <a className={css.linkArena} href="#arena">
          Sou dono de arena
        </a>
      </header>

      <section className={css.hero}>
        <h1 className={css.chamada}>
          Marcou?
          <br />
          Já tá gravado.
        </h1>
        <p className={css.apoio}>
          A câmera fica na quadra e o botão fica com vocês. Os últimos 22 segundos ficam
          esperando aqui — em alta, com a marca da sua arena.
        </p>
      </section>

      <Card variante="painel" className={css.buscaCartao}>
        <p className="rotulo">Onde você jogou?</p>

        {/*
          O campo é `readOnly` e não `disabled`: `disabled` tira do Tab e some do
          leitor de tela, e a pessoa que navega por teclado nunca fica sabendo que
          a busca existe. `readOnly` mantém o campo alcançável e a explicação
          amarrada por `aria-describedby`.
        */}
        <div className={css.buscaCampo}>
          <Search size={20} aria-hidden="true" className={css.buscaIcone} />
          <input
            className={css.buscaEntrada}
            type="search"
            readOnly
            placeholder="Arena, quadra ou cidade"
            aria-label="Buscar arena"
            aria-describedby="busca-ajuda"
          />
        </div>
        <p className={css.buscaAjuda} id="busca-ajuda">
          A busca de arenas entra em breve. Por enquanto, abra o endereço da sua arena:{" "}
          <code>replayja.com.br/sua-arena</code>.
        </p>

        <p className="rotulo" style={{ marginTop: "var(--e-16)" }}>
          Você jogou aqui
        </p>
        <a className={css.arenaItem} href={`/${ARENA_EXEMPLO.slug}`}>
          <span className={css.brasao}>{ARENA_EXEMPLO.iniciais}</span>
          <span className={css.arenaTextos}>
            <span className={css.arenaNome}>{ARENA_EXEMPLO.nome}</span>
            <span className={css.arenaApoio}>
              {ARENA_EXEMPLO.cidade} · 4 quadras
            </span>
          </span>
          <StatusDot status="online" rotulo="ao vivo" pilula />
        </a>
      </Card>

      <div className={css.acao}>
        <Button
          href={sessao ? "/app" : "/entrar"}
          tamanho={56}
          largura="total"
          icone={<Clock size={20} />}
        >
          {sessao ? "Ver meus lances" : "Entrar para ver meus lances"}
        </Button>
        <p className={css.acaoApoio}>Grátis pra quem joga. Sem instalar nada.</p>
      </div>

      <ul className={css.beneficios}>
        {[
          { icone: <Clock size={20} />, texto: "Clipe de 22s" },
          { icone: <Download size={20} />, texto: "Baixa em alta" },
          { icone: <Link2 size={20} />, texto: "Link fixo do grupo" },
        ].map((b) => (
          <li key={b.texto} className={css.beneficio}>
            <span className={css.beneficioIcone} aria-hidden="true">
              {b.icone}
            </span>
            <span>{b.texto}</span>
          </li>
        ))}
      </ul>

      <section className={css.arena} id="arena">
        <div>
          <h2 className={css.arenaTitulo}>Tem uma arena?</h2>
          <p className={css.arenaChamada}>Câmera, botão e página própria.</p>
        </div>
        <Button
          href="mailto:contato@replayja.com.br?subject=Quero%20o%20Replay%20j%C3%A1%20na%20minha%20arena"
          variante="secundario"
          tamanho={44}
          iconeDepois={<ArrowRight size={16} />}
        >
          Quero ver
        </Button>
      </section>
    </main>
  );
}

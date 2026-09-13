import { ArrowRight, Download, MonitorPlay, RotateCcw } from "lucide-react";
import { Button, CtaFixo, Ilustracao, Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
import { ARENA_EXEMPLO } from "@/lib/fixtures";
import { PrimeiraAbertura } from "./PrimeiraAbertura";
import css from "./home.module.css";

/**
 * `/` — a home pública.
 *
 * ─── A PROMESSA VEM ANTES DE TUDO ──────────────────────────────────────────
 *
 * "Marcou? Já tá gravado." continua sendo a primeira coisa da tela. Quem chega
 * aqui quase nunca conhece o produto: chegou por um link do WhatsApp ou pelo
 * Instagram da arena.
 *
 * ─── A BUSCA DE ARENAS SAIU DA HOME ────────────────────────────────────────
 *
 * Ela era um campo DESABILITADO com um parágrafo explicando que não funciona —
 * o primeiro elemento interativo do produto, e ele não fazia nada. Um campo
 * morto no alto da home não é honestidade, é o defeito que a honestidade
 * tentava consertar. A busca de arena existe, funciona e mora em `/app`, uma
 * tela depois do login; a home manda para lá.
 *
 * ─── A AÇÃO É FIXA NO RODAPÉ ───────────────────────────────────────────────
 *
 * Mesma regra de toda tela de ação da v2: "Entrar pra ver meus lances" não rola
 * junto com o conteúdo. É sempre ESSA frase — a folha de voz manda uma frase por
 * ação, repetida em toda tela.
 */

export default async function Home() {
  const sessao = await getSession();

  return (
    <main className={`${css.pagina} com-cta`} id="conteudo">
      <PrimeiraAbertura logado={Boolean(sessao)} />

      <header className={css.topo}>
        <Logo tamanho={34} />
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

      {/*
        OS TRÊS PASSOS, COM AS ILUSTRAÇÕES DO SISTEMA. A v1 tinha três pílulas de
        texto com um ícone de 20px; aqui cada passo é uma linha com a peça
        desenhada, e o conjunto conta a história inteira do produto em nove
        palavras — que é o que uma home pública tem de fazer.
      */}
      <ol className={css.passos}>
        <li className={css.passo}>
          <Ilustracao nome="camera" tamanho={56} />
          <span className={css.passoTextos}>
            <span className={css.passoTitulo}>A câmera já tá lá.</span>
            <span className={css.passoApoio}>A arena instalou. Ela grava a pelada inteira.</span>
          </span>
        </li>
        <li className={css.passo}>
          <Ilustracao nome="botao" tamanho={56} />
          <span className={css.passoTextos}>
            <span className={css.passoTitulo}>Marcou? Aperta o botão.</span>
            <span className={css.passoApoio}>
              Um toque guarda os últimos <span className="tempo">22</span> segundos.
            </span>
          </span>
        </li>
        <li className={css.passo}>
          <Ilustracao nome="quadra" tamanho={56} />
          <span className={css.passoTextos}>
            <span className={css.passoTitulo}>Acha pelo horário.</span>
            <span className={css.passoApoio}>E manda o golaço pro grupo, em alta.</span>
          </span>
        </li>
      </ol>

      <section className={css.beneficios}>
        <span className={css.beneficio}>
          <RotateCcw size={20} strokeWidth={2.2} aria-hidden="true" />
          <span>
            Clipe de <span className="tempo">22 s</span>
          </span>
        </span>
        <span className={css.beneficio}>
          <Download size={20} strokeWidth={2.2} aria-hidden="true" />
          <span>Baixa em alta</span>
        </span>
        <span className={css.beneficio}>
          <MonitorPlay size={20} strokeWidth={2.2} aria-hidden="true" />
          <span>Link fixo do grupo</span>
        </span>
      </section>

      <section className={css.arena} id="arena">
        <div>
          <h2 className={css.arenaTitulo}>Tem uma arena?</h2>
          <p className={css.arenaChamada}>
            Câmera, botão e uma página como a da {ARENA_EXEMPLO.nome} — com a sua marca em todo
            vídeo que sai daqui.
          </p>
        </div>
        <Button
          href="mailto:contato@replayja.com.br?subject=Quero%20o%20Replay%20j%C3%A1%20na%20minha%20arena"
          variante="secundario"
          tamanho={52}
          largura="total"
          iconeDepois={<ArrowRight size={18} />}
        >
          Quero ver
        </Button>
      </section>

      <CtaFixo apoio="Grátis pra quem joga. Sem instalar nada.">
        <Button href={sessao ? "/app" : "/entrar"} tamanho={56} largura="total">
          {sessao ? "Bora achar meu lance" : "Entrar pra ver meus lances"}
        </Button>
      </CtaFixo>
    </main>
  );
}

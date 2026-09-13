import Link from "next/link";
import { Clock, Play } from "lucide-react";
import type { Clipe } from "./tipos";
import css from "./ClipCard.module.css";

/**
 * O card de um lance — a unidade de conteúdo do produto.
 *
 * ─── O HORÁRIO VIROU O TÍTULO DO CARD ──────────────────────────────────────
 *
 * Sinal nº 4 do diagnóstico da v2: `20:47` era uma pílula de 12px sobre a
 * miniatura, do mesmo tamanho da duração. Mas o atleta não procura "o gol do
 * fulano": ele procura "o que aconteceu às 20:47 na quadra 2". O horário agora
 * é o título, em 20px no display e em `tabular-nums`, embaixo da miniatura — a
 * duração desce para o canto do vídeo, que é onde toda plataforma de vídeo a
 * coloca e onde ela custa zero atenção.
 *
 * ─── OS TRÊS ESTADOS ───────────────────────────────────────────────────────
 *
 * `pronto`      — abre no player.
 * `processando` — NÃO é clicável, e tem cara PRÓPRIA: ladrilho escuro com o
 *                 relógio amarelo e "Cortando…". A v1 o desenhava como um card
 *                 normal com um selo, e o contador da página pública nem o
 *                 contava — o atleta que acabou de apertar o botão via o lance
 *                 dele simplesmente não existir. Mostrar o corte em andamento é
 *                 a diferença entre "o produto está trabalhando" e "o produto
 *                 comeu meu lance".
 * `parcial`     — clicável, com selo: o corte saiu menor que 22 s porque a
 *                 câmera teve lacuna. O atleta precisa saber que o vídeo está
 *                 curto de propósito, não quebrado.
 */

export type ClipCardProps = {
  clipe: Clipe;
  /** Quando não há `href` no clipe, o card vira botão e chama isto. */
  onSelecionar?: (clipe: Clipe) => void;
  /** Card menor (a faixa "na mesma pelada" do player). */
  denso?: boolean;
};

function Miniatura({ clipe }: { clipe: Clipe }) {
  if (clipe.estado === "processando") {
    return (
      <div className={`${css.miniatura} ${css.cortando}`}>
        <span className={css.pulso} aria-hidden="true" />
        {/*
          `role="status"` NO SELO, e não no card (achado P2-38). A transição
          "Cortando… → pronto" não era anunciada: o card tinha um `aria-label`
          ESTÁTICO e, quando virava `<Link>`, nada era falado. Um `role="status"`
          no texto que MUDA é o que faz o leitor de tela contar o fim do corte.
        */}
        <span className={css.cortandoTextos} role="status">
          <Clock size={20} strokeWidth={2.2} aria-hidden="true" />
          <span className={css.cortandoRotulo}>Cortando…</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`${css.miniatura} ${clipe.thumbnailUrl ? "" : "grama"}`}>
      {clipe.thumbnailUrl ? (
        // A Image Optimization está desligada (ADR §4.1): o thumbnail já sai
        // pronto do relay, e cada transformação na Vercel é cobrada.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={css.imagem}
          src={clipe.thumbnailUrl}
          alt=""
          // `width`/`height` (achado P2-33): a Image Optimization está desligada
          // (ADR §4.1), então nada reserva o espaço por nós. Hoje não dói porque
          // não há imagem em produção; quando o thumbnail real do relay chegar,
          // sem as dimensões a grade pula a cada card que carrega. O
          // `aspect-ratio` do CSS manda no tamanho final — estes números são a
          // PROPORÇÃO que o navegador usa para reservar a caixa antes do byte.
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
        />
      ) : null}

      <span className={css.veu} aria-hidden="true" />

      <span className={css.play} aria-hidden="true">
        <Play size={14} fill="currentColor" strokeWidth={0} />
      </span>

      {clipe.estado === "parcial" ? <span className={css.selo}>parcial</span> : null}

      {/*
        A MARCA D'ÁGUA APARECE JÁ NA MINIATURA. É a promessa que a arena compra
        ("o vídeo sai com a sua marca"), e mostrá-la só no player faria o
        parceiro achar que ela não existe. O texto é o nome DA ARENA que está
        sendo vista — nunca uma fixture.
      */}
      {clipe.marca ? <span className={css.marca}>{clipe.marca}</span> : null}
      <span className={`${css.duracao} tempo`}>{clipe.duracao}</span>
    </div>
  );
}

function Corpo({ clipe }: { clipe: Clipe }) {
  const cortando = clipe.estado === "processando";
  return (
    <div className={css.corpo}>
      {/*
        `<time>` DE VERDADE (achado P2-35). O horário é o dado central do produto
        e era um `<span>`: o repositório inteiro não tinha nenhum `<time>`, então
        a regra global `.tempo, time, .contador` nunca casava pelos dois últimos
        seletores e o `tabular-nums` dependia de alguém lembrar da classe. Com o
        elemento certo vêm as duas coisas de uma vez — a semântica e a fonte.
      */}
      <time
        className={`${css.horario} ${cortando ? css.horarioApagado : ""}`}
        dateTime={clipe.quandoIso}
      >
        {clipe.horario}
      </time>
      <span className={css.contexto}>
        {cortando ? "Fica pronto em ~30 s" : (clipe.contexto ?? clipe.quadra)}
      </span>
    </div>
  );
}

export function ClipCard({ clipe, onSelecionar, denso }: ClipCardProps) {
  // O rótulo acessível monta a frase inteira: sem ele, o leitor de tela lê
  // "20:47 0:22 Quadra 2" como três coisas soltas.
  const descricao = `Lance das ${clipe.horario}, ${clipe.quadra}, ${clipe.duracao}${
    clipe.estado === "parcial" ? ", gravação parcial" : ""
  }`;

  const conteudo = (
    <>
      <Miniatura clipe={clipe} />
      <Corpo clipe={clipe} />
    </>
  );

  const cn = [css.card, clipe.estado === "processando" ? css.emCorte : null, denso ? css.denso : null]
    .filter(Boolean)
    .join(" ");

  if (clipe.estado === "processando") {
    return (
      /*
        SEM `role="group"` (achado P2-38). Um `group` num nó que não recebe foco e
        cujos filhos não são rotulados não é a semântica certa — ele só
        acrescenta um nível na árvore. O card em corte não é interativo: o que
        precisa ser dito está no `role="status"` do selo, que é o texto que muda.
      */
      <div className={cn}>{conteudo}</div>
    );
  }

  if (clipe.href) {
    return (
      <Link className={cn} href={clipe.href} aria-label={descricao}>
        {conteudo}
      </Link>
    );
  }

  return (
    <button type="button" className={cn} aria-label={descricao} onClick={() => onSelecionar?.(clipe)}>
      {conteudo}
    </button>
  );
}

export default ClipCard;

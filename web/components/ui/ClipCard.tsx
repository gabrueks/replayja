import Link from "next/link";
import { Play } from "lucide-react";
import type { Clipe } from "./tipos";
import css from "./ClipCard.module.css";

/**
 * O card de um lance — a unidade de conteúdo do produto.
 *
 * ─── O QUE O CARD TEM DE DIZER SEM SER ABERTO ──────────────────────────────
 *
 * HORÁRIO, duração e quadra. O atleta não procura "o gol do fulano": ele procura
 * "o que aconteceu às 20:47 na quadra 2". Por isso o horário fica em cima, em
 * `tabular-nums`, e é a primeira coisa que o leitor de tela anuncia.
 *
 * ─── OS TRÊS ESTADOS ───────────────────────────────────────────────────────
 *
 * `pronto`      — abre no player.
 * `processando` — NÃO é clicável e diz por quê. Um card que abre num player
 *                 vazio queima mais confiança do que um card que avisa.
 * `parcial`     — clicável, com selo: o corte saiu menor que 22 s porque a
 *                 câmera teve lacuna. O atleta precisa saber que o vídeo está
 *                 curto de propósito, não quebrado.
 */

export type ClipCardProps = {
  clipe: Clipe;
  /** Quando não há `href` no clipe, o card vira botão e chama isto. */
  onSelecionar?: (clipe: Clipe) => void;
  /** Card menor (a faixa "próximos lances" do player). */
  denso?: boolean;
};

function Miniatura({ clipe }: { clipe: Clipe }) {
  return (
    <div className={`${css.miniatura} ${clipe.thumbnailUrl ? "" : "grama"}`}>
      {clipe.thumbnailUrl ? (
        // A Image Optimization está desligada (ADR §4.1): o thumbnail já sai
        // pronto do relay, e cada transformação na Vercel é cobrada.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={css.imagem} src={clipe.thumbnailUrl} alt="" loading="lazy" decoding="async" />
      ) : null}

      {clipe.estado === "processando" ? <span className={css.pulso} aria-hidden="true" /> : null}

      <span className={css.horario}>{clipe.horario}</span>

      {clipe.estado === "pronto" || clipe.estado === "parcial" ? (
        <span className={css.play} aria-hidden="true">
          <Play size={14} fill="currentColor" strokeWidth={0} />
        </span>
      ) : null}

      {clipe.estado === "processando" ? (
        <span className={`${css.selo} ${css.seloProcessando}`}>processando</span>
      ) : null}
      {clipe.estado === "parcial" ? (
        <span className={`${css.selo} ${css.seloParcial}`}>parcial</span>
      ) : null}

      <span className={css.duracao}>{clipe.duracao}</span>
      {clipe.marca ? <span className={css.marca}>{clipe.marca}</span> : null}
    </div>
  );
}

function Corpo({ clipe }: { clipe: Clipe }) {
  return (
    <div className={css.corpo}>
      <span className={css.quadra}>{clipe.quadra}</span>
      <span className={css.contexto}>
        {clipe.estado === "processando"
          ? "fica pronto em alguns segundos"
          : (clipe.contexto ?? " ")}
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

  const cn = [css.card, clipe.estado === "processando" ? css.processando : null, denso ? css.denso : null]
    .filter(Boolean)
    .join(" ");

  if (clipe.estado === "processando") {
    return (
      <div className={cn} aria-label={`${descricao}. Ainda processando.`} role="group">
        {conteudo}
      </div>
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

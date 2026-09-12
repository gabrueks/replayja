"use client";

import Link from "next/link";
import { useId } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import css from "./Player.module.css";

/**
 * O player do lance.
 *
 * ─── `<video controls>` NATIVO, DE PROPÓSITO ───────────────────────────────
 *
 * Nada de player customizado. O controle nativo já tem tela cheia, picture in
 * picture, velocidade, legenda e — o que mais importa aqui — o gesto de arrastar
 * no tempo que o atleta já conhece. Um player próprio significaria reimplementar
 * tudo isso com pior acessibilidade, para um clipe de 22 segundos.
 *
 * ─── "ESTENDER LANCE" NASCE DESABILITADO ───────────────────────────────────
 *
 * ±8 s exige recortar de novo a partir do segmento bruto, e isso é trabalho de
 * relay (task de backend). O botão aparece porque é a primeira coisa que o
 * atleta pede quando o lance corta cedo — mostrar que está no mapa vale mais que
 * esconder. A dica "em breve" é TEXTO visível, não `title`: `title` não existe no
 * toque.
 */

export type PosicaoDaMarca = "sup-esq" | "sup-dir" | "inf-esq" | "inf-dir";

export type PlayerProps = {
  /** URL do MP4 já com marca queimada. Sem ela, o palco mostra o porquê. */
  src?: string | null;
  poster?: string | null;
  /** "20:47" */
  horario: string;
  /** "Quadra 2 · Society · seg, 8 set" */
  contexto: string;
  /** "Lance 12 de 18" */
  posicao?: string;
  /** Nome da arena mostrado no overlay de referência da marca. */
  arena?: string;
  iniciaisDaArena?: string;
  posicaoDaMarca?: PosicaoDaMarca;
  /** `true` quando o arquivo já vem marcado: aí o overlay não é desenhado. */
  marcaQueimada?: boolean;
  /** Duração formatada, mostrada quando não há vídeo carregado ainda. */
  duracao?: string;
  hrefAnterior?: string | null;
  hrefProximo?: string | null;
  /** O que aparece embaixo — normalmente a `ShareBar`. */
  children?: React.ReactNode;
};

const CLASSE_DA_MARCA: Record<PosicaoDaMarca, string | undefined> = {
  "sup-dir": undefined,
  "sup-esq": css.marcaEsqSup,
  "inf-esq": css.marcaEsqInf,
  "inf-dir": css.marcaDirInf,
};

export function Player({
  src,
  poster,
  horario,
  contexto,
  posicao,
  arena,
  iniciaisDaArena,
  posicaoDaMarca = "sup-dir",
  marcaQueimada,
  duracao,
  hrefAnterior,
  hrefProximo,
  children,
}: PlayerProps) {
  const idDica = useId();

  return (
    <div className={css.raiz}>
      {posicao || arena ? (
        <div className={css.topo}>
          <span>{posicao}</span>
          <span>{arena}</span>
        </div>
      ) : null}

      <div className={css.palco}>
        {src ? (
          <video
            className={css.video}
            src={src}
            poster={poster ?? undefined}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <>
            <div className={`${css.video} grama`} aria-hidden="true" />
            <p className={css.semVideo}>
              O vídeo deste lance ainda está sendo preparado. Atualize em alguns segundos.
            </p>
          </>
        )}

        {arena && !marcaQueimada ? (
          <span
            className={[css.marca, CLASSE_DA_MARCA[posicaoDaMarca]].filter(Boolean).join(" ")}
            aria-hidden="true"
          >
            {iniciaisDaArena ? <span className={css.brasao}>{iniciaisDaArena}</span> : null}
            {arena.toUpperCase()}
          </span>
        ) : null}

        {!src && duracao ? <span className={css.tempo}>{duracao}</span> : null}
      </div>

      <div className={css.meta}>
        <span className={css.horario}>{horario}</span>
        <span className={css.contexto}>{contexto}</span>
      </div>

      <div className={css.navegacao}>
        {hrefAnterior ? (
          <Link className={css.navBotao} href={hrefAnterior} rel="prev">
            <ChevronLeft size={18} aria-hidden="true" />
            Anterior
          </Link>
        ) : (
          <button type="button" className={css.navBotao} disabled>
            <ChevronLeft size={18} aria-hidden="true" />
            Anterior
          </button>
        )}
        {hrefProximo ? (
          <Link className={css.navBotao} href={hrefProximo} rel="next">
            Próximo
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" className={css.navBotao} disabled>
            Próximo
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className={css.estender}>
        <button type="button" className={css.navBotao} disabled aria-describedby={idDica}>
          <Minus size={16} aria-hidden="true" />
          8s antes
        </button>
        <button type="button" className={css.navBotao} disabled aria-describedby={idDica}>
          <Plus size={16} aria-hidden="true" />
          8s depois
        </button>
      </div>
      <p className={css.emBreve} id={idDica}>
        Estender o lance em 8 segundos: em breve.
      </p>

      {children}
    </div>
  );
}

export default Player;

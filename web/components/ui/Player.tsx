"use client";

import Link from "next/link";
import { useId } from "react";
import { ChevronLeft, ChevronRight, MoveHorizontal } from "lucide-react";
import css from "./Player.module.css";

/**
 * O player do lance — a única tela escura do app, junto com o botão virtual.
 *
 * ─── ESCURO AQUI TRABALHA A FAVOR ──────────────────────────────────────────
 *
 * O app da v2 é claro, e o player não. O vídeo tem de ser a coisa mais clara da
 * tela; uma moldura branca em volta de um clipe noturno de quadra rouba o
 * contraste do próprio conteúdo. É a mesma razão pela qual todo serviço de vídeo
 * escurece o ambiente do reprodutor.
 *
 * ─── `<video controls>` NATIVO, DE PROPÓSITO ───────────────────────────────
 *
 * Nada de player customizado. O controle nativo já tem tela cheia, picture in
 * picture, velocidade, legenda e — o que mais importa aqui — o gesto de arrastar
 * no tempo que o atleta já conhece. Um player próprio significaria reimplementar
 * tudo isso com pior acessibilidade, para um clipe de 22 segundos.
 *
 * ─── O HORÁRIO É O TÍTULO DA TELA, EM 44px ─────────────────────────────────
 *
 * Era 32px numa linha de metadado. É o dado que o atleta veio conferir ("é o das
 * 20:47?") e é o que ele vai digitar no grupo. Agora ele é a maior coisa abaixo
 * do vídeo, em `tabular-nums`, com "Hoje" como rótulo por cima.
 *
 * ─── "ESTENDER O LANCE" VIROU UM CARTÃO PRO, VISÍVEL E DESABILITADO ────────
 *
 * ±8 s exige recortar de novo a partir do segmento bruto, e isso é trabalho de
 * relay. Era um par de botões cinza com um "em breve" embaixo — o que lê como
 * software quebrado. Como cartão amarelo com o selo PRO ele lê como o que é: um
 * recurso que existe e ainda não está no ar. A promessa continua sendo TEXTO
 * visível e não `title`, porque `title` não existe no toque.
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
  /** "Hoje", "Ontem", "8 set" — o rótulo por cima do horário. */
  dia?: string;
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
  dia,
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

        {!src && duracao ? <span className={`${css.tempo} tempo`}>{duracao}</span> : null}
      </div>

      <div className={css.identificacao}>
        <div className={css.meta}>
          {dia ? <span className={css.dia}>{dia}</span> : null}
          <h1 className={`${css.horario} tempo`}>{horario}</h1>
          <span className={css.contexto}>{contexto}</span>
        </div>

        {/*
          As setas viram DOIS LADRILHOS de 44px no canto, e não dois botões de
          largura inteira: navegar entre lances é o gesto secundário desta tela —
          a ação principal é compartilhar, e ela precisa da linha toda.
        */}
        <div className={css.navegacao}>
          {hrefAnterior ? (
            <Link className={css.navBotao} href={hrefAnterior} rel="prev" aria-label="Lance anterior">
              <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" className={css.navBotao} disabled aria-label="Lance anterior">
              <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
          {hrefProximo ? (
            <Link className={css.navBotao} href={hrefProximo} rel="next" aria-label="Próximo lance">
              <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" className={css.navBotao} disabled aria-label="Próximo lance">
              <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {posicao ? <p className={`${css.posicao} tempo`}>{posicao}</p> : null}

      {children}

      <button type="button" className={css.pro} disabled aria-describedby={idDica}>
        <span className={css.proIcone} aria-hidden="true">
          <MoveHorizontal size={23} strokeWidth={2.4} />
        </span>
        <span className={css.proTextos}>
          <span className={css.proTitulo}>
            Estender o lance
            <span className={css.proSelo}>PRO</span>
          </span>
          <span className={css.proApoio} id={idDica}>
            +8 s antes e depois. Pega a jogada inteira. Ainda não disponível.
          </span>
        </span>
      </button>
    </div>
  );
}

export default Player;

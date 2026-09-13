import type { ReactNode } from "react";
import type { Clipe } from "./tipos";
import { ClipGrid } from "./ClipGrid";
import { Ilustracao } from "./Ilustracoes";
import { plural } from "@/lib/plural";
import css from "./WeekSection.module.css";

/**
 * Uma rodada da página do grupo: "Rodada 12 · 8 set · 9 lances" + a grade.
 *
 * ─── "RODADA", E NÃO "SEMANA" ──────────────────────────────────────────────
 *
 * O grupo é uma pelada que se repete, e quem joga conta em rodadas — é a palavra
 * que a turma já usa no WhatsApp. "Semana 12" é como um sistema numera; "Rodada
 * 12" é como um time fala. A data continua ali, como apoio, porque é ela que
 * responde "foi a de segunda passada?".
 *
 * A página do grupo é o diferencial do produto — "os vídeos já organizados por
 * semana, atualizados sozinhos" — e é também a tela mais longa. Por isso o
 * cabeçalho gruda no topo enquanto a rodada rola.
 *
 * Rodada SEM lance continua aparecendo, com a ilustração e a explicação. Sumir
 * com a rodada faria o atleta achar que o produto perdeu o jogo dele; dizer
 * "ninguém apertou o botão" mostra que o sistema olhou e não achou.
 */

export type Semana = {
  id: string;
  /** "Segunda, 8 set" — a data da ocorrência. */
  titulo: string;
  /** O número da rodada. Sem ele, o cabeçalho volta a usar a data como título. */
  rodada?: number;
  clipes: Clipe[];
  /** Quando conhecido, a contagem real — pode ser maior que `clipes.length`. */
  total?: number;
  /** A data da rodada em `AAAA-MM-DD`, para o `datetime` do `<time>`. */
  dataIso?: string;
  /** Link "ver todos" quando a rodada está truncada. */
  hrefCompleto?: string;
};

export function WeekSection({
  semana,
  rodape,
}: {
  semana: Semana;
  /** Ação no fim da rodada ("Ver os 18 lances"). */
  rodape?: ReactNode;
}) {
  const total = semana.total ?? semana.clipes.length;
  const vazia = total === 0;
  const nome = typeof semana.rodada === "number" ? `Rodada ${semana.rodada}` : semana.titulo;
  const apoio = typeof semana.rodada === "number" ? semana.titulo : null;

  return (
    <section className={css.semana} aria-label={`${nome} · ${semana.titulo}`}>
      <header className={css.cabecalho}>
        <h3 className={`${css.rodada} ${vazia ? css.apagada : ""}`}>{nome}</h3>
        {/* `<time>` e não `<span>` (achado P2-35): a data da rodada é um dado de
            calendário, e marcá-la é o que faz o `tabular-nums` global casar sem
            depender da classe. */}
        {apoio ? (
          <time className={css.data} dateTime={semana.dataIso}>
            {apoio}
          </time>
        ) : null}
        {vazia ? null : (
          <span className={`${css.contagem} tempo`}>{plural(total, "lance", "lances")}</span>
        )}
      </header>

      {vazia ? (
        <div className={css.vazia}>
          <Ilustracao nome="botao" tamanho={56} variante="vazia" />
          <span className={css.vaziaTextos}>
            <span className={css.vaziaTitulo}>Ninguém apertou o botão.</span>
            <span className={css.vaziaApoio}>
              A quadra gravou, mas não veio lance. Na próxima, aperta!
            </span>
          </span>
        </div>
      ) : (
        <ClipGrid clipes={semana.clipes} rotulo={`Lances de ${semana.titulo}`} />
      )}

      {rodape}
    </section>
  );
}

export default WeekSection;

import type { Tendencia } from "../_lib/tendencia";
import css from "../painel.module.css";

/**
 * O ladrilho de número do painel: rótulo, valor grande, apoio e variação.
 *
 * ─── A HIERARQUIA É 38/11, E ISSO É O PONTO ────────────────────────────────
 *
 * O painel da v1 escrevia rótulo e valor quase do mesmo tamanho — sinal nº 3 do
 * diagnóstico ("tudo do mesmo tamanho"). Aqui o número está no display de 38px e
 * o rótulo em 11px caixa alta: a tela inteira pode ser lida de relance, que é o
 * modo como um painel de operação é lido.
 *
 * ─── A VARIAÇÃO TEM UM TEXTO SÓ PARA O LEITOR DE TELA ──────────────────────
 *
 * A pílula visual diz "+18%" e a seta diz a direção. Quem ouve a página recebe
 * "subiu 18% contra a média das semanas anteriores" — a mesma informação, sem
 * depender de um glifo que o leitor de tela pronuncia como "triângulo".
 */

export function StatTile({
  rotulo,
  valor,
  apoio,
  tendencia,
}: {
  rotulo: string;
  valor: number | string;
  apoio?: string;
  tendencia?: Tendencia | null;
}) {
  return (
    <li className={css.kpi}>
      <span className={css.kpiRotulo}>{rotulo}</span>
      <span className={css.kpiValor}>{valor}</span>
      <span className={css.kpiRodape}>
        {tendencia ? (
          <span className={`${css.variacao} ${css[tendencia.direcao]}`}>
            <span aria-hidden="true">
              {tendencia.direcao === "sobe" ? "▲" : tendencia.direcao === "desce" ? "▼" : "="}
            </span>
            <span aria-hidden="true">{tendencia.rotulo}</span>
            <span className="apenas-leitor">{tendencia.descricao}</span>
          </span>
        ) : null}
        {apoio ? <span className={css.kpiApoio}>{apoio}</span> : null}
      </span>
    </li>
  );
}

export default StatTile;

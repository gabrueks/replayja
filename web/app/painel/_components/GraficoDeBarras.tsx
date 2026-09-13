import css from "../painel.module.css";

/**
 * O gráfico de barras do painel — em CSS puro, com a tabela por baixo.
 *
 * ─── POR QUE NÃO UMA BIBLIOTECA ────────────────────────────────────────────
 *
 * São de sete a vinte e quatro valores, num eixo só, sem interação. A menor
 * biblioteca de gráfico usável custa ~40 kB comprimidos e chega ao celular do
 * dono da arena pelo 4G da quadra. Retângulo com altura em porcentagem é CSS de
 * 1996 e desenha a mesma coisa.
 *
 * ─── E POR QUE A TABELA ESCONDIDA NÃO É OPCIONAL ───────────────────────────
 *
 * `div` com altura não é lida por leitor de tela nenhum — sem o texto, o gráfico
 * simplesmente não existe para quem ouve a página. `aria-hidden` no desenho mais
 * a frase em `.apenas-leitor` é o par que deixa a informação inteira nos dois
 * canais.
 *
 * ─── O PICO É O ÚNICO RÓTULO ───────────────────────────────────────────────
 *
 * Escrever o valor sobre cada coluna vira cerca. O pico escrito responde a
 * pergunta que o parceiro faz de verdade ("a que horas enche?") sem ele ter de
 * medir a barra contra nada.
 */

export type Coluna = {
  /** A chave e o rótulo do eixo — "20h", "07h". */
  rotulo: string;
  /** O valor bruto, para a altura e para a tabela escondida. */
  valor: number;
  /** O que a tabela escondida lê ("95.4%"). Sem isso, usa o valor. */
  texto?: string;
  /** Pinta a coluna: `pico` (laranja cheio), `ok` (verde), `alerta` (vermelho). */
  tom?: "base" | "pico" | "ok" | "alerta";
};

export function GraficoDeBarras({
  colunas,
  maximo,
  descricao,
  legenda,
}: {
  colunas: Coluna[];
  /** O topo da escala. Zero ou menos desenha tudo no chão, sem dividir por zero. */
  maximo: number;
  /** A frase que abre a leitura ("Lances por horário nos últimos 7 dias"). */
  descricao: string;
  /** Duas notas embaixo do eixo (esquerda e direita). */
  legenda?: [React.ReactNode, React.ReactNode];
}) {
  const teto = maximo > 0 ? maximo : 1;

  return (
    <>
      <div className={css.grafico} aria-hidden="true">
        {colunas.map((c) => {
          const altura = Math.max(2, Math.round((c.valor / teto) * 100));
          const tom = c.tom ?? "base";
          return (
            <div key={c.rotulo} className={css.coluna}>
              {tom === "pico" ? (
                <span className={css.colunaValor}>{c.texto ?? c.valor}</span>
              ) : null}
              <div
                className={[
                  css.barra,
                  tom === "pico" ? css.barraPico : null,
                  tom === "ok" ? css.barraOk : null,
                  tom === "alerta" ? css.barraAlerta : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ height: `${altura}%` }}
              />
              <span className={css.horaRotulo}>{c.rotulo}</span>
            </div>
          );
        })}
      </div>

      {legenda ? (
        <p className={css.graficoLegenda}>
          <span>{legenda[0]}</span>
          <span>{legenda[1]}</span>
        </p>
      ) : null}

      <p className="apenas-leitor">
        {descricao}: {colunas.map((c) => `${c.rotulo}, ${c.texto ?? c.valor}`).join("; ")}.
      </p>
    </>
  );
}

export default GraficoDeBarras;

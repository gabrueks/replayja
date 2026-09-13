/**
 * A variação de um número do painel contra o período anterior.
 *
 * ─── POR QUE A COMPARAÇÃO É DERIVADA, E NÃO UMA CONSULTA NOVA ──────────────
 *
 * `metricasDoPainel` já devolve `lances_7d` e `lances_30d` na MESMA consulta, e
 * as duas janelas terminam agora. Então a semana anterior já está lá dentro:
 * `30d − 7d` são os 23 dias antes da última semana, e dividir isso pelo número
 * de semanas dá a média semanal do período anterior.
 *
 * Uma coluna nova (`lances_semana_passada`) seria mais precisa por alguns
 * pontos percentuais e custaria outra varredura de 30 dias em `clip` a cada
 * abertura do painel — para responder a mesma pergunta: "está subindo ou
 * caindo?". A conta fica aqui, é pura, e o rótulo diz exatamente o que ela
 * compara: **média das semanas anteriores**, não "semana passada". Prometer
 * "semana passada" e entregar uma média é o tipo de imprecisão que o parceiro
 * descobre no dia em que confere no braço.
 *
 * ─── O QUE NÃO GANHA VARIAÇÃO ──────────────────────────────────────────────
 *
 * "Atletas" é `count(DISTINCT)`: a diferença entre 30 e 7 dias NÃO é o número de
 * atletas dos 23 dias anteriores — quem jogou nas duas janelas é contado uma vez
 * só. Subtrair contagens distintas é a forma mais comum de inventar um número
 * que parece certo. Esses ladrilhos mostram o valor da outra janela como apoio,
 * sem seta.
 */

export type Tendencia = {
  /** `"sobe" | "desce" | "estavel"` — o que a pílula pinta. */
  direcao: "sobe" | "desce" | "estavel";
  /** `"+18%"`, `"−12%"`, `"estável"` — já formatado em pt-BR. */
  rotulo: string;
  /** A frase que o leitor de tela ouve, com o "de quê" junto. */
  descricao: string;
};

/** Abaixo disso a variação é ruído de amostra e a pílula diz "estável". */
const RUIDO = 0.05;

/**
 * Compara `atual` com `anterior` e devolve a pílula pronta.
 *
 * `anterior <= 0` devolve `null`: "subiu infinito%" não é informação, e a
 * primeira semana de uma arena cairia sempre nesse caso.
 */
export function variacao(atual: number, anterior: number, contra: string): Tendencia | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  if (anterior <= 0) return null;

  const razao = (atual - anterior) / anterior;
  if (Math.abs(razao) < RUIDO) {
    return { direcao: "estavel", rotulo: "estável", descricao: `estável ${contra}` };
  }

  const pct = Math.round(Math.abs(razao) * 100);
  const sobe = razao > 0;
  // O sinal de menos é o MATEMÁTICO (U+2212) e não o hífen: no display de 800 o
  // hífen fica curto demais e "-12%" lê como "12%" de relance.
  const rotulo = `${sobe ? "+" : "−"}${pct}%`;
  return {
    direcao: sobe ? "sobe" : "desce",
    rotulo,
    descricao: `${sobe ? "subiu" : "caiu"} ${pct}% ${contra}`,
  };
}

/**
 * A média semanal dos dias que ficaram FORA da última semana.
 *
 * `total30` inclui os 7 últimos dias, então o período anterior tem 23 dias —
 * 23/7 semanas. Devolve `null` quando não há período anterior nenhum (arena que
 * começou a gravar nesta semana).
 */
export function mediaSemanalAnterior(total30: number, total7: number): number | null {
  const anteriores = total30 - total7;
  if (anteriores <= 0) return null;
  return (anteriores * 7) / 23;
}

/** A média diária de uma janela de 7 dias — o que "hoje" é comparado contra. */
export function mediaDiariaDaSemana(total7: number): number | null {
  if (total7 <= 0) return null;
  return total7 / 7;
}

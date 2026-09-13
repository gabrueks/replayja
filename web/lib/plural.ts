// NÚMERO E PLURAL, em pt-BR, num lugar só.
//
// ─── OS DOIS ACHADOS QUE ESTE ARQUIVO FECHA ────────────────────────────────
//
// **P2-32 — plural sem tratamento.** "1 lances em 30 dias" no painel (na mesma
// linha em que "câmera" e "botão" estavam pluralizados certo), "1 quadras" na
// página da arena (enquanto a linha seguinte do MESMO arquivo tratava o
// singular), "1 dias" no convite. A revisão contou **36 ternários `=== 1 ?`**
// espalhados, nenhum helper — e a forma "lance(s)", que não existe em nenhuma
// outra parte do produto, em três telas do painel.
//
// **P2-24 — duas convenções numéricas na mesma tela.** "cobertura 24 h 85.2%" e
// "0.0%" — decimal com PONTO, à moda americana — três blocos abaixo de "média
// de 0,6 por dia", com vírgula. Não havia **nenhum** `Intl.NumberFormat` no
// repositório, e por isso milhar nunca era separado: "1234 lances".
//
// ─── POR QUE `Intl.PluralRules` NÃO RESOLVE SOZINHO ────────────────────────
//
// Ele diz QUAL forma usar (`one`/`other`), não QUAIS são as formas — em
// português a irregularidade mora no substantivo ("lance/lances", mas
// "canal/canais"), e nenhuma tabela do ICU tem isso. O que ele acrescenta de
// útil é a regra do **zero**: em pt-BR `0` é plural ("0 lances"), ao contrário
// do francês. Como essa é a única sutileza e ela cabe numa linha, a conta é
// feita aqui — e a formatação do NÚMERO, essa sim, é do `Intl`.

/**
 * O formatador de número do produto. Um só, memorizado.
 *
 * Construir um `Intl.NumberFormat` custa uns 200 µs; numa lista de trinta
 * lances isso aparece. O `Map` por chave de opções é o mesmo padrão que
 * `lib/fuso.ts` usa para `DateTimeFormat`.
 */
const FORMATOS = new Map<string, Intl.NumberFormat>();

function formatador(casas: number): Intl.NumberFormat {
  const chave = String(casas);
  let f = FORMATOS.get(chave);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
    FORMATOS.set(chave, f);
  }
  return f;
}

/**
 * `1234` → `"1.234"`; `0.856, 1` → `"0,9"`.
 *
 * Vírgula decimal e ponto de milhar, que é a convenção que o resto do produto
 * já usava em "média de 0,6 por dia".
 */
export function numero(valor: number | string | null | undefined, casas = 0): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "—";
  return formatador(casas).format(n);
}

/**
 * `0.852, 1` → `"85,2%"`.
 *
 * Recebe a FRAÇÃO (0–1), que é como as consultas de saúde guardam cobertura, e
 * não o número já multiplicado — a multiplicação espalhada pelas telas foi
 * metade do P2-24.
 */
export function percentual(fracao: number | string | null | undefined, casas = 1): string {
  const n = Number(fracao ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${numero(n * 100, casas)}%`;
}

/**
 * A PALAVRA certa para a contagem, sem o número.
 *
 * Em pt-BR o zero é plural: "0 lances", nunca "0 lance". O `-1` de um contador
 * que ainda não carregou também cai no plural, que é a forma que não chama
 * atenção.
 */
export function palavra(n: number, singular: string, plural: string): string {
  return Math.abs(n) === 1 ? singular : plural;
}

/**
 * `plural(1, "lance", "lances")` → `"1 lance"`.
 * `plural(1234, "lance", "lances")` → `"1.234 lances"`.
 *
 * O número sai por `numero()`, então milhar é separado de graça — que é o outro
 * lado do P2-24.
 */
export function plural(n: number, singular: string, formaPlural: string): string {
  return `${numero(n)} ${palavra(n, singular, formaPlural)}`;
}

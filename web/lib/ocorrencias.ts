import { instanteNaArena, relogioDe } from "./fuso";

// A DERIVAÇÃO DAS OCORRÊNCIAS DE UM FILTRO RECORRENTE — em TypeScript.
//
// ─── POR QUE ISTO EXISTE SE A CONSULTA DO GRUPO JÁ DERIVA EM SQL ───────────
//
// São perguntas diferentes. O SQL deriva as ocorrências PASSADAS para juntá-las
// aos clipes — ele tem de fazer isso lá dentro, porque o join é com `clip`. Aqui
// a pergunta é "quando é o próximo jogo?", que não toca em clipe nenhum: fazer
// isso em SQL custaria um `generate_series` e um `LATERAL` por grupo da lista só
// para produzir uma data que o navegador já poderia ter recebido.
//
// A regra é a mesma dos dois lados e está escrita uma vez em cada linguagem
// porque cada uma responde uma pergunta — o que NÃO pode acontecer é a contagem
// e a grade da mesma semana virem de derivações diferentes, e é por isso que
// aquelas duas compartilham um fragmento de SQL.
//
// ─── O FUSO É O DA ARENA, SEMPRE ───────────────────────────────────────────
//
// "Toda sexta às 20h" é hora da ARENA. A função da Vercel roda em UTC e o
// celular do atleta pode estar em qualquer lugar; toda conversão passa por
// `instanteNaArena`, que usa a mesma base IANA que o `AT TIME ZONE` do Postgres.
// O Brasil não tem horário de verão desde 2019, mas ele foi abolido por decreto
// e volta por decreto — nada aqui congela offset.

export type FiltroRecorrente = {
  /** ISO-8601: 1 = segunda … 7 = domingo. */
  weekdays: number[];
  /** `HH:MM` (aceita `HH:MM:SS`, que é como o `pg` devolve `time`). */
  startTime: string;
  endTime: string;
  /** IANA, copiado de `partner.timezone` na criação do grupo. */
  timezone: string;
};

export type Ocorrencia = {
  /** Data local da arena, `AAAA-MM-DD`. */
  localDate: string;
  /** O dia da semana ISO daquela data (1 = segunda). */
  weekday: number;
  inicio: Date;
  fim: Date;
};

/** "20:00:00" → "20:00". O `pg` devolve `time` com segundos. */
function hhmm(t: string): string {
  return t.slice(0, 5);
}

/**
 * A data local + N dias, em texto.
 *
 * A âncora é MEIO-DIA UTC, e não meia-noite: com meia-noite, qualquer fuso
 * negativo empurra a data um dia para trás (`new Date('2026-09-08')` é o
 * clássico "um dia a menos"). Ao meio-dia, o Brasil inteiro cai no mesmo dia.
 * A aritmética também atravessa virada de mês e de ano sozinha, porque quem
 * conta é o `Date` e não a string.
 */
export function somarDiasLocais(localDate: string, dias: number): string {
  const [ano, mes, dia] = localDate.split("-").map(Number);
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 12));
  d.setUTCDate(d.getUTCDate() + dias);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** Dia da semana ISO (1 = segunda … 7 = domingo) de uma data local. */
export function diaIsoDaData(localDate: string): number {
  const [ano, mes, dia] = localDate.split("-").map(Number);
  const js = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 12)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** A janela absoluta de uma ocorrência naquela data local. */
export function janelaDaOcorrencia(f: FiltroRecorrente, localDate: string): Ocorrencia {
  const inicio = instanteNaArena(localDate, hhmm(f.startTime), f.timezone);
  const fimMesmoDia = instanteNaArena(localDate, hhmm(f.endTime), f.timezone);
  // `fim <= início` é a pelada que CRUZA A MEIA-NOITE (23h → 0h30): a janela
  // termina no dia seguinte.
  const fim =
    fimMesmoDia.getTime() > inicio.getTime()
      ? fimMesmoDia
      : instanteNaArena(somarDiasLocais(localDate, 1), hhmm(f.endTime), f.timezone);

  return { localDate, weekday: diaIsoDaData(localDate), inicio, fim };
}

/** Quantos dias para trás vale procurar por `quantas` ocorrências. */
function alcance(f: FiltroRecorrente, quantas: number): number {
  const porSemana = Math.max(1, new Set(f.weekdays).size);
  return Math.ceil(quantas / porSemana) * 7 + 7;
}

/**
 * As últimas `quantas` ocorrências que JÁ COMEÇARAM, da mais recente para a mais
 * antiga.
 *
 * "Já começaram" e não "já terminaram": a pelada que está acontecendo agora é a
 * sessão mais importante da tela — é nela que os lances estão nascendo.
 */
export function ultimasOcorrencias(
  f: FiltroRecorrente,
  quantas = 8,
  agora: Date = new Date(),
): Ocorrencia[] {
  const dias = new Set(f.weekdays);
  if (dias.size === 0) return [];

  const hoje = relogioDe(agora, f.timezone).data;
  const saida: Ocorrencia[] = [];

  for (let i = 0; i <= alcance(f, quantas) && saida.length < quantas; i++) {
    const data = somarDiasLocais(hoje, -i);
    if (!dias.has(diaIsoDaData(data))) continue;
    const o = janelaDaOcorrencia(f, data);
    if (o.inicio.getTime() > agora.getTime()) continue;
    saida.push(o);
  }

  return saida;
}

/**
 * A PRÓXIMA ocorrência — "Próximo: sexta às 20:00".
 *
 * A pelada que começou há pouco ainda conta como próxima (`toleranciaMs`,
 * 3 h por padrão): quem está na quadra agora não pode ler "próximo jogo: semana
 * que vem". Três horas é o teto de uma janela de grupo (o `CHECK` da tabela é
 * de 6 h, mas a pelada real dura uma ou duas).
 */
export function proximaOcorrencia(
  f: FiltroRecorrente,
  agora: Date = new Date(),
  toleranciaMs = 3 * 60 * 60 * 1000,
): Ocorrencia | null {
  const dias = new Set(f.weekdays);
  if (dias.size === 0) return null;

  const hoje = relogioDe(agora, f.timezone).data;

  // Oito dias cobrem qualquer combinação: o pior caso é o grupo de um dia só,
  // que reaparece em sete.
  for (let i = 0; i <= 8; i++) {
    const data = somarDiasLocais(hoje, i);
    if (!dias.has(diaIsoDaData(data))) continue;
    const o = janelaDaOcorrencia(f, data);
    if (o.inicio.getTime() > agora.getTime() - toleranciaMs) return o;
  }

  return null;
}

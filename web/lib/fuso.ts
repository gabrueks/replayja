// Conversão entre a HORA DA ARENA e o instante absoluto.
//
// ─── POR QUE ISTO EXISTE, E POR QUE NÃO É `new Date(...)` ──────────────────
//
// O produto inteiro fala em hora local da arena: "os lances das 20h às 21h".
// O banco guarda `timestamptz` (instantes) e o `partner.timezone` diz em que
// fuso aquelas 20h foram vividas. Quem faz a ponte é este arquivo.
//
// O erro clássico que ele evita: `new Date("2026-09-12T20:00")` usa o fuso da
// MÁQUINA. Numa função da Vercel a máquina está em UTC, então "20:00 em São
// Paulo" viraria 17:00 — e a busca voltaria vazia sem erro nenhum. Foi
// exatamente por isso que `docs/modelo-de-dados.md` §4 proíbe congelar offset:
// `America/Sao_Paulo` hoje é `-03` o ano inteiro, mas o horário de verão foi
// abolido em 2019 e é reversível por decreto.
//
// Sem dependência externa: `Intl.DateTimeFormat` já carrega a base IANA no
// Node 20+, e é a mesma base que o Postgres usa em `AT TIME ZONE`.

const FORMATO_PARTES = new Map<string, Intl.DateTimeFormat>();

function partes(tz: string): Intl.DateTimeFormat {
  let f = FORMATO_PARTES.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      // `hourCycle: "h23"` e não `hour12: false`: em algumas versões do ICU o
      // segundo devolve "24" à meia-noite, e `Date.UTC(..., 24, ...)` empurra o
      // dia inteiro para a frente.
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATO_PARTES.set(tz, f);
  }
  return f;
}

export type RelogioLocal = {
  /** `2026-09-12` */
  data: string;
  /** `20:47` */
  hora: string;
  /** `2026-09-12T20:47:00` — o que o cliente lê com `new Date(...)`. */
  iso: string;
};

function campos(d: Date, tz: string): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const p of partes(tz).formatToParts(d)) {
    if (p.type !== "literal") saida[p.type] = Number(p.value);
  }
  return saida;
}

/** Offset do fuso, em ms, NO INSTANTE dado (positivo a leste de Greenwich). */
function offsetMs(d: Date, tz: string): number {
  const c = campos(d, tz);
  const comoUtc = Date.UTC(
    c.year ?? 1970,
    (c.month ?? 1) - 1,
    c.day ?? 1,
    c.hour ?? 0,
    c.minute ?? 0,
    c.second ?? 0,
  );
  return comoUtc - d.getTime();
}

/**
 * "20:00 do dia 12 de setembro, no fuso da arena" → o instante absoluto.
 *
 * Duas passadas: a primeira chuta o offset pelo horário lido como se fosse UTC,
 * a segunda corrige usando o offset do instante estimado. É o que acerta a
 * fronteira de uma eventual mudança de horário de verão sem tabela própria.
 */
export function instanteNaArena(dataLocal: string, hora: string, tz: string): Date {
  const [ano, mes, dia] = dataLocal.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  const alvo = Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, h ?? 0, m ?? 0, 0);
  const primeira = alvo - offsetMs(new Date(alvo), tz);
  const segunda = alvo - offsetMs(new Date(primeira), tz);
  return new Date(segunda);
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** O relógio de parede da arena agora. */
export function agoraNaArena(tz: string, agora: Date = new Date()): RelogioLocal {
  return relogioDe(agora, tz);
}

/** O relógio de parede da arena no instante dado. */
export function relogioDe(d: Date, tz: string): RelogioLocal {
  const c = campos(d, tz);
  const data = `${c.year}-${doisDigitos(c.month ?? 1)}-${doisDigitos(c.day ?? 1)}`;
  const hora = `${doisDigitos(c.hour ?? 0)}:${doisDigitos(c.minute ?? 0)}`;
  return { data, hora, iso: `${data}T${hora}:${doisDigitos(c.second ?? 0)}` };
}

/** `20:47` — a hora da arena, para o card e o player. */
export function horaNaArena(d: Date, tz: string): string {
  return relogioDe(d, tz).hora;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * "Hoje", "Ontem" ou "seg, 8 set" — a linha de contexto do card.
 *
 * A comparação é feita entre DATAS LOCAIS DA ARENA (texto `AAAA-MM-DD`), nunca
 * entre instantes: às 21h de São Paulo já é outro dia em UTC, e um clipe de
 * hoje apareceria como "ontem".
 */
export function diaRelativoNaArena(d: Date, tz: string, agora: Date = new Date()): string {
  const alvo = relogioDe(d, tz).data;
  const hoje = relogioDe(agora, tz).data;
  if (alvo === hoje) return "Hoje";

  const ontem = relogioDe(new Date(agora.getTime() - 86_400_000), tz).data;
  if (alvo === ontem) return "Ontem";

  const [ano, mes, dia] = alvo.split("-").map(Number);
  // `T12:00:00Z` no meio do dia: qualquer fuso do Brasil cai no mesmo dia, e o
  // clássico "um dia a menos" de `new Date('2026-09-08')` não acontece.
  const semana = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 12)).getUTCDay();
  return `${DIAS[semana]}, ${dia} ${MESES[(mes ?? 1) - 1]}`;
}

/** `22` segundos → `0:22`. Aceita o `numeric` que o `pg` devolve como string. */
export function duracaoFormatada(segundos: number | string | null): string {
  const s = Math.max(0, Math.round(Number(segundos ?? 0)));
  return `${Math.floor(s / 60)}:${doisDigitos(s % 60)}`;
}

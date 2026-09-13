// O ARQUIVO DE CALENDÁRIO DA PELADA — iCalendar (RFC 5545), escrito à mão.
//
// ─── POR QUE SEM BIBLIOTECA ────────────────────────────────────────────────
//
// O que o produto precisa gerar é UM evento com recorrência semanal. As
// bibliotecas de ics do npm trazem parser, timezone database e um modelo de
// objeto inteiro para escrever quinze linhas de texto — e cada dependência nova
// numa função da Vercel é peso de cold start no 4G da quadra. As três coisas que
// realmente têm pegadinha (quebra de linha CRLF, dobra em 75 octetos e escape
// de TEXT) estão resolvidas aqui embaixo, com teste.
//
// ─── OS INSTANTES SÃO UTC, E A RECORRÊNCIA É CURTA ─────────────────────────
//
// `DTSTART` com `TZID=America/Sao_Paulo` obrigaria o arquivo a carregar um bloco
// `VTIMEZONE` completo (com as regras históricas de horário de verão), e um
// VTIMEZONE errado é pior que nenhum: o evento aparece na hora errada sem nada
// na tela dizendo por quê. Então o instante vai em UTC, calculado por
// `lib/fuso.ts` — a mesma conversão que o resto do produto usa, e que acerta
// qualquer regra de fuso porque consulta a base IANA em vez de congelar offset.
//
// A consequência de usar UTC é que a RECORRÊNCIA congela o offset: se o Brasil
// reintroduzir o horário de verão (abolido em 2019, reversível por decreto), as
// ocorrências futuras deste arquivo ficariam uma hora deslocadas. É por isso que
// a recorrência tem `COUNT=12` — três meses de pelada, o mesmo horizonte da
// página do grupo. Quem continuar jogando baixa o arquivo de novo, e aí ele vem
// com o fuso do dia. Um `RRULE` infinito seria uma promessa que o arquivo não
// pode cumprir.

export type EventoDaPelada = {
  /** Identidade estável do evento — mesmo grupo, mesmo `UID`. */
  uid: string;
  titulo: string;
  descricao: string;
  local: string;
  url: string;
  inicio: Date;
  fim: Date;
  /** ISO-8601: 1 = segunda … 7 = domingo. */
  weekdays: number[];
  /** Quantas ocorrências o arquivo promete. */
  ocorrencias?: number;
  /** Injetável para o teste — o `DTSTAMP` é "quando este arquivo foi gerado". */
  agora?: Date;
};

/** ISO 1–7 → o código de dia da semana do RFC 5545. */
const DIA_ICS = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** `2026-09-18T23:00:00.000Z` → `20260918T230000Z`. */
export function carimboUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${doisDigitos(d.getUTCMonth() + 1)}${doisDigitos(d.getUTCDate())}` +
    `T${doisDigitos(d.getUTCHours())}${doisDigitos(d.getUTCMinutes())}` +
    `${doisDigitos(d.getUTCSeconds())}Z`
  );
}

/**
 * Escape de um valor TEXT do RFC 5545 (§3.3.11).
 *
 * A barra invertida vem PRIMEIRO: escapar a vírgula antes produziria `\,` e a
 * passada seguinte transformaria aquela barra em `\\,`, que o calendário lê como
 * uma barra literal seguida de fim de valor. É o clássico "escape do escape".
 */
export function escaparTexto(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Dobra a linha em 75 OCTETOS, não em 75 caracteres.
 *
 * "Pelada de sábado às 20h" tem acento, e acento em UTF-8 ocupa dois octetos. Um
 * corte por caractere passaria do limite e, pior, poderia cortar no MEIO de um
 * caractere multibyte — o que produz um arquivo que alguns calendários abrem com
 * um losango no lugar da letra e outros recusam inteiro.
 */
export function dobrarLinha(linha: string): string {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;

  const partes: string[] = [];
  let inicio = 0;
  // A primeira linha cabe 75 octetos; as seguintes, 74 (o espaço da continuação
  // conta).
  let teto = 75;
  while (inicio < bytes.length) {
    let fim = Math.min(inicio + teto, bytes.length);
    // Recua até o começo de um caractere: em UTF-8, byte de continuação é
    // `10xxxxxx`.
    while (fim > inicio && fim < bytes.length && (bytes[fim]! & 0b1100_0000) === 0b1000_0000) {
      fim -= 1;
    }
    partes.push(bytes.subarray(inicio, fim).toString("utf8"));
    inicio = fim;
    teto = 74;
  }
  return partes.join("\r\n ");
}

/**
 * O `.ics` da pelada.
 *
 * `CRLF` em toda quebra, inclusive na última linha: o RFC é explícito, e o
 * Outlook é o cliente que realmente recusa `LF` sozinho.
 */
export function icsDaPelada(e: EventoDaPelada): string {
  const dias = [...new Set(e.weekdays)]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b)
    .map((d) => DIA_ICS[d])
    .filter(Boolean);

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Replay ja//Grupo//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${carimboUtc(e.agora ?? new Date())}`,
    `DTSTART:${carimboUtc(e.inicio)}`,
    `DTEND:${carimboUtc(e.fim)}`,
    ...(dias.length > 0
      ? [`RRULE:FREQ=WEEKLY;BYDAY=${dias.join(",")};COUNT=${e.ocorrencias ?? 12}`]
      : []),
    `SUMMARY:${escaparTexto(e.titulo)}`,
    `DESCRIPTION:${escaparTexto(e.descricao)}`,
    `LOCATION:${escaparTexto(e.local)}`,
    `URL:${escaparTexto(e.url)}`,
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    // Uma hora antes, e só uma. Dois alarmes num evento recorrente é o caminho
    // mais curto para alguém desinstalar o calendário da pelada.
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparTexto(e.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${linhas.map(dobrarLinha).join("\r\n")}\r\n`;
}

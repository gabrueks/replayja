// A CASA DE DATA E HORA. Uma só, em pt-BR, sempre em 24 h.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
//
// A revisão de UX de 13/09 (achado P2-31) contou **quatro formatos** para a
// mesma coisa na mesma sessão de navegação — "Segunda, 14 set às 20:00" no
// grupo, "seg · 20:00–22:00" no chip, "13 de set., 10:45" no editar, "Sábado,
// 12 set · 18h–19h" na sessão — e, por baixo, **onze cópias** do array de dia da
// semana em **duas convenções de índice incompatíveis**, as duas chamadas
// `DIAS`:
//
//   lib/fuso.ts                       ["dom","seg",…]      0 = domingo
//   app/[arena]/[grupo]/page.tsx      ["","segunda",…]     1 = segunda
//
// Um copy-paste entre as duas erra o dia **em silêncio** — e num produto cujo
// dado central é "que horas você jogou", errar o dia é errar tudo.
//
// ─── A CONVENÇÃO É UMA: ISO-8601, 1 = SEGUNDA … 7 = DOMINGO ────────────────
//
// É a mesma do banco (`play_group.weekdays`), a mesma do `lib/ocorrencias.ts` e
// a mesma do formulário de grupo. O índice `0` de cada tabela é `""` de
// propósito: um `weekdays` com zero por engano sai como vazio e some do texto,
// em vez de virar "domingo".
//
// Quem tem um `Date` e precisa do dia da semana passa por `diaIsoDaData`, que
// lê a data LOCAL DA ARENA como texto (`AAAA-MM-DD`) e nunca o relógio da
// máquina — a função da Vercel roda em UTC, e às 21h de São Paulo já é o dia
// seguinte lá.
//
// ─── E POR QUE NÃO `toLocaleDateString("pt-BR")` ──────────────────────────
//
// Porque ele depende de duas coisas que não controlamos: a base ICU do runtime
// (a Vercel já entregou build sem `full-icu`, e o mês volta em inglês) e o
// `timeZone`, que quando não é passado é o da MÁQUINA — foi exatamente assim
// que a tela de editar grupo passou a mostrar 10:45 para uma arena cujo relógio
// marcava 07:45 (achado P1-10). Aqui o fuso é **argumento obrigatório** em toda
// função que recebe um instante, e as palavras são nossas.

import { relogioDe } from "./fuso";

/** `["", "seg", … "dom"]` — índice ISO: 1 = segunda. */
export const DIAS_CURTOS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

/** `["", "segunda", … "domingo"]` — índice ISO: 1 = segunda. */
export const DIAS_LONGOS = [
  "",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
] as const;

/** `["", "jan", … "dez"]` — índice humano: 1 = janeiro. */
export const MESES_CURTOS = [
  "",
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** `["", "janeiro", … "dezembro"]` — índice humano: 1 = janeiro. */
export const MESES_LONGOS = [
  "",
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/**
 * As partes de uma data local `AAAA-MM-DD`, sem passar por `new Date(texto)`.
 *
 * `new Date("2026-09-13")` é lido como MEIA-NOITE UTC e volta para o dia 12 em
 * qualquer fuso negativo — o clássico "um dia a menos". Aqui a data é só texto:
 * ela nunca vira instante, então não há fuso para errar.
 */
function partesDaData(dataLocal: string): { ano: number; mes: number; dia: number } | null {
  const casa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataLocal.trim());
  if (!casa) return null;
  const ano = Number(casa[1]);
  const mes = Number(casa[2]);
  const dia = Number(casa[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

/**
 * O dia da semana ISO (1 = segunda … 7 = domingo) de uma data local.
 *
 * `Date.UTC(..., 12)` no meio do dia e `getUTCDay()` na leitura: os dois lados
 * em UTC, então o fuso da máquina não participa da conta em ponto nenhum.
 */
export function diaIsoDaData(dataLocal: string): number | null {
  const p = partesDaData(dataLocal);
  if (!p) return null;
  const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia, 12));
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/** `2` → `"ter"`. Fora da faixa devolve `""`, nunca `undefined`. */
export function diaCurto(iso: number): string {
  return DIAS_CURTOS[iso] ?? "";
}

/** `2` → `"terça"`. */
export function diaLongo(iso: number): string {
  return DIAS_LONGOS[iso] ?? "";
}

/** `"terça"` → `"Terça"`. Só a primeira letra, e sem tocar no resto. */
export function comInicialMaiuscula(texto: string): string {
  return texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}` : texto;
}

/** `[1, 3]` → `"seg, qua"`. */
export function diasCurtos(weekdays: readonly number[]): string {
  return weekdays.map(diaCurto).filter(Boolean).join(", ");
}

/** `[1, 3]` → `"segunda ou quarta"`. O separador é do chamador. */
export function diasLongos(weekdays: readonly number[], junta = " ou "): string {
  return weekdays.map(diaLongo).filter(Boolean).join(junta);
}

/**
 * `1` → `"na segunda"`; `6` → `"no sábado"`.
 *
 * Existe porque a frase "Assim que alguém apertar o botão segunda entre 20:00 e
 * 22:00" (achado P2-39) não tem preposição — e a preposição muda com o gênero
 * do dia, que só o dia conhece. Interpolar o dia cru é como o erro volta.
 */
export function diaComPreposicao(iso: number): string {
  const dia = diaLongo(iso);
  if (!dia) return "";
  // Sábado e domingo são masculinos; de segunda a sexta o substantivo elidido é
  // "feira", feminino.
  return iso >= 6 ? `no ${dia}` : `na ${dia}`;
}

/** `[1, 3]` → `"na segunda ou na quarta"`. */
export function diasComPreposicao(weekdays: readonly number[], junta = " ou "): string {
  return weekdays.map(diaComPreposicao).filter(Boolean).join(junta);
}

/** `9` → `"set"`. */
export function mesCurto(mes: number): string {
  return MESES_CURTOS[mes] ?? "";
}

/** `9` → `"setembro"`. */
export function mesLongo(mes: number): string {
  return MESES_LONGOS[mes] ?? "";
}

/**
 * `"2026-09-13"` → `"13 de set"`.
 *
 * É o formato que o `CampoDeData` mostra embaixo do `<input type="date">`, e é
 * a resposta ao achado P0-3: o navegador pode renderizar `09/13/2026`, mas o
 * que a pessoa CONFERE é esta linha, que é nossa e é sempre pt-BR.
 */
export function diaEMes(dataLocal: string): string {
  const p = partesDaData(dataLocal);
  if (!p) return dataLocal;
  return `${p.dia} de ${mesCurto(p.mes)}`;
}

/** `"2026-09-13"` → `"Sáb, 13 set"` — a linha de contexto de um card. */
export function dataCurta(dataLocal: string): string {
  const p = partesDaData(dataLocal);
  const iso = diaIsoDaData(dataLocal);
  if (!p || !iso) return dataLocal;
  return `${comInicialMaiuscula(diaCurto(iso))}, ${p.dia} ${mesCurto(p.mes)}`;
}

/** `"2026-09-13"` → `"Sábado, 13 de setembro"` — o título de uma tela. */
export function dataLonga(dataLocal: string): string {
  const p = partesDaData(dataLocal);
  const iso = diaIsoDaData(dataLocal);
  if (!p || !iso) return dataLocal;
  return `${comInicialMaiuscula(diaLongo(iso))}, ${p.dia} de ${mesLongo(p.mes)}`;
}

/** `"2026-09-13"` → `"Sábado, 13 set"` — o meio-termo, para cabeçalho de rodada. */
export function dataMedia(dataLocal: string): string {
  const p = partesDaData(dataLocal);
  const iso = diaIsoDaData(dataLocal);
  if (!p || !iso) return dataLocal;
  return `${comInicialMaiuscula(diaLongo(iso))}, ${p.dia} ${mesCurto(p.mes)}`;
}

/**
 * `"20:00:00"` → `"20:00"`. O `time` do Postgres chega com segundos.
 *
 * Estava escrito como `.slice(0, 5)` em onze lugares. Um `slice` não sabe dizer
 * que recebeu `"8:00"` — esta função sabe, e devolve `"08:00"`.
 */
export function hhmm(hora: string): string {
  const casa = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
  if (!casa) return hora;
  return `${String(Number(casa[1])).padStart(2, "0")}:${casa[2]}`;
}

/**
 * `"20:00"` → `"20h"`; `"21:30"` → `"21h30"`.
 *
 * É como se fala e como se escreve numa mensagem de WhatsApp ("bora 20h"). O
 * `20:00` do relógio digital é preciso e é a forma que ninguém usa em voz alta.
 */
export function horaHumana(hora: string): string {
  const [h, m] = hhmm(hora).split(":");
  if (!h) return hora;
  return m && m !== "00" ? `${h}h${m}` : `${h}h`;
}

/**
 * `"20:00", "21:30"` → `"20:00–21:30"` (ou `"20h–21h30"` no modo humano).
 *
 * O travessão é `–` (en dash) e não `-`: é o sinal tipográfico de intervalo, e
 * é o que o produto já usava nos chips. Ter a escolha num lugar só é o que
 * impede a terceira variação.
 */
export function faixaDeHorario(
  de: string,
  ate: string,
  opcoes?: { humano?: boolean },
): string {
  const f = opcoes?.humano ? horaHumana : hhmm;
  return `${f(de)}–${f(ate)}`;
}

// ─── O QUE PRECISA DO FUSO DA ARENA ────────────────────────────────────────
//
// Daqui para baixo tudo recebe um `Date` (um INSTANTE) e o fuso em que ele deve
// ser lido. O fuso é argumento obrigatório, sem valor padrão: um padrão seria a
// máquina, e a máquina é UTC.

/** `"13 de set"` — a data do instante, no relógio da arena. */
export function dataCurtaNaArena(d: Date, tz: string): string {
  return diaEMes(relogioDe(d, tz).data);
}

/**
 * `"13 de set, 19:47"` — instante completo no relógio da arena.
 *
 * É o que substitui o `new Intl.DateTimeFormat("pt-BR", …)` SEM `timeZone` de
 * `editar/page.tsx:49`, que mostrava "13 de set., 10:45" para uma arena cujo
 * relógio marcava 07:45 (achado P1-10).
 */
export function dataHoraNaArena(d: Date, tz: string): string {
  const r = relogioDe(d, tz);
  return `${diaEMes(r.data)}, ${r.hora}`;
}

/** `"Sáb, 13 set · 19:47"` — a versão com dia da semana. */
export function dataCompletaNaArena(d: Date, tz: string): string {
  const r = relogioDe(d, tz);
  return `${dataCurta(r.data)} · ${r.hora}`;
}

/**
 * "Hoje", "Ontem" ou "seg, 8 set" — a linha de contexto do card de lance.
 *
 * Veio de `lib/fuso.ts`, onde dependia de uma tabela 0-indexada própria. A
 * comparação é feita entre DATAS LOCAIS DA ARENA (texto `AAAA-MM-DD`), nunca
 * entre instantes: às 21h de São Paulo já é outro dia em UTC, e um clipe de
 * hoje apareceria como "ontem".
 */
export function diaRelativoNaArena(d: Date, tz: string, agora: Date = new Date()): string {
  const alvo = relogioDe(d, tz).data;
  const hoje = relogioDe(agora, tz).data;
  if (alvo === hoje) return "Hoje";

  const ontem = relogioDe(new Date(agora.getTime() - 86_400_000), tz).data;
  if (alvo === ontem) return "Ontem";

  const p = partesDaData(alvo);
  const iso = diaIsoDaData(alvo);
  if (!p || !iso) return alvo;
  return `${diaCurto(iso)}, ${p.dia} ${mesCurto(p.mes)}`;
}

/**
 * "hoje", "amanhã" ou "sexta" — para a linha "Próxima pelada".
 *
 * Recebe a data local que o SQL já devolveu no fuso da arena.
 */
export function diaRelativoLongo(dataLocal: string, tz: string, agora: Date = new Date()): string {
  if (dataLocal === relogioDe(agora, tz).data) return "hoje";
  if (dataLocal === relogioDe(new Date(agora.getTime() + 86_400_000), tz).data) return "amanhã";
  const iso = diaIsoDaData(dataLocal);
  return iso ? diaLongo(iso) : dataLocal;
}

/**
 * `150` → `"2 h 30 min"`; `30` → `"30 min"`; `120` → `"2 h"`.
 *
 * Achado P2-27: a linha de resumo da busca era três expressões concatenadas no
 * JSX, e saía `"30min de busca"` (sem espaço) para meia hora e `"2h  de busca"`
 * (com espaço duplo) para uma janela cheia. Montar a string numa função é o que
 * faz o caso "só horas" e o caso "só minutos" pararem de ser acidentes.
 */
export function duracaoEmPalavras(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  const partes: string[] = [];
  if (horas > 0) partes.push(`${horas} h`);
  if (resto > 0) partes.push(`${resto} min`);
  return partes.length > 0 ? partes.join(" ") : "0 min";
}

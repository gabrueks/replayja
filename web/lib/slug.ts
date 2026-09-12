import { slugReservadoDeArena, slugReservadoDeGrupo } from "./reserved-slugs";

// Regras de slug — ADR §8 e `modelo-de-dados.md` §3.1.
//
//   ^[a-z0-9]+(-[a-z0-9]+)*$ , 3–40 chars (arena) / 3–30 (grupo)
//
// Normalização: minúsculas, sem acentos (NFD + remoção de diacríticos),
// espaços → `-`, colapsar `-` repetidos, remover `-` nas pontas.
//
// O slug é IMUTÁVEL depois que a arena vai ao ar: renomear cria um alias em
// `partner_slug_alias` e a rota antiga responde 308. Um link impresso num banner
// na quadra não pode quebrar.

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const ARENA_SLUG_MIN = 3;
export const ARENA_SLUG_MAX = 40;
export const GRUPO_SLUG_MIN = 3;
export const GRUPO_SLUG_MAX = 30;

/**
 * Normaliza um texto livre ("Arena Calabouço") em slug ("arena-calabouco").
 *
 * Faz a remoção de diacríticos com NFD (`ç` → `c` + cedilha combinante, e a
 * cedilha combinante cai no `\p{Diacritic}`). Não garante que o resultado seja
 * válido — quem valida é `validarSlugDeArena`; texto só de símbolos vira string
 * vazia, e é o chamador que decide o que fazer com isso.
 */
export function normalizarSlug(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type MotivoSlugInvalido =
  | "formato"
  | "curto"
  | "longo"
  | "reservado";

export type ResultadoSlug =
  | { ok: true; slug: string }
  | { ok: false; motivo: MotivoSlugInvalido };

function validar(
  slug: string,
  min: number,
  max: number,
  reservado: (s: string) => boolean,
): ResultadoSlug {
  const s = slug.toLowerCase();
  // A ordem importa para a mensagem de erro: tamanho antes de formato deixaria
  // "ab" e "a--b" com o mesmo motivo, e são erros diferentes para quem digita.
  if (!SLUG_RE.test(s)) return { ok: false, motivo: "formato" };
  if (s.length < min) return { ok: false, motivo: "curto" };
  if (s.length > max) return { ok: false, motivo: "longo" };
  if (reservado(s)) return { ok: false, motivo: "reservado" };
  return { ok: true, slug: s };
}

export function validarSlugDeArena(slug: string): ResultadoSlug {
  return validar(slug, ARENA_SLUG_MIN, ARENA_SLUG_MAX, slugReservadoDeArena);
}

export function validarSlugDeGrupo(slug: string): ResultadoSlug {
  return validar(slug, GRUPO_SLUG_MIN, GRUPO_SLUG_MAX, slugReservadoDeGrupo);
}

/** Atalho para rota: o parâmetro do caminho é um slug de arena plausível? */
export function ehSlugDeArena(slug: string): boolean {
  return validarSlugDeArena(slug).ok;
}

export function ehSlugDeGrupo(slug: string): boolean {
  return validarSlugDeGrupo(slug).ok;
}

export const MENSAGEM_SLUG: Record<MotivoSlugInvalido, string> = {
  formato: "Use apenas letras minúsculas, números e hífen entre palavras.",
  curto: "O endereço precisa de pelo menos 3 caracteres.",
  longo: "O endereço ficou longo demais.",
  reservado: "Este endereço é reservado pelo sistema. Escolha outro.",
};

/**
 * Slug de sessão: `AAAA-MM-DD-HHhMMm-HHhMMm` (ex.: `2026-09-08-20h00m-21h30m`).
 *
 * É o caminho de `/[arenaSlug]/s/[sessionSlug]` — uma JANELA, não uma linha do
 * banco (`share_link.target_type = 'session'` também não tem `target_id`). A
 * janela é local à arena; a conversão para `timestamptz` acontece na consulta,
 * com o `timezone` do parceiro.
 */
export const SESSION_SLUG_RE =
  /^(\d{4})-(\d{2})-(\d{2})-(\d{2})h(\d{2})m-(\d{2})h(\d{2})m$/;

export type JanelaDeSessao = {
  /** Data local da arena, `AAAA-MM-DD`. */
  localDate: string;
  /** Hora local de início, `HH:MM`. */
  startTime: string;
  /** Hora local de fim, `HH:MM`. Pode ser menor que o início (cruza a meia-noite). */
  endTime: string;
};

export function parseSessionSlug(slug: string): JanelaDeSessao | null {
  const m = SESSION_SLUG_RE.exec(slug);
  if (!m) return null;
  const [, ano, mes, dia, h1, m1, h2, m2] = m as unknown as string[];
  const nMes = Number(mes);
  const nDia = Number(dia);
  const nH1 = Number(h1);
  const nH2 = Number(h2);
  const nM1 = Number(m1);
  const nM2 = Number(m2);
  if (nMes < 1 || nMes > 12 || nDia < 1 || nDia > 31) return null;
  if (nH1 > 23 || nH2 > 23 || nM1 > 59 || nM2 > 59) return null;
  return {
    localDate: `${ano}-${mes}-${dia}`,
    startTime: `${h1}:${m1}`,
    endTime: `${h2}:${m2}`,
  };
}

export function formatSessionSlug(j: JanelaDeSessao): string {
  const [h1, m1] = j.startTime.split(":");
  const [h2, m2] = j.endTime.split(":");
  return `${j.localDate}-${h1}h${m1}m-${h2}h${m2}m`;
}

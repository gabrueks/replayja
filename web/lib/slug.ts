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
 * Slug de sessão: `[<quadra>-]AAAA-MM-DD-HHh[MMm]-HHh[MMm]`.
 *
 *   `2026-09-08-20h-21h`             → a arena inteira, das 20h às 21h
 *   `quadra-1-2026-09-08-20h-21h30m` → só a quadra 1, das 20h às 21h30
 *
 * É o caminho de `/[arenaSlug]/s/[sessionSlug]` — uma JANELA, não uma linha do
 * banco (`share_link.target_type = 'session'` também não tem `target_id`). A
 * janela é local à arena; a conversão para `timestamptz` acontece na consulta,
 * com o `timezone` do parceiro.
 *
 * ─── DUAS DECISÕES DE FORMATO, E POR QUÊ ───────────────────────────────────
 *
 * 1. OS MINUTOS SÃO OPCIONAIS NA ESCRITA E OMITIDOS QUANDO SÃO ZERO. O caso
 *    esmagadoramente comum é hora cheia, e `2026-09-08-20h-21h` é o que cabe
 *    numa mensagem de WhatsApp sem virar duas linhas. `20h00m` continua sendo
 *    aceito na leitura: links já compartilhados não podem quebrar.
 * 2. A QUADRA É PREFIXO, NÃO SUFIXO NEM QUERY STRING. Prefixo porque o trecho
 *    final tem forma fixa, o que torna a separação inequívoca mesmo com um slug
 *    de quadra cheio de hífens (`quadra-1`, `campo-de-areia-2`). Query string
 *    ficaria de fora do link quando alguém copiasse só o caminho.
 */
export const SESSION_SLUG_RE =
  /^(?:(.+)-)?(\d{4})-(\d{2})-(\d{2})-(\d{2})h(?:(\d{2})m)?-(\d{2})h(?:(\d{2})m)?$/;

export type JanelaDeSessao = {
  /** Data local da arena, `AAAA-MM-DD`. */
  localDate: string;
  /** Hora local de início, `HH:MM`. */
  startTime: string;
  /** Hora local de fim, `HH:MM`. Pode ser menor que o início (cruza a meia-noite). */
  endTime: string;
  /** Slug da quadra, quando a sessão é de uma só. `null` = a arena inteira. */
  courtSlug?: string | null;
};

export function parseSessionSlug(slug: string): JanelaDeSessao | null {
  const m = SESSION_SLUG_RE.exec(slug);
  if (!m) return null;
  const [, quadra, ano, mes, dia, h1, m1, h2, m2] = m as unknown as (string | undefined)[];
  if (!ano || !mes || !dia || !h1 || !h2) return null;
  // A quadra é um slug de verdade: sem isso, `qualquer--coisa-2026-…` viraria um
  // filtro que nunca casa e a sessão voltaria vazia sem explicação.
  if (quadra !== undefined && !SLUG_RE.test(quadra)) return null;
  const min1 = m1 ?? "00";
  const min2 = m2 ?? "00";
  const nMes = Number(mes);
  const nDia = Number(dia);
  if (nMes < 1 || nMes > 12 || nDia < 1 || nDia > 31) return null;
  if (Number(h1) > 23 || Number(h2) > 23 || Number(min1) > 59 || Number(min2) > 59) return null;
  return {
    localDate: `${ano}-${mes}-${dia}`,
    startTime: `${h1}:${min1}`,
    endTime: `${h2}:${min2}`,
    courtSlug: quadra ?? null,
  };
}

/** `HH:MM` → `20h` (hora cheia) ou `20h30m`. */
function horaNoSlug(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${h}h` : `${h}h${m}m`;
}

export function formatSessionSlug(j: JanelaDeSessao): string {
  const prefixo = j.courtSlug ? `${j.courtSlug}-` : "";
  return `${prefixo}${j.localDate}-${horaNoSlug(j.startTime)}-${horaNoSlug(j.endTime)}`;
}

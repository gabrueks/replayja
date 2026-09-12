import { query } from "@/lib/db";
import type { Sessao } from "@/lib/session";
import { mascararEmail, papelNoGrupo } from "./autorizacao";

// O grupo — `api/README.md` §3 ("O grupo NÃO é uma ACL") e `modelo-de-dados.md`
// §3.17.

export type GrupoRow = {
  id: string;
  partner_id: string;
  partner_slug: string;
  partner_display_name: string;
  slug: string;
  name: string;
  description: string | null;
  weekdays: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  visibility: "public" | "unlisted" | "private";
  all_courts: boolean;
  cover_object_key: string | null;
  member_count: number;
};

/**
 * O grupo por (slug da arena, slug do grupo).
 *
 * ─── VISIBILIDADE ──────────────────────────────────────────────────────────
 *
 *   public   → metadados para anônimo, página inteira para logado, entra no
 *              sitemap e aparece na página da arena
 *   unlisted → só com o link; anônimo vê o mínimo
 *   private  → 404 para quem não é membro. NUNCA 403: distinguir "não existe" de
 *              "você não pode ver" é um oráculo de enumeração.
 *
 * E o que o grupo privado esconde é a PÁGINA, as sessões organizadas e a lista de
 * membros — nunca os clipes. A UI diz "quem pode ver esta página".
 */
export async function grupoPorSlug(
  s: Sessao | null,
  arenaSlug: string,
  grupoSlug: string,
): Promise<GrupoRow | null> {
  const linhas = await query<GrupoRow>(
    `SELECT g.id, g.partner_id, p.slug::text AS partner_slug,
            p.display_name AS partner_display_name,
            g.slug::text AS slug, g.name, g.description,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time,
            g.timezone, g.visibility::text AS visibility, g.all_courts,
            g.cover_object_key, g.member_count
       FROM play_group g
       JOIN partner p ON p.id = g.partner_id
      WHERE p.slug = $1 AND g.slug = $2
        AND g.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [arenaSlug, grupoSlug],
  );
  const g = linhas[0];
  if (!g) return null;
  if (g.visibility !== "private") return g;
  // `private`: só membro (ou admin da arena, que o chamador confere quando for o
  // painel). Para o resto, some.
  return (await papelNoGrupo(s, g.id)) ? g : null;
}

/** Grupos públicos da arena — a aba "Grupos" da página do parceiro. */
export async function gruposPublicosDaArena(partnerId: string): Promise<GrupoRow[]> {
  return query<GrupoRow>(
    `SELECT g.id, g.partner_id, p.slug::text AS partner_slug,
            p.display_name AS partner_display_name,
            g.slug::text AS slug, g.name, g.description,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time,
            g.timezone, g.visibility::text AS visibility, g.all_courts,
            g.cover_object_key, g.member_count
       FROM play_group g
       JOIN partner p ON p.id = g.partner_id
      WHERE g.partner_id = $1
        AND g.visibility = 'public'
        AND g.deleted_at IS NULL
      ORDER BY g.member_count DESC, g.name`,
    [partnerId],
  );
}

/** "Meus grupos" da área logada. */
export async function meusGrupos(s: Sessao | null): Promise<GrupoRow[]> {
  if (!s?.uid) return [];
  return query<GrupoRow>(
    `SELECT g.id, g.partner_id, p.slug::text AS partner_slug,
            p.display_name AS partner_display_name,
            g.slug::text AS slug, g.name, g.description,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time,
            g.timezone, g.visibility::text AS visibility, g.all_courts,
            g.cover_object_key, g.member_count
       FROM play_group_member m
       JOIN play_group g ON g.id = m.play_group_id
       JOIN partner p    ON p.id = g.partner_id
      WHERE m.user_id = $1 AND m.status = 'active' AND g.deleted_at IS NULL
      ORDER BY g.name`,
    [s.uid],
  );
}

export type MembroRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string;
  role: "owner" | "member";
  status: string;
  accepted_at: Date | null;
};

/**
 * Membros do grupo, com o e-mail MASCARADO para quem não é dono.
 *
 * A lista serve para saber quem está no grupo, não para extrair base de
 * contatos. O mascaramento acontece no TS e não no SQL de propósito: é visível na
 * revisão de código e não some num `COALESCE` mal editado.
 */
export async function membrosDoGrupo(
  s: Sessao | null,
  playGroupId: string,
): Promise<MembroRow[]> {
  const papel = await papelNoGrupo(s, playGroupId);
  if (!papel) return [];
  const linhas = await query<MembroRow>(
    `SELECT m.id, m.user_id, u.display_name,
            m.invited_email::text AS email,
            m.role::text AS role, m.status::text AS status, m.accepted_at
       FROM play_group_member m
       LEFT JOIN app_user u ON u.id = m.user_id
      WHERE m.play_group_id = $1 AND m.status IN ('invited','active')
      ORDER BY m.role DESC, m.accepted_at NULLS LAST, m.created_at`,
    [playGroupId],
  );
  if (papel === "owner") return linhas;
  return linhas.map((m) => ({ ...m, email: mascararEmail(m.email) }));
}

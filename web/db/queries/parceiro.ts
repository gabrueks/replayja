import { query } from "@/lib/db";
import type { Sessao } from "@/lib/session";

// Página pública da arena — a única superfície do produto que anônimo lê.
//
// É a LANDING PAGE da arena, e é isso que a torna argumento de venda: ela carrega
// inteira sem login (`design/README.md`, decisão 1). O gate aparece na AÇÃO —
// buscar, baixar, compartilhar, criar grupo —, não na chegada.

export type ParceiroPublicoRow = {
  id: string;
  slug: string;
  display_name: string;
  city: string | null;
  state: string | null;
  timezone: string;
  public_page_enabled: boolean;
  watermark_enabled: boolean;
  clip_retention_days: number;
  logo_object_key: string | null;
  logo_dark_object_key: string | null;
  og_image_object_key: string | null;
  primary_color: string | null;
  accent_color: string | null;
  tagline: string | null;
};

/**
 * A arena por slug, para a página pública e o `generateMetadata`.
 *
 * NÃO recebe sessão de propósito: é o único caminho de leitura verdadeiramente
 * público do produto. Tudo o que ele projeta é o que já está impresso na placa da
 * quadra — nome, cidade, marca. Nenhuma coluna operacional entra aqui.
 */
export async function parceiroPublicoPorSlug(
  slug: string,
): Promise<ParceiroPublicoRow | null> {
  const linhas = await query<ParceiroPublicoRow>(
    `SELECT p.id, p.slug, p.display_name, p.city, p.state, p.timezone,
            p.public_page_enabled, p.watermark_enabled, p.clip_retention_days,
            b.logo_object_key, b.logo_dark_object_key, b.og_image_object_key,
            b.primary_color, b.accent_color, b.tagline
       FROM partner p
       LEFT JOIN partner_branding b ON b.partner_id = p.id
      WHERE p.slug = $1
        AND p.deleted_at IS NULL
        AND p.public_page_enabled
        AND p.status IN ('active','pending')`,
    [slug],
  );
  return linhas[0] ?? null;
}

/**
 * Slug antigo → id da arena. A rota responde 308 permanente.
 *
 * Renomear cria alias em vez de mudar o slug porque um link IMPRESSO em banner na
 * quadra não pode quebrar.
 */
export async function parceiroPorAlias(slug: string): Promise<{ slug: string } | null> {
  const linhas = await query<{ slug: string }>(
    `SELECT p.slug
       FROM partner_slug_alias a
       JOIN partner p ON p.id = a.partner_id
      WHERE a.slug = $1 AND p.deleted_at IS NULL`,
    [slug],
  );
  return linhas[0] ?? null;
}

export type QuadraPublicaRow = {
  id: string;
  slug: string;
  name: string;
  sport: string;
  surface: string | null;
  display_order: number;
  /** True quando há pelo menos uma câmera ativa — "quadras com câmera". */
  tem_camera: boolean;
};

/**
 * Quadras da arena, para os chips de filtro da busca e a aba "Sobre".
 *
 * Não paginada de propósito (`api/README.md` §2): uma arena tem 2–20 quadras, e
 * paginar 4 quadras é complexidade sem benefício.
 *
 * `tem_camera` é um EXISTS e não um join com contagem: não devolvemos quantas nem
 * quais câmeras para quem não é admin — isso é dado operacional.
 */
export async function quadrasDoParceiro(partnerId: string): Promise<QuadraPublicaRow[]> {
  return query<QuadraPublicaRow>(
    `SELECT c.id, c.slug, c.name, c.sport::text AS sport, c.surface, c.display_order,
            EXISTS (
              SELECT 1 FROM camera cam
               WHERE cam.court_id = c.id AND cam.enabled AND cam.deleted_at IS NULL
            ) AS tem_camera
       FROM court c
      WHERE c.partner_id = $1 AND c.active AND c.deleted_at IS NULL
      ORDER BY c.display_order, c.name`,
    [partnerId],
  );
}

export type ContatoRow = {
  kind: string;
  label: string | null;
  value: string;
  is_primary: boolean;
};

export async function contatosDoParceiro(partnerId: string): Promise<ContatoRow[]> {
  return query<ContatoRow>(
    `SELECT kind::text AS kind, label, value, is_primary
       FROM partner_contact
      WHERE partner_id = $1
      ORDER BY display_order, kind`,
    [partnerId],
  );
}

export type ArenaDoAdminRow = {
  id: string;
  slug: string;
  display_name: string;
  role: "owner" | "manager" | "viewer";
};

/**
 * As arenas que ESTE usuário administra.
 *
 * É a consulta que DEFINE o escopo, não uma que o recebe: ela não aceita
 * `partnerId` de lugar nenhum — responde "de quais arenas VOCÊ é admin" a partir
 * do `uid` da sessão. Tudo o que o painel faz depois parte daqui, e qualquer
 * `partnerId` que venha da URL ainda precisa passar por `exigirAdminDaArena`.
 */
export async function arenasDoAdmin(s: Sessao | null): Promise<ArenaDoAdminRow[]> {
  if (!s?.uid) return [];
  return query<ArenaDoAdminRow>(
    `SELECT p.id, p.slug::text AS slug, p.display_name, pa.role::text AS role
       FROM partner_admin pa
       JOIN partner p ON p.id = pa.partner_id
      WHERE pa.user_id = $1 AND pa.status = 'active' AND p.deleted_at IS NULL
      ORDER BY p.display_name`,
    [s.uid],
  );
}

/** Quantos lances a arena gravou hoje — o contador da grade borrada da página
 *  deslogada ("132 lances gravados hoje"). É uma contagem, nunca uma lista:
 *  mostra que existe conteúdo antes de pedir o e-mail. */
export async function lancesDeHojeNaArena(
  partnerId: string,
  timezone: string,
): Promise<number> {
  const linhas = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM clip
      WHERE partner_id = $1
        AND status IN ('ready','partial')
        AND deleted_at IS NULL
        AND (triggered_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
    [partnerId, timezone],
  );
  return Number(linhas[0]?.n ?? 0);
}

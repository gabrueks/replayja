import { query, transacao } from "@/lib/db";
import type { Sessao } from "@/lib/session";
import { exigirLogin, mascararEmail, papelNoGrupo } from "./autorizacao";

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

// ───────────────────────────────────────────────────── criação

export type NovoGrupo = {
  partnerId: string;
  /** Já normalizado e validado por `lib/slug.ts` — aqui só entra slug pronto. */
  slug: string;
  name: string;
  description?: string | null;
  /** ISO-8601: 1 = segunda … 7 = domingo. */
  weekdays: number[];
  /** `HH:MM`, hora da ARENA. */
  startTime: string;
  endTime: string;
  timezone: string;
  /** `null` = todas as quadras da arena. */
  courtId?: string | null;
  visibility?: "public" | "unlisted" | "private";
};

/** O slug já está em uso nesta arena? */
export async function slugDeGrupoEmUso(partnerId: string, slug: string): Promise<boolean> {
  const linhas = await query<{ um: number }>(
    `SELECT 1 AS um FROM play_group
      WHERE partner_id = $1 AND slug = $2 AND deleted_at IS NULL LIMIT 1`,
    [partnerId, slug],
  );
  return linhas.length > 0;
}

/**
 * Cria o grupo e põe quem criou como DONO, numa transação só.
 *
 * ─── POR QUE TRANSAÇÃO, SE SÃO TRÊS INSERTS ────────────────────────────────
 *
 * Porque as três linhas juntas são o grupo. Um `play_group` sem
 * `play_group_member` é um grupo que existe, aparece na aba da arena, e que
 * NINGUÉM pode editar — nem quem o criou: `exigirDonoDoGrupo` consulta a
 * participação, não a coluna `created_by`. E um `play_group` sem
 * `play_group_court` quando `all_courts = false` é um grupo que nunca acha
 * lance nenhum. Os dois estados são irreparáveis pela UI.
 *
 * O `ON CONFLICT DO NOTHING` do índice parcial de slug NÃO serve aqui: ele
 * devolveria zero linhas e o chamador teria de adivinhar o porquê. A corrida
 * real (duas abas, mesmo nome) volta como violação de unicidade, e é o
 * chamador que a traduz em "esse endereço acabou de ser usado".
 */
export async function criarGrupo(
  s: Sessao | null,
  g: NovoGrupo,
): Promise<{ id: string; slug: string }> {
  const sessao = exigirLogin(s);

  return transacao(async (q) => {
    const criado = await q<{ id: string; slug: string }>(
      `INSERT INTO play_group
         (partner_id, created_by, slug, name, description, weekdays,
          start_time, end_time, timezone, all_courts, visibility, member_count)
       VALUES ($1, $2, $3, $4, $5, $6::smallint[], $7::time, $8::time, $9, $10, $11, 1)
       RETURNING id, slug::text AS slug`,
      [
        g.partnerId,
        sessao.uid,
        g.slug,
        g.name,
        g.description ?? null,
        g.weekdays,
        g.startTime,
        g.endTime,
        g.timezone,
        !g.courtId,
        g.visibility ?? "unlisted",
      ],
    );
    const grupo = criado[0]!;

    if (g.courtId) {
      // O gatilho `play_group_court_mesmo_parceiro` recusa quadra de OUTRA
      // arena aqui dentro — sem RLS, é a barreira que impede um grupo da arena
      // A de filtrar clipes da arena B.
      await q(`INSERT INTO play_group_court (play_group_id, court_id) VALUES ($1, $2)`, [
        grupo.id,
        g.courtId,
      ]);
    }

    await q(
      `INSERT INTO play_group_member
         (play_group_id, user_id, invited_email, role, status, accepted_at)
       SELECT $1, u.id, u.email, 'owner', 'active', now()
         FROM app_user u WHERE u.id = $2`,
      [grupo.id, sessao.uid],
    );

    return grupo;
  });
}

// ───────────────────────────────────────────────── convite e entrada

/**
 * Entra no grupo pelo convite.
 *
 * ─── O GRUPO É ABERTO POR LINK, E ISSO É DECISÃO DO PILOTO ─────────────────
 *
 * `design/README.md` deixou em aberto se o grupo é aberto (qualquer um com o
 * link entra) ou fechado (dono aprova). Para o piloto é ABERTO, porque o grupo
 * não é um cofre: `api/README.md` §3 já diz que ele esconde a página, não os
 * clipes — qualquer pessoa logada que saiba a arena e o horário acha os mesmos
 * vídeos pela busca. Uma fila de aprovação custaria uma tela, um e-mail e uma
 * espera para proteger o que não está protegido.
 *
 * Idempotente de propósito: o link do convite circula num grupo de WhatsApp e é
 * aberto várias vezes pela mesma pessoa. O `ON CONFLICT` pelo par
 * (grupo, e-mail) reativa quem tinha saído e não duplica ninguém.
 *
 * `member_count` é RECONTADO da tabela em vez de somar 1: com o `ON CONFLICT`
 * não dá para saber se a linha era nova sem uma segunda consulta, e um contador
 * que erra para cima é o tipo de defeito que ninguém reporta e todo mundo vê.
 */
export async function entrarNoGrupo(
  s: Sessao | null,
  playGroupId: string,
  convidadoPor?: string | null,
): Promise<"entrou" | "ja-era-membro"> {
  const sessao = exigirLogin(s);

  return transacao(async (q) => {
    const antes = await q<{ status: string }>(
      `SELECT status::text AS status FROM play_group_member
        WHERE play_group_id = $1 AND user_id = $2 LIMIT 1`,
      [playGroupId, sessao.uid],
    );

    await q(
      `INSERT INTO play_group_member
         (play_group_id, user_id, invited_email, invited_by, role, status, accepted_at)
       SELECT $1, u.id, u.email, $3, 'member', 'active', now()
         FROM app_user u WHERE u.id = $2
       ON CONFLICT (play_group_id, invited_email) DO UPDATE
          SET user_id     = EXCLUDED.user_id,
              status      = 'active',
              accepted_at = COALESCE(play_group_member.accepted_at, now()),
              removed_at  = NULL`,
      [playGroupId, sessao.uid, convidadoPor ?? null],
    );

    await q(
      `UPDATE play_group g
          SET member_count = (
                SELECT count(*) FROM play_group_member m
                 WHERE m.play_group_id = g.id AND m.status = 'active'
              )
        WHERE g.id = $1`,
      [playGroupId],
    );

    return antes[0]?.status === "active" ? "ja-era-membro" : "entrou";
  });
}

export type GrupoDoConviteRow = {
  id: string;
  slug: string;
  name: string;
  partner_id: string;
  partner_slug: string;
  partner_display_name: string;
  created_by: string | null;
  share_link_id: string;
};

/**
 * O grupo por trás de um token de convite.
 *
 * ─── O CONVITE É UM `share_link`, NÃO UMA LINHA DE `play_group_member` ─────
 *
 * `play_group_member` tem uma coluna de hash de convite, e a tentação é usá-la.
 * Mas aquela coluna pressupõe um convite POR E-MAIL: a linha existe antes de a
 * pessoa aceitar, e `invited_email` é `NOT NULL` e único por grupo. Um link
 * ABERTO — o que a pelada cola no WhatsApp e cinco pessoas abrem — não tem
 * e-mail nenhum para pôr ali.
 *
 * `share_link` já é exatamente isso: um token opaco que aponta para um alvo
 * (`target_type = 'group'`), com `partner_id` para a métrica do parceiro,
 * `channel_hint`, contador de abertura e revogação. Manter os dois mecanismos
 * daria dois caminhos de aceite, com duas regras de expiração — e o segundo
 * caminho é sempre o que ninguém testa.
 */
export async function grupoPorTokenDeConvite(token: string): Promise<GrupoDoConviteRow | null> {
  const linhas = await query<GrupoDoConviteRow>(
    `SELECT g.id, g.slug::text AS slug, g.name, g.partner_id,
            p.slug::text AS partner_slug, p.display_name AS partner_display_name,
            l.created_by, l.id AS share_link_id
       FROM share_link l
       JOIN play_group g ON g.id = l.target_id
       JOIN partner p    ON p.id = g.partner_id
      WHERE l.token = $1
        AND l.target_type = 'group'
        AND l.revoked_at IS NULL
        AND (l.expires_at IS NULL OR l.expires_at > now())
        AND g.deleted_at IS NULL
        AND p.deleted_at IS NULL`,
    [token],
  );
  return linhas[0] ?? null;
}

// ──────────────────────────────────────────── a lista de "meus grupos"

export type MeuGrupoRow = GrupoRow & {
  /** O acionamento mais recente que caiu dentro de alguma janela do grupo. */
  ultimo_lance_em: Date | null;
};

/**
 * "Meus grupos" com a segunda linha que faz alguém voltar: quando saiu o último
 * lance da pelada.
 *
 * O PRÓXIMO horário não vem daqui — ele é derivado em TS (`lib/ocorrencias.ts`)
 * a partir de `weekdays` e do fuso da arena, porque não toca em `clip` nenhum e
 * um `generate_series` por grupo da lista seria trabalho de banco para produzir
 * uma data.
 *
 * O ÚLTIMO lance, esse precisa ser SQL: ele é um `max` sobre `clip` filtrado
 * pela JANELA do grupo. Sem o filtro de janela seria o último lance da ARENA — e
 * a pelada de segunda mostraria o gol de quinta de outra turma.
 */
export async function meusGruposDetalhado(s: Sessao | null): Promise<MeuGrupoRow[]> {
  if (!s?.uid) return [];
  return query<MeuGrupoRow>(
    `SELECT g.id, g.partner_id, p.slug::text AS partner_slug,
            p.display_name AS partner_display_name,
            g.slug::text AS slug, g.name, g.description,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time,
            g.timezone, g.visibility::text AS visibility, g.all_courts,
            g.cover_object_key, g.member_count,
            ultimo.ultimo_lance_em
       FROM play_group_member m
       JOIN play_group g ON g.id = m.play_group_id
       JOIN partner p    ON p.id = g.partner_id
       LEFT JOIN LATERAL (
         SELECT max(c.triggered_at) AS ultimo_lance_em
           FROM clip c
          WHERE c.partner_id = g.partner_id
            AND c.status IN ('ready','partial')
            AND c.deleted_at IS NULL
            AND c.triggered_at > now() - interval '120 days'
            AND (
              g.all_courts
              OR c.court_id IN (SELECT court_id FROM play_group_court WHERE play_group_id = g.id)
            )
            -- A hora local do acionamento tem de cair na janela do grupo. Sem
            -- isto, "último lance" seria o último lance da ARENA — e a pelada
            -- de segunda mostraria o gol de quinta de outra turma.
            AND (
              CASE WHEN g.end_time <= g.start_time
                   THEN (c.triggered_at AT TIME ZONE g.timezone)::time >= g.start_time
                     OR (c.triggered_at AT TIME ZONE g.timezone)::time <  g.end_time
                   ELSE (c.triggered_at AT TIME ZONE g.timezone)::time >= g.start_time
                    AND (c.triggered_at AT TIME ZONE g.timezone)::time <  g.end_time
              END
            )
            AND extract(isodow FROM (c.triggered_at AT TIME ZONE g.timezone))::smallint
                = ANY (g.weekdays)
       ) ultimo ON true
      WHERE m.user_id = $1 AND m.status = 'active' AND g.deleted_at IS NULL
      ORDER BY g.name`,
    [s.uid],
  );
}

/**
 * Os grupos da arena para a aba "Grupos" da página do parceiro.
 *
 * Diferente de `gruposPublicosDaArena`: inclui os `unlisted` de que ESTE
 * usuário participa. Um grupo criado pelo atleta nasce `unlisted` (o padrão da
 * tabela) e some da aba pública — mas quem está nele precisa reencontrá-lo pela
 * arena, que é por onde ele chegou. `private` continua fora: ele existe para não
 * aparecer em lista nenhuma.
 */
export async function gruposDaArenaParaUsuario(
  s: Sessao | null,
  partnerId: string,
): Promise<GrupoRow[]> {
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
        AND g.deleted_at IS NULL
        AND (
          g.visibility = 'public'
          OR ($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM play_group_member m
                 WHERE m.play_group_id = g.id AND m.user_id = $2 AND m.status = 'active'
              ))
        )
      ORDER BY g.member_count DESC, g.name`,
    [partnerId, s?.uid ?? null],
  );
}

/**
 * O grupo pelo id — para as rotas que já receberam o id e ainda precisam do
 * `partner_id` (a métrica de compartilhamento é sempre por arena).
 *
 * Não recebe sessão porque não decide nada: quem chama já passou (ou ainda vai
 * passar) por `exigirMembroDoGrupo`. Projeta só o que a rota usa.
 */
export async function grupoPorId(playGroupId: string): Promise<{
  id: string;
  name: string;
  slug: string;
  partner_id: string;
  partner_slug: string;
  partner_display_name: string;
} | null> {
  const linhas = await query<{
    id: string;
    name: string;
    slug: string;
    partner_id: string;
    partner_slug: string;
    partner_display_name: string;
  }>(
    `SELECT g.id, g.name, g.slug::text AS slug, g.partner_id,
            p.slug::text AS partner_slug, p.display_name AS partner_display_name
       FROM play_group g
       JOIN partner p ON p.id = g.partner_id
      WHERE g.id = $1 AND g.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [playGroupId],
  );
  return linhas[0] ?? null;
}

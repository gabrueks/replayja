import { query, transacao } from "@/lib/db";
import type { Sessao } from "@/lib/session";
import {
  exigirDonoDoGrupo,
  exigirLogin,
  exigirMembroDoGrupo,
  mascararEmail,
  papelNoGrupo,
} from "./autorizacao";

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
  /**
   * O endereço COMPLETO — e `null` para todo mundo que não é dono do grupo.
   *
   * Nulo, e não mascarado: se este campo carregasse ora o endereço ora a
   * máscara, a tela teria de adivinhar qual dos dois recebeu, e o dia em que
   * errasse ninguém veria — porque `g***@gmail.com` numa tela é indistinguível
   * de um e-mail estranho. `null` é a única forma que quebra ALTO.
   */
  email: string | null;
  /** Sempre presente: `g***@gmail.com`. É o que a tela mostra por padrão. */
  emailMascarado: string;
  /**
   * O nome a exibir, já resolvido: `display_name` quando existe, senão o
   * primeiro nome tirado do e-mail (`gabriel.bolzi@x` → `Gabriel`).
   *
   * Existe para que NENHUMA tela precise escrever `display_name ?? email` — que
   * é exatamente o `??` que despeja o endereço completo na página do grupo no
   * dia em que alguém entra sem nome.
   */
  nome: string;
  role: "owner" | "member";
  status: string;
  accepted_at: Date | null;
};

type MembroBruto = Omit<MembroRow, "email" | "emailMascarado" | "nome"> & { email: string };

/**
 * `gabriel.bolzi@gmail.com` → `Gabriel`. Só o primeiro nome, capitalizado.
 *
 * Corta no primeiro separador (`.`, `_`, `-`, `+`) porque o que vem depois é
 * sobrenome, ano de nascimento ou sufixo de alias — informação que o grupo não
 * precisa e que ninguém escolheu publicar. Um local-part que não tenha nada
 * disso vira ele mesmo: `pelezinho10` → `Pelezinho10`.
 */
export function primeiroNomeDoEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const nome = (local.split(/[._\-+]/)[0] ?? local).trim();
  if (!nome) return "Alguém";
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/**
 * Membros do grupo. O e-mail COMPLETO só sai para o dono.
 *
 * ─── A DECISÃO DO FUNDADOR (13/09), E O QUE ELA CONSERTA ───────────────────
 *
 * Qualquer membro vê NOME (ou o primeiro nome tirado do e-mail) e a máscara;
 * o endereço inteiro é poder de dono de grupo, como convidar e remover.
 *
 * Antes desta leva a regra já existia, e ainda assim vazava por uma porta que
 * ninguém olhou: o campo se chamava `email` nos dois casos, e as telas escreviam
 * `m.display_name ?? m.email`. Para quem NÃO é dono isso mostra a máscara — mas
 * a página do grupo também renderizava `m.email` direto na linha de apoio. Uma
 * lista de pelada é uma base de contatos pronta: 20 endereços de pessoas que se
 * encontram toda segunda, num link que circula em grupo de WhatsApp.
 *
 * Agora o contrato não deixa escolher errado. `email` é `null` para quem não é
 * dono (uma tela que o imprima mostra vazio, não um endereço), `emailMascarado`
 * está sempre lá, e `nome` já vem resolvido para o caso comum.
 *
 * O mascaramento acontece no TS e não no SQL de propósito: é visível na revisão
 * de código e não some num `COALESCE` mal editado.
 */
export async function membrosDoGrupo(
  s: Sessao | null,
  playGroupId: string,
): Promise<MembroRow[]> {
  const papel = await papelNoGrupo(s, playGroupId);
  // Quem não é membro não recebe lista nenhuma — nem mascarada. Saber QUANTAS
  // pessoas e QUEM está na pelada já é informação do grupo.
  if (!papel) return [];
  const linhas = await query<MembroBruto>(
    `SELECT m.id, m.user_id, u.display_name,
            m.invited_email::text AS email,
            m.role::text AS role, m.status::text AS status, m.accepted_at
       FROM play_group_member m
       LEFT JOIN app_user u ON u.id = m.user_id
      WHERE m.play_group_id = $1 AND m.status IN ('invited','active')
      ORDER BY m.role DESC, m.accepted_at NULLS LAST, m.created_at`,
    [playGroupId],
  );
  const souDono = papel === "owner";
  return linhas.map((m) => ({
    ...m,
    email: souDono ? m.email : null,
    emailMascarado: mascararEmail(m.email),
    nome: m.display_name ?? primeiroNomeDoEmail(m.email),
  }));
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
  /** Quem gerou o convite — o "fulano te chamou" da tela de aceite. */
  convidou_nome: string | null;
  convidou_email: string | null;
  expires_at: Date | null;
  weekdays: number[];
  start_time: string;
  end_time: string;
  member_count: number;
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
            l.created_by, l.id AS share_link_id, l.expires_at,
            u.display_name AS convidou_nome, u.email::text AS convidou_email,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time,
            g.member_count
       FROM share_link l
       JOIN play_group g ON g.id = l.target_id
       JOIN partner p    ON p.id = g.partner_id
       LEFT JOIN app_user u ON u.id = l.created_by
      WHERE l.token = $1
        AND l.target_type = 'group'
        AND l.revoked_at IS NULL
        AND (l.expires_at IS NULL OR l.expires_at > now())
        AND g.deleted_at IS NULL
        AND p.deleted_at IS NULL`,
    [token],
  );
  const convite = linhas[0];
  if (!convite) return null;
  // O e-mail de quem convidou sai MASCARADO mesmo aqui. A tela de aceite é
  // aberta por quem tem o token — que circula num grupo de WhatsApp — e o nome
  // basta para reconhecer quem chamou. Devolver o endereço completo faria de
  // todo convite encaminhado um vazamento de contato.
  return {
    ...convite,
    convidou_email: convite.convidou_email ? mascararEmail(convite.convidou_email) : null,
  };
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
            -- Idem: o lance vencido não é "o último lance da pelada".
            AND c.expires_at > now()
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
export type GrupoPorIdRow = {
  id: string;
  name: string;
  slug: string;
  partner_id: string;
  partner_slug: string;
  partner_display_name: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
};

export async function grupoPorId(playGroupId: string): Promise<GrupoPorIdRow | null> {
  const linhas = await query<GrupoPorIdRow>(
    `SELECT g.id, g.name, g.slug::text AS slug, g.partner_id,
            p.slug::text AS partner_slug, p.display_name AS partner_display_name,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time
       FROM play_group g
       JOIN partner p ON p.id = g.partner_id
      WHERE g.id = $1 AND g.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [playGroupId],
  );
  return linhas[0] ?? null;
}

// ───────────────────────────────────────────────────── edição

export type GrupoParaEdicaoRow = GrupoRow & {
  sport: string | null;
  court_id: string | null;
  court_slug: string | null;
  updated_at: Date;
  updated_by_name: string | null;
  updated_by_email: string | null;
};

/**
 * O grupo como o DONO o vê para editar — com a quadra escolhida e o histórico
 * mínimo ("quem mexeu por último").
 *
 * Passa por `exigirDonoDoGrupo` antes de projetar: a tela de edição mostra o
 * e-mail de quem editou, e quem não é dono não vê e-mail completo em lugar
 * nenhum do produto (`modelo-de-dados.md` §7.3).
 */
export async function grupoParaEdicao(
  s: Sessao | null,
  playGroupId: string,
): Promise<GrupoParaEdicaoRow | null> {
  await exigirDonoDoGrupo(s, playGroupId);
  const linhas = await query<GrupoParaEdicaoRow>(
    `SELECT g.id, g.partner_id, p.slug::text AS partner_slug,
            p.display_name AS partner_display_name,
            g.slug::text AS slug, g.name, g.description,
            g.weekdays, g.start_time::text AS start_time, g.end_time::text AS end_time,
            g.timezone, g.visibility::text AS visibility, g.all_courts,
            g.cover_object_key, g.member_count,
            g.sport::text AS sport,
            g.updated_at,
            u.display_name AS updated_by_name,
            u.email::text  AS updated_by_email,
            pgc.court_id,
            ct.slug::text AS court_slug
       FROM play_group g
       JOIN partner p    ON p.id = g.partner_id
       LEFT JOIN app_user u ON u.id = g.updated_by
       LEFT JOIN play_group_court pgc ON pgc.play_group_id = g.id
       LEFT JOIN court ct ON ct.id = pgc.court_id
      WHERE g.id = $1 AND g.deleted_at IS NULL AND p.deleted_at IS NULL
      LIMIT 1`,
    [playGroupId],
  );
  return linhas[0] ?? null;
}

export type EdicaoDeGrupo = {
  name: string;
  /** `null` = "o esporte da quadra". */
  sport: string | null;
  weekdays: number[];
  startTime: string;
  endTime: string;
  /** `null` = todas as quadras da arena. */
  courtId: string | null;
  visibility: "public" | "unlisted" | "private";
  description?: string | null;
};

/**
 * Edita o grupo. SÓ O DONO.
 *
 * ─── O SLUG NÃO ENTRA, E ISSO É O PRODUTO ──────────────────────────────────
 *
 * `EdicaoDeGrupo` não tem campo de endereço, e a ausência é deliberada: o link
 * fixo É o que o grupo vende. Ele está fixado no tópico do WhatsApp da pelada há
 * meses, foi mandado por e-mail, entrou no histórico do navegador de dez
 * pessoas. Renomear "Fut de segunda" para "Fut de terça" muda o NOME — o
 * endereço continua `/<arena>/fut-de-segunda`, e é isso que mantém vivo todo
 * link já compartilhado.
 *
 * O dia em que isso deixar de bastar, a saída é `partner_slug_alias` (que já
 * existe para arena): endereço novo com o antigo redirecionando. Nunca uma troca
 * seca, que quebra links em silêncio.
 *
 * ─── UMA TRANSAÇÃO, PORQUE A QUADRA É PARTE DO GRUPO ───────────────────────
 *
 * Mudar de "Quadra 1" para "todas" é um `UPDATE` em `play_group.all_courts` MAIS
 * um `DELETE` em `play_group_court`. Fora de transação, o estado intermediário
 * (`all_courts = false` sem nenhuma quadra) é um grupo que não acha lance nenhum
 * — e a tela não tem como consertá-lo, porque para ela o grupo já está salvo.
 */
export async function atualizarGrupo(
  s: Sessao | null,
  playGroupId: string,
  e: EdicaoDeGrupo,
): Promise<void> {
  const sessao = exigirLogin(s);
  await exigirDonoDoGrupo(sessao, playGroupId);

  await transacao(async (q) => {
    await q(
      `UPDATE play_group
          SET name        = $2,
              description = $3,
              sport       = $4::court_sport,
              weekdays    = $5::smallint[],
              start_time  = $6::time,
              end_time    = $7::time,
              all_courts  = $8,
              visibility  = $9::group_visibility,
              updated_by  = $10
        WHERE id = $1 AND deleted_at IS NULL`,
      [
        playGroupId,
        e.name,
        e.description ?? null,
        e.sport,
        e.weekdays,
        e.startTime,
        e.endTime,
        !e.courtId,
        e.visibility,
        sessao.uid,
      ],
    );

    // A lista de quadras é REESCRITA, não mesclada: o formulário manda o estado
    // final ("todas" ou uma), e um merge deixaria para trás a quadra de uma
    // edição anterior — o grupo continuaria achando lance de uma quadra que o
    // dono tirou, sem nada na tela dizendo por quê.
    await q(`DELETE FROM play_group_court WHERE play_group_id = $1`, [playGroupId]);
    if (e.courtId) {
      // O gatilho `play_group_court_mesmo_parceiro` recusa quadra de OUTRA
      // arena aqui dentro — a mesma barreira da criação.
      await q(`INSERT INTO play_group_court (play_group_id, court_id) VALUES ($1, $2)`, [
        playGroupId,
        e.courtId,
      ]);
    }
  });
}

// ─────────────────────────────────────────── sair, remover, promover

export type ResultadoDeSaida = {
  /** Quem assumiu o grupo quando o dono saiu — o gatilho do banco decide. */
  novoDono: { nome: string | null; email: string } | null;
  /** O grupo ficou sem ninguém. */
  vazio: boolean;
};

/**
 * Sair do grupo.
 *
 * ─── QUANDO O DONO SAI, O BANCO ESCOLHE O SUCESSOR ─────────────────────────
 *
 * O gatilho `play_group_member_promove_dono` (migração 0005) promove o membro
 * ativo mais antigo assim que não sobra nenhum dono ativo. Ele é
 * `DEFERRABLE INITIALLY DEFERRED`, ou seja, roda no COMMIT — e é por isso que a
 * consulta de "quem assumiu" acontece DEPOIS da transação, e não dentro dela:
 * lá dentro o papel novo ainda não existe.
 *
 * Diferente da arena, que RECUSA a saída do último dono. Aqui o grupo é do
 * atleta, e travar a saída dele para proteger uma pelada seria cobrar um preço
 * pessoal por um problema de dados.
 *
 * O último membro a sair deixa o grupo VAZIO e vivo — não apagado. A página
 * continua respondendo, o link fixado no WhatsApp continua abrindo, e qualquer
 * pessoa com o link volta a entrar. Apagar o grupo quando o último sai
 * destruiria o endereço permanente que é o produto.
 */
export async function sairDoGrupo(
  s: Sessao | null,
  playGroupId: string,
): Promise<ResultadoDeSaida> {
  const sessao = exigirLogin(s);
  await exigirMembroDoGrupo(sessao, playGroupId);

  await transacao(async (q) => {
    await q(
      `UPDATE play_group_member
          SET status = 'removed', removed_at = now()
        WHERE play_group_id = $1 AND user_id = $2 AND status = 'active'`,
      [playGroupId, sessao.uid],
    );
    await recontarMembros(q, playGroupId);
  });

  return await quemAssumiu(playGroupId);
}

/**
 * O dono remove alguém. Nunca a si mesmo — para isso existe `sairDoGrupo`, que
 * é a ação com o nome certo e com a promoção do sucessor.
 *
 * Recebe o id da PARTICIPAÇÃO (`play_group_member.id`) e não o do usuário: é o
 * que a lista da tela já tem em mãos, e é a única chave que serve para um
 * convite ainda não aceito (`user_id` é nulo enquanto ninguém aceitou).
 *
 * O `WHERE play_group_id` na mesma cláusula é o que impede remover um membro de
 * OUTRO grupo com um id adivinhado — sem RLS, é a única barreira.
 */
export async function removerMembroDoGrupo(
  s: Sessao | null,
  playGroupId: string,
  membershipId: string,
): Promise<"removido" | "nao-encontrado" | "voce-mesmo"> {
  const sessao = exigirLogin(s);
  await exigirDonoDoGrupo(sessao, playGroupId);

  const alvo = await query<{ user_id: string | null }>(
    `SELECT user_id FROM play_group_member
      WHERE id = $1 AND play_group_id = $2 AND status IN ('invited','active') LIMIT 1`,
    [membershipId, playGroupId],
  );
  if (!alvo[0]) return "nao-encontrado";
  if (alvo[0].user_id === sessao.uid) return "voce-mesmo";

  await transacao(async (q) => {
    await q(
      `UPDATE play_group_member
          SET status = 'removed', removed_at = now()
        WHERE id = $1 AND play_group_id = $2`,
      [membershipId, playGroupId],
    );
    await recontarMembros(q, playGroupId);
  });
  return "removido";
}

type ConsultaDaTransacao = (sql: string, params?: unknown[]) => Promise<unknown[]>;

/**
 * `member_count` é RECONTADO da tabela, nunca somado ou subtraído.
 *
 * Um contador que deriva por delta erra para sempre no primeiro caminho que
 * alguém esquecer de atualizar — e é o tipo de defeito que ninguém reporta e
 * todo mundo vê ("12 na pelada" com 9 nomes na lista).
 */
async function recontarMembros(q: ConsultaDaTransacao, playGroupId: string): Promise<void> {
  await q(
    `UPDATE play_group g
        SET member_count = (
              SELECT count(*) FROM play_group_member m
               WHERE m.play_group_id = g.id AND m.status = 'active'
            )
      WHERE g.id = $1`,
    [playGroupId],
  );
}

/** Quem é o dono ativo agora — depois de o gatilho de promoção ter rodado. */
async function quemAssumiu(playGroupId: string): Promise<ResultadoDeSaida> {
  const linhas = await query<{ nome: string | null; email: string; ativos: number }>(
    `SELECT u.display_name AS nome, m.invited_email::text AS email,
            (SELECT count(*)::int FROM play_group_member x
              WHERE x.play_group_id = $1 AND x.status = 'active') AS ativos
       FROM play_group_member m
       LEFT JOIN app_user u ON u.id = m.user_id
      WHERE m.play_group_id = $1 AND m.role = 'owner' AND m.status = 'active'
      ORDER BY m.accepted_at NULLS LAST, m.created_at
      LIMIT 1`,
    [playGroupId],
  );
  const dono = linhas[0];
  if (!dono) {
    const restantes = await query<{ ativos: number }>(
      `SELECT count(*)::int AS ativos FROM play_group_member
        WHERE play_group_id = $1 AND status = 'active'`,
      [playGroupId],
    );
    return { novoDono: null, vazio: (restantes[0]?.ativos ?? 0) === 0 };
  }
  return { novoDono: { nome: dono.nome, email: dono.email }, vazio: dono.ativos === 0 };
}

// ──────────────────────────────────────────── o aviso semanal (opt-in)

/**
 * Liga ou desliga o resumo semanal DESTE membro NESTE grupo.
 *
 * A preferência é por participação e não por usuário porque a pergunta real é
 * "quero receber o resumo DESTA pelada?": quem joga em três grupos costuma
 * querer só o de sexta. Um interruptor único por conta transformaria "não quero
 * o da terça" em "não quero nenhum" — e quem não consegue calar só um acaba
 * calando tudo.
 */
export async function definirAvisoSemanal(
  s: Sessao | null,
  playGroupId: string,
  ligado: boolean,
): Promise<void> {
  const sessao = exigirLogin(s);
  await exigirMembroDoGrupo(sessao, playGroupId);
  await query(
    `UPDATE play_group_member SET notify_weekly = $3
      WHERE play_group_id = $1 AND user_id = $2 AND status = 'active'`,
    [playGroupId, sessao.uid, ligado],
  );
}

export type AvisoDoGrupoRow = {
  play_group_id: string;
  name: string;
  slug: string;
  partner_slug: string;
  partner_display_name: string;
  weekdays: number[];
  start_time: string;
  notify_weekly: boolean;
};

/** As preferências de e-mail do atleta — a seção de notificações de `/app/perfil`. */
export async function avisosDoUsuario(s: Sessao | null): Promise<AvisoDoGrupoRow[]> {
  if (!s?.uid) return [];
  return query<AvisoDoGrupoRow>(
    `SELECT g.id AS play_group_id, g.name, g.slug::text AS slug,
            p.slug::text AS partner_slug, p.display_name AS partner_display_name,
            g.weekdays, g.start_time::text AS start_time,
            m.notify_weekly
       FROM play_group_member m
       JOIN play_group g ON g.id = m.play_group_id
       JOIN partner p    ON p.id = g.partner_id
      WHERE m.user_id = $1 AND m.status = 'active' AND g.deleted_at IS NULL
      ORDER BY g.name`,
    [s.uid],
  );
}

/**
 * O descadastro em UM CLIQUE, sem sessão.
 *
 * Quem chama é `/descadastro/[token]`, com um token assinado pelo segredo do app
 * (`lib/descadastro.ts`) — a assinatura é a autenticação, e é por isso que esta
 * é a única função do arquivo que não recebe `Sessao`. Exigir login aqui
 * quebraria o `List-Unsubscribe` do Gmail, que abre a URL sem cookie nenhum, e
 * poria uma tela de login entre a pessoa e um direito (LGPD art. 18).
 *
 * `playGroupId = null` desliga TODOS os grupos da pessoa — é o que o botão do
 * cliente de e-mail significa ("não quero mais isto"), e desligar só o grupo do
 * e-mail faria a terceira mensagem parecer desobediência.
 */
export async function desligarAvisoSemanalPorUsuario(
  userId: string,
  playGroupId: string | null,
): Promise<number> {
  const linhas = await query<{ id: string }>(
    `UPDATE play_group_member SET notify_weekly = false
      WHERE user_id = $1
        AND status = 'active'
        AND notify_weekly
        AND ($2::uuid IS NULL OR play_group_id = $2)
      RETURNING id`,
    [userId, playGroupId],
  );
  return linhas.length;
}

// ───────────────────────────────────── o melhor da rodada

export type MelhorDaRodadaRow = {
  id: string;
  court_name: string;
  court_slug: string;
  triggered_at: Date;
  duration_seconds: string | number | null;
  thumbnail_object_key: string | null;
  view_count: number;
  share_count: number;
};

/**
 * O lance mais compartilhado da rodada — e, no empate, o mais visto.
 *
 * ─── POR QUE COMPARTILHAMENTO VEM ANTES DE VISUALIZAÇÃO ────────────────────
 *
 * Ver é barato: basta abrir a página do grupo e a grade já conta. Compartilhar
 * custa uma decisão ("isto merece ir para o grupo") e é exatamente o
 * comportamento que o produto vende. Ordenar por view primeiro elegeria quase
 * sempre o primeiro card da grade — o mais alto na tela — e a seção viraria um
 * espelho da ordenação, não um destaque.
 *
 * `share_event` conta as ações de INTENÇÃO (`created`) e de ALCANCE (`opened`,
 * `played`): o lance que alguém mandou e três pessoas abriram vale mais que o
 * que foi mandado e ninguém abriu.
 *
 * Exige login pelo mesmo motivo da grade: a seção mostra miniatura e leva ao
 * player (`api/README.md` §3).
 */
export async function melhorDaRodada(
  s: Sessao | null,
  g: { playGroupId: string; partnerId: string; allCourts: boolean; de: Date; ate: Date },
): Promise<MelhorDaRodadaRow | null> {
  exigirLogin(s);
  const linhas = await query<MelhorDaRodadaRow>(
    `SELECT c.id, ct.name AS court_name, ct.slug::text AS court_slug,
            c.triggered_at, c.duration_seconds, c.thumbnail_object_key,
            c.view_count,
            COALESCE(e.compartilhamentos, 0)::int AS share_count
       FROM clip c
       JOIN court ct ON ct.id = c.court_id
       LEFT JOIN LATERAL (
         SELECT count(*) AS compartilhamentos
           FROM share_event se
          WHERE se.clip_id = c.id
            AND se.action IN ('created','opened','played')
       ) e ON true
      WHERE c.partner_id   = $2
        AND c.triggered_at >= $3
        AND c.triggered_at <  $4
        AND c.status = 'ready'
        AND c.deleted_at IS NULL
        -- A retenção é conferida na LEITURA, nunca num job que pode não ter
        -- rodado (tests/retencao.test.ts).
        AND c.expires_at > now()
        AND (
          $5::bool
          OR c.court_id IN (SELECT court_id FROM play_group_court WHERE play_group_id = $1)
        )
      ORDER BY COALESCE(e.compartilhamentos, 0) DESC, c.view_count DESC, c.triggered_at DESC
      LIMIT 1`,
    [g.playGroupId, g.partnerId, g.de, g.ate, g.allCourts],
  );
  const melhor = linhas[0];
  if (!melhor) return null;
  // Um "destaque" com zero compartilhamento e zero view não é destaque: é o
  // primeiro da lista com outro nome. Nesse caso a seção não aparece.
  return melhor.share_count > 0 || melhor.view_count > 0 ? melhor : null;
}

// ──────────────────────────────────── o resumo semanal (o job do cron)

export type RodadaParaResumoRow = {
  play_group_id: string;
  name: string;
  slug: string;
  partner_id: string;
  partner_slug: string;
  partner_display_name: string;
  timezone: string;
  all_courts: boolean;
  start_time: string;
  end_time: string;
  /** A data local da ocorrência que acabou de passar. */
  local_date: string;
  window_start: Date;
  window_end: Date;
  clip_count: number;
};

/**
 * As rodadas que TERMINARAM nas últimas `horas` e ainda não tiveram resumo.
 *
 * ─── A CONSULTA É POR JANELA FECHADA, NÃO POR "ONTEM" ──────────────────────
 *
 * "Ontem" é ambíguo num produto com fuso por arena: o job roda em UTC e às 8h de
 * São Paulo já é outro dia em metade do mundo. A pergunta certa é "que janela de
 * grupo terminou desde a última passada do cron?", e ela se responde com
 * `window_end` — um instante absoluto, que não depende de onde o job acordou.
 *
 * A folga de 30 horas cobre o cron que falhou uma vez sem mandar duas vezes: a
 * segunda barreira é `play_group_digest`, e é ela que garante o resto.
 *
 * Rodada SEM LANCE não entra. Um e-mail dizendo "Rodada de sexta: 0 lances" é
 * pior que silêncio — ele lembra a pessoa de que o produto existe exatamente no
 * dia em que ele não entregou nada.
 */
export async function rodadasParaResumo(horas = 30): Promise<RodadaParaResumoRow[]> {
  return query<RodadaParaResumoRow>(
    `WITH grupos AS (
        SELECT g.id, g.name, g.slug::text AS slug, g.partner_id, g.weekdays,
               g.start_time, g.end_time, g.timezone, g.all_courts, g.active_from,
               p.slug::text AS partner_slug, p.display_name AS partner_display_name
          FROM play_group g
          JOIN partner p ON p.id = g.partner_id
         WHERE g.deleted_at IS NULL AND p.deleted_at IS NULL
           AND EXISTS (
                 SELECT 1 FROM play_group_member m
                  WHERE m.play_group_id = g.id AND m.status = 'active' AND m.notify_weekly
               )
     ),
     -- Três dias de datas locais cobrem qualquer fuso e qualquer janela que
     -- cruze a meia-noite; o filtro de verdade é o window_end, mais abaixo.
     datas AS (
        SELECT g.id AS play_group_id,
               ((now() AT TIME ZONE g.timezone)::date - offset_dias) AS local_date
          FROM grupos g
          CROSS JOIN generate_series(0, 2) AS offset_dias
     ),
     ocorrencias AS (
        SELECT g.id AS play_group_id, g.name, g.slug, g.partner_id, g.partner_slug,
               g.partner_display_name, g.timezone, g.all_courts,
               g.start_time, g.end_time, d.local_date,
               ((d.local_date + g.start_time) AT TIME ZONE g.timezone) AS window_start,
               ((d.local_date
                   + CASE WHEN g.end_time <= g.start_time THEN interval '1 day' ELSE interval '0' END
                   + g.end_time) AT TIME ZONE g.timezone) AS window_end
          FROM grupos g
          JOIN datas d ON d.play_group_id = g.id
         WHERE extract(isodow FROM d.local_date)::smallint = ANY (g.weekdays)
           AND d.local_date >= g.active_from
     )
     SELECT o.play_group_id, o.name, o.slug, o.partner_id, o.partner_slug,
            o.partner_display_name, o.timezone, o.all_courts,
            o.start_time::text AS start_time, o.end_time::text AS end_time,
            o.local_date::text AS local_date,
            o.window_start, o.window_end,
            count(c.id)::int AS clip_count
       FROM ocorrencias o
       LEFT JOIN clip c
         ON c.partner_id   = o.partner_id
        AND c.triggered_at >= o.window_start
        AND c.triggered_at <  o.window_end
        AND c.status IN ('ready','partial')
        AND c.deleted_at IS NULL
        -- A retenção é conferida na LEITURA, nunca num job que pode não ter
        -- rodado (tests/retencao.test.ts).
        AND c.expires_at > now()
        AND (
          o.all_courts
          OR c.court_id IN (SELECT court_id FROM play_group_court WHERE play_group_id = o.play_group_id)
        )
      WHERE o.window_end <= now()
        AND o.window_end >  now() - make_interval(hours => $1::int)
        AND NOT EXISTS (
              SELECT 1 FROM play_group_digest d
               WHERE d.play_group_id = o.play_group_id AND d.local_date = o.local_date
            )
      GROUP BY o.play_group_id, o.name, o.slug, o.partner_id, o.partner_slug,
               o.partner_display_name, o.timezone, o.all_courts,
               o.start_time, o.end_time, o.local_date, o.window_start, o.window_end
     HAVING count(c.id) > 0
      ORDER BY o.window_end`,
    [horas],
  );
}

export type DestinatarioDoResumoRow = {
  user_id: string;
  email: string;
  display_name: string | null;
};

/** Quem pediu para receber o resumo desta pelada. */
export async function destinatariosDoResumo(
  playGroupId: string,
): Promise<DestinatarioDoResumoRow[]> {
  return query<DestinatarioDoResumoRow>(
    `SELECT m.user_id, u.email::text AS email, u.display_name
       FROM play_group_member m
       JOIN app_user u ON u.id = m.user_id
      WHERE m.play_group_id = $1
        AND m.status = 'active'
        AND m.notify_weekly
        AND u.deleted_at IS NULL
      ORDER BY m.accepted_at NULLS LAST, m.created_at`,
    [playGroupId],
  );
}

/**
 * Reserva o envio do resumo desta rodada. `false` = alguém já reservou.
 *
 * ─── ESTA LINHA É A IDEMPOTÊNCIA INTEIRA ───────────────────────────────────
 *
 * O cron da Vercel não promete execução única (reexecuta em falha, e um deploy
 * no meio da janela põe duas instâncias no ar). Quem ganha a chave primária
 * manda o e-mail; quem perde desiste em silêncio. É a mesma disciplina da
 * reivindicação de job do relay: quem decide é o banco.
 *
 * A reserva acontece ANTES do envio, nunca depois. Depois, uma falha do Resend
 * no meio da lista deixaria a rodada sem registro — e a próxima passada do cron
 * mandaria tudo de novo para quem já tinha recebido. Preferimos perder um
 * resumo a mandar dois: o segundo e-mail é o que faz alguém apertar "isto é
 * spam", e o domínio queimado é o mesmo que manda o código de login.
 */
export async function reservarResumo(
  playGroupId: string,
  localDate: string,
  clipCount: number,
  recipients: number,
): Promise<boolean> {
  const linhas = await query<{ play_group_id: string }>(
    `INSERT INTO play_group_digest (play_group_id, local_date, clip_count, recipients)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (play_group_id, local_date) DO NOTHING
     RETURNING play_group_id`,
    [playGroupId, localDate, clipCount, recipients],
  );
  return linhas.length > 0;
}

export type LanceDoResumoRow = {
  id: string;
  triggered_at: Date;
  thumbnail_object_key: string | null;
  court_name: string;
};

/** Os primeiros lances da rodada — as miniaturas que vão no e-mail. */
export async function lancesDoResumo(
  g: { playGroupId: string; partnerId: string; allCourts: boolean; de: Date; ate: Date },
  quantos = 3,
): Promise<LanceDoResumoRow[]> {
  return query<LanceDoResumoRow>(
    `SELECT c.id, c.triggered_at, c.thumbnail_object_key, ct.name AS court_name
       FROM clip c
       JOIN court ct ON ct.id = c.court_id
      WHERE c.partner_id   = $2
        AND c.triggered_at >= $3
        AND c.triggered_at <  $4
        AND c.status IN ('ready','partial')
        AND c.deleted_at IS NULL
        -- A retenção é conferida na LEITURA, nunca num job que pode não ter
        -- rodado (tests/retencao.test.ts).
        AND c.expires_at > now()
        AND (
          $5::bool
          OR c.court_id IN (SELECT court_id FROM play_group_court WHERE play_group_id = $1)
        )
      ORDER BY c.triggered_at
      LIMIT $6`,
    [g.playGroupId, g.partnerId, g.de, g.ate, g.allCourts, quantos],
  );
}

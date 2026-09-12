import { query } from "@/lib/db";
import type { Sessao } from "@/lib/session";
import { exigirLogin } from "./autorizacao";

// `app_user` — o perfil de aplicação. Não há provedor de identidade externo.

export type UsuarioRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  primary_provider: "email_otp" | "google";
  marketing_opt_in: boolean;
  first_partner_id: string | null;
  created_at: Date;
};

/**
 * A VINCULAÇÃO DE CONTAS, e a única regra que precisa estar certa.
 *
 * `ON CONFLICT (email)`: quem entrou por OTP na segunda e por Google na quarta
 * cai na MESMA linha, com os mesmos grupos. Funciona porque os dois caminhos só
 * chegam aqui com o e-mail COMPROVADO — o OTP por construção, o Google só quando
 * `email_verified === true` (que `lib/google-oidc.ts` recusa antes de chamar
 * esta função).
 *
 * Chamar isto com um e-mail NÃO comprovado é tomada de conta alheia. Não existe
 * caminho no app que faça isso, e nenhum deve existir.
 *
 * `first_partner_id` só é gravado na CRIAÇÃO (`COALESCE` no update preserva o
 * valor antigo): é atribuição de aquisição para o parceiro — por qual arena esta
 * pessoa entrou no produto —, e reescrevê-la a cada login apagaria a métrica.
 */
export async function upsertUsuarioPorEmail(
  email: string,
  dados: {
    provider: "email_otp" | "google";
    displayName?: string | null;
    avatarUrl?: string | null;
    firstPartnerId?: string | null;
  },
): Promise<UsuarioRow> {
  const linhas = await query<UsuarioRow>(
    `INSERT INTO app_user (
       email, email_verified_at, display_name, avatar_url,
       primary_provider, first_partner_id, last_login_at
     ) VALUES ($1, now(), $2, $3, $4, $5, now())
     ON CONFLICT (email) DO UPDATE SET
       last_login_at     = now(),
       email_verified_at = COALESCE(app_user.email_verified_at, now()),
       -- O nome e o avatar do Google só preenchem o que está VAZIO: o atleta que
       -- editou o próprio nome não deve vê-lo reescrito no próximo login social.
       display_name      = COALESCE(app_user.display_name, EXCLUDED.display_name),
       avatar_url        = COALESCE(app_user.avatar_url, EXCLUDED.avatar_url),
       first_partner_id  = COALESCE(app_user.first_partner_id, EXCLUDED.first_partner_id),
       deleted_at        = NULL
     RETURNING id, email, display_name, avatar_url, primary_provider,
               marketing_opt_in, first_partner_id, created_at`,
    [
      email.trim().toLowerCase(),
      dados.displayName ?? null,
      dados.avatarUrl ?? null,
      dados.provider,
      dados.firstPartnerId ?? null,
    ],
  );
  const u = linhas[0];
  if (!u) throw new Error("upsert de app_user não devolveu linha");
  return u;
}

/** O perfil do usuário da sessão. `null` quando a linha sumiu (conta excluída). */
export async function usuarioDaSessao(s: Sessao | null): Promise<UsuarioRow | null> {
  if (!s?.uid) return null;
  const linhas = await query<UsuarioRow>(
    `SELECT id, email, display_name, avatar_url, primary_provider,
            marketing_opt_in, first_partner_id, created_at
       FROM app_user
      WHERE id = $1 AND deleted_at IS NULL`,
    [s.uid],
  );
  return linhas[0] ?? null;
}

export async function atualizarPerfil(
  s: Sessao | null,
  dados: { displayName?: string; phone?: string; marketingOptIn?: boolean; timezone?: string },
): Promise<UsuarioRow> {
  const sessao = exigirLogin(s);
  const linhas = await query<UsuarioRow>(
    `UPDATE app_user SET
       display_name     = COALESCE($2, display_name),
       phone            = COALESCE($3, phone),
       marketing_opt_in = COALESCE($4, marketing_opt_in),
       timezone         = COALESCE($5, timezone)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, display_name, avatar_url, primary_provider,
               marketing_opt_in, first_partner_id, created_at`,
    [
      sessao.uid,
      dados.displayName ?? null,
      dados.phone ?? null,
      dados.marketingOptIn ?? null,
      dados.timezone ?? null,
    ],
  );
  const u = linhas[0];
  if (!u) throw new Error("usuário da sessão não existe mais");
  return u;
}

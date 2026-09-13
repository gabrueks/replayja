import { query, transacao } from "@/lib/db";
import { podeRemoverAdmin, type AdminDaArena } from "./painel-regras";

// Quem administra a arena — `partner_admin`.
//
// ─── O CONVITE NÃO É UM LINK, É UMA CAIXA DE E-MAIL ────────────────────────
//
// `partner_admin` tem `invite_token_hash` e `invite_expires_at`, e a leitura
// óbvia é gerar um link de aceite. Não é o que esta task faz, e a razão é que o
// login do produto JÁ é a prova de posse do e-mail: não há senha, entra-se com
// um código de 6 dígitos enviado para o endereço. Um link de convite provaria
// exatamente a mesma coisa — controlar aquela caixa — com uma tela, um e-mail e
// um prazo de expiração a mais, e com um segundo caminho de aceite que ninguém
// testa (é o mesmo argumento da decisão 25 do `README`, sobre o convite de
// grupo).
//
// Então convidar cria a linha de `app_user` (sem `email_verified_at`: ela só é
// verificada quando a pessoa entra de verdade) e o `partner_admin` já ativo. O
// acesso continua condicionado a receber o código naquele endereço.
//
// A consequência a não esquecer: um e-mail DIGITADO ERRADO vira um admin que
// nunca aparece. Por isso a tela lista "aguardando primeiro acesso" em vez de
// mostrar todo mundo igual — é assim que o dono vê o próprio erro de digitação.

export type MembroDaEquipeRow = {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: "owner" | "manager" | "viewer";
  status: string;
  invited_at: Date;
  accepted_at: Date | null;
  last_login_at: Date | null;
};

export async function equipeDaArena(partnerId: string): Promise<MembroDaEquipeRow[]> {
  return query<MembroDaEquipeRow>(
    `SELECT pa.id, pa.user_id, pa.invited_email::text AS email,
            u.display_name, pa.role::text AS role, pa.status::text AS status,
            pa.invited_at, pa.accepted_at, u.last_login_at
       FROM partner_admin pa
       LEFT JOIN app_user u ON u.id = pa.user_id
      WHERE pa.partner_id = $1
        AND pa.status IN ('invited','active')
      ORDER BY
        CASE pa.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
        pa.invited_email`,
    [partnerId],
  );
}

export type ErroDeConvite = "email" | "ja-existe";

/**
 * Convida (ou reativa) um admin.
 *
 * Tudo numa transação: `app_user` e `partner_admin` criados em duas chamadas
 * separadas deixariam, no meio, um usuário sem permissão nenhuma — e, no outro
 * lado da falha, um convite apontando para um usuário que não existe (o que o
 * `CHECK partner_admin_ativo_chk` recusaria, mas só depois de a primeira
 * escrita ter passado).
 *
 * `ON CONFLICT (partner_id, invited_email)` REATIVA quem foi removido antes, em
 * vez de estourar chave duplicada: remover e reconvidar é rotina de arena (o
 * gerente que saiu e voltou), e um erro de chave ali não teria conserto pela UI.
 */
export async function convidarAdmin(
  partnerId: string,
  email: string,
  papel: "owner" | "manager" | "viewer",
  convidadoPor: string | null,
): Promise<{ ok: true; jaTinhaConta: boolean } | { ok: false; motivo: ErroDeConvite }> {
  const normalizado = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizado) || normalizado.length > 160) {
    return { ok: false, motivo: "email" };
  }

  return transacao(async (q) => {
    const existente = await q<{ id: string }>(
      `SELECT id FROM app_user WHERE email = $1 AND deleted_at IS NULL`,
      [normalizado],
    );
    const jaTinhaConta = Boolean(existente[0]);

    // `email_verified_at` fica NULO: quem cria a conta aqui é o dono da arena,
    // não a pessoa. A verificação acontece no primeiro login, e é lá que
    // `upsertUsuarioPorEmail` a preenche.
    const usuario = await q<{ id: string }>(
      `INSERT INTO app_user (email, primary_provider)
       VALUES ($1, 'email_otp')
       ON CONFLICT (email) DO UPDATE SET deleted_at = NULL
       RETURNING id`,
      [normalizado],
    );

    await q(
      `INSERT INTO partner_admin (partner_id, user_id, invited_email, role, status,
                                  invited_by, accepted_at)
       VALUES ($1, $2, $3, $4::partner_role, 'active', $5, now())
       ON CONFLICT (partner_id, invited_email) DO UPDATE SET
         user_id     = EXCLUDED.user_id,
         role        = EXCLUDED.role,
         status      = 'active',
         accepted_at = COALESCE(partner_admin.accepted_at, now())`,
      [partnerId, usuario[0]!.id, normalizado, papel, convidadoPor],
    );

    return { ok: true as const, jaTinhaConta };
  });
}

export type ErroDeSaida = "ultimo-owner" | "nao-encontrado";

/**
 * Remove um admin — `status = 'removed'`, nunca `DELETE`.
 *
 * A regra do último dono é conferida DUAS vezes de propósito: aqui, para dar uma
 * frase em pt-BR antes de tentar, e no gatilho `partner_admin_exige_owner` da
 * migração 0003, que é a garantia de verdade (vale para `psql` e para qualquer
 * rota futura). O gatilho é `DEFERRABLE INITIALLY DEFERRED`, então ele dispara
 * no COMMIT — o que significa que promover alguém e rebaixar o dono antigo na
 * mesma transação é permitido, e só o estado final é julgado.
 */
export async function removerAdmin(
  partnerId: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; motivo: ErroDeSaida }> {
  return transacao(async (q) => {
    const admins = await q<AdminDaArena>(
      `SELECT id, user_id, role::text AS role, status::text AS status
         FROM partner_admin
        WHERE partner_id = $1
        FOR UPDATE`,
      [partnerId],
    );
    const veredito = podeRemoverAdmin(admins, adminId);
    if (!veredito.ok) return { ok: false as const, motivo: veredito.motivo };

    await q(
      `UPDATE partner_admin SET status = 'removed'
        WHERE id = $2 AND partner_id = $1`,
      [partnerId, adminId],
    );
    return { ok: true as const };
  });
}

/**
 * Troca o papel de um admin.
 *
 * Rebaixar o último `owner` cai na MESMA regra de remoção: uma arena com um
 * `manager` e nenhum `owner` não consegue convidar ninguém, e recuperar isso
 * exige acesso ao banco.
 */
export async function alterarPapelDoAdmin(
  partnerId: string,
  adminId: string,
  papel: "owner" | "manager" | "viewer",
): Promise<{ ok: true } | { ok: false; motivo: ErroDeSaida }> {
  return transacao(async (q) => {
    const admins = await q<AdminDaArena>(
      `SELECT id, user_id, role::text AS role, status::text AS status
         FROM partner_admin
        WHERE partner_id = $1
        FOR UPDATE`,
      [partnerId],
    );
    if (papel !== "owner") {
      const veredito = podeRemoverAdmin(admins, adminId);
      if (!veredito.ok) return { ok: false as const, motivo: veredito.motivo };
    } else if (!admins.some((a) => a.id === adminId && a.status === "active")) {
      // `status === "active"` faz parte da pergunta, e não fazia.
      //
      // A lista vem de `SELECT ... FOR UPDATE` sem filtro de status, então ela
      // inclui quem já foi REMOVIDO. Sem esta condição, promover um removido
      // passava na checagem, caía num `UPDATE ... AND status = 'active'` que não
      // acha linha nenhuma, e a tela respondia "Papel atualizado." — uma
      // confirmação para um efeito que não aconteceu. É o pior tipo de bug de
      // permissão: o dono acha que deu acesso e ninguém confere de novo.
      return { ok: false as const, motivo: "nao-encontrado" as const };
    }

    const alterados = await q<{ id: string }>(
      `UPDATE partner_admin SET role = $3::partner_role
        WHERE id = $2 AND partner_id = $1 AND status = 'active'
        RETURNING id`,
      [partnerId, adminId, papel],
    );
    // A confirmação sai do que o banco FEZ, nunca do que a rota quis fazer.
    if (alterados.length === 0) {
      return { ok: false as const, motivo: "nao-encontrado" as const };
    }
    return { ok: true as const };
  });
}

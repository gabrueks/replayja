import { customAlphabet } from "nanoid";
import { query, tryQuery } from "@/lib/db";
import type { Sessao } from "@/lib/session";
import { exigirLogin } from "./autorizacao";

// Link curto e métrica de compartilhamento — `modelo-de-dados.md` §3.20.
//
// ─── COMPARTILHAR É O PRODUTO, E POR ISSO ELE É MEDIDO ─────────────────────
//
// O clipe vai para o WhatsApp e é aí que a arena aparece. `share_event` é o que
// o painel do parceiro mostra como ALCANCE — o argumento de renovação dele — e
// é também a auditoria que torna defensável a decisão de "qualquer logado vê os
// clipes" (`api/README.md` §3): sabemos quem viu o quê.

/**
 * O alfabeto do token: base62 sem os caracteres que o olho confunde.
 *
 * Este token é lido em voz alta ("manda aí o link do grupo") e digitado errado
 * com frequência. Tirar `0/O` e `1/l/I` custa ~4 bits de espaço num token de 12
 * caracteres (ainda ~66 bits) e evita a classe inteira de "o link não abre".
 * O `CHECK` da tabela aceita `[A-Za-z0-9_-]{8,32}`, então este alfabeto é um
 * subconjunto legal.
 */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const novoToken = customAlphabet(ALFABETO, 12);

export type CanalDeCompartilhamento =
  | "whatsapp"
  | "instagram"
  | "instagram_stories"
  | "tiktok"
  | "copy_link"
  | "native_share"
  | "direct"
  | "unknown";

export type AcaoDeCompartilhamento =
  | "created"
  | "opened"
  | "played"
  | "download"
  | "signup_from_link";

export type AlvoDeCompartilhamento = "clip" | "session" | "group" | "partner";

/**
 * Registra um compartilhamento.
 *
 * `tryQuery` e não `query`: esta é uma escrita de MÉTRICA. Quem a chama já
 * mandou o usuário para o WhatsApp, e um erro aqui não pode derrubar a ação —
 * perder um evento de analytics é infinitamente melhor que perder o
 * compartilhamento.
 *
 * O `actor_user_id` é nulo para visitante anônimo, que é o caso de quem ABRE um
 * link antes de entrar.
 */
export async function registrarCompartilhamento(
  s: Sessao | null,
  e: {
    partnerId: string;
    action: AcaoDeCompartilhamento;
    channel: CanalDeCompartilhamento;
    clipId?: string | null;
    shareLinkId?: string | null;
    referrerHost?: string | null;
    userAgentFamily?: string | null;
  },
): Promise<void> {
  await tryQuery(
    `INSERT INTO share_event
       (share_link_id, clip_id, partner_id, actor_user_id, action, channel,
        referrer_host, user_agent_family)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.shareLinkId ?? null,
      e.clipId ?? null,
      e.partnerId,
      s?.uid ?? null,
      e.action,
      e.channel,
      e.referrerHost ?? null,
      e.userAgentFamily ?? null,
    ],
  );
}

export type LinkCriado = { id: string; token: string };

/**
 * O link de CONVITE de um grupo: um `share_link` com `target_type = 'group'`.
 *
 * Exige login — o token é criado em nome de alguém, e `created_by` é o que faz
 * "quem convidou" existir na linha de membro que nasce do aceite.
 *
 * ─── UM LINK POR PESSOA POR GRUPO, REUTILIZADO ─────────────────────────────
 *
 * Um token novo a cada toque em "Convidar" encheria `share_link` de linhas
 * mortas e, pior, tornaria impossível revogar o convite que vazou: seriam
 * dezenas. O `SELECT` antes do `INSERT` devolve o link vivo que esta pessoa já
 * criou para este grupo. A corrida (dois toques simultâneos) produziria dois
 * tokens válidos, o que é inofensivo — os dois apontam para o mesmo grupo.
 */
export async function linkDeConviteDoGrupo(
  s: Sessao | null,
  g: { playGroupId: string; partnerId: string; canal?: CanalDeCompartilhamento },
): Promise<LinkCriado> {
  const sessao = exigirLogin(s);

  const existente = await query<LinkCriado>(
    `SELECT id, token FROM share_link
      WHERE target_type = 'group'
        AND target_id = $1
        AND created_by = $2
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC
      LIMIT 1`,
    [g.playGroupId, sessao.uid],
  );
  if (existente[0]) return existente[0];

  const criado = await query<LinkCriado>(
    `INSERT INTO share_link (token, target_type, target_id, partner_id, created_by, channel_hint)
     VALUES ($1, 'group', $2, $3, $4, $5)
     RETURNING id, token`,
    [novoToken(), g.playGroupId, g.partnerId, sessao.uid, g.canal ?? null],
  );
  return criado[0]!;
}

/** Conta a abertura de um link de convite. Não-crítica, como todo o resto. */
export async function contarAberturaDoLink(shareLinkId: string): Promise<void> {
  await tryQuery(`UPDATE share_link SET view_count = view_count + 1 WHERE id = $1`, [
    shareLinkId,
  ]);
}

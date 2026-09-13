// QUEM VIRA DONO DA ARENA DO PILOTO — a decisão, isolada do script que a usa.
//
// ─── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ────────────────────────
//
// `scripts/seed-piloto.ts` resolvia a lista de admins assim:
//
//     const emails = (args.emails ?? utilizavel(process.env.OTP_BYPASS_EMAILS) ?? "")
//
// Ou seja: na ausência de `--emails`, QUEM ESTIVESSE EM `OTP_BYPASS_EMAILS`
// virava `owner` da Arena Vasco. E `OTP_BYPASS_EMAILS` não é uma lista de
// operação — é a lista de LOGIN SEM E-MAIL (`lib/otp.ts`), a porta estreita que
// existe porque o domínio do Resend demorou a ser verificado. As duas listas
// têm propósitos opostos:
//
//   OTP_BYPASS_EMAILS  "esta conta consegue ENTRAR com o código fixo"
//   admins da arena    "esta conta MANDA na operação de uma arena real"
//
// Acoplá-las significa que acrescentar o Gmail do fundador para ele conseguir
// testar o login em produção o promove, no mesmo gesto e sem nenhum aviso, a
// dono da Arena Vasco — com acesso a câmera, chave RTMP, token de botão,
// remoção de vídeo e à equipe. É exatamente a suspeita que abriu esta auditoria.
//
// (No banco de produção de hoje isso NÃO aconteceu: os donos são `teste1@` e
// `teste2@replayja.com.br`, e `bolzi.gabriel@gmail.com` existe como usuário
// comum, sem linha em `partner_admin`. O que havia era o mecanismo, armado.)
//
// A regra agora: a lista de operação é EXPLÍCITA — `--emails=` ou
// `PILOT_ADMIN_EMAILS`. `OTP_BYPASS_EMAILS` nunca é lida como fonte. Quando as
// duas se sobrepõem (o que é legítimo no piloto), o script AVISA, porque uma
// conta que entra sem e-mail e manda na arena merece ser dita em voz alta.

/** As fontes possíveis, na ordem em que valem. */
export type FonteDeAdmins = {
  /** `--emails=a@x.com,b@x.com` da linha de comando. Vence tudo. */
  argumento?: string | null;
  /** `PILOT_ADMIN_EMAILS` — a variável que existe para ISTO. */
  env?: string | null;
};

export type ResultadoDeAdmins =
  | { ok: true; emails: string[] }
  | { ok: false; motivo: "sem-fonte" | "nenhum-valido" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Um valor que o `vercel env pull` não conseguiu ler não pode virar linha. */
function utilizavel(v: string | null | undefined): string | null {
  const t = v?.trim();
  if (!t || t.startsWith("[SENSITIVE")) return null;
  return t;
}

/** `"A@x.com, b@X.com ,, a@x.com"` → `["a@x.com", "b@x.com"]`. */
export function normalizarLista(bruto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const parte of (utilizavel(bruto) ?? "").split(",")) {
    const e = parte.trim().toLowerCase();
    if (e && EMAIL_RE.test(e)) vistos.add(e);
  }
  return [...vistos];
}

/**
 * Os e-mails que viram `owner` da arena do piloto.
 *
 * NÃO recebe `OTP_BYPASS_EMAILS`, e isso é o ponto: a assinatura não tem por
 * onde aceitar a lista errada. Sem fonte explícita, o resultado é uma RECUSA —
 * nunca um palpite. Um seed que adivinha quem manda numa arena real é pior que
 * um seed que para e pergunta.
 */
export function emailsDeOperacao(f: FonteDeAdmins): ResultadoDeAdmins {
  const bruto = utilizavel(f.argumento) ?? utilizavel(f.env);
  if (!bruto) return { ok: false, motivo: "sem-fonte" };
  const emails = normalizarLista(bruto);
  if (emails.length === 0) return { ok: false, motivo: "nenhum-valido" };
  return { ok: true, emails };
}

/**
 * As contas que são admin da arena E entram pela porta do bypass de login.
 *
 * Não é erro — no piloto é o caso normal, porque o operador precisa entrar e o
 * domínio de e-mail ainda estava sendo verificado. É um AVISO: quem lê o resumo
 * do seed precisa saber que aquelas contas têm as duas coisas ao mesmo tempo, e
 * que apagar `OTP_BYPASS_EMAILS` da Vercel não remove admin nenhum (nem deve).
 */
export function adminsComBypass(admins: readonly string[], bypass: string | null | undefined) {
  const lista = new Set(normalizarLista(bypass));
  return admins.filter((e) => lista.has(e));
}

export const MENSAGEM_SEM_FONTE =
  "Sem e-mails de operação. Passe --emails=a@x.com,b@x.com ou defina PILOT_ADMIN_EMAILS. " +
  "São as contas que VIRAM DONAS da arena — câmera, chave RTMP, token de botão, remoção de " +
  "vídeo e equipe. OTP_BYPASS_EMAILS NÃO serve: aquela lista diz quem consegue ENTRAR com o " +
  "código fixo, não quem manda na operação, e usá-la aqui promove a admin toda conta que " +
  "alguém acrescentar para testar login.";

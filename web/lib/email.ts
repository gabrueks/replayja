// Envio de e-mail transacional via Resend.
//
// ADR §4.4: mesma CONTA do Sentinela, domínio NOVO (`replayja.com.br`, envelope
// em `mail.replayja.com.br`, com SPF/DKIM/DMARC próprios). Um OTP do "Replay já"
// chegando de `@sentinelacam.com` parece phishing, e o atleta que não reconhece
// o remetente não confirma o código — o que mata exatamente a métrica que o
// produto precisa proteger.
//
// O teto do plano gratuito é COMPARTILHADO e é por dia: 100 e-mails/dia somando
// os dois produtos. O piloto sozinho deve ficar em 60–80/dia. Monitorar.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Remetente padrão do login. Sobrescrito por `EMAIL_FROM`. */
const FROM_PADRAO = "Replay já <login@replayja.com.br>";

export type EmailMontado = { subject: string; text: string; html: string };

export async function sendEmail(
  to: string,
  { subject, text, html }: EmailMontado,
  headers?: Record<string, string>,
): Promise<void> {
  const recipients = to
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (recipients.length === 0) return;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Sem provedor configurado: útil em dev, inutilizável em produção. A rota
    // que chama decide se isso é erro (ver `api/auth/otp/start`).
    console.log(`[email] Para ${to} — "${subject}" (RESEND_API_KEY ausente — NÃO enviado)`);
    return;
  }

  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? FROM_PADRAO,
      to: recipients,
      subject,
      text,
      html,
      // O domínio de envio não recebe e-mail: sem isto, resposta do usuário cai
      // no vazio.
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao enviar e-mail: ${res.status} ${await res.text()}`);
  }
}

/** True quando o e-mail transacional está realmente configurado. */
export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

// ─────────────────────────────────────────────── templates (pt-BR)

/**
 * O e-mail do código de login.
 *
 * Regras de copy: o código aparece no ASSUNTO (o atleta lê na notificação do
 * celular sem abrir o app de e-mail — é o caminho mais curto entre o dedo e o
 * campo), o HTML é uma tabela simples com estilo inline (cliente de e-mail não
 * entende CSS moderno) e o texto puro é o fallback obrigatório.
 */
export function emailCodigo(code: string): EmailMontado {
  const subject = `${code} é o seu código do Replay já`;
  const text = [
    `Seu código de acesso: ${code}`,
    "",
    "Ele vale por 10 minutos e só pode ser usado uma vez.",
    "Se você não pediu este código, ignore este e-mail — ninguém entra sem ele.",
    "",
    "Replay já — replayja.com.br",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0B0C0E;font-family:Helvetica Neue,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0C0E;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#15171A;border:1px solid #2A2E34;border-radius:18px;padding:32px;">
        <tr><td style="color:#FF6B1F;font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;padding-bottom:12px;">Replay já</td></tr>
        <tr><td style="color:#F2F4F6;font-size:22px;font-weight:700;padding-bottom:8px;">Seu código de acesso</td></tr>
        <tr><td style="color:#9AA1AA;font-size:15px;line-height:1.5;padding-bottom:24px;">Digite o código abaixo para entrar e ver os seus lances.</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="background:#1D2025;border:1px solid #2A2E34;border-radius:14px;padding:18px 24px;color:#F2F4F6;font-size:34px;font-weight:700;letter-spacing:.22em;">${code}</div>
        </td></tr>
        <tr><td style="color:#6E757E;font-size:13px;line-height:1.6;">O código vale por 10 minutos e só pode ser usado uma vez.<br>Se você não pediu, pode ignorar este e-mail — ninguém entra sem ele.</td></tr>
      </table>
      <div style="color:#6E757E;font-size:12px;padding-top:16px;">replayja.com.br</div>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

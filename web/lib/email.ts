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
    "Se você não pediu este código, pode ignorar este e-mail — ninguém entra sem ele.",
    "",
    "Replay já — replayja.com.br",
  ].join("\n");

  /*
   * ─── O TERCEIRO (E ÚLTIMO) LUGAR COM HEX LITERAL ─────────────────────────
   *
   * `globals.css` é o único lugar do produto com cor escrita à mão — menos aqui,
   * em `components/og.tsx` (Satori) e neste e-mail. Cliente de e-mail não tem
   * CSSOM: `var(--cor-acao)` não resolve, `<style>` é removido por metade deles
   * e o Gmail ignora tudo o que não for estilo inline numa tabela. Os valores
   * abaixo são os tokens da v2 copiados à mão, e mudam JUNTO com eles.
   *
   * ─── E ELE FICA CLARO, COMO O APP ────────────────────────────────────────
   *
   * A v1 mandava um cartão preto. Num cliente de e-mail claro — que é o padrão
   * de quase todo mundo — ele chegava como um bloco escuro no meio da caixa de
   * entrada, que é a aparência de spam promocional. O cartão claro sobre o
   * neutro quente é o mesmo objeto que a pessoa vai ver na tela seguinte.
   *
   * O CÓDIGO É A MAIOR COISA DO E-MAIL, com `letter-spacing` largo: metade das
   * pessoas lê o código na prévia da notificação e nunca abre a mensagem.
   */
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F6F3EF;font-family:Helvetica Neue,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#FFFFFF;border-radius:18px;padding:32px;">
        <tr><td style="color:#D93C06;font-size:12px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;padding-bottom:14px;">Replay já</td></tr>
        <tr><td style="color:#16130F;font-size:24px;font-weight:700;padding-bottom:8px;">Chegou.</td></tr>
        <tr><td style="color:#6B6259;font-size:15px;line-height:1.5;padding-bottom:24px;">Digita o código abaixo pra entrar e ver os seus lances.</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="background:#F0EBE4;border-radius:16px;padding:18px 24px;color:#16130F;font-size:34px;font-weight:700;letter-spacing:.22em;">${code}</div>
        </td></tr>
        <tr><td style="color:#786F66;font-size:13px;line-height:1.6;">O código vale por 10 minutos e só pode ser usado uma vez.<br>Se você não pediu, pode ignorar este e-mail — ninguém entra sem ele.</td></tr>
      </table>
      <div style="color:#786F66;font-size:12px;padding-top:16px;">replayja.com.br</div>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

// ───────────────────────────────── o convite e o resumo (voz da v2)
//
// Os dois e-mails abaixo seguem a mesma regra do código de login: cartão CLARO
// sobre o neutro quente, tokens da v2 copiados à mão (cliente de e-mail não tem
// CSSOM), tabela com estilo inline, e texto puro obrigatório.
//
// A voz é a da folha do `design/v2`: primeira pessoa ("a gente guarda"), título
// que é SITUAÇÃO e não funcionalidade ("Bora?" em vez de "Convite de grupo"), e
// a mesma frase para a mesma ação em toda tela ("Entrar pra ver meus lances").
// Sem emoji — a mesma decisão do produto, e num e-mail ela vale dobrado: emoji
// no assunto é um dos sinais que os filtros de spam pesam.

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** O cartão claro compartilhado pelos e-mails do produto. */
function moldura(interno: string, rodape: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F6F3EF;font-family:Helvetica Neue,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#FFFFFF;border-radius:18px;padding:32px;">
        <tr><td style="color:#D93C06;font-size:12px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;padding-bottom:14px;">Replay já</td></tr>
        ${interno}
      </table>
      <div style="color:#786F66;font-size:12px;line-height:1.6;padding-top:16px;max-width:440px;">${rodape}</div>
    </td></tr>
  </table>
</body></html>`;
}

/** O botão do e-mail. Tabela e não `<a>` com padding: o Outlook come o padding. */
function botao(url: string, rotulo: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
  <td align="center" style="background:#D93C06;border-radius:16px;">
    <a href="${escaparHtml(url)}" style="display:inline-block;padding:15px 26px;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;">${escaparHtml(rotulo)}</a>
  </td></tr></table>`;
}

export type ConviteDeGrupo = {
  grupo: string;
  arena: string;
  /** Nome de quem convidou, quando conhecido. */
  convidadoPor?: string | null;
  /** "Toda sexta, das 20h às 21h" — a recorrência por extenso. */
  quando?: string | null;
  url: string;
  validadeDias?: number;
};

/**
 * O convite para entrar no grupo.
 *
 * ─── O QUE ELE PRECISA DIZER ANTES DO BOTÃO ────────────────────────────────
 *
 * Quem convida é uma pessoa; quem recebe pode nunca ter ouvido falar do Replay
 * já. Então o e-mail responde as três perguntas na ordem em que elas aparecem na
 * cabeça de quem abre: QUEM me chamou, PRA ONDE, e o QUE eu ganho. Só depois
 * vem o botão.
 *
 * E ele diz que o convite EXPIRA. Não por formalidade: um link sem prazo é um
 * link que fica para depois, e "depois" é onde convite morre.
 *
 * LGPD (D6 de `docs/legal/analise-lgpd.md`): este é um e-mail de TERCEIRO,
 * digitado por outra pessoa, e a base legal é legítimo interesse com mitigação
 * obrigatória — UM e-mail só, sem reenvio automático. É por isso que o reenvio
 * existe apenas como ação manual de quem convida, e nunca como job.
 */
export function emailConviteDeGrupo(c: ConviteDeGrupo): EmailMontado {
  const quem = c.convidadoPor?.trim() || null;
  const subject = quem ? `${quem} te chamou pro ${c.grupo}` : `Te chamaram pro ${c.grupo}`;
  const dias = c.validadeDias ?? 14;

  const text = [
    quem ? `${quem} te chamou pro ${c.grupo}, na ${c.arena}.` : `Te chamaram pro ${c.grupo}, na ${c.arena}.`,
    ...(c.quando ? ["", c.quando] : []),
    "",
    "A câmera da quadra já tá lá. Quando alguém aperta o botão, a gente guarda os últimos 22 segundos — e os lances ficam nesse link, separados por rodada.",
    "",
    c.url,
    "",
    `O convite vale por ${dias} dias. É só entrar com o seu e-mail — não tem senha.`,
    "",
    "Replay já — replayja.com.br",
  ].join("\n");

  const html = moldura(
    `<tr><td style="color:#16130F;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.05;padding-bottom:10px;">Bora?</td></tr>
        <tr><td style="color:#16130F;font-size:16px;line-height:1.5;padding-bottom:6px;">${
          quem
            ? `<strong>${escaparHtml(quem)}</strong> te chamou pro <strong>${escaparHtml(c.grupo)}</strong>, na ${escaparHtml(c.arena)}.`
            : `Te chamaram pro <strong>${escaparHtml(c.grupo)}</strong>, na ${escaparHtml(c.arena)}.`
        }</td></tr>
        ${
          c.quando
            ? `<tr><td style="color:#6B6259;font-size:15px;line-height:1.5;padding-bottom:18px;">${escaparHtml(c.quando)}</td></tr>`
            : `<tr><td style="padding-bottom:12px;"></td></tr>`
        }
        <tr><td style="color:#6B6259;font-size:15px;line-height:1.55;padding-bottom:24px;">A câmera da quadra já tá lá. Quando alguém aperta o botão, a gente guarda os últimos 22 segundos — e os lances da pelada ficam nesse link, separados por rodada.</td></tr>
        <tr><td style="padding-bottom:20px;">${botao(c.url, "Entrar no grupo")}</td></tr>
        <tr><td style="color:#786F66;font-size:13px;line-height:1.6;">O convite vale por ${dias} dias. É só entrar com o seu e-mail — sem senha, sem cadastro.</td></tr>`,
    `Você recebeu isto porque alguém do ${escaparHtml(c.grupo)} digitou o seu e-mail. Se não era pra você, é só ignorar — a gente não guarda endereço de quem não entrou.`,
  );

  return { subject, text, html };
}

export type LanceDoResumo = {
  /** "20:47" — a hora da arena. */
  horario: string;
  href: string;
  thumbnailUrl: string | null;
};

export type ResumoDaRodada = {
  grupo: string;
  arena: string;
  /** "sexta" — o dia da semana da rodada, em minúsculas. */
  dia: string;
  /** "12 set" — a data curta. */
  data: string;
  lances: number;
  /** No máximo três — é o que cabe numa linha de 440px. */
  thumbs: LanceDoResumo[];
  /** A página da rodada. */
  url: string;
  urlDeDescadastro: string;
};

/**
 * "Rodada de sexta: 7 lances" — o e-mail que faz a pelada voltar.
 *
 * ─── O ASSUNTO É O PRODUTO INTEIRO ─────────────────────────────────────────
 *
 * Metade das pessoas nunca abre este e-mail: elas leem o assunto na notificação,
 * lembram que jogaram e abrem o app. Por isso o assunto carrega os dois dados
 * que importam (QUAL rodada e QUANTOS lances) e nada mais — nem o nome do
 * produto, nem o do grupo, que roubariam o espaço que o celular corta.
 *
 * ─── E ELE NUNCA SAI COM ZERO LANCE ────────────────────────────────────────
 *
 * Quem monta a lista (`rodadasParaResumo`) filtra rodada vazia. Um e-mail
 * dizendo "0 lances" lembraria a pessoa de que o produto existe exatamente no
 * dia em que ele não entregou nada — e é assim que se ensina alguém a ignorar um
 * remetente.
 *
 * As miniaturas são as PÚBLICAS (as mesmas do CDN sem login): cliente de e-mail
 * não manda cookie, e uma URL assinada de 15 minutos chegaria quebrada para quem
 * abre o e-mail no dia seguinte.
 */
export function emailResumoDaRodada(r: ResumoDaRodada): EmailMontado {
  const subject = `Rodada de ${r.dia}: ${r.lances} ${r.lances === 1 ? "lance" : "lances"}`;

  const text = [
    `A rodada de ${r.dia}, ${r.data}, rendeu ${r.lances} ${r.lances === 1 ? "lance" : "lances"} no ${r.grupo}.`,
    "",
    "Os vídeos já estão organizados por rodada aqui:",
    r.url,
    "",
    `${r.arena} — Replay já`,
    "",
    `Não quer mais receber o resumo? ${r.urlDeDescadastro}`,
  ].join("\n");

  const celulas = r.thumbs
    .slice(0, 3)
    .map(
      (t) => `<td width="33%" style="padding:0 4px;">
            <a href="${escaparHtml(t.href)}" style="text-decoration:none;">
              ${
                t.thumbnailUrl
                  ? `<img src="${escaparHtml(t.thumbnailUrl)}" width="130" alt="Lance das ${escaparHtml(t.horario)}" style="display:block;width:100%;max-width:130px;height:auto;border-radius:14px;border:0;">`
                  : `<div style="width:100%;height:78px;border-radius:14px;background:#0E4224;"></div>`
              }
              <div style="color:#16130F;font-size:14px;font-weight:700;padding-top:6px;">${escaparHtml(t.horario)}</div>
            </a>
          </td>`,
    )
    .join("\n");

  const html = moldura(
    `<tr><td style="color:#16130F;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.05;padding-bottom:10px;">Saiu.</td></tr>
        <tr><td style="color:#16130F;font-size:16px;line-height:1.5;padding-bottom:4px;">A rodada de ${escaparHtml(r.dia)}, ${escaparHtml(r.data)}, rendeu <strong>${r.lances} ${r.lances === 1 ? "lance" : "lances"}</strong> no ${escaparHtml(r.grupo)}.</td></tr>
        <tr><td style="color:#6B6259;font-size:15px;line-height:1.5;padding-bottom:20px;">${escaparHtml(r.arena)}</td></tr>
        ${
          celulas
            ? `<tr><td style="padding-bottom:22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${celulas}
          </tr></table>
        </td></tr>`
            : ""
        }
        <tr><td style="padding-bottom:18px;">${botao(r.url, "Ver a rodada")}</td></tr>
        <tr><td style="color:#786F66;font-size:13px;line-height:1.6;">Os vídeos ficam organizados por rodada no link fixo do grupo — toda semana, sozinhos.</td></tr>`,
    `Você recebe este resumo porque é membro do ${escaparHtml(r.grupo)}. <a href="${escaparHtml(r.urlDeDescadastro)}" style="color:#6B6259;">Não quero mais receber</a> — sai na hora, sem login.`,
  );

  return { subject, text, html };
}

/**
 * Os cabeçalhos que fazem o botão "Cancelar inscrição" aparecer no Gmail e no
 * Outlook — e que evitam que a pessoa use o botão de SPAM no lugar dele.
 *
 * `List-Unsubscribe-Post` é o que habilita o descadastro de um clique de
 * verdade (RFC 8058): o cliente de e-mail faz um `POST` na URL e mostra
 * "inscrição cancelada" sem sair da caixa de entrada. Sem ele, o Gmail abre a
 * URL numa aba — que também funciona, porque a rota trata `GET`.
 */
export function cabecalhosDeDescadastro(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

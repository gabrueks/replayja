import { safeEqualB64, signWithAppSecret } from "./app-secret";

// O TOKEN DE DESCADASTRO — a saída em um clique do resumo semanal.
//
// ─── POR QUE UM TOKEN ASSINADO E NÃO UMA TABELA ────────────────────────────
//
// Uma tabela de tokens de descadastro precisaria de uma linha por destinatário
// por e-mail enviado, de um job de poda e de uma decisão sobre o que fazer
// quando a linha some — e o que ela protegeria já está protegido pela
// assinatura. O payload é minúsculo (dois uuid) e o segredo do app é o mesmo que
// assina o cookie de sessão: quem consegue forjar isto já consegue forjar
// sessão, e então este é o menor dos problemas.
//
// ─── E POR QUE ELE NÃO EXPIRA ──────────────────────────────────────────────
//
// Todo o resto do produto tem validade (cookie, código de login, convite). Este
// não pode ter: o Gmail guarda o cabeçalho `List-Unsubscribe` junto da mensagem
// e a pessoa pode apertar "Cancelar inscrição" num e-mail de oito meses atrás.
// Um token expirado ali vira uma tela de erro no lugar de um direito — e a
// reação a isso não é pedir um link novo, é marcar como spam.
//
// O que o token PODE fazer é estritamente uma coisa: pôr `notify_weekly = false`.
// Ele não autentica, não abre sessão, não lê nada. O pior caso de um token
// vazado é alguém desligar um e-mail que o dono do endereço pode religar em
// `/app/perfil`.
//
// ─── O FORMATO ─────────────────────────────────────────────────────────────
//
//   <base64url(json)>.<hmac base64url>
//
// O JSON tem chaves de uma letra porque este token vai numa URL que entra num
// cabeçalho de e-mail, e cabeçalho longo é cabeçalho que algum servidor quebra.

export type AlvoDoDescadastro = {
  /** `app_user.id` de quem está saindo da lista. */
  userId: string;
  /** `play_group.id`, ou `null` para "todos os grupos desta pessoa". */
  playGroupId: string | null;
};

type Carga = { u: string; g?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O token que vai no link do rodapé e no `List-Unsubscribe`. */
export function assinarDescadastro(alvo: AlvoDoDescadastro): string {
  const carga: Carga = alvo.playGroupId
    ? { u: alvo.userId, g: alvo.playGroupId }
    : { u: alvo.userId };
  const corpo = Buffer.from(JSON.stringify(carga), "utf8").toString("base64url");
  return `${corpo}.${signWithAppSecret(corpo)}`;
}

/**
 * Confere a assinatura e devolve o alvo. `null` para qualquer coisa estranha.
 *
 * Nunca lança: este código roda numa rota que o cliente de e-mail abre sozinho,
 * e uma exceção aqui viraria 500 numa URL que o Gmail mostra ao usuário como
 * "cancelar inscrição não funcionou".
 */
export function lerDescadastro(token: string): AlvoDoDescadastro | null {
  const ponto = token.lastIndexOf(".");
  if (ponto <= 0) return null;

  const corpo = token.slice(0, ponto);
  const assinatura = token.slice(ponto + 1);
  if (!safeEqualB64(assinatura, signWithAppSecret(corpo))) return null;

  try {
    const bruto: unknown = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (!bruto || typeof bruto !== "object") return null;
    const carga = bruto as Carga;
    if (typeof carga.u !== "string" || !UUID.test(carga.u)) return null;
    if (carga.g !== undefined && (typeof carga.g !== "string" || !UUID.test(carga.g))) {
      return null;
    }
    return { userId: carga.u, playGroupId: carga.g ?? null };
  } catch {
    return null;
  }
}

/**
 * A URL do rodapé do e-mail — a que uma PESSOA clica.
 *
 * Ela abre uma página que diz o que vai acontecer e confirma. É o caminho com
 * explicação.
 */
export function urlDeDescadastro(base: string, alvo: AlvoDoDescadastro): string {
  return `${base}/descadastro/${assinarDescadastro(alvo)}`;
}

/**
 * A URL do `List-Unsubscribe` — a que o CLIENTE DE E-MAIL chama.
 *
 * ─── POR QUE DUAS URLS E NÃO UMA ───────────────────────────────────────────
 *
 * O RFC 8058 (o "um clique" de verdade) manda o cliente de e-mail fazer um
 * `POST` na URL do cabeçalho, e mostrar "inscrição cancelada" sem sair da caixa
 * de entrada. Uma rota do App Router é ou `page.tsx` ou `route.ts` — nunca as
 * duas no mesmo caminho — então o `POST` mora sob `/api/`, onde o middleware não
 * redireciona nada, e a página com explicação mora em `/descadastro/`.
 *
 * A rota de API também responde `GET`, porque os clientes de e-mail que não
 * implementam o RFC 8058 simplesmente ABREM a URL do cabeçalho: ali ela
 * descadastra e manda a pessoa para a página, que confirma o que aconteceu.
 */
export function urlDeDescadastroUmClique(base: string, alvo: AlvoDoDescadastro): string {
  return `${base}/api/descadastro/${assinarDescadastro(alvo)}`;
}

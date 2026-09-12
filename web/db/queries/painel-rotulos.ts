import { relogioDe } from "@/lib/fuso";

// As regras PURAS do painel — sem banco, sem React e sem `node:*`.
//
// ─── POR QUE ESTE ARQUIVO É SEPARADO DE `painel-regras.ts` ─────────────────
//
// As telas do painel são componentes de cliente, e um `import` de valor arrasta
// o módulo inteiro para o bundle do navegador. Quando as constantes de rótulo
// (esportes, dias da semana, posições da marca) moravam junto das funções que
// usam `node:crypto`, o build quebrava com "Can't resolve 'net'" — o webpack
// seguia a cadeia até o `pg`.
//
// A fronteira é simples e vale a pena manter: aqui entra o que roda nos DOIS
// lados; em `painel-regras.ts`, o que só roda no servidor.
//
// Não há SQL neste módulo. Ele está em `db/queries/` por ser a camada onde a
// regra de dados mora, e para que os `painel-*.ts` importem de um lugar só.

// ───────────────────────────────────────────── dias da semana

/** ISO 8601: 1 = segunda … 7 = domingo. O mesmo de `play_group.weekdays`. */
export const DIAS_ISO = [
  { iso: 1, curto: "SEG", nome: "segunda" },
  { iso: 2, curto: "TER", nome: "terça" },
  { iso: 3, curto: "QUA", nome: "quarta" },
  { iso: 4, curto: "QUI", nome: "quinta" },
  { iso: 5, curto: "SEX", nome: "sexta" },
  { iso: 6, curto: "SÁB", nome: "sábado" },
  { iso: 7, curto: "DOM", nome: "domingo" },
] as const;

/**
 * O dia da semana ISO **no fuso da arena**.
 *
 * `d.getDay()` daria o dia da MÁQUINA, que na Vercel está em UTC: às 21h de
 * domingo em São Paulo já é segunda em UTC, e um bloqueio de segunda de manhã
 * passaria a recusar o jogo de domingo à noite.
 */
export function diaIsoNaArena(instante: Date, timezone: string): number {
  const [ano, mes, dia] = relogioDe(instante, timezone).data.split("-").map(Number);
  // Meio-dia UTC: qualquer fuso do mundo cai no mesmo dia do calendário, e o
  // clássico "um dia a menos" de `new Date('2026-09-08')` não acontece.
  const domingoZero = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 12)).getUTCDay();
  return domingoZero === 0 ? 7 : domingoZero;
}

// ───────────────────────────────────────── horário bloqueado

export type Bloqueio = {
  id: string;
  /** `null` = a arena inteira, que é o caso comum da escolinha. */
  court_id: string | null;
  weekday: number;
  /** `HH:MM` ou `HH:MM:SS` — o `pg` devolve `time` como string. */
  starts_time: string;
  ends_time: string;
  label: string | null;
  active: boolean;
};

/** `08:00:00` e `8:00` viram ambos `480` minutos. */
export function minutosDoDia(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * O bloqueio que está valendo AGORA para esta quadra, ou `null`.
 *
 * ─── AS TRÊS SUTILEZAS QUE O TESTE PRENDE ──────────────────────────────────
 *
 * 1. O intervalo é **fechado no começo e aberto no fim** (`[início, fim)`).
 *    Fosse fechado nos dois lados, um bloqueio de 08:00–09:00 colado num de
 *    09:00–10:00 teria um instante pertencendo aos dois — e a aula que termina
 *    às 9h em ponto não é motivo para recusar o lance das 9h em ponto.
 * 2. Bloqueio da arena (`court_id = null`) vale para TODA quadra; bloqueio de
 *    uma quadra não vale para as outras.
 * 3. `active = false` não bloqueia. Desligar é o que o parceiro faz nas férias
 *    da escolinha, e apagar perderia o histórico do que estava configurado
 *    quando um pedido de remoção chegar.
 */
export function bloqueioEmVigor(
  bloqueios: readonly Bloqueio[],
  courtId: string,
  instante: Date,
  timezone: string,
): Bloqueio | null {
  const dia = diaIsoNaArena(instante, timezone);
  const agora = minutosDoDia(relogioDe(instante, timezone).hora);
  return (
    bloqueios.find(
      (b) =>
        b.active &&
        b.weekday === dia &&
        (b.court_id === null || b.court_id === courtId) &&
        agora >= minutosDoDia(b.starts_time) &&
        agora < minutosDoDia(b.ends_time),
    ) ?? null
  );
}

export type ErroDeBloqueio = "dia" | "horario" | "ordem" | "longo";

export const MENSAGEM_BLOQUEIO: Record<ErroDeBloqueio, string> = {
  dia: "Escolha um dia da semana.",
  horario: "Informe o horário de início e de fim.",
  ordem: "O fim precisa ser depois do início — o bloqueio não atravessa a meia-noite.",
  longo: "Um bloqueio vai até 12 horas. Para o dia inteiro, crie dois.",
};

/** Valida o que o formulário de bloqueio mandou, antes de chegar ao `CHECK`. */
export function validarBloqueio(dados: {
  weekday: number;
  inicio: string;
  fim: string;
}): { ok: true } | { ok: false; motivo: ErroDeBloqueio } {
  if (!Number.isInteger(dados.weekday) || dados.weekday < 1 || dados.weekday > 7) {
    return { ok: false, motivo: "dia" };
  }
  const HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (!HORA.test(dados.inicio) || !HORA.test(dados.fim)) return { ok: false, motivo: "horario" };
  const i = minutosDoDia(dados.inicio);
  const f = minutosDoDia(dados.fim);
  if (f <= i) return { ok: false, motivo: "ordem" };
  if (f - i > 12 * 60) return { ok: false, motivo: "longo" };
  return { ok: true };
}

// ──────────────────────────────────────── alocação de porta

export type FaixaDoRelay = {
  port_range_start: number;
  port_range_end: number;
  port_range_next: number;
};

export type AlocacaoDePorta =
  | { ok: true; porta: number; proxima: number }
  | { ok: false; motivo: "faixa-esgotada" };

/**
 * A próxima porta do relay — **contador monotônico, nunca busca por buraco**.
 *
 * A tentação é reaproveitar a porta de uma câmera removida (a faixa tem 100
 * portas e sempre parece que sobra). O comentário da 0004 explica por que não:
 * uma câmera antiga, mal desconfigurada no app do cliente, continua empurrando
 * RTMP para a porta que tinha — e o vídeo dela apareceria na quadra de outra
 * pessoa. É um vazamento de imagem entre arenas, não um bug de inventário.
 *
 * Esgotada a faixa, a resposta é "não" e não "vai que dá": abrir a câmera 101
 * numa faixa de 100 significa duas câmeras na mesma porta.
 */
export function alocarPorta(relay: FaixaDoRelay): AlocacaoDePorta {
  const porta = Math.max(relay.port_range_next, relay.port_range_start);
  if (porta > relay.port_range_end) return { ok: false, motivo: "faixa-esgotada" };
  return { ok: true, porta, proxima: porta + 1 };
}

// ───────────────────────────────────────── identidade da câmera

/**
 * O id da câmera vira **nome de diretório** no relay (`/srv/rec/<id>/`) e
 * segmento de URL, e por isso o `CHECK` da 0004 exige `^[a-z0-9]{6,32}$` — sem
 * hífen, sem acento, sem maiúscula.
 *
 * Derivar de arena + quadra é o que torna o diretório legível para quem entra na
 * máquina às 2h da manhã. O sufixo aleatório é curto e existe só para o caso de
 * duas quadras com slug parecido colidirem depois do corte em 32.
 */
export function idDeCamera(arenaSlug: string, quadraSlug: string, sufixo = ""): string {
  const limpa = (s: string) => s.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const base = `${limpa(arenaSlug)}${limpa(quadraSlug)}`.slice(0, 32 - sufixo.length);
  const id = `${base}${sufixo}`;
  return id.length >= 6 ? id : `${id}${"0".repeat(6 - id.length)}`;
}

export function idDeCameraValido(id: string): boolean {
  return /^[a-z0-9]{6,32}$/.test(id);
}

// ──────────────────────────────────────────── equipe da arena

export type AdminDaArena = {
  id: string;
  user_id: string | null;
  role: "owner" | "manager" | "viewer";
  status: string;
};

export type ErroDeRemocao = "ultimo-owner" | "nao-encontrado";

/**
 * Pode remover este admin?
 *
 * ─── A REGRA EXISTE EM DOIS LUGARES, E ISSO É DE PROPÓSITO ─────────────────
 *
 * O gatilho `partner_admin_exige_owner` (migração 0003) já recusa deixar a arena
 * sem `owner` ativo — e ele é a garantia real, porque vale para `psql`, script e
 * qualquer rota futura. O que ele NÃO faz é explicar: o erro chega como
 * `check_violation`, que vira 500 na tela.
 *
 * Esta função existe para transformar isso numa frase em pt-BR ANTES de tentar,
 * e um convite que troca o dono não é bloqueado à toa. Se as duas divergirem, o
 * banco vence — é ele que impede a arena de ficar sem dono.
 */
export function podeRemoverAdmin(
  admins: readonly AdminDaArena[],
  alvoId: string,
): { ok: true } | { ok: false; motivo: ErroDeRemocao } {
  const alvo = admins.find((a) => a.id === alvoId);
  if (!alvo) return { ok: false, motivo: "nao-encontrado" };
  if (alvo.role !== "owner" || alvo.status !== "active") return { ok: true };
  const donosAtivos = admins.filter((a) => a.role === "owner" && a.status === "active");
  return donosAtivos.length > 1 ? { ok: true } : { ok: false, motivo: "ultimo-owner" };
}

// ─────────────────────────────────────────── marca d'água

export const MARCA_TAMANHO_MAX_BYTES = 2 * 1024 * 1024;
export const MARCA_LARGURA_MIN = 200;
export const MARCA_ALTURA_MIN = 64;
export const LOGO_LADO_MIN = 128;

export type PosicaoDaMarca = "top_left" | "top_right" | "bottom_left" | "bottom_right";

export const POSICOES: ReadonlyArray<{ id: PosicaoDaMarca; rotulo: string }> = [
  { id: "top_left", rotulo: "Sup. esq." },
  { id: "top_right", rotulo: "Sup. dir." },
  { id: "bottom_left", rotulo: "Inf. esq." },
  { id: "bottom_right", rotulo: "Inf. dir." },
];

export function ehPosicaoDaMarca(v: string): v is PosicaoDaMarca {
  return POSICOES.some((p) => p.id === v);
}

export type ErroDaMarca = "tipo" | "tamanho" | "dimensao" | "corrompido";

export const MENSAGEM_MARCA: Record<ErroDaMarca, string> = {
  tipo: "A marca d'água precisa ser um PNG com fundo transparente.",
  tamanho: "O arquivo passa de 2 MB. Exporte o PNG em 512px de largura.",
  dimensao: `A imagem é pequena demais: mínimo ${MARCA_LARGURA_MIN}×${MARCA_ALTURA_MIN} px.`,
  corrompido: "Não conseguimos ler esse PNG. Exporte de novo e tente outra vez.",
};

/**
 * Lê largura e altura do **cabeçalho IHDR** de um PNG.
 *
 * ─── POR QUE NÃO CONFIAR NO QUE O NAVEGADOR DISSE ──────────────────────────
 *
 * A tela já mede a imagem antes de mandar, e essa medida é uma sugestão: o
 * upload é um `PUT` pré-assinado DIRETO no S3, então entre a validação da tela e
 * o objeto no bucket não passa código nosso. Quem confere de verdade é isto,
 * lendo os 33 primeiros bytes do objeto depois que ele chega.
 *
 * Os 8 bytes de assinatura também são o teste de tipo que importa: um JPEG
 * renomeado para `.png` passa por qualquer checagem de extensão e faria o relay
 * queimar um retângulo preto no vídeo do cliente.
 */
export function lerCabecalhoPng(
  bytes: Uint8Array,
): { largura: number; altura: number } | { erro: ErroDaMarca } {
  const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) return { erro: "corrompido" };
  for (let i = 0; i < ASSINATURA.length; i++) {
    if (bytes[i] !== ASSINATURA[i]) return { erro: "tipo" };
  }
  // Bytes 12–15 são o nome do chunk; o primeiro chunk de um PNG válido é IHDR.
  const nome = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (nome !== "IHDR") return { erro: "corrompido" };
  const inteiro = (o: number) =>
    ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0;
  const largura = inteiro(16);
  const altura = inteiro(20);
  if (largura === 0 || altura === 0) return { erro: "corrompido" };
  return { largura, altura };
}

export function validarImagemDaMarca(
  bytes: Uint8Array,
  papel: "marca" | "logo",
): { ok: true; largura: number; altura: number } | { ok: false; motivo: ErroDaMarca } {
  if (bytes.length > MARCA_TAMANHO_MAX_BYTES) return { ok: false, motivo: "tamanho" };
  const cabecalho = lerCabecalhoPng(bytes);
  if ("erro" in cabecalho) return { ok: false, motivo: cabecalho.erro };
  const { largura, altura } = cabecalho;
  const pequena =
    papel === "marca"
      ? largura < MARCA_LARGURA_MIN || altura < MARCA_ALTURA_MIN
      : largura < LOGO_LADO_MIN || altura < LOGO_LADO_MIN;
  if (pequena) return { ok: false, motivo: "dimensao" };
  return { ok: true, largura, altura };
}

export type ParametrosDaMarca = {
  posicao: PosicaoDaMarca;
  /** 0.20 a 1.00. */
  opacidade: number;
  /** 5 a 30 — porcentagem da LARGURA do quadro. */
  larguraPct: number;
};

export const MARCA_PADRAO: ParametrosDaMarca = {
  posicao: "bottom_right",
  opacidade: 0.85,
  larguraPct: 18,
};

/**
 * Normaliza os três parâmetros da marca.
 *
 * Prende em vez de recusar: os limites são os `CHECK` da 0002/0011, e um slider
 * que devolve 0.9999 por arredondamento de float não pode virar erro de
 * formulário. O que é recusado é o que não é número.
 */
export function normalizarParametrosDaMarca(bruto: {
  posicao?: string | null;
  opacidade?: unknown;
  larguraPct?: unknown;
}): ParametrosDaMarca {
  const prender = (v: unknown, min: number, max: number, padrao: number) => {
    // `null` e `""` são AUSÊNCIA, não zero. `Number(null)` devolve 0, que é
    // finito — e sem esta linha um campo não preenchido viraria o menor valor
    // possível em vez do padrão do contrato.
    if (v === null || v === undefined || v === "") return padrao;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  return {
    posicao:
      bruto.posicao && ehPosicaoDaMarca(bruto.posicao) ? bruto.posicao : MARCA_PADRAO.posicao,
    opacidade: Number(prender(bruto.opacidade, 0.2, 1, MARCA_PADRAO.opacidade).toFixed(2)),
    larguraPct: Math.round(prender(bruto.larguraPct, 5, 30, MARCA_PADRAO.larguraPct)),
  };
}

/** Onde a marca fica no PNG do bucket privado — o contrato com o pipeline. */
export function chaveDaMarca(partnerId: string): string {
  return `branding/${partnerId}/watermark.png`;
}

export function chaveDoLogo(partnerId: string): string {
  return `branding/${partnerId}/logo.png`;
}

// ─────────────────────────────────────────────────── cores

const HEX = /^#[0-9a-f]{6}$/i;

/** `#C8FF3D` → `#c8ff3d`; qualquer outra coisa → `null` (o `CHECK` exige minúscula). */
export function normalizarCor(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  const comCerquilha = t.startsWith("#") ? t : `#${t}`;
  return HEX.test(comCerquilha) ? comCerquilha.toLowerCase() : null;
}

// ────────────────────────────────────────────────── esportes

export type EsporteRow = { id: string; rotulo: string };

/** Os valores do enum `court_sport`, em pt-BR. */
export const ESPORTES: readonly EsporteRow[] = [
  { id: "society", rotulo: "Society" },
  { id: "beach_tennis", rotulo: "Beach tennis" },
  { id: "futevolei", rotulo: "Futevôlei" },
  { id: "padel", rotulo: "Padel" },
  { id: "volei", rotulo: "Vôlei" },
  { id: "tenis", rotulo: "Tênis" },
  { id: "basquete", rotulo: "Basquete" },
  { id: "outro", rotulo: "Outro" },
];

export function ehEsporte(v: string): boolean {
  return ESPORTES.some((e) => e.id === v);
}

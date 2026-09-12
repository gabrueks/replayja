import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { storageConfig, urlAssinadaS3, urlDeUpload } from "@/lib/storage";
import {
  MARCA_TAMANHO_MAX_BYTES,
  chaveDaMarca,
  chaveDoLogo,
  validarImagemDaMarca,
  type ErroDaMarca,
} from "@/db/queries/painel-regras";

// O upload do logo e da marca d'água.
//
// ─── O ARQUIVO NÃO PASSA PELA VERCEL, E ISSO NÃO É OTIMIZAÇÃO ──────────────
//
// Server Action tem teto de corpo de 1 MB por padrão, e a marca d'água pode ter
// até 2 MB. As duas saídas seriam subir o teto (fazendo TODA server action do
// app carregar 2 MB de corpo aceitável) ou não passar o arquivo por lá.
//
// O caminho escolhido é o segundo, e é o mesmo que o relay já usa para os
// clipes: `urlDeUpload` assina um `PUT` de 5 minutos, o navegador manda os bytes
// direto para o S3, e o servidor só CONFERE depois. `lib/storage.ts` não
// precisou de uma linha nova.
//
// ─── E É POR ISSO QUE A VALIDAÇÃO DE VERDADE ACONTECE DEPOIS ───────────────
//
// Entre o clique e o objeto no bucket não passa código nosso. O que a tela
// validou (tipo, tamanho, dimensão) é uma cortesia para dar erro rápido; o que
// vale é `conferirImagemEnviada`, que baixa os 33 primeiros bytes do objeto e lê
// o IHDR. Um JPEG renomeado para `.png` passa por qualquer checagem de extensão
// e faria o relay queimar um retângulo preto no vídeo do cliente.
//
// ─── CONTRATO COM O PIPELINE DA MARCA D'ÁGUA ───────────────────────────────
//
//   bucket PRIVADO `replayja-clips`
//   branding/<partnerId>/watermark.png   marca d'água (PNG com alpha)
//   branding/<partnerId>/logo.png        logo de exibição
//
// Chave FIXA por parceiro, sem versão no nome: a versão vive em
// `partner_branding.watermark_version`, que é o que o relay usa para invalidar o
// cache local. Chave com hash no nome deixaria o objeto antigo no bucket para
// sempre, pagando armazenamento por um arquivo que ninguém mais lê.

/** 5 minutos: tempo de sobra para 2 MB num 4G ruim, curto para um link vazado. */
const UPLOAD_SEGUNDOS = 5 * 60;
/** 10 minutos de prévia. A tela recarrega, não guarda. */
const PREVIA_SEGUNDOS = 10 * 60;

export type PapelDaImagem = "marca" | "logo";

export function chaveDaImagem(papel: PapelDaImagem, partnerId: string): string {
  return papel === "marca" ? chaveDaMarca(partnerId) : chaveDoLogo(partnerId);
}

/** O bucket PRIVADO. O logo do parceiro não é conteúdo público por decisão:
 *  ele aparece nas nossas páginas por URL assinada, e não vira asset aberto. */
export function bucketDaMarca(): string {
  return storageConfig().bucket;
}

export type PedidoDeUpload = {
  url: string;
  headers: Record<string, string>;
  objectKey: string;
  expiraEm: string;
};

export async function pedirUploadDeImagem(
  papel: PapelDaImagem,
  partnerId: string,
  tamanhoBytes: number,
): Promise<PedidoDeUpload> {
  const objectKey = chaveDaImagem(papel, partnerId);
  const assinada = await urlDeUpload(
    bucketDaMarca(),
    objectKey,
    "image/png",
    UPLOAD_SEGUNDOS,
    // O `Content-Length` entra na assinatura: um upload maior que o declarado é
    // recusado pelo S3, e não só pela nossa conferência depois.
    Math.min(tamanhoBytes, MARCA_TAMANHO_MAX_BYTES),
  );
  return {
    url: assinada.url,
    headers: assinada.headers,
    objectKey,
    expiraEm: assinada.expiresAt,
  };
}

const globalParaS3 = globalThis as unknown as { replayjaPainelS3?: S3Client };

/**
 * Um `S3Client` próprio, com a MESMA configuração de `lib/storage.ts`.
 *
 * `storageConfig()` já devolve o provider de credenciais da federação OIDC da
 * Vercel (ou a chave estática do ambiente local), então isto reaproveita a
 * decisão sem duplicá-la: nenhuma access key nova, nenhum caminho de credencial
 * novo para auditar.
 */
function s3(): S3Client {
  if (globalParaS3.replayjaPainelS3) return globalParaS3.replayjaPainelS3;
  const cfg = storageConfig();
  const c = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: cfg.credentials,
  });
  globalParaS3.replayjaPainelS3 = c;
  return c;
}

export type ConferenciaDaImagem =
  | { ok: true; largura: number; altura: number }
  | { ok: false; motivo: ErroDaMarca | "ausente" };

/**
 * Confere o PNG que acabou de chegar ao bucket, lendo só o cabeçalho.
 *
 * `Range: bytes=0-32` baixa 33 bytes: assinatura (8) + comprimento e nome do
 * chunk (8) + largura e altura do IHDR (8). Baixar o arquivo inteiro para ler
 * dois inteiros custaria 2 MB de tráfego por upload — e o `Range` é a mesma
 * operação Class B, pelo mesmo preço.
 */
export async function conferirImagemEnviada(
  papel: PapelDaImagem,
  partnerId: string,
): Promise<ConferenciaDaImagem> {
  const objectKey = chaveDaImagem(papel, partnerId);
  let bytes: Uint8Array;
  try {
    const r = await s3().send(
      new GetObjectCommand({
        Bucket: bucketDaMarca(),
        Key: objectKey,
        Range: "bytes=0-32",
      }),
    );
    const corpo = await r.Body?.transformToByteArray();
    if (!corpo) return { ok: false, motivo: "ausente" };
    bytes = corpo;
  } catch {
    // Objeto ausente é o caso comum: a pessoa apertou "salvar" sem escolher
    // arquivo, ou o `PUT` falhou no celular. Não é erro de servidor.
    return { ok: false, motivo: "ausente" };
  }

  const veredito = validarImagemDaMarca(bytes, papel);
  return veredito.ok
    ? { ok: true, largura: veredito.largura, altura: veredito.altura }
    : { ok: false, motivo: veredito.motivo };
}

/**
 * URL assinada para a PRÉVIA no painel.
 *
 * Assinada no S3 e não no CloudFront: a marca d'água mora no bucket privado e
 * não deve ganhar caminho de CDN com cache — é o arquivo que o relay queima no
 * vídeo, não um asset de página. Dez minutos bastam para a tela em que ela
 * aparece.
 */
export async function urlDePrevia(
  papel: PapelDaImagem,
  partnerId: string,
  objectKey?: string | null,
): Promise<string | null> {
  const chave = objectKey ?? chaveDaImagem(papel, partnerId);
  try {
    return await urlAssinadaS3(bucketDaMarca(), chave, PREVIA_SEGUNDOS);
  } catch {
    // Sem storage configurado (preview sem AWS), a tela mostra o espaço vazio em
    // vez de quebrar. É o mesmo padrão de `dbConfigured()`.
    return null;
  }
}

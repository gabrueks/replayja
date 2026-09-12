import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSignedUrl as getSignedCloudFrontUrl } from "@aws-sdk/cloudfront-signer";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import type { S3ClientConfig } from "@aws-sdk/client-s3";

/** Identidade estática OU provider (o tipo aceito pelos clientes do SDK). */
type CredenciaisAws = NonNullable<S3ClientConfig["credentials"]>;

// Armazenamento e entrega de mídia.
//
// ─── A DECISÃO (fechada em 2026-09-12, substitui o R2 da ADR §5) ───────────
//
//   Clipes         → Amazon S3 em `sa-east-1` (São Paulo)
//   Entrega        → CloudFront, Price Class All, com URL ASSINADA e curta
//   Thumbnail/OG   → bucket público separado, servido pelo mesmo CloudFront
//
// Ficar em `sa-east-1` é a decisão do fundador ("só Brasil"): o dado de imagem de
// pessoa não sai do país, o que simplifica a análise de LGPD (não há
// transferência internacional a justificar) e tira a jurisdição do bucket da
// lista de bloqueantes. O custo que isso troca é o egress: o CloudFront cobra
// saída, e o R2 não cobrava — é o parafuso a acompanhar quando o piloto virar
// tráfego real.
//
// ─── A CAMADA CONTINUA GENÉRICA, DE PROPÓSITO ──────────────────────────────
//
// Tudo aqui fala S3 padrão. `STORAGE_ENDPOINT` existe mas é OPCIONAL: sem ele o
// SDK resolve o endpoint da AWS sozinho; com ele, aponta para qualquer provedor
// S3-compatível. Trocar de provedor é trocar variáveis, não reescrever o módulo
// — e como a conta de egress é o risco conhecido desta decisão, essa porta fica
// aberta de graça.
//
// O banco guarda CHAVE DE OBJETO (`storage_bucket` + `*_object_key`), nunca URL
// absoluta (`modelo-de-dados.md` §1). A URL é montada/assinada na leitura.

export type StorageConfig = {
  /** Vazio = endpoint padrão da AWS. Preenchido = provedor S3-compatível. */
  endpoint: string | null;
  region: string;
  /** Bucket privado dos clipes. */
  bucket: string;
  /** Bucket público de thumbnail e Open Graph. */
  bucketPublico: string;
  /**
   * Credenciais para o SDK. Em produção é o PROVIDER da federação OIDC da Vercel
   * (`AWS_ROLE_ARN`): o deploy troca o próprio token por credenciais temporárias
   * da role `replayja-vercel-app` e nenhuma access key da AWS existe em lugar
   * nenhum. Chave estática (`STORAGE_ACCESS_KEY_ID`/`SECRET`) fica só para
   * desenvolvimento local e provedores S3-compatíveis fora da AWS.
   */
  credentials: CredenciaisAws;
};

export function storageConfigurado(): boolean {
  return Boolean(
    process.env.AWS_ROLE_ARN?.trim() ||
      (process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY),
  );
}

export function storageConfig(): StorageConfig {
  if (!storageConfigurado()) {
    throw new Error(
      "Storage não configurado — defina AWS_ROLE_ARN (federação OIDC da Vercel) ou " +
        "STORAGE_ACCESS_KEY_ID e STORAGE_SECRET_ACCESS_KEY (e, se não for AWS, STORAGE_ENDPOINT).",
    );
  }
  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  return {
    endpoint: process.env.STORAGE_ENDPOINT?.trim() || null,
    region: process.env.STORAGE_REGION?.trim() || "sa-east-1",
    bucket: process.env.STORAGE_BUCKET?.trim() || "replayja-clips",
    bucketPublico: process.env.STORAGE_PUBLIC_BUCKET?.trim() || "replayja-thumbs",
    credentials: roleArn
      ? awsCredentialsProvider({ roleArn })
      : {
          accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
          secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
        },
  };
}

const globalForAws = globalThis as unknown as {
  replayjaS3?: S3Client;
  replayjaCf?: CloudFrontClient;
};

function s3(): S3Client {
  if (globalForAws.replayjaS3) return globalForAws.replayjaS3;
  const cfg = storageConfig();
  const c = new S3Client({
    region: cfg.region,
    // `forcePathStyle` só quando há endpoint custom: a AWS prefere virtual-host,
    // e quase todo provedor não-AWS só aceita path-style (o estilo virtual-host
    // exige DNS wildcard no domínio deles).
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: cfg.credentials,
  });
  globalForAws.replayjaS3 = c;
  return c;
}

// ────────────────────────────────────────────── chaves de objeto

export type PapelDeArquivo = "watermarked" | "source" | "thumbnail" | "preview" | "og";

const ARQUIVO: Record<PapelDeArquivo, string> = {
  watermarked: "wm.mp4",
  source: "src.mp4",
  thumbnail: "thumb.jpg",
  preview: "preview.mp4",
  og: "og.jpg",
};

/** Thumbnail e OG vão para o bucket PÚBLICO: o crawler do WhatsApp não tem
 *  sessão, e sem imagem pública o card compartilhado não tem preview tocável —
 *  que é exatamente o que faz a arena aparecer. É a exceção consciente de
 *  `api/README.md` §3. */
export function bucketDoPapel(papel: PapelDeArquivo): "privado" | "publico" {
  return papel === "thumbnail" || papel === "og" ? "publico" : "privado";
}

export function nomeDoBucket(papel: PapelDeArquivo): string {
  const cfg = storageConfig();
  return bucketDoPapel(papel) === "publico" ? cfg.bucketPublico : cfg.bucket;
}

/**
 * Chave de objeto DETERMINÍSTICA — `api/README.md` §5, camada 4.
 *
 *   clips/<partner>/<court>/<AAAA-MM-DD>/<clipId>/<arquivo>
 *
 * Determinística de propósito: object storage não é append log, então repetir um
 * `PUT` sobrescreve com bytes idênticos e é inofensivo por construção. É o que
 * torna seguro reexecutar um job cujo lease venceu.
 */
export function chaveDeClipe(
  partnerId: string,
  courtId: string,
  dataLocal: string,
  clipId: string,
  papel: PapelDeArquivo,
): string {
  return `clips/${partnerId}/${courtId}/${dataLocal}/${clipId}/${ARQUIVO[papel]}`;
}

// ───────────────────────────────────────────────── upload (relay)

export type UrlAssinada = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

/**
 * URL pré-assinada de UPLOAD, direto no S3.
 *
 * Nenhum byte de vídeo passa pela Vercel. O relay faz `PUT` e depois confirma —
 * e chamar de novo é seguro, porque a chave é determinística.
 */
export async function urlDeUpload(
  bucket: string,
  objectKey: string,
  contentType: string,
  expiresInSeconds: number,
  sizeBytes?: number,
): Promise<UrlAssinada> {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    ...(sizeBytes ? { ContentLength: sizeBytes } : {}),
  });
  const url = await getSignedUrl(s3(), cmd, { expiresIn: expiresInSeconds });
  return {
    url,
    method: "PUT",
    headers: { "Content-Type": contentType },
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

// ───────────────────────────────────────── entrega (CloudFront)

export function cloudfrontConfigurado(): boolean {
  return Boolean(
    process.env.CLOUDFRONT_DOMAIN &&
      process.env.CLOUDFRONT_KEY_PAIR_ID &&
      process.env.CLOUDFRONT_PRIVATE_KEY,
  );
}

function cloudfrontDominio(): string {
  const d = process.env.CLOUDFRONT_DOMAIN?.trim();
  if (!d) throw new Error("CLOUDFRONT_DOMAIN não configurado");
  return d.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * URL assinada do CloudFront — é assim que o clipe chega ao atleta.
 *
 * Curta de propósito (`api/README.md` §3): reprodução 6 h, download 15 min. Um
 * MP4 colado num fórum morre no mesmo dia, e essa validade curta é metade da
 * defesa de privacidade do produto (a outra metade é exigir login para chegar
 * até aqui).
 *
 * A chave privada vem por env em PEM. Na Vercel, quebras de linha viram `\n`
 * literal — por isso o `replace`.
 */
export function urlDeEntrega(objectKey: string, expiresInSeconds: number): string {
  const pem = process.env.CLOUDFRONT_PRIVATE_KEY;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  if (!pem || !keyPairId) throw new Error("CloudFront não configurado para assinatura");
  return getSignedCloudFrontUrl({
    url: `https://${cloudfrontDominio()}/${objectKey}`,
    keyPairId,
    privateKey: pem.replace(/\\n/g, "\n"),
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  });
}

/**
 * URL PÚBLICA e cacheável, sem assinatura. Só para thumbnail e Open Graph.
 *
 * `CDN_PUBLIC_BASE_URL` (`https://cdn.replayja.com.br`) quando existir; senão o
 * domínio bruto do CloudFront. O banco nunca guarda isto — é montado na leitura.
 */
export function urlPublica(objectKey: string): string | null {
  const base = process.env.CDN_PUBLIC_BASE_URL?.trim();
  if (base) return `${base.replace(/\/$/, "")}/${objectKey}`;
  if (!process.env.CLOUDFRONT_DOMAIN) return null;
  return `https://${cloudfrontDominio()}/${objectKey}`;
}

/** URL assinada direto no S3. Só para diagnóstico e scripts — o caminho do
 *  usuário é sempre o CloudFront, que é quem tem cache e Price Class All. */
export async function urlAssinadaS3(
  bucket: string,
  objectKey: string,
  expiresInSeconds: number,
): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
    expiresIn: expiresInSeconds,
  });
}

// ───────────────────────────────────────────── verificação e expurgo

export type ObjetoNoStorage = { sizeBytes: number; checksumSha256: string | null };

/**
 * Confere que o objeto realmente chegou, com o tamanho declarado.
 *
 * É o que impede um upload truncado de virar clipe `ready` corrompido
 * (`api/README.md` §5, camada 4). Devolve `null` quando o objeto não existe — o
 * chamador transforma isso em 409 e o relay reenvia o arquivo.
 */
export async function inspecionarObjeto(
  bucket: string,
  objectKey: string,
): Promise<ObjetoNoStorage | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return {
      sizeBytes: Number(r.ContentLength ?? 0),
      // Só vem quando o upload declarou o checksum; por isso o `confirm` também
      // aceita comparar apenas o tamanho.
      checksumSha256: r.ChecksumSHA256 ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Apaga objetos em lote. 1.000 chaves por chamada = UMA operação Class A.
 *
 * Usado pelo expurgo diário (`purge_expired_clips`, 04:00 BRT) e pelo takedown
 * da LGPD. A ordem importa: apagar o OBJETO primeiro e a LINHA depois. Órfão de
 * registro é melhor que órfão de objeto — o segundo cresce para sempre sem
 * ninguém ver.
 */
export async function apagarObjetos(bucket: string, chaves: string[]): Promise<number> {
  if (chaves.length === 0) return 0;
  let apagados = 0;
  for (let i = 0; i < chaves.length; i += 1000) {
    const lote = chaves.slice(i, i + 1000);
    const r = await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    apagados += lote.length - (r.Errors?.length ?? 0);
    if (r.Errors?.length) {
      console.error("[storage] falha ao apagar:", r.Errors.map((e) => e.Key).join(", "));
    }
  }
  return apagados;
}

function cloudfront(): CloudFrontClient {
  if (globalForAws.replayjaCf) return globalForAws.replayjaCf;
  const cfg = storageConfig();
  const c = new CloudFrontClient({
    // O CloudFront é global e só atende em `us-east-1`, independentemente de
    // onde o bucket esteja.
    region: "us-east-1",
    credentials: cfg.credentials,
  });
  globalForAws.replayjaCf = c;
  return c;
}

/**
 * Invalida caminhos no CloudFront — a segunda metade do takedown.
 *
 * ─── POR QUE ISTO EXISTE MESMO SEM CHAMADOR AINDA ──────────────────────────
 *
 * Apagar o objeto no S3 NÃO tira o vídeo do ar: o CloudFront continua servindo a
 * cópia em cache nas bordas até o TTL vencer. Num produto que promete responder a
 * pedido de remoção em 72 h e que grava imagem de pessoa, "apaguei do bucket" não
 * é resposta — e descobrir isso no dia do primeiro pedido de remoção seria caro.
 *
 * A função fica pronta e testável; o job de expurgo e a rota de takedown a
 * chamam quando existirem (B2/B6). Sem `CLOUDFRONT_DISTRIBUTION_ID` ela não faz
 * nada e avisa, em vez de lançar — um expurgo não pode falhar por causa da CDN.
 *
 * Atenção ao custo: as 1.000 primeiras invalidações do mês são gratuitas e cada
 * caminho conta uma. Para expurgo em massa, invalidar o PREFIXO (`/clips/<id>/*`)
 * em vez de arquivo por arquivo.
 */
export async function invalidarCache(caminhos: string[]): Promise<boolean> {
  const distribuicao = process.env.CLOUDFRONT_DISTRIBUTION_ID?.trim();
  if (!distribuicao) {
    console.warn("[storage] CLOUDFRONT_DISTRIBUTION_ID ausente — cache NÃO invalidado.");
    return false;
  }
  if (caminhos.length === 0) return true;
  const items = caminhos.map((c) => (c.startsWith("/") ? c : `/${c}`));
  await cloudfront().send(
    new CreateInvalidationCommand({
      DistributionId: distribuicao,
      InvalidationBatch: {
        // O `CallerReference` precisa ser único por chamada; repetir devolve a
        // invalidação anterior em vez de criar uma nova.
        CallerReference: `replayja-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        Paths: { Quantity: items.length, Items: items },
      },
    }),
  );
  return true;
}

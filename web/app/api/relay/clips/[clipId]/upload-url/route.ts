import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { lerJson } from "@/lib/http-guards";
import { URL_UPLOAD_SEGUNDOS } from "@/lib/limites";
import { ProblemError, corpoInvalido, naoEncontrado } from "@/lib/problem";
import { exigirRelay } from "@/lib/relay-auth";
import {
  chaveDeClipe,
  nomeDoBucket,
  storageConfigurado,
  urlDeUpload,
  type PapelDeArquivo,
} from "@/lib/storage";
import { clipeParaUpload } from "@/db/queries/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/relay/clips/{clipId}/upload-url` — URLs pré-assinadas.
//
// O relay sobe DIRETO para o S3. Nenhum byte de vídeo passa pela Vercel nem pela
// nossa API — o que é a razão de a conta de Fast Data Transfer do time (que é
// compartilhada com o Sentinela, ADR §4.1) continuar sendo ruído.
//
// Chamar de novo devolve URLs apenas para os arquivos ainda NÃO confirmados — é
// assim que o relay retoma um upload interrompido: ele pergunta o que falta.
//
// As chaves são DETERMINÍSTICAS, então repetir um `PUT` sobrescreve com bytes
// idênticos e é inofensivo por construção.

const PAPEIS: readonly PapelDeArquivo[] = ["watermarked", "source", "thumbnail", "preview", "og"];
const TIPOS = new Set(["video/mp4", "image/jpeg", "image/webp"]);
const MAX_BYTES = 209_715_200; // 200 MB

type PedidoDeArquivo = { role: PapelDeArquivo; contentType: string; sizeBytes: number };

export const POST = withRoute<{ params: Promise<{ clipId: string }> }>(
  "/api/relay/clips/[clipId]/upload-url",
  async (req: NextRequest, ctx) => {
    const relay = await exigirRelay(req);
    const { clipId } = await ctx.params;

    if (!storageConfigurado()) {
      throw new ProblemError({
        type: "internal",
        title: "Armazenamento não configurado",
        status: 503,
        detail: "O armazenamento de clipes ainda não foi configurado neste ambiente.",
      });
    }

    const clipe = await clipeParaUpload(relay.relayNodeId, clipId);
    // 404 e não 403 quando o clipe é de outro relay: não revelamos que ele
    // existe.
    if (!clipe) throw naoEncontrado();

    if (clipe.status === "ready" || clipe.status === "expired") {
      throw new ProblemError({
        type: "clip-not-ready",
        title: "Clipe já fechado",
        status: 409,
        detail: "Este clipe já foi confirmado ou expirou.",
      });
    }

    const body = await lerJson(req);
    const brutos = Array.isArray(body?.files) ? body.files : null;
    if (!brutos || brutos.length === 0 || brutos.length > 5) throw corpoInvalido();

    const arquivos: PedidoDeArquivo[] = [];
    for (const b of brutos) {
      if (!b || typeof b !== "object") throw corpoInvalido();
      const f = b as Record<string, unknown>;
      const role = f.role as PapelDeArquivo;
      const contentType = String(f.contentType ?? "");
      const sizeBytes = Number(f.sizeBytes);
      if (!PAPEIS.includes(role)) throw corpoInvalido(`Tipo de arquivo desconhecido: ${role}`);
      if (!TIPOS.has(contentType)) throw corpoInvalido(`Content-Type não aceito: ${contentType}`);
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BYTES) {
        throw corpoInvalido("Tamanho de arquivo fora do aceito.");
      }
      arquivos.push({ role, contentType, sizeBytes });
    }

    // Já confirmados não ganham URL nova: é isso que faz a retomada devolver só
    // o que falta.
    const jaConfirmados = new Set<PapelDeArquivo>();
    if (clipe.watermarked_object_key) jaConfirmados.add("watermarked");
    if (clipe.thumbnail_object_key) jaConfirmados.add("thumbnail");

    // Data LOCAL da arena na chave do objeto: é o que torna o prefixo legível
    // para quem for inspecionar o bucket ("os clipes de 8 de setembro").
    const dataLocal = new Date(clipe.triggered_at).toLocaleDateString("en-CA", {
      timeZone: clipe.timezone,
    });

    const uploads = [];
    for (const a of arquivos) {
      if (jaConfirmados.has(a.role)) continue;
      const bucket = nomeDoBucket(a.role);
      const objectKey = chaveDeClipe(
        clipe.partner_id,
        clipe.court_id,
        dataLocal,
        clipe.clip_id,
        a.role,
      );
      const assinada = await urlDeUpload(
        bucket,
        objectKey,
        a.contentType,
        URL_UPLOAD_SEGUNDOS,
        a.sizeBytes,
      );
      uploads.push({
        role: a.role,
        bucket,
        objectKey,
        url: assinada.url,
        method: assinada.method,
        headers: assinada.headers,
        expiresAt: assinada.expiresAt,
        maxBytes: MAX_BYTES,
      });
    }

    return NextResponse.json(
      {
        expiresAt: new Date(Date.now() + URL_UPLOAD_SEGUNDOS * 1000).toISOString(),
        uploads,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);

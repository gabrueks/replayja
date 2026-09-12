import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { lerJson } from "@/lib/http-guards";
import { RETAIN_SOURCE_HORAS } from "@/lib/limites";
import { ProblemError, corpoInvalido, naoEncontrado } from "@/lib/problem";
import { exigirRelay } from "@/lib/relay-auth";
import { inspecionarObjeto, nomeDoBucket, storageConfigurado, type PapelDeArquivo } from "@/lib/storage";
import { clipeParaUpload, confirmarClipe, type ArquivoConfirmado } from "@/db/queries/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `POST /api/relay/clips/{clipId}/confirm` — fecha o job.
//
// ─── O QUE ESTA ROTA EXISTE PARA IMPEDIR ───────────────────────────────────
//
// Que um upload TRUNCADO vire clipe `ready` corrompido. Por isso ela verifica
// cada objeto no storage (`HeadObject`, comparação de tamanho e `sha256`) ANTES
// de aceitar. Divergência → `409`, e o relay reenvia aquele arquivo.
//
// Idempotente: reconfirmar devolve `200` com o estado atual, sem efeito.
//
// `coverageRatio` decide o estado final:
//
//   1.0                     → `ready`
//   entre minCoverage e 1.0 → `partial`, e o app mostra honestamente quantos
//                             segundos faltaram e por quê ("a internet da arena
//                             oscilou")
//   abaixo do mínimo (0,6)  → `failed` com `no_coverage`, e o gatilho aparece no
//                             painel do parceiro como evidência de uplink ruim
//
// `partial` APARECE na busca. Um lance com 3 segundos faltando ainda é o lance do
// atleta; escondê-lo seria pior que entregá-lo rotulado.

const PAPEIS: readonly PapelDeArquivo[] = ["watermarked", "source", "thumbnail", "preview", "og"];

export const POST = withRoute<{ params: Promise<{ clipId: string }> }>(
  "/api/relay/clips/[clipId]/confirm",
  async (req: NextRequest, ctx) => {
    const relay = await exigirRelay(req);
    const { clipId } = await ctx.params;

    const clipe = await clipeParaUpload(relay.relayNodeId, clipId);
    if (!clipe) throw naoEncontrado();

    const body = await lerJson(req);
    if (!body) throw corpoInvalido();

    const coverageRatio = Number(body.coverageRatio);
    if (!Number.isFinite(coverageRatio) || coverageRatio < 0 || coverageRatio > 1) {
      throw corpoInvalido("coverageRatio precisa estar entre 0 e 1.");
    }

    const brutos = Array.isArray(body.files) ? body.files : null;
    if (!brutos || brutos.length === 0) throw corpoInvalido("Informe os arquivos enviados.");

    const arquivos: ArquivoConfirmado[] = [];
    for (const b of brutos) {
      if (!b || typeof b !== "object") throw corpoInvalido();
      const f = b as Record<string, unknown>;
      const role = f.role as PapelDeArquivo;
      const objectKey = String(f.objectKey ?? "");
      const sizeBytes = Number(f.sizeBytes);
      const sha256 = typeof f.sha256 === "string" ? f.sha256 : null;
      if (!PAPEIS.includes(role) || !objectKey) throw corpoInvalido();
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1) throw corpoInvalido();
      if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) throw corpoInvalido("sha256 inválido.");
      arquivos.push({ role, objectKey, sizeBytes, sha256 });
    }

    // A VERIFICAÇÃO. Sem storage configurado (bancada, preview) ela é pulada com
    // aviso: recusar aqui impediria testar o pipeline inteiro sem bucket, que é
    // exatamente o que a task B2 precisa fazer antes de o Gabriel aprovar a
    // infra. Em produção, `storageConfigurado()` é sempre verdadeiro.
    if (storageConfigurado()) {
      for (const a of arquivos) {
        const objeto = await inspecionarObjeto(nomeDoBucket(a.role), a.objectKey);
        if (!objeto) {
          throw new ProblemError({
            type: "checksum-mismatch",
            title: "Arquivo não encontrado",
            status: 409,
            detail: `O arquivo "${a.role}" não chegou ao armazenamento. Reenvie.`,
          });
        }
        if (objeto.sizeBytes !== a.sizeBytes) {
          throw new ProblemError({
            type: "checksum-mismatch",
            title: "Upload truncado",
            status: 409,
            detail: `O arquivo "${a.role}" chegou incompleto (${objeto.sizeBytes} de ${a.sizeBytes} bytes). Reenvie.`,
          });
        }
        // O CHECKSUM, quando o storage devolve um.
        //
        // O tamanho pega truncamento; o sha256 pega CORRUPÇÃO — bytes que
        // chegaram todos, mas errados. É raro e é exatamente por isso que
        // precisa ser automático: um MP4 corrompido vira um clipe `ready` que
        // não toca, e o atleta conclui que o produto não funciona.
        //
        // `ChecksumSHA256` só existe quando o `PUT` declarou o checksum, e nem
        // todo provedor S3-compatível o devolve. Quando não vier, o tamanho é o
        // que temos — e está registrado como pendência no README.
        if (a.sha256 && objeto.checksumSha256) {
          // A AWS devolve o SHA-256 em BASE64; o relay manda em hex. Comparar sem
          // converter reprovaria todo upload íntegro.
          const emHex = Buffer.from(objeto.checksumSha256, "base64").toString("hex");
          if (emHex.toLowerCase() !== a.sha256.toLowerCase()) {
            throw new ProblemError({
              type: "checksum-mismatch",
              title: "Arquivo corrompido",
              status: 409,
              detail: `O arquivo "${a.role}" chegou corrompido (o hash não confere). Reenvie.`,
            });
          }
        }
      }
    } else {
      console.warn("[confirm] storage não configurado — verificação de objeto pulada.");
    }

    const r = await confirmarClipe(relay.relayNodeId, clipId, {
      arquivos,
      coverageRatio,
      actualFrom: typeof body.actualFrom === "string" ? body.actualFrom : null,
      actualTo: typeof body.actualTo === "string" ? body.actualTo : null,
      durationSeconds: Number.isFinite(Number(body.durationSeconds))
        ? Number(body.durationSeconds)
        : null,
      width: Number.isFinite(Number(body.width)) ? Number(body.width) : null,
      height: Number.isFinite(Number(body.height)) ? Number(body.height) : null,
      fps: Number.isFinite(Number(body.fps)) ? Number(body.fps) : null,
      codec: typeof body.codec === "string" ? body.codec : null,
      watermarkApplied: body.watermarkApplied === true,
      watermarkVersion: Number.isFinite(Number(body.watermarkVersion))
        ? Number(body.watermarkVersion)
        : null,
      cutMs: Number.isFinite(Number(body.cutMs)) ? Number(body.cutMs) : null,
      encodeMs: Number.isFinite(Number(body.encodeMs)) ? Number(body.encodeMs) : null,
    });

    if (!r) throw naoEncontrado();

    return NextResponse.json(
      {
        clipId,
        status: r.status,
        // Até quando o relay deve guardar o RECORTE BRUTO em disco, para permitir
        // "estender lance" sem cortar a sessão de novo. É o contrário do desenho
        // de borda, em que um lance mal capturado estava perdido para sempre.
        retainSourceUntil: new Date(
          Date.now() + RETAIN_SOURCE_HORAS * 60 * 60 * 1000,
        ).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);

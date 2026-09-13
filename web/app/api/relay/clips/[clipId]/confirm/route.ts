import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { lerJson } from "@/lib/http-guards";
import { RETAIN_SOURCE_HORAS } from "@/lib/limites";
import { ProblemError, corpoInvalido, naoEncontrado } from "@/lib/problem";
import { exigirRelay } from "@/lib/relay-auth";
import {
  chaveDeClipe,
  inspecionarObjeto,
  nomeDoBucket,
  storageConfigurado,
  type PapelDeArquivo,
} from "@/lib/storage";
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

// Qual marca saiu no clipe. `default-fallback` é o caso que importa monitorar: o
// parceiro tem logo, o relay não conseguiu baixá-lo e o clipe saiu com a nossa
// marca. Ver `db/migrations/2026-09-12-0011-marca-dagua.sql`.
const KINDS: readonly string[] = ["partner", "default", "default-fallback"];

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

    // ─── A CHAVE É RECALCULADA, NUNCA ACEITA ──────────────────────────────
    //
    // `objectKey` vinha do corpo e era gravado em `clip.*_object_key` sem
    // conferência nenhuma. A chave é DETERMINÍSTICA por contrato
    // (`api/README.md` §5, camada 4) e é a própria `upload-url` que a calcula —
    // o relay não escolhe nada, ele recebe. Aceitar de volta o que mandamos é
    // deixar uma chave ARBITRÁRIA do bucket privado virar o vídeo deste clipe:
    // basta confirmar apontando para `clips/<outra arena>/…/wm.mp4` e qualquer
    // usuário logado recebe uma URL assinada para aquele objeto pelo
    // `/api/clips/{id}/download`.
    //
    // A chave do relay é um segredo forte e o relay é máquina nossa — mas é o
    // único chamador que existe, e "o chamador é confiável" é exatamente o
    // argumento que some no dia em que a chave vaza ou em que há dois relays.
    // Recalcular custa uma linha.
    //
    // A data é a MESMA conta de `upload-url` (data local da arena, `en-CA`),
    // porque as duas precisam produzir a mesma string para o mesmo clipe.
    const dataLocal = new Date(clipe.triggered_at).toLocaleDateString("en-CA", {
      timeZone: clipe.timezone,
    });

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

      const esperada = chaveDeClipe(
        clipe.partner_id,
        clipe.court_id,
        dataLocal,
        clipe.clip_id,
        role,
      );
      if (objectKey !== esperada) {
        throw corpoInvalido(
          `A chave de "${role}" não é a que esta API emitiu. Peça as URLs em ` +
            "/upload-url e confirme exatamente as chaves recebidas.",
        );
      }

      arquivos.push({ role, objectKey: esperada, sizeBytes, sha256 });
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
      // Recusar um `kind` desconhecido em vez de gravá-lo: a coluna tem CHECK, e
      // um valor fora da lista faria o `confirm` estourar em 500 DEPOIS do
      // upload — o clipe existiria no S3 e ficaria eternamente `processing`.
      // Ignorar o campo perde um dado de diagnóstico; perder o clipe é pior.
      watermarkKind: KINDS.includes(String(body.watermarkKind))
        ? String(body.watermarkKind)
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

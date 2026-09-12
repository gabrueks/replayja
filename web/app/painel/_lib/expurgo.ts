import { apagarObjetos, invalidarCache, storageConfig, storageConfigurado } from "@/lib/storage";
import {
  arquivosDosClipes,
  marcarClipesRemovidos,
  registrarExecucaoDoPedido,
} from "@/db/queries/painel-privacidade";

// A EXECUÇÃO DE UM PEDIDO DE REMOÇÃO — `docs/legal/fluxo-remocao.md` §7.
//
// ─── UM CLIPE EXISTE EM SEIS LUGARES ───────────────────────────────────────
//
// Apagar só do banco é o erro clássico, e é o que transforma um takedown em
// incidente no dia em que alguém prova que o link assinado antigo ainda
// funciona. As camadas, na ordem do documento:
//
//   1. Postgres            `deleted_at`, `deleted_reason`, `takedown_request_id`
//   2. URL assinada        [PENDENTE] revogação das assinaturas já emitidas
//   3. S3 `sa-east-1`      DELETE do MP4, da fonte e do thumbnail
//   4. CloudFront          invalidação dos caminhos nas bordas
//   5. Relay               [PENDENTE] segmento no disco da EC2
//   6. ISR                 [PENDENTE] `revalidateTag` das páginas em cache
//
// Esta função faz 1, 3 e 4 — e **registra em `verification` o que cada camada
// respondeu**, inclusive as que não fez. O protocolo só vira `concluido` quando
// as camadas implementadas passam; caso contrário fica `executado`, que é o
// estado honesto: o vídeo saiu do ar, e ainda há trabalho manual.
//
// ─── A ORDEM É A DO TAKEDOWN, NÃO A DA RETENÇÃO ────────────────────────────
//
// O expurgo por retenção apaga o OBJETO antes da LINHA, para não deixar órfão de
// objeto. Aqui é o contrário: o relógio do SLA corre e a primeira coisa que
// precisa acontecer é o vídeo sair do ar para quem abrir a página. Marcar
// `deleted_at` é imediato e reversível; apagar o objeto não é. Um órfão de
// objeto por alguns segundos é preço barato por isso.

export type ResultadoDoExpurgo = {
  clipesMarcados: number;
  objetosApagados: number;
  cacheInvalidado: boolean;
  /** O que vai para `takedown_request.verification`. */
  verificacao: Record<string, unknown>;
  concluido: boolean;
};

export async function executarExpurgo(
  partnerId: string,
  clipIds: readonly string[],
  opcoes: { motivo: string; pedidoId: string | null; decididoPor: string | null },
): Promise<ResultadoDoExpurgo> {
  const arquivos = await arquivosDosClipes(partnerId, clipIds);
  // Só os clipes que realmente são desta arena seguem. Um uuid de outra arena
  // simplesmente não aparece aqui — e não é apagado.
  const idsValidos = arquivos.map((a) => a.clip_id);

  // ── camada 1: o clipe some da API ────────────────────────────────────────
  const clipesMarcados = await marcarClipesRemovidos(
    partnerId,
    idsValidos,
    opcoes.motivo,
    opcoes.pedidoId,
  );

  // ── camadas 3 e 4: objetos e cache ───────────────────────────────────────
  const porBucket = new Map<string, string[]>();
  const caminhos: string[] = [];
  for (const a of arquivos) {
    const chaves = [
      a.watermarked_object_key,
      a.source_object_key,
      a.preview_object_key,
    ].filter((k): k is string => Boolean(k));
    // Thumbnail e OG vivem no bucket PÚBLICO (a exceção consciente de
    // `api/README.md` §3): são as duas superfícies que o crawler do WhatsApp lê
    // sem sessão, e por isso são justamente as que precisam sumir primeiro.
    const publicas = [a.thumbnail_object_key, a.og_object_key].filter(
      (k): k is string => Boolean(k),
    );
    if (chaves.length) {
      porBucket.set(a.storage_bucket, [...(porBucket.get(a.storage_bucket) ?? []), ...chaves]);
    }
    if (publicas.length && storageConfigurado()) {
      const publico = storageConfig().bucketPublico;
      porBucket.set(publico, [...(porBucket.get(publico) ?? []), ...publicas]);
    }
    caminhos.push(...chaves, ...publicas);
  }

  let objetosApagados = 0;
  const errosDeStorage: string[] = [];
  if (storageConfigurado()) {
    for (const [bucket, chaves] of porBucket) {
      try {
        objetosApagados += await apagarObjetos(bucket, chaves);
      } catch (err) {
        errosDeStorage.push(`${bucket}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    errosDeStorage.push("storage nao configurado");
  }

  let cacheInvalidado = false;
  if (caminhos.length > 0) {
    try {
      cacheInvalidado = await invalidarCache(caminhos);
    } catch (err) {
      errosDeStorage.push(`cloudfront: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const verificacao: Record<string, unknown> = {
    em: new Date().toISOString(),
    clipes_pedidos: clipIds.length,
    clipes_da_arena: idsValidos.length,
    banco: { ok: clipesMarcados === idsValidos.length, marcados: clipesMarcados },
    objetos: { ok: errosDeStorage.length === 0, apagados: objetosApagados, erros: errosDeStorage },
    // A invalidação do CloudFront é ASSÍNCRONA: `true` quer dizer "pedido
    // aceito", não "já saiu das bordas". É a camada mais lenta das seis e a que
    // precisa ser conferida de verdade, não presumida.
    cdn: { pedido: cacheInvalidado, assincrono: true },
    // As três camadas que este código ainda NÃO faz. Registradas para que o
    // protocolo não pareça completo quando não está.
    pendentes: ["revogacao-url-assinada", "segmento-no-relay", "revalidate-isr"],
  };

  const concluido =
    idsValidos.length > 0 && clipesMarcados === idsValidos.length && errosDeStorage.length === 0;

  if (opcoes.pedidoId) {
    await registrarExecucaoDoPedido(
      partnerId,
      opcoes.pedidoId,
      verificacao,
      concluido,
      opcoes.decididoPor,
    );
  }

  return { clipesMarcados, objetosApagados, cacheInvalidado, verificacao, concluido };
}

import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/lib/app-error";
import { dbConfigured } from "@/lib/db";
import { semPermissao } from "@/lib/problem";
import {
  apagarObjetos,
  invalidarCache,
  storageConfig,
  storageConfigurado,
} from "@/lib/storage";
import {
  clipesVencidosParaExpurgo,
  contarClipesVencidos,
  marcarClipesExpurgados,
  type ClipeParaExpurgoRow,
} from "@/db/queries/expurgo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O teto da Vercel decide quantos clipes cabem numa passada. `DeleteObjects`
// leva 1.000 chaves por chamada e volta em ~200 ms; a invalidação do CloudFront
// é uma chamada por lote. 60 s dão folga larga para o teto abaixo.
export const maxDuration = 60;

// `GET /api/cron/purge-clips` — o job diário que TIRA OS BYTES.
//
// ─── A METADE QUE FALTAVA DO A-5 ───────────────────────────────────────────
//
// `b0567fa` fez o clipe vencido sumir da API: a retenção é conferida no `WHERE`
// de toda consulta, e não num cron que pode não ter acordado. Este arquivo é a
// outra metade — o MP4 sai do S3 `sa-east-1`, a capa sai do bucket público, e o
// CloudFront para de servir a cópia em cache nas bordas.
//
// A ordem das duas metades importa e é deliberada: o usuário nunca depende
// deste job. Se ele quebrar, ninguém vê clipe fora do prazo — só o bucket
// engorda, e o `pendentes` da resposta grita.
//
// ─── 04:00 NO HORÁRIO DE BRASÍLIA ──────────────────────────────────────────
//
// `vercel.json` agenda `0 7 * * *` (UTC), que é 04:00 em `America/Sao_Paulo`. É
// o vale do tráfego: nenhuma pelada em quadra, nenhum relay subindo clipe,
// nenhum parceiro no painel. Um `DeleteObjects` de 1.000 chaves no meio da
// noite não disputa nada com o `upload-url` de um lance recém-gravado.
//
// O horário de verão foi abolido em 2019 mas é reversível por decreto: se
// voltar, este cron roda às 05:00 locais por alguns meses. É aceitável — o que
// não seria aceitável é derivar o horário de uma variável e descobrir o erro
// num dia em que o job rodou às 20h.
//
// ─── AUTENTICAÇÃO: A MESMA DO RESUMO SEMANAL ───────────────────────────────
//
// `Authorization: Bearer $CRON_SECRET`. Sem o segredo configurado a rota RECUSA
// em produção — e aqui isso pesa mais que no resumo: uma rota de APAGAR VÍDEO
// aberta na internet é um botão de destruição de acervo. Em desenvolvimento ela
// roda solta, para dar para testar.
//
// ─── A ORDEM DAS CAMADAS É A DA RETENÇÃO, NÃO A DO TAKEDOWN ────────────────
//
// `docs/legal/fluxo-remocao.md` §7: aqui o OBJETO vai primeiro e a LINHA
// depois. Órfão de registro é recuperável — a linha ainda diz onde o objeto
// estava. Órfão de objeto cresce para sempre sem ninguém ver, e é ele que vira
// a conta do S3 e o vídeo que sobreviveu à Política de Privacidade.
//
// O takedown do painel faz o contrário (linha primeiro, para o vídeo sair do ar
// em segundos enquanto o SLA corre). Os dois convergem aqui: um takedown cujo
// `DeleteObjects` falhou fica com `deleted_at` preenchido e `purged_at` nulo, e
// esta passada o recolhe na madrugada seguinte — mantendo o `deleted_reason`
// original, que é a prova de por que aquele vídeo saiu do ar.
//
// ─── A REDE DE SEGURANÇA DO S3, E O QUE ELA NÃO COBRE ──────────────────────
//
// O bucket `replayja-clips` tem regra de ciclo de vida com expiração em 100
// dias. Ela existe para o dia em que este job estiver quebrado e para o objeto
// órfão que nunca teve linha no banco. Ela NÃO cumpre a promessa de 90 dias
// (100 > 90), não sabe de `pinned` (um clipe baixado vale 180 dias e ela o
// apagaria antes da hora se fosse apertada para 90) e não invalida o
// CloudFront. Prazo é deste job; rede é do lifecycle. As duas coisas, e nesta
// ordem.

/**
 * Teto por passada.
 *
 * 500 clipes × até 5 objetos = 2.500 chaves, que cabem em 3 chamadas de
 * `DeleteObjects`. Com uma arena de 200 clipes/dia, uma passada diária drena
 * dois dias e meio de acúmulo — folga suficiente para o job ficar dois dias
 * fora do ar sem virar backlog permanente.
 */
const TETO_POR_PASSADA = 500;

/**
 * Teto de caminhos por invalidação do CloudFront.
 *
 * As 1.000 primeiras invalidações do mês são gratuitas e **cada caminho conta
 * uma**. Invalidar arquivo por arquivo num expurgo de 500 clipes gastaria a
 * cota inteira numa noite. Por isso o pedido vai por PREFIXO
 * (`/clips/<partner>/<court>/<data>/<clipId>/*`): um caminho por clipe em vez
 * de cinco, e ainda alcança o que quer que tenha sido gravado sob aquela pasta.
 */
const TETO_DE_INVALIDACOES = 300;

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV === "development";
  return req.headers.get("authorization") === `Bearer ${segredo}`;
}

/**
 * O prefixo do clipe no bucket — a pasta inteira dele.
 *
 * Espelha `chaveDeClipe` (`lib/storage.ts`), que monta
 * `clips/<partner>/<court>/<AAAA-MM-DD>/<clipId>/<arquivo>`. Derivamos o
 * prefixo da PRÓPRIA CHAVE gravada no banco, e não remontamos a partir de
 * `triggered_at`: a data no caminho é a data LOCAL DA ARENA, e recalculá-la
 * aqui erraria por um dia em todo lance depois das 21h de São Paulo — que é o
 * horário de pico da pelada.
 */
export function prefixoDoClipe(c: ClipeParaExpurgoRow): string | null {
  const qualquer =
    c.watermarked_object_key ??
    c.source_object_key ??
    c.preview_object_key ??
    c.thumbnail_object_key ??
    c.og_object_key;
  if (!qualquer) return null;
  const corte = qualquer.lastIndexOf("/");
  return corte <= 0 ? null : qualquer.slice(0, corte);
}

export const GET = withRoute("/api/cron/purge-clips", async (req: NextRequest) => {
  if (!autorizado(req)) throw semPermissao();

  if (!dbConfigured()) {
    return NextResponse.json(
      { clipes: 0, objetos: 0, motivo: "sem-banco" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const lote = await clipesVencidosParaExpurgo(TETO_POR_PASSADA);
  if (lote.length === 0) {
    return NextResponse.json(
      { clipes: 0, objetos: 0, marcados: 0, pendentes: 0, motivo: "nada-a-fazer" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Sem storage configurado o job PARA, e não marca nada. Marcar `purged_at`
  // sem ter apagado byte nenhum seria mentir na única coluna que responde "os
  // bytes ainda existem?" — e a mentira sairia da varredura para sempre.
  if (!storageConfigurado()) {
    const fila = await contarClipesVencidos();
    return NextResponse.json(
      { clipes: 0, objetos: 0, marcados: 0, pendentes: fila.pendentes, motivo: "sem-storage" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const bucketPublico = storageConfig().bucketPublico;

  // ── camada 3: os objetos, agrupados por bucket ───────────────────────────
  //
  // Privado e público são dois buckets e duas chamadas. Thumbnail e OG vivem no
  // PÚBLICO (a exceção consciente de `api/README.md` §3) — são as duas
  // superfícies que o crawler do WhatsApp lê sem sessão, e por isso as que mais
  // precisam sumir.
  const porBucket = new Map<string, string[]>();
  const prefixos: string[] = [];
  const acrescentar = (bucket: string, chaves: string[]) => {
    if (chaves.length === 0) return;
    porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), ...chaves]);
  };

  for (const c of lote) {
    acrescentar(
      c.storage_bucket,
      [c.watermarked_object_key, c.source_object_key, c.preview_object_key].filter(
        (k): k is string => Boolean(k),
      ),
    );
    acrescentar(
      bucketPublico,
      [c.thumbnail_object_key, c.og_object_key].filter((k): k is string => Boolean(k)),
    );
    const prefixo = prefixoDoClipe(c);
    if (prefixo) prefixos.push(`/${prefixo}/*`);
  }

  let objetos = 0;
  const erros: string[] = [];
  for (const [bucket, chaves] of porBucket) {
    try {
      objetos += await apagarObjetos(bucket, chaves);
    } catch (err) {
      erros.push(`${bucket}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Um bucket falhou. Não marcamos NADA: `purged_at` é a promessa de que os
  // bytes sumiram, e meia promessa é pior que nenhuma — o clipe sairia da
  // varredura com o MP4 ainda no ar. A próxima passada pega o mesmo lote, que é
  // exatamente o que se espera de um job idempotente.
  if (erros.length > 0) {
    console.error("[expurgo] objetos não apagados:", erros.join(" · "));
    const fila = await contarClipesVencidos();
    return NextResponse.json(
      {
        clipes: 0,
        objetos,
        marcados: 0,
        pendentes: fila.pendentes,
        erros,
        motivo: "storage-falhou",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── camada 4: o cache de borda ───────────────────────────────────────────
  //
  // Apagar do S3 NÃO tira o vídeo do ar: o CloudFront continua servindo a cópia
  // em cache até o TTL vencer. A invalidação é assíncrona (minutos) e precisa
  // alcançar PoPs fora do Brasil — é a camada mais lenta das seis. Ela NÃO pode
  // derrubar o expurgo: o objeto já não existe na origem, então o pior caso é
  // uma borda servindo bytes que morrem no próximo TTL.
  let cacheInvalidado = false;
  try {
    cacheInvalidado = await invalidarCache(prefixos.slice(0, TETO_DE_INVALIDACOES));
  } catch (err) {
    console.error("[expurgo] CloudFront não invalidou:", err);
  }

  // ── camada 1: a linha, por último ────────────────────────────────────────
  //
  // Em dois grupos, porque o motivo é diferente e não pode ser sobrescrito: o
  // takedown já escreveu `takedown <protocolo>` em `deleted_reason`, e trocar
  // isso por `'expirado'` apagaria a única prova de por que aquele vídeo saiu.
  const porRetencao = lote.filter((c) => c.por_retencao).map((c) => c.id);
  const porTakedown = lote.filter((c) => !c.por_retencao).map((c) => c.id);

  const marcados =
    (await marcarClipesExpurgados(porRetencao, "expirado")) +
    (await marcarClipesExpurgados(porTakedown, "takedown"));

  const fila = await contarClipesVencidos();

  // O log é o que permite responder "quando este vídeo saiu do S3?" a um
  // titular de dados, meses depois, sem Sentry.
  console.log(
    `[expurgo] ${marcados} clipes · ${objetos} objetos · ${prefixos.length} prefixos · ` +
      `retenção ${porRetencao.length} · takedown ${porTakedown.length} · ` +
      `fila restante ${fila.pendentes}`,
  );

  return NextResponse.json(
    {
      clipes: marcados,
      objetos,
      marcados,
      por_retencao: porRetencao.length,
      por_takedown: porTakedown.length,
      invalidacoes: Math.min(prefixos.length, TETO_DE_INVALIDACOES),
      cdn: { pedido: cacheInvalidado, assincrono: true },
      pendentes: fila.pendentes,
      mais_antigo: fila.mais_antigo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});

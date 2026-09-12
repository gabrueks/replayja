import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button, Player, ShareBar } from "@/components/ui";
import { thumbnailPublica } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { diaRelativoNaArena, duracaoFormatada, horaNaArena } from "@/lib/fuso";
import { URL_PLAY_SEGUNDOS } from "@/lib/limites";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { cloudfrontConfigurado, urlDeEntrega } from "@/lib/storage";
import { capaDoClipe, clipePorId, registrarVisualizacaoDoClipe } from "@/db/queries/clipe";
import css from "./clipe.module.css";

// `/[arenaSlug]/c/[clipId]` — O PLAYER DO LANCE.
//
// ─── LOGIN OBRIGATÓRIO, INCLUSIVE POR LINK DIRETO ──────────────────────────
//
// `clipePorId` chama `exigirLogin` — não existe caminho de leitura de clipe sem
// sessão (`db/queries/clipe.ts`). A proteção do produto não vem de restringir
// QUEM vê (não há forma confiável de saber de quem é o lance: um clipe de 22 s
// tem 10 a 20 pessoas em quadra, e reconhecimento facial é dado biométrico
// sensível sob a LGPD art. 11). Vem de restringir QUANTO se pode varrer, exigir
// identificação de quem viu e responder rápido a pedido de remoção.
//
// ─── A URL DO VÍDEO É ASSINADA E CURTA (6 h) ───────────────────────────────
//
// O MP4 nunca é servido pelo nosso domínio: sai do CloudFront com uma assinatura
// de validade curta. Um arquivo colado num fórum morre no mesmo dia, e essa
// validade é metade da defesa de privacidade do produto — a outra metade é
// exigir login para chegar até aqui.
//
// ─── POR QUE O `download` DA `ShareBar` APONTA PARA UMA ROTA NOSSA ─────────
//
// `<a download>` só funciona em MESMA ORIGEM. Apontar direto para o CloudFront
// faria o navegador NAVEGAR para o vídeo em vez de baixá-lo (pendência §11 do
// design system). `GET /api/clips/{id}/download` resolve isso redirecionando
// para uma URL assinada de 15 min com `response-content-disposition=attachment`.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ arenaSlug: string; clipId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { arenaSlug, clipId } = await params;

  // O `generateMetadata` roda para o CRAWLER, que não tem sessão — então usa
  // `capaDoClipe`, que devolve APENAS a chave da thumbnail (bucket público) e
  // nada mais. O texto é genérico de propósito: nunca dizemos "gol do Gabriel
  // às 20:47" num preview que qualquer um vê.
  const capa =
    dbConfigured() && UUID.test(clipId) && ehSlugDeArena(arenaSlug)
      ? await capaDoClipe(clipId)
      : null;
  const thumb =
    capa && capa.partner_slug === arenaSlug
      ? thumbnailPublica(capa.thumbnail_object_key)
      : null;

  return {
    title: "Lance",
    description: "Assista e compartilhe este lance no Replay já.",
    // NUNCA indexado: leva a um vídeo específico (`api/README.md` §3).
    robots: { index: false, follow: false },
    openGraph: {
      type: "video.other",
      title: "Um lance no Replay já",
      description: "Entre para assistir, baixar e mandar no grupo.",
      locale: "pt_BR",
      ...(thumb ? { images: [{ url: thumb, width: 1280, height: 720 }] } : {}),
    },
  };
}

export default async function PaginaDoClipe({ params }: Props) {
  const { arenaSlug, clipId } = await params;
  if (!ehSlugDeArena(arenaSlug) || !UUID.test(clipId)) notFound();

  const caminho = `/${arenaSlug}/c/${clipId}`;
  const sessao = await getSession();
  // O middleware não cobre `/[arenaSlug]/…` (lá a maior parte é pública), então
  // o gate de navegação é aqui — e a consulta confere de novo, por baixo.
  if (!sessao) redirect(`/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`);
  if (!dbConfigured()) notFound();

  const clipe = await clipePorId(sessao, clipId);
  if (!clipe) notFound();

  // O clipe existe, mas é de OUTRA arena: 404, não redirect. A URL errada não
  // deve confirmar que o id existe em algum lugar.
  if (clipe.partner_slug !== arenaSlug) notFound();

  const fuso = clipe.partner_timezone;
  const quando = new Date(clipe.triggered_at);
  const horario = horaNaArena(quando, fuso);
  const dia = diaRelativoNaArena(quando, fuso);

  const chave = clipe.watermarked_object_key;
  const src =
    chave && cloudfrontConfigurado() ? urlDeEntrega(chave, URL_PLAY_SEGUNDOS) : null;
  const poster = thumbnailPublica(clipe.thumbnail_object_key);

  // Não bloqueia a renderização: o contador é métrica, o vídeo é o produto.
  void registrarVisualizacaoDoClipe(sessao, clipId);

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://replayja.vercel.app";
  const nomeDoArquivo = `${arenaSlug}-${horario.replace(":", "h")}.mp4`;

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.topo}>
        <Link className={css.voltar} href={`/${arenaSlug}`}>
          {clipe.partner_display_name}
        </Link>
        <Button
          href={`/app/buscar?arena=${arenaSlug}`}
          variante="fantasma"
          tamanho={44}
          icone={<Search size={16} />}
        >
          Buscar mais
        </Button>
      </header>

      <Player
        src={src}
        poster={poster}
        horario={horario}
        contexto={`${clipe.court_name} · ${dia}`}
        duracao={duracaoFormatada(clipe.duration_seconds)}
        // A marca já vem QUEIMADA no arquivo quando o relay aplicou o passe de
        // marca d'água; desenhar o overlay por cima duplicaria a logo na tela.
        marcaQueimada={clipe.watermark_applied}
      >
        <ShareBar
          url={`${base}${caminho}`}
          titulo={`Lance das ${horario} — ${clipe.court_name}`}
          texto={`Olha esse lance das ${horario} na ${clipe.court_name}:`}
          urlDoArquivo={src ? `/api/clips/${clipId}/download` : null}
          nomeDoArquivo={nomeDoArquivo}
          nota={
            clipe.status === "partial"
              ? "Este lance saiu mais curto que o normal: a câmera teve uma lacuna na gravação."
              : "O link pede login para assistir. O arquivo baixado sai com a marca da arena."
          }
        />
      </Player>

      {!src ? (
        <p className={css.aviso}>
          {chave
            ? "A entrega de vídeo ainda não está configurada neste ambiente (CloudFront)."
            : "O arquivo deste lance ainda não chegou ao armazenamento. Atualize em alguns segundos."}
        </p>
      ) : null}
    </main>
  );
}

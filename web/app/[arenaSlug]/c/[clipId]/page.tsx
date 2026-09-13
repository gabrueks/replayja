import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button, EmptyState, Player, ShareBar, Voltar } from "@/components/ui";
import { thumbnailPublica } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { dataCompletaNaArena, diaRelativoNaArena } from "@/lib/datas";
import { duracaoFormatada, horaNaArena } from "@/lib/fuso";
import { URL_PLAY_SEGUNDOS } from "@/lib/limites";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { cloudfrontConfigurado, urlDeEntrega } from "@/lib/storage";
import {
  capaDoClipe,
  clipePorId,
  clipeSumido,
  registrarVisualizacaoDoClipe,
} from "@/db/queries/clipe";
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

/*
 * O PLAYER É ESCURO, E A BARRA DO SISTEMA TAMBÉM.
 *
 * `themeColor` por rota: sem isso o Android desenha a barra de status em
 * `#F6F3EF` por cima de uma tela `#0F1419`, e a emenda é a primeira coisa que
 * denuncia "isto é um site dentro de um navegador".
 */
export const viewport: Viewport = { themeColor: "#0F1419" };

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
  /*
    O LANCE QUE EXISTIU E SAIU DO AR — a metade de UX da decisão D-4 do QA.

    `clipePorId` é cega para o clipe fora da retenção, e tem de ser: qualquer
    caminho que ainda projete chave de objeto, quadra ou horário de um clipe
    vencido é um vazamento com outro nome. Então ela volta vazia, e só AQUI, no
    caminho de erro, a página pergunta se aquele id um dia existiu.

    A resposta importa porque este link mora no WhatsApp da turma. Uma 404 diz "o
    Replay já perdeu o meu gol"; esta tela diz "ele foi gravado em 12 de agosto e
    saiu do ar depois de 90 dias, como está na Política de Privacidade". A
    primeira queima confiança, a segunda a constrói — e a política está cumprida
    nas duas.

    Quem chega aqui já tinha o link do clipe, então dizer a DATA não conta nada
    novo. Quadra, duração e chave de objeto continuam fora.
  */
  if (!clipe) {
    const sumido = await clipeSumido(sessao, clipId);
    if (sumido) return <LanceForaDoAr quando={sumido.triggered_at} fuso={sumido.partner_timezone} arenaSlug={arenaSlug} />;
    notFound();
  }

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
    <main className={`${css.pagina} noite`} id="conteudo">
      {/*
        O topo do player é um X à esquerda e o menu à direita — o chassi de uma
        tela IMERSIVA, não o cabeçalho de uma página. A barra inferior de abas
        não aparece aqui (o layout `/app` não envolve esta rota), e é de
        propósito: navegação no pé de um vídeo é convite para sair no meio do
        lance. É justamente por ela não estar aqui que o × TEM de funcionar.

        E ele mandava para `/${arenaSlug}` — um destino fixo, e não o lugar de
        onde a pessoa veio. Quem chegou ao lance pela busca era despejado na
        página pública da arena, que não tinha barra inferior: o beco sem saída
        do bug 2. `Voltar` volta no histórico quando há tela nossa atrás, e cai
        na BUSCA DA ARENA (e não na página pública) quando a pessoa abriu o link
        direto do WhatsApp — ela veio ver um lance, e a busca é o lugar onde há
        mais lances.
      */}
      <header className={css.topo}>
        <Voltar
          para={`/app/buscar?arena=${arenaSlug}`}
          rotulo="Fechar o lance"
          icone="fechar"
          tom="escuro"
        />
        <span className={css.tituloTopo}>
          <span className={css.arena}>{clipe.partner_display_name}</span>
          <span className={css.quadra}>{clipe.court_name}</span>
        </span>
        {/*
          O ÍCONE PASSA A DIZER O QUE FAZ (UX-4 do README §13).

          Eram três pontos verticais — o glifo universal de "mais opções" — num
          link que abre a BUSCA da arena. Quem toca espera um menu (baixar,
          remover, denunciar) e recebe uma troca de tela; quem quer buscar não
          toca, porque três pontos não parecem busca. O ícone errado é pior que
          ícone nenhum: ele promete.

          Uma lupa promete a coisa certa, e o `aria-label` já estava correto — era
          só o desenho que mentia.
        */}
        <Link
          className={css.redondo}
          href={`/app/buscar?arena=${arenaSlug}`}
          aria-label="Buscar outros lances nesta arena"
        >
          <Search size={19} aria-hidden="true" />
        </Link>
      </header>

      <Player
        src={src}
        poster={poster}
        horario={horario}
        dia={dia}
        contexto={`${clipe.court_name} · ${duracaoFormatada(clipe.duration_seconds)}`}
        duracao={duracaoFormatada(clipe.duration_seconds)}
        arena={clipe.partner_display_name}
        // A marca já vem QUEIMADA no arquivo quando o relay aplicou o passe de
        // marca d'água; desenhar o overlay por cima duplicaria a logo na tela.
        marcaQueimada={clipe.watermark_applied}
      >
        <ShareBar
          url={`${base}${caminho}`}
          titulo={`Lance das ${horario} — ${clipe.court_name}`}
          texto={`Olha esse lance das ${horario} na ${clipe.court_name}:`}
          chamada="Achou o golaço? Manda pro grupo."
          urlDoArquivo={src ? `/api/clips/${clipId}/download` : null}
          nomeDoArquivo={nomeDoArquivo}
          nota={
            clipe.status === "partial"
              ? "Este lance saiu mais curto que o normal: a câmera teve uma lacuna na gravação."
              : `Vai em alta, com a marca da ${clipe.partner_display_name} no canto.`
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

/**
 * "Este lance saiu do ar" — a tela do clipe fora da retenção de 90 dias.
 *
 * Ela NÃO é a 404, e essa é a diferença toda (decisão D-4 do relatório de QA). O
 * catálogo de `lib/problem.ts` já declarava `clip-expired` com status 410 —
 * "existiu, e não existe mais" — e ninguém o lançava: o clipe vencido caía no
 * mesmo 404 de um id inventado.
 *
 * O 410 da API é do outro lado; esta é a tela. As duas dizem a mesma coisa, e a
 * frase é a que o produto pode defender numa conversa com a arena: a política de
 * privacidade promete 90 dias, e cumprir a promessa é o motivo de o vídeo não
 * estar mais aqui.
 */
function LanceForaDoAr({
  quando,
  fuso,
  arenaSlug,
}: {
  quando: Date;
  fuso: string;
  arenaSlug: string;
}) {
  return (
    <main className={`${css.pagina} noite`} id="conteudo">
      <header className={css.topo}>
        <Voltar para={`/${arenaSlug}`} rotulo="Fechar" icone="fechar" tom="escuro" />
      </header>

      <div className={css.foraDoAr}>
        <EmptyState
          ilustracao="camera"
          titulo="Este lance saiu do ar."
          descricao={`Ele foi gravado em ${dataCompletaNaArena(quando, fuso)} e ficou disponível por 90 dias, que é o prazo da nossa Política de Privacidade. Depois disso o vídeo é apagado de verdade — não fica guardado em lugar nenhum.`}
          acoes={
            <Button href={`/app/buscar?arena=${arenaSlug}`} tamanho={56} largura="total">
              Achar outro lance
            </Button>
          }
          nota={
            <>
              Lance baixado ou compartilhado ganha prazo maior. Se este era o golaço,{" "}
              <Link href="/privacidade">a política explica por quê</Link>.
            </>
          }
        />
      </div>
    </main>
  );
}

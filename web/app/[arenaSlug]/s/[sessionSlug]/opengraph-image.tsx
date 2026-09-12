import { imagemDeCapa, TAMANHO_OG, TIPO_OG } from "@/components/og";
import { dbConfigured } from "@/lib/db";
import { ehSlugDeArena, parseSessionSlug } from "@/lib/slug";
import { parceiroPublicoPorSlug } from "@/db/queries/parceiro";

/**
 * A capa do link da SESSÃO — o que aparece quando alguém joga
 * `/arena/s/2026-09-08-20h-21h` no grupo do WhatsApp.
 *
 * A arte mostra data e janela, NUNCA thumbnail: a página da sessão é `noindex` e
 * leva a vídeos específicos, e uma prévia com imagem de pessoa no WhatsApp
 * contornaria o próprio gate de login.
 */

export const alt = "Sessão no Replay já";
export const size = TAMANHO_OG;
export const contentType = TIPO_OG;
export const revalidate = 86_400;

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dataPorExtenso(iso: string): string {
  // `T12:00` evita o clássico "um dia a menos" de `new Date('2026-09-08')`, que é
  // interpretado em UTC e volta para o dia 7 em qualquer fuso negativo.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DIAS[d.getDay()] ?? ""}, ${d.getDate()} de ${MESES[d.getMonth()] ?? ""}`;
}

export default async function Imagem({
  params,
}: {
  params: Promise<{ arenaSlug: string; sessionSlug: string }>;
}) {
  const { arenaSlug, sessionSlug } = await params;
  const janela = parseSessionSlug(sessionSlug);

  const parceiro =
    dbConfigured() && ehSlugDeArena(arenaSlug) ? await parceiroPublicoPorSlug(arenaSlug) : null;

  return imagemDeCapa({
    arena: parceiro?.display_name ?? arenaSlug,
    titulo: janela ? dataPorExtenso(janela.localDate) : "Sessão",
    linha: janela ? `${janela.startTime} às ${janela.endTime}` : undefined,
    selo: "SESSÃO",
  });
}

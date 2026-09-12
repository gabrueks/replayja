import { imagemDeCapa, TAMANHO_OG, TIPO_OG } from "@/components/og";
import { dbConfigured } from "@/lib/db";
import { ehSlugDeArena } from "@/lib/slug";
import { parceiroPublicoPorSlug } from "@/db/queries/parceiro";

/**
 * A capa do link da arena no WhatsApp e no Instagram.
 *
 * Só entra em cena quando a arena NÃO enviou a própria arte: se
 * `og_image_object_key` existe, `generateMetadata` declara `openGraph.images` e o
 * Next ignora esta rota (metadata explícito vence a convenção de arquivo).
 *
 * Um dia de cache: o crawler bate uma vez por link e o resto sai da borda.
 */

export const alt = "Página da arena no Replay já";
export const size = TAMANHO_OG;
export const contentType = TIPO_OG;
export const revalidate = 86_400;

export default async function Imagem({ params }: { params: Promise<{ arenaSlug: string }> }) {
  const { arenaSlug } = await params;

  const parceiro =
    dbConfigured() && ehSlugDeArena(arenaSlug) ? await parceiroPublicoPorSlug(arenaSlug) : null;

  const nome = parceiro?.display_name ?? "Sua arena";
  const local = [parceiro?.city, parceiro?.state].filter(Boolean).join(" · ");

  return imagemDeCapa({
    arena: "Arena parceira",
    titulo: nome,
    linha: local || "Os lances da pelada, gravados e prontos pra compartilhar.",
  });
}

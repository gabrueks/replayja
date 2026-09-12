import { imagemDeCapa, TAMANHO_OG, TIPO_OG } from "@/components/og";
import { dbConfigured } from "@/lib/db";
import { ehSlugDeArena, ehSlugDeGrupo } from "@/lib/slug";
import { grupoPorSlug } from "@/db/queries/grupo";

/**
 * A capa do link do GRUPO — o convite que roda no WhatsApp da pelada.
 *
 * ─── SEM SESSÃO, DE PROPÓSITO ──────────────────────────────────────────────
 *
 * O crawler do WhatsApp não tem cookie. `grupoPorSlug(null, ...)` é a mesma
 * chamada que `generateMetadata` faz: grupo `private` volta `null` e a arte cai
 * no genérico, sem revelar nome nem horário de um grupo fechado.
 */

export const alt = "Grupo no Replay já";
export const size = TAMANHO_OG;
export const contentType = TIPO_OG;
export const revalidate = 86_400;

const DIAS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export default async function Imagem({
  params,
}: {
  params: Promise<{ arenaSlug: string; groupSlug: string }>;
}) {
  const { arenaSlug, groupSlug } = await params;

  const grupo =
    dbConfigured() && ehSlugDeArena(arenaSlug) && ehSlugDeGrupo(groupSlug)
      ? await grupoPorSlug(null, arenaSlug, groupSlug)
      : null;

  if (!grupo) {
    return imagemDeCapa({
      arena: "Replay já",
      titulo: "Grupo da pelada",
      linha: "Os lances de toda semana, no mesmo link.",
      selo: "GRUPO",
    });
  }

  const dias = grupo.weekdays.map((d) => DIAS[d] ?? "").filter(Boolean).join(", ");

  return imagemDeCapa({
    arena: grupo.partner_display_name,
    titulo: grupo.name,
    linha: `${dias} · ${grupo.start_time.slice(0, 5)}–${grupo.end_time.slice(0, 5)}`,
    selo: "GRUPO",
  });
}

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { dbConfigured } from "@/lib/db";
import { ehSlugDeArena, ehSlugDeGrupo } from "@/lib/slug";
import { grupoPorSlug } from "@/db/queries/grupo";

type Props = { children: ReactNode; params: Promise<{ arenaSlug: string; groupSlug: string }> };

/**
 * Mesmo motivo do layout da arena: o `loading.tsx` deste segmento transmite a
 * página em streaming, e um `notFound()` dentro dela já não muda o status.
 * Aqui, fora do boundary, grupo inexistente responde 404 de verdade. A leitura é
 * a pública (sessão nula): existência não depende de quem olha.
 */
export default async function LayoutDoGrupo({ children, params }: Props) {
  const { arenaSlug, groupSlug } = await params;
  if (!ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) notFound();
  if (dbConfigured()) {
    const grupo = await grupoPorSlug(null, arenaSlug, groupSlug);
    if (!grupo) notFound();
  }
  return children;
}

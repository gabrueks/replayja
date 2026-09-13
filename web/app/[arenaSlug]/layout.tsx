import type { ReactNode } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { dbConfigured } from "@/lib/db";
import { ehSlugDeArena } from "@/lib/slug";
import { parceiroPorAlias, parceiroPublicoPorSlug } from "@/db/queries/parceiro";

type Props = { children: ReactNode; params: Promise<{ arenaSlug: string }> };

/**
 * Existência da arena decidida ANTES do `loading.tsx` do segmento.
 *
 * Com o esqueleto de carregamento, a página passou a ser transmitida em
 * streaming: o `notFound()` dentro dela chega DEPOIS de os cabeçalhos terem
 * saído, e uma arena inexistente respondia **200** com a tela de "não
 * encontrada" — errado para o navegador, para o crawler e para quem confia no
 * status (o QA mede 404). O layout renderiza fora do boundary de `loading`, então
 * aqui o status ainda é nosso. O alias antigo continua virando 308 permanente.
 *
 * Sem banco configurado (preview novo) não decide nada: a página trata.
 */
export default async function LayoutDaArena({ children, params }: Props) {
  const { arenaSlug } = await params;
  if (!ehSlugDeArena(arenaSlug)) notFound();
  if (dbConfigured()) {
    const parceiro = await parceiroPublicoPorSlug(arenaSlug);
    if (!parceiro) {
      const alias = await parceiroPorAlias(arenaSlug);
      if (alias) permanentRedirect(`/${alias.slug}`);
      notFound();
    }
  }
  return children;
}

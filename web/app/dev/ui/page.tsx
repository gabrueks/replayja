import { notFound } from "next/navigation";
import Catalogo from "./Catalogo";

/**
 * `/dev/ui` — o catálogo visual do design system.
 *
 * ─── POR QUE NÃO STORYBOOK ─────────────────────────────────────────────────
 *
 * Storybook seria mais uma build, mais um servidor, mais um conjunto de
 * dependências (e de CVEs) para manter — num app que tem ~20 componentes e um
 * único tema. Uma rota do próprio Next renderiza os componentes NO AMBIENTE
 * REAL: mesmas fontes, mesmos tokens, mesmo React Server Components, mesmo
 * bundler. O que se vê aqui é o que a tela vai mostrar, não uma aproximação.
 *
 * ─── O GATE ────────────────────────────────────────────────────────────────
 *
 * Em produção a rota simplesmente NÃO EXISTE (404, não 403): um catálogo é
 * superfície de ataque de reconhecimento e não tem por que anunciar que existe.
 * `NODE_ENV` é avaliado no build, então o Next remove a página do bundle de
 * produção junto.
 *
 * `dev` já está em `lib/reserved-slugs.ts`, então nenhuma arena pode roubar esta
 * rota do catch-all da raiz.
 */

export const metadata = {
  title: "Catálogo de UI",
  robots: { index: false, follow: false },
};

export default function PaginaDoCatalogo() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Catalogo />;
}

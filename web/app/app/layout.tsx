import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
import css from "./app.module.css";

// Área logada do atleta.
//
// O middleware já redireciona quem não tem cookie — mas ESTE layout confere de
// novo, e de propósito: o middleware é conveniência de navegação, não
// autorização. Um dia alguém muda o `matcher` e só esta linha segura a porta.
//
// ─── A NAVEGAÇÃO FICA EM BAIXO NO CELULAR ──────────────────────────────────
//
// Buscar / Grupos / Sair é uma barra fixa no rodapé abaixo de 640px e volta para
// o topo no desktop. O produto é usado com uma mão só, de pé: o topo da tela de
// um celular de 6,7" não é alcançável com o polegar.

export default async function LayoutDoApp({ children }: { children: React.ReactNode }) {
  const sessao = await getSession();
  if (!sessao) redirect("/entrar?redirectTo=/app");

  return (
    <div className={css.moldura}>
      <header className={css.topo}>
        <Link href="/app" aria-label="Replay já — início">
          <Logo />
        </Link>
        <Link className={css.sair} href="/sair">
          Sair
        </Link>
      </header>

      {children}

      {/*
        A navegação NÃO tem mais um "Buscar" solto. A busca só existe dentro de
        uma arena (`/app/buscar?arena=…`) e um atalho que a abrisse sem arena
        teria de adivinhar uma — que é exatamente o defeito de fluxo que esta
        task corrigiu. Quem quer buscar passa por "Arenas", que é o passo 1 do
        PRD ("Arena/parceiro → horário → vídeos").
      */}
      <nav className={css.barra} aria-label="Navegação principal">
        <Link className={css.item} href="/app">
          Arenas
        </Link>
        <Link className={css.item} href="/app/grupos">
          Grupos
        </Link>
      </nav>
    </div>
  );
}

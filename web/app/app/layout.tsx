import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav, Logo } from "@/components/ui";
import { iniciais } from "@/components/ui/MemberAvatars";
import { getSession } from "@/lib/session";
import css from "./app.module.css";

// Área logada do atleta.
//
// O middleware já redireciona quem não tem cookie — mas ESTE layout confere de
// novo, e de propósito: o middleware é conveniência de navegação, não
// autorização. Um dia alguém muda o `matcher` e só esta linha segura a porta.
//
// ─── O CHASSI ──────────────────────────────────────────────────────────────
//
// Cabeçalho curto (marca + avatar) e a BARRA DE QUATRO ABAS no rodapé. A v1
// tinha dois links de texto soltos numa barra sem ícone e sem estado ativo — o
// que não é navegação, é um menu. A barra some no botão virtual, que é tela de
// uma ação só.
//
// A reserva de espaço para a barra é da PRÓPRIA barra (`RodapeFixo`), e não
// mais de uma classe global aplicada aqui na moldura. Além de não ter como ser
// derrubada por um `padding` de módulo, ela some junto com a barra: em
// `/app/botao` a navegação não é renderizada, e antes a moldura continuava
// reservando 76px mortos no pé daquela tela.

export default async function LayoutDoApp({ children }: { children: React.ReactNode }) {
  const sessao = await getSession();
  if (!sessao) redirect("/entrar?redirectTo=/app");

  return (
    <div className={css.moldura}>
      <header className={css.topo}>
        <Link href="/app" aria-label="Replay já — início">
          <Logo tamanho={34} />
        </Link>
        {/*
          O avatar é o atalho para o perfil e o único lugar em que o e-mail
          aparece no chrome. "Sair" saiu do cabeçalho: era o link mais visível de
          um app cujo objetivo é a pessoa ficar.
        */}
        <Link className={css.avatar} href="/app/perfil" aria-label="Seu perfil">
          {iniciais(sessao.email)}
        </Link>
      </header>

      {children}

      <BottomNav esconderEm={["/app/botao"]} />
    </div>
  );
}

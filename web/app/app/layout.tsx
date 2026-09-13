import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { getSession } from "@/lib/session";
import { CabecalhoDoApp } from "./CabecalhoDoApp";
import css from "./app.module.css";

// Área logada do atleta.
//
// O middleware já redireciona quem não tem cookie — mas ESTE layout confere de
// novo, e de propósito: o middleware é conveniência de navegação, não
// autorização. Um dia alguém muda o `matcher` e só esta linha segura a porta.
//
// ─── O CHASSI, E AS DUAS TELAS QUE NÃO O TÊM ───────────────────────────────
//
// Cabeçalho curto (marca + avatar) e a BARRA DE QUATRO ABAS no rodapé. A v1
// tinha dois links de texto soltos numa barra sem ícone e sem estado ativo — o
// que não é navegação, é um menu.
//
// As duas metades somem JUNTAS em `/app/botao`, e isso é a correção do achado
// P1-15: a barra já sumia lá (é tela de uma ação só, e uma navegação no pé de um
// botão de gravar é convite para sair no meio do lance), mas o cabeçalho claro
// continuava — então a tela-herói escura começava em y = 62px, com uma faixa
// `#F6F3EF` entre a barra de status (pintada de `#0F1419` pelo `themeColor` da
// rota) e o `.noite`. Exatamente a emenda que o `themeColor` por rota existe
// para evitar.
//
// A reserva de espaço para a barra é da PRÓPRIA barra (`RodapeFixo`), e não mais
// de uma classe global aplicada aqui na moldura. Além de não ter como ser
// derrubada por um `padding` de módulo, ela some junto com a barra: antes a
// moldura reservava 76px mortos no pé de `/app/botao`.

/** As rotas de `/app/**` que são tela de uma ação só, sem chassi nenhum. */
const SEM_CHASSI = ["/app/botao"];

export default async function LayoutDoApp({ children }: { children: React.ReactNode }) {
  const sessao = await getSession();
  if (!sessao) redirect("/entrar?redirectTo=/app");

  return (
    <div className={css.moldura}>
      <CabecalhoDoApp email={sessao.email} esconderEm={SEM_CHASSI} />

      {children}

      <BottomNav esconderEm={SEM_CHASSI} />
    </div>
  );
}

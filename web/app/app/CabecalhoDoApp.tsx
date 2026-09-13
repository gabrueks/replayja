"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";
import { TITULOS } from "@/lib/copy";
import { iniciais } from "@/components/ui/MemberAvatars";
import css from "./app.module.css";

/**
 * O cabeçalho curto da área logada — e a regra de quando ele NÃO aparece.
 *
 * ─── A EMENDA DE COR NO TOPO (achado P1-15) ────────────────────────────────
 *
 * `/app/botao` é uma tela-herói ESCURA, e ela declara `themeColor: "#0F1419"`
 * para que o Android pinte a barra de status junto — é o mecanismo que o
 * `design-system.md` §12.2 descreve para evitar a "emenda" que denuncia "isto é
 * um site dentro de um navegador".
 *
 * Só que este cabeçalho, claro, era renderizado para TODAS as rotas de
 * `/app/**`: o `.noite` começava em y = 62px, e acima dele ficava uma faixa
 * `#F6F3EF`. Ou seja, a barra de status escura, depois uma faixa clara, depois
 * a tela escura — exatamente a emenda que o `themeColor` por rota existe para
 * evitar, invertida e duas vezes mais visível.
 *
 * ─── POR QUE UM COMPONENTE DE CLIENTE ─────────────────────────────────────
 *
 * Porque a decisão depende da ROTA, e um layout de servidor não conhece o
 * `pathname` (ele é montado uma vez e reaproveitado pelas filhas). É o mesmo
 * mecanismo que a `BottomNav` já usa com `esconderEm`, e usar o mesmo é o que
 * mantém as duas metades do chassi sumindo JUNTAS: a barra já sumia aqui, e era
 * só o cabeçalho que insistia em ficar.
 *
 * O custo é um componente de cliente de ~1 KB no topo de `/app/**`. O `Logo` e
 * as iniciais continuam sendo desenho puro, sem estado.
 */

export type CabecalhoDoAppProps = {
  /** O e-mail da sessão — vira as iniciais do avatar. */
  email: string;
  /** Prefixos de rota em que o cabeçalho não aparece. */
  esconderEm?: string[];
};

export function CabecalhoDoApp({ email, esconderEm }: CabecalhoDoAppProps) {
  const caminho = usePathname() ?? "";
  const escondido = (esconderEm ?? []).some(
    (p) => caminho === p || caminho.startsWith(`${p}/`),
  );
  if (escondido) return null;

  return (
    <header className={css.topo}>
      <Link href="/app" aria-label="Replay já — início">
        <Logo tamanho={34} />
      </Link>
      {/*
        O avatar é o atalho para o perfil e o único lugar em que o e-mail aparece
        no chrome. "Sair" saiu do cabeçalho: era o link mais visível de um app
        cujo objetivo é a pessoa ficar.

        44px e não 36 (achado P2-30): ele estava na lista de alvos abaixo do
        mínimo, ao lado de alvos de 44+, e é o alvo que todo atleta usa para
        chegar ao perfil.
      */}
      <Link className={css.avatar} href="/app/perfil" aria-label={`${TITULOS.perfil} — seu perfil`}>
        {iniciais(email)}
      </Link>
    </header>
  );
}

export default CabecalhoDoApp;

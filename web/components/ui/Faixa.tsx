import type { ReactNode } from "react";
import css from "./Faixa.module.css";

/**
 * A FILEIRA ROLÁVEL — uma só, para as três do produto.
 *
 * ─── POR QUE ELA EXISTE (UX-6 do README §13) ───────────────────────────────
 *
 * O produto tem três fileiras que rolam na horizontal: os chips de atalho e de
 * quadra na busca (`ChipFaixa`), as arenas em `/app/lances` e as quadras no
 * botão virtual. As duas últimas não usam `ChipFaixa` por um bom motivo — elas
 * são LINKS (navegam, mudam a URL), e o `Chip` do design system é um
 * `aria-pressed`, que é o certo para filtro em memória e o errado para destino.
 *
 * A consequência foi que o mesmo CSS ficou COPIADO EM TRÊS ARQUIVOS — e foi por
 * isso que o bug 1 do teste em produção do fundador apareceu em três lugares de
 * uma vez: a faixa sangrava 20px para fora de um cartão com 14 de margem
 * interna, o primeiro chip nascia colado na borda da tela e o selecionado era
 * fatiado pela quina arredondada. Consertar em três arquivos é consertar duas
 * vezes e esquecer a terceira.
 *
 * Agora a MECÂNICA mora aqui — sangria, respiro da sombra, `scroll-padding`,
 * barra de rolagem escondida — e o CONTEÚDO continua sendo de quem chama: chips
 * com `aria-pressed` na busca, `<Link>` nas outras duas.
 *
 * ─── O RECUO É DO CONTAINER, E POR ISSO É UM TOKEN ─────────────────────────
 *
 * A faixa SANGRA para fora de quem a embala (é o que faz o quinto item parecer
 * continuar para além da tela em vez de terminar numa parede) e devolve o mesmo
 * tanto em `padding`, para que o PRIMEIRO item fique alinhado com o texto acima
 * dele. As duas medidas têm de ser a mesma, e ela é a margem interna de QUEM
 * EMBALA — não um 20 fixo. Quem embala declara `--faixa-recuo`; o padrão é a
 * margem da página.
 *
 * ─── E O RESPIRO VERTICAL É PARA A SOMBRA ─────────────────────────────────
 *
 * `overflow-x: auto` obriga o eixo vertical a `auto` também (regra do CSS: um
 * eixo `visible` ao lado de um `auto` vira `auto`), então NÃO EXISTE deixar a
 * sombra escapar da faixa — o que sobrar do padding é cortado.
 */

export type FaixaProps = {
  children: ReactNode;
  /**
   * O nome do grupo para o leitor de tela — "Arena", "Quadra", "Atalhos de
   * horário". Obrigatório: uma fileira sem nome é um punhado de links soltos.
   */
  rotulo: string;
  /**
   * `grupo` (padrão) para um conjunto de controles; `navegacao` quando os itens
   * são links que trocam de tela, que é o caso das arenas e das quadras.
   */
  papel?: "grupo" | "navegacao";
  /** `escura` sobre `.noite` — só muda a máscara de rolagem, não o conteúdo. */
  tom?: "clara" | "escura";
  className?: string;
};

export function Faixa({ children, rotulo, papel = "grupo", tom = "clara", className }: FaixaProps) {
  const comum = {
    className: [css.faixa, tom === "escura" ? css.escura : null, className]
      .filter(Boolean)
      .join(" "),
  };

  // `<nav>` quando os itens navegam e `role="group"` quando não: o leitor de
  // tela oferece atalho para landmarks de navegação, e uma lista de destinos
  // merece esse atalho.
  return papel === "navegacao" ? (
    <nav {...comum} aria-label={rotulo}>
      {children}
    </nav>
  ) : (
    <div {...comum} role="group" aria-label={rotulo}>
      {children}
    </div>
  );
}

export default Faixa;

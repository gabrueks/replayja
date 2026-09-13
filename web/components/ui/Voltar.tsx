"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import css from "./Voltar.module.css";

/**
 * A SAÍDA. Um só componente, uma só regra, em todas as telas.
 *
 * ─── O BUG QUE ELE CONSERTA ────────────────────────────────────────────────
 *
 * O "×" do player mandava para `/[arena]` — um destino FIXO, escolhido no
 * código, e não o lugar de onde a pessoa veio. Quem chegou ao lance pela busca
 * era despejado na página pública da arena, que (até esta rodada) não tinha
 * barra inferior: um beco. `/[arena]/grupos/novo` não tinha saída nenhuma, e o
 * voltar do grupo caía no mesmo beco. Foram os bugs 2, 3 e 6 do teste em
 * produção do fundador.
 *
 * ─── A REGRA ───────────────────────────────────────────────────────────────
 *
 * Se a pessoa navegou DENTRO do site, voltar é `router.back()` — que é o que ela
 * espera, preserva a posição de rolagem da tela anterior e não empilha uma
 * entrada nova no histórico. Se ela chegou de fora (o link do WhatsApp, que é
 * como metade do produto é aberto), `back()` a jogaria para FORA do site: aí o
 * destino é a tela de origem daquele conteúdo, passada em `para`.
 *
 * ─── COMO SE SABE SE HOUVE NAVEGAÇÃO NOSSA ─────────────────────────────────
 *
 * Não dá para perguntar ao navegador. `history.length` conta também a página
 * externa que trouxe a pessoa, e o App Router do Next — diferente do Pages
 * Router — não guarda índice nenhum em `history.state` (conferido: o estado é
 * `{__NA, __PRIVATE_NEXTJS_INTERNALS_TREE}`). `document.referrer` também não
 * serve sozinho: ele é fixado no CARREGAMENTO do documento e não muda em
 * navegação de cliente, então depois de dois toques dentro do app ele ainda
 * aponta para o WhatsApp.
 *
 * Então quem conta é o próprio app: `RegistroDeNavegacao` fica montado no layout
 * raiz e soma uma visita a cada mudança de rota. Duas ou mais visitas nesta aba
 * significam que existe uma tela NOSSA atrás. O referrer entra como segunda
 * pista, para o caso de uma navegação de documento inteiro dentro do site
 * (um `redirect` de servidor, por exemplo), em que o contador nasce em 1.
 *
 * ─── POR QUE `<a>` E NÃO `<button>` ────────────────────────────────────────
 *
 * Porque a saída tem de existir ANTES do JavaScript. Um `<button onClick>` numa
 * tela cujo bundle ainda não hidratou — o 4G da quadra — é um botão que não faz
 * nada, e o sintoma é exatamente o que o fundador relatou ("não há como sair").
 * Com `href`, o destino alternativo já funciona no HTML, o toque longo oferece
 * "abrir em nova aba" e o leitor de tela anuncia um link com destino. O
 * JavaScript só MELHORA: quando há histórico nosso, ele intercepta e volta.
 */

// ─── O CONTADOR DE VISITAS ────────────────────────────────────────────────
//
// Escopo de MÓDULO, e é isso que o faz funcionar: o módulo é instanciado uma vez
// por carregamento de documento e sobrevive a toda navegação de cliente. Um
// `useState` morreria a cada tela; um `sessionStorage` sobreviveria demais (a
// aba duplicada herdaria um histórico que ela não tem).

let visitas = 0;
let ultimoCaminho: string | null = null;

/**
 * Soma uma visita. Ignora a repetição do mesmo caminho — o React em modo
 * estrito monta o efeito duas vezes no desenvolvimento, e sem isto toda tela
 * nasceria achando que tem histórico atrás.
 */
export function registrarVisita(caminho: string): void {
  if (caminho === ultimoCaminho) return;
  ultimoCaminho = caminho;
  visitas += 1;
}

/** Quantas telas do site esta aba já mostrou. Exportada para o teste. */
export function visitasNoSite(): number {
  return visitas;
}

/** Zera o contador. Existe para o teste, e só. */
export function esquecerVisitas(): void {
  visitas = 0;
  ultimoCaminho = null;
}

export type DestinoDoVoltar = "historico" | "alternativa";

/**
 * A regra, isolada do DOM para poder ser testada nos dois casos que importam:
 * quem navegou aqui dentro e quem caiu de um link do WhatsApp.
 */
export function decidirVoltar(ctx: {
  /** `visitasNoSite()`. */
  visitas: number;
  /** `document.referrer`. */
  referencia?: string | null;
  /** `window.location.origin`. */
  origem?: string | null;
}): DestinoDoVoltar {
  if (ctx.visitas > 1) return "historico";

  const ref = ctx.referencia?.trim();
  if (ref && ctx.origem) {
    try {
      // Mesma origem: a entrada anterior do histórico é uma tela nossa, ainda
      // que o contador não a tenha visto (navegação de documento inteiro).
      if (new URL(ref).origin === ctx.origem) return "historico";
    } catch {
      // Referrer malformado é tratado como externo: errar para o lado do
      // destino explícito nunca tira a pessoa do site.
    }
  }

  return "alternativa";
}

/**
 * Fica montado no layout raiz e conta as telas. Não desenha nada.
 *
 * Ele mora no layout raiz, e não no de `/app`, porque as telas sem saída do
 * relato do fundador (player, grupo, criar grupo) vivem FORA de `/app` — contar
 * só a área logada deixaria justamente elas sem histórico.
 */
export function RegistroDeNavegacao() {
  const caminho = usePathname();

  useEffect(() => {
    registrarVisita(caminho ?? "/");
  }, [caminho]);

  return null;
}

export type VoltarProps = {
  /**
   * Para onde ir quando NÃO há histórico do site — quem chegou pelo link do
   * WhatsApp. É a tela de origem daquele conteúdo, nunca a home.
   */
  para: string;
  /** O nome acessível. Obrigatório: o componente pode não ter texto visível. */
  rotulo: string;
  /** `seta` no cabeçalho de uma página; `fechar` no player, que é uma camada. */
  icone?: "seta" | "fechar";
  /** `escuro` sobre `.noite` e `.tinta`, onde a sombra não existe. */
  tom?: "claro" | "escuro";
  /** Texto ao lado do ícone. Sem ele o alvo é um círculo de 44px. */
  children?: ReactNode;
  className?: string;
};

export function Voltar({
  para,
  rotulo,
  icone = "seta",
  tom = "claro",
  children,
  className,
}: VoltarProps) {
  const router = useRouter();
  const Icone = icone === "fechar" ? X : ArrowLeft;

  function aoTocar(evento: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/⌘/Shift/Alt-clique e botão do meio continuam sendo do navegador: quem
    // segurou a tecla pediu a URL, e a URL é o destino alternativo.
    if (
      evento.defaultPrevented ||
      evento.metaKey ||
      evento.ctrlKey ||
      evento.shiftKey ||
      evento.altKey ||
      evento.button !== 0
    ) {
      return;
    }

    const destino = decidirVoltar({
      visitas: visitasNoSite(),
      referencia: typeof document === "undefined" ? null : document.referrer,
      origem: typeof window === "undefined" ? null : window.location.origin,
    });

    if (destino === "alternativa") return; // deixa o `<a>` navegar sozinho
    evento.preventDefault();
    router.back();
  }

  return (
    <Link
      href={para}
      className={[css.voltar, tom === "escuro" ? css.escuro : null, children ? css.comRotulo : null, className]
        .filter(Boolean)
        .join(" ")}
      aria-label={rotulo}
      onClick={aoTocar}
    >
      <Icone size={20} strokeWidth={2.4} aria-hidden="true" />
      {children ? <span className={css.texto}>{children}</span> : null}
    </Link>
  );
}

export default Voltar;

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import css from "./Button.module.css";

/**
 * O botão do produto.
 *
 * ─── POR QUE ELE TAMBÉM É LINK ─────────────────────────────────────────────
 *
 * Metade das "ações" do Replay já é navegação: "Ver meus lances", "Entrar",
 * "Ver grupo". Renderizar navegação como `<button onClick={router.push}>` quebra
 * abrir em nova aba, copiar o endereço e a pré-busca do Next — e o produto vive
 * de link compartilhado. Com `href`, o componente vira `<Link>` e mantém a
 * mesma aparência.
 *
 * ─── ESTADOS QUE NÃO SÃO OPCIONAIS ─────────────────────────────────────────
 *
 * `carregando` desabilita E anuncia (`aria-busy`), porque o clique duplo em 4G
 * ruim é a forma mais comum de mandar o mesmo formulário duas vezes. E o
 * desabilitado mantém contraste legível: o botão "estender lance" nasce
 * desabilitado com dica "em breve" e precisa ser LIDO, não adivinhado.
 */

export type VarianteDoBotao = "primario" | "secundario" | "fantasma" | "perigo";
export type TamanhoDoBotao = 44 | 52 | 56;

type Comum = {
  children: ReactNode;
  variante?: VarianteDoBotao;
  tamanho?: TamanhoDoBotao;
  /** Ocupa a largura toda do container. O padrão do botão principal no celular. */
  largura?: "total" | "auto";
  /** Ícone antes do rótulo. Use `lucide-react` em 18–20px. */
  icone?: ReactNode;
  /** Ícone depois do rótulo (seta de avanço, por exemplo). */
  iconeDepois?: ReactNode;
  carregando?: boolean;
  className?: string;
};

type ComoBotao = Comum &
  Omit<ComponentPropsWithoutRef<"button">, "children" | "className"> & { href?: undefined };

type ComoLink = Comum &
  Omit<ComponentPropsWithoutRef<"a">, "children" | "className" | "href"> & { href: string };

export type ButtonProps = ComoBotao | ComoLink;

function classes(p: Comum): string {
  const tamanho = p.tamanho ?? 52;
  return [
    css.base,
    css[`t${tamanho}`],
    css[p.variante ?? "primario"],
    p.largura === "total" ? css.total : null,
    p.className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button(props: ButtonProps) {
  const {
    children,
    variante,
    tamanho,
    largura,
    icone,
    iconeDepois,
    carregando,
    className,
    ...resto
  } = props as Comum & Record<string, unknown>;

  const conteudo = (
    <>
      {carregando ? (
        // `aria-hidden`: quem usa leitor de tela recebe o estado por `aria-busy`,
        // e um segundo anúncio ("imagem, girando") só atrapalha.
        <span className={css.girando} aria-hidden="true" />
      ) : icone ? (
        <span className={css.icone} aria-hidden="true">
          {icone}
        </span>
      ) : null}
      <span>{children}</span>
      {iconeDepois && !carregando ? (
        <span className={css.icone} aria-hidden="true">
          {iconeDepois}
        </span>
      ) : null}
    </>
  );

  const cn = classes({ children, variante, tamanho, largura, className });

  if ("href" in props && typeof props.href === "string") {
    const { href, ...linkResto } = resto as { href: string } & ComponentPropsWithoutRef<"a">;
    return (
      <Link href={href} className={cn} {...linkResto}>
        {conteudo}
      </Link>
    );
  }

  const botaoResto = resto as ComponentPropsWithoutRef<"button">;
  return (
    <button
      type={botaoResto.type ?? "button"}
      {...botaoResto}
      className={cn}
      disabled={botaoResto.disabled || carregando}
      aria-busy={carregando ? true : undefined}
    >
      {conteudo}
    </button>
  );
}

export default Button;

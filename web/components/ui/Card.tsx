import Link from "next/link";
import type { ReactNode } from "react";
import css from "./Card.module.css";

/**
 * A superfície elevada do produto: `#15171A` com 1px de `#2A2E34` e raio 14.
 *
 * Existe para que ninguém repita esse trio à mão — é o que garante que o card do
 * grupo, o do painel e o da home sejam a MESMA coisa, e não três aproximações.
 */

export type CardProps = {
  children: ReactNode;
  /** Raio 18 e mais respiro — os blocos do painel do parceiro. */
  variante?: "padrao" | "painel" | "nu";
  /** Vira `<Link>` e ganha realce no hover. */
  href?: string;
  titulo?: ReactNode;
  /** Texto pequeno alinhado à direita do título ("pico às 21h"). */
  acessorio?: ReactNode;
  className?: string;
  /** Elemento HTML de saída quando não há `href`. Use `li` dentro de listas. */
  como?: "div" | "li" | "article" | "section";
};

export function Card({
  children,
  variante = "padrao",
  href,
  titulo,
  acessorio,
  className,
  como = "div",
}: CardProps) {
  const cn = [
    css.card,
    variante === "painel" ? css.painel : null,
    variante === "nu" ? css.nu : null,
    href ? css.clicavel : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const interno = (
    <>
      {titulo || acessorio ? (
        <div className={css.cabecalho}>
          {titulo ? <span className={css.titulo}>{titulo}</span> : <span />}
          {acessorio ? <span className={css.acessorio}>{acessorio}</span> : null}
        </div>
      ) : null}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn}>
        {interno}
      </Link>
    );
  }

  const Tag = como;
  return <Tag className={cn}>{interno}</Tag>;
}

/**
 * Seção de página com título e ação opcional à direita.
 *
 * O título sai como `<h2>` por padrão porque quase toda seção do produto é de
 * segundo nível; onde não for, `nivel` corrige — nunca estilize um `<h3>` para
 * PARECER `<h2>`, é assim que o sumário do leitor de tela vira ruído.
 */
export function Secao({
  titulo,
  acao,
  children,
  nivel = 2,
  id,
}: {
  titulo: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  nivel?: 2 | 3;
  id?: string;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <section className={css.secao} id={id}>
      <div className={css.secaoCabecalho}>
        <Titulo>{titulo}</Titulo>
        {acao}
      </div>
      {children}
    </section>
  );
}

export default Card;

import Link from "next/link";
import type { ReactNode } from "react";
import css from "./PartnerHeader.module.css";

/**
 * O cabeçalho da página do parceiro: capa, brasão/logo, nome, estado e abas.
 *
 * ─── AS ABAS SÃO LINKS, NÃO UM `role="tablist"` ────────────────────────────
 *
 * Cada aba é um endereço (`?aba=grupos`): a arena manda "olha a aba Sobre" no
 * WhatsApp, o botão voltar funciona e o Google indexa a página inteira. Um
 * tablist de verdade guardaria o estado só na memória do navegador e perderia as
 * três coisas. O preço é uma navegação por clique — barato numa página que já é
 * renderizada no servidor.
 *
 * `aria-current="page"` é o que diz "você está aqui" para o leitor de tela; a
 * cor e o sublinhado dizem para o olho.
 */

export type AbaDoParceiro = {
  id: string;
  rotulo: string;
  href: string;
  /** Número ao lado do rótulo ("Grupos 4"). */
  contagem?: number;
};

export type PartnerHeaderProps = {
  nome: string;
  /** Iniciais do brasão quando não há logo — "AC" para Arena Calabouço. */
  iniciais: string;
  /** Linha de apoio: "Society e futevôlei · 4 quadras · Vila Prudente, SP". */
  subtitulo?: string;
  logoUrl?: string | null;
  capaUrl?: string | null;
  /** Selo de estado ao lado do nome (use `StatusDot`). */
  estado?: ReactNode;
  /** Ações no canto da capa (compartilhar, voltar). */
  acoes?: ReactNode;
  abas?: AbaDoParceiro[];
  abaAtiva?: string;
  /** Endereço do brasão/nome (a própria página da arena). */
  href?: string;
};

export function PartnerHeader({
  nome,
  iniciais,
  subtitulo,
  logoUrl,
  capaUrl,
  estado,
  acoes,
  abas,
  abaAtiva,
  href,
}: PartnerHeaderProps) {
  const identidade = (
    <>
      <span className={css.brasao}>
        {logoUrl ? (
          // Image Optimization desligada (ADR §4.1): o logo da arena já é
          // enviado no tamanho certo pelo painel.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" />
        ) : (
          iniciais
        )}
      </span>
      <span className={css.textos}>
        <span className={css.nome}>{nome}</span>
        {subtitulo ? <span className={css.sub}>{subtitulo}</span> : null}
      </span>
    </>
  );

  return (
    <header className={css.raiz}>
      <div
        className={[css.capa, capaUrl ? css.capaComFoto : null].filter(Boolean).join(" ")}
        style={capaUrl ? ({ ["--capa-url" as string]: `url(${capaUrl})` } as React.CSSProperties) : undefined}
      >
        {acoes ? <div className={css.acoesCapa}>{acoes}</div> : null}
      </div>

      <div className={css.identidade}>
        {href ? (
          <Link href={href} style={{ display: "contents" }}>
            {identidade}
          </Link>
        ) : (
          identidade
        )}
      </div>

      {estado ? <div className={css.estado}>{estado}</div> : null}

      {abas && abas.length > 0 ? (
        <nav className={css.abas} aria-label="Seções da arena">
          {abas.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={[css.aba, a.id === abaAtiva ? css.abaAtiva : null].filter(Boolean).join(" ")}
              aria-current={a.id === abaAtiva ? "page" : undefined}
              scroll={false}
            >
              {a.rotulo}
              {typeof a.contagem === "number" ? (
                <span className={css.contagem}>{a.contagem}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export default PartnerHeader;

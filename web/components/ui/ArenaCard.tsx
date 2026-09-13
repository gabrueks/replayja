import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ArteQuadra } from "./ArteQuadra";
import css from "./ArenaCard.module.css";

/**
 * O card grande de arena: capa, "gravando agora", brasão, nome e cidade.
 *
 * ─── A FOTO É O HERÓI ──────────────────────────────────────────────────────
 *
 * Sinal nº 2 do diagnóstico da v2: um produto de vídeo sem uma única imagem. A
 * arena que PAGA aparecia como um quadradinho de duas letras numa linha de
 * lista. Aqui ela tem 152px de capa, o brasão por cima e o nome em display —
 * que é como o Zé Delivery mostra uma loja e como o iFood mostra um
 * restaurante.
 *
 * Enquanto a arena não sobe a capa dela (task C9, upload no painel),
 * `ArteQuadra` desenha a quadra à noite no lugar. É o LUGAR da foto, não a foto.
 *
 * ─── "GRAVANDO AGORA" É O QUE FAZ O CARD SER TOCADO ────────────────────────
 *
 * O atleta abre o app ainda na quadra. A pílula verde no canto da capa responde
 * "é aqui mesmo?" antes de ele ler o nome — e, ao contrário do ponto de status
 * numa lista, ela é visível a um braço de distância.
 */

export type ArenaCardProps = {
  href: string;
  nome: string;
  /** Iniciais do brasão quando a arena não tem logo — "AV". */
  iniciais: string;
  /** "Vila Prudente · São Paulo" ou "Piloto do Replay já · 2 quadras". */
  apoio?: string;
  logoUrl?: string | null;
  capaUrl?: string | null;
  /** Liga a pílula verde pulsante no canto da capa. */
  gravando?: boolean;
  /** Pílula branca no canto: "4 quadras", "12 lances hoje". */
  selo?: string;
  /** Altura da capa. 152 no destaque, 128 na lista. */
  altura?: number;
};

export function ArenaCard({
  href,
  nome,
  iniciais,
  apoio,
  logoUrl,
  capaUrl,
  gravando,
  selo,
  altura = 152,
}: ArenaCardProps) {
  return (
    <Link className={css.card} href={href}>
      <div className={css.capa} style={{ height: altura }}>
        {capaUrl ? (
          <>
            {/*
              Image Optimization desligada (ADR §4.1): a capa já sai no tamanho
              certo do painel, e cada transformação na Vercel é cobrada.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={css.foto} src={capaUrl} alt="" loading="lazy" decoding="async" />
            <span className={css.veu} aria-hidden="true" />
          </>
        ) : (
          <ArteQuadra altura={altura} semente={href} simples={altura < 140} />
        )}

        {gravando ? (
          <span className={css.aoVivo}>
            <span className={css.pulso} aria-hidden="true" />
            Gravando agora
          </span>
        ) : null}

        {selo ? <span className={`${css.selo} tempo`}>{selo}</span> : null}
      </div>

      <div className={css.corpo}>
        <span className={css.brasao} aria-hidden="true">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className={css.logo} />
          ) : (
            iniciais
          )}
        </span>

        <span className={css.textos}>
          <span className={css.nome}>{nome}</span>
          {apoio ? <span className={css.apoio}>{apoio}</span> : null}
        </span>

        <ChevronRight size={20} className={css.seta} aria-hidden="true" />
      </div>
    </Link>
  );
}

export default ArenaCard;

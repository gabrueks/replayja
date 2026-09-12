"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Camera,
  CircleDot,
  LayoutGrid,
  Palette,
  RadioTower,
  ShieldCheck,
  Users,
} from "lucide-react";
import css from "../painel.module.css";

/**
 * A navegação do painel — lateral no desktop, abas roláveis no celular.
 *
 * ─── POR QUE ELA É CLIENTE, E É A ÚNICA COISA CLIENTE DO LAYOUT ────────────
 *
 * Duas informações só existem no cliente: qual item está ativo (`usePathname`) e
 * qual arena está escolhida (`useSearchParams`). A segunda é a que obriga: o
 * layout de uma rota do App Router NÃO recebe `searchParams`, e o painel carrega
 * a arena na query string (`?arena=arena-vasco`) porque uma conta pode
 * administrar mais de uma.
 *
 * Perder o `?arena=` ao navegar levaria a pessoa de volta à tela de escolha a
 * cada clique — que era o defeito do fluxo do atleta descrito na decisão 22.
 *
 * ─── E POR QUE ABAS NO CELULAR EM VEZ DE UMA GAVETA ────────────────────────
 *
 * O painel é usado em pé, na quadra, com uma mão. Uma gaveta custa dois toques
 * (abrir, escolher) e esconde para onde dá para ir; sete abas roláveis custam um
 * toque e mostram o mapa inteiro. O preço é a rolagem horizontal, que é
 * aceitável num item de navegação e não seria num conteúdo.
 */

const ITENS = [
  { href: "/painel", rotulo: "Visão geral", Icone: LayoutGrid },
  { href: "/painel/quadras", rotulo: "Quadras", Icone: CircleDot },
  { href: "/painel/cameras", rotulo: "Câmeras", Icone: Camera },
  { href: "/painel/botoes", rotulo: "Botões", Icone: RadioTower },
  { href: "/painel/pagina", rotulo: "Marca e página", Icone: Palette },
  { href: "/painel/equipe", rotulo: "Equipe", Icone: Users },
  { href: "/painel/privacidade", rotulo: "Privacidade", Icone: ShieldCheck },
] as const;

export function Navegacao() {
  const caminho = usePathname();
  const busca = useSearchParams();
  const arena = busca.get("arena");
  const sufixo = arena ? `?arena=${encodeURIComponent(arena)}` : "";

  return (
    <nav className={css.lateral} aria-label="Seções do painel">
      <ul className={css.lista}>
        {ITENS.map(({ href, rotulo, Icone }) => {
          // `/painel` só casa exato: sem isso ele ficaria aceso em todas as
          // outras, e "onde eu estou" deixaria de ser respondido.
          const ativo = href === "/painel" ? caminho === href : caminho.startsWith(href);
          return (
            <li key={href}>
              <Link
                className={[css.item, ativo ? css.itemAtivo : null].filter(Boolean).join(" ")}
                href={`${href}${sufixo}`}
                aria-current={ativo ? "page" : undefined}
              >
                <Icone size={18} aria-hidden="true" />
                <span>{rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default Navegacao;

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, MonitorPlay, User, Users } from "lucide-react";
import { slugReservadoDeArena } from "@/lib/reserved-slugs";
import { SLUG_RE } from "@/lib/slug";
import { RodapeFixo } from "./RodapeFixo";
import css from "./BottomNav.module.css";

/**
 * A barra inferior de quatro abas: Arenas · Lances · Grupos · Perfil.
 *
 * ─── O QUE ELA CONSERTA ────────────────────────────────────────────────────
 *
 * Sem navegação persistente, toda tela do produto era um beco: o atleta chegava
 * por um link do WhatsApp, via o lance, e não tinha para onde ir. Era o sinal nº
 * 5 do diagnóstico da v2. A barra é o chassi que diz "isto é um app", e é o que
 * toda referência brasileira (Zé, iFood, Rappi) tem.
 *
 * ─── A ABA ATIVA TEM TRÊS SINAIS, NÃO UM ───────────────────────────────────
 *
 * Pílula `--cor-acao-fraca` atrás do ícone + ícone e rótulo em `--cor-acao` +
 * traço mais grosso (2,4 contra 2). Só a cor não seria sinal acessível, e
 * `aria-current="page"` é o que diz a mesma coisa para o leitor de tela.
 *
 * ─── O QUE DECIDE A ABA ATIVA ──────────────────────────────────────────────
 *
 * O `pathname`, e não um prop de cada tela — que é como a aba ativa começa a
 * mentir. Cada aba declara os prefixos que pertencem a ela; a mais específica
 * ganha, então `/app/grupos` acende "Grupos" e não "Arenas".
 *
 * Fora de `/app` o prefixo não resolve, porque o primeiro segmento é o SLUG DA
 * ARENA: `/arena-vasco/fut-de-sexta` não tem como ser declarado numa lista. A
 * segunda passagem (`abaDaRotaDeArena`) lê o SEGUNDO segmento, que é o que
 * distingue o player (`/c/…`), a sessão (`/s/…`), o criar grupo (`/grupos/novo`)
 * e a página do grupo (`/<qualquer>`) — todos eles telas do atleta que até esta
 * rodada apareciam sem barra nenhuma.
 *
 * ─── ELA SOME NAS TELAS IMERSIVAS ──────────────────────────────────────────
 *
 * Player, botão virtual, onboarding e login não a renderizam: são telas de uma
 * ação só, e uma barra de navegação no pé de um vídeo em tela cheia é convite
 * para sair no meio do lance.
 */

export type AbaDaBarra = {
  id: string;
  rotulo: string;
  href: string;
  /** Prefixos de rota que acendem esta aba. O mais longo que casar vence. */
  prefixos: string[];
  /** Contagem no cantinho do ícone (grupos com lance novo). `0` esconde. */
  badge?: number;
};

const ICONE = {
  arenas: MapPin,
  lances: MonitorPlay,
  grupos: Users,
  perfil: User,
} as const;

export const ABAS_DO_ATLETA: AbaDaBarra[] = [
  { id: "arenas", rotulo: "Arenas", href: "/app", prefixos: ["/app"] },
  { id: "lances", rotulo: "Lances", href: "/app/lances", prefixos: ["/app/lances", "/app/buscar"] },
  { id: "grupos", rotulo: "Grupos", href: "/app/grupos", prefixos: ["/app/grupos"] },
  { id: "perfil", rotulo: "Perfil", href: "/app/perfil", prefixos: ["/app/perfil"] },
];

/**
 * Os SEGUNDOS segmentos de `/[arenaSlug]/…` que já são rota do sistema, e a aba
 * a que cada um pertence. A lista vem de `lib/reserved-slugs.ts`
 * (`RESERVED_GROUP_SLUGS`): o que não está aqui é slug de grupo.
 */
const SEGUNDO_SEGMENTO: Record<string, string> = {
  // `/[arena]/c/[clipId]` — o player. É um lance, então acende "Lances".
  c: "lances",
  // `/[arena]/s/[sessao]` — a janela de jogo. Também é uma lista de lances.
  s: "lances",
  // `/[arena]/grupos/novo` — criar grupo.
  grupos: "grupos",
};

/**
 * A aba de uma rota de ARENA (`/[arenaSlug]/…`), onde o prefixo não resolve
 * porque o primeiro segmento é um slug.
 *
 * O primeiro segmento tem de ser um slug de arena de verdade: `/entrar`,
 * `/painel` e `/privacidade` são rotas do sistema, não arenas, e nenhuma aba
 * acende nelas.
 */
function abaDaRotaDeArena(caminho: string): string | null {
  const partes = caminho.split("/").filter(Boolean);
  const arena = partes[0];
  if (!arena || slugReservadoDeArena(arena) || !SLUG_RE.test(arena)) return null;

  const segundo = partes[1];
  if (!segundo) return "arenas"; // `/[arena]` — a página da arena
  return SEGUNDO_SEGMENTO[segundo] ?? "grupos"; // `/[arena]/[grupo]` e filhas
}

/**
 * Qual aba acende para um caminho. Exportada para o teste — a regra de "o
 * prefixo mais longo ganha" é justamente o que quebra quando alguém acrescenta
 * uma rota nova, e ela merece um teste próprio.
 */
export function abaAtivaDe(caminho: string, abas: AbaDaBarra[] = ABAS_DO_ATLETA): string | null {
  let escolhida: string | null = null;
  let melhor = -1;

  for (const aba of abas) {
    for (const prefixo of aba.prefixos) {
      const casa = caminho === prefixo || caminho.startsWith(`${prefixo}/`);
      if (casa && prefixo.length > melhor) {
        melhor = prefixo.length;
        escolhida = aba.id;
      }
    }
  }

  if (escolhida) return escolhida;

  // Só cai aqui quem está fora de `/app`. Uma lista de abas customizada (o
  // catálogo `/dev/ui`) não recebe a regra de arena: ela é do produto, não do
  // componente.
  return abas === ABAS_DO_ATLETA ? abaDaRotaDeArena(caminho) : null;
}

export type BottomNavProps = {
  abas?: AbaDaBarra[];
  /** Sobrepõe a detecção por rota. Só para o catálogo `/dev/ui`. */
  ativa?: string;
  /** Caminho a considerar. Só para teste — em produção vem do `usePathname`. */
  caminho?: string;
  /**
   * Prefixos de rota em que a barra NÃO aparece.
   *
   * O botão virtual é tela de uma ação só, e uma barra de navegação no pé dela é
   * convite para sair no meio do lance. A lista vive em quem monta o layout, e
   * não aqui dentro, porque é uma decisão de produto por rota.
   */
  esconderEm?: string[];
  /** Some com a reserva de espaço. Só para o catálogo `/dev/ui`. */
  semReserva?: boolean;
};

export function BottomNav({
  abas = ABAS_DO_ATLETA,
  ativa,
  caminho,
  esconderEm,
  semReserva,
}: BottomNavProps) {
  const atual = usePathname();
  const pathname = caminho ?? atual ?? "";
  const ativaAgora = ativa ?? abaAtivaDe(pathname, abas);

  const escondida = (esconderEm ?? []).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (escondida) return null;

  return (
    /*
      A RESERVA DE ESPAÇO É DA BARRA, e não da tela. Era `.com-barra`, uma classe
      global que cada layout aplicava à mão — e que continuava reservando 76px em
      `/app/botao`, onde a barra não é renderizada (`esconderEm`). Agora a
      reserva nasce e morre junto com a barra: o `return null` acima não deixa
      nenhum buraco no pé.
    */
    <RodapeFixo reservaInicial={76} semReserva={semReserva} className={css.barra}>
      <nav className={css.abas} aria-label="Navegação principal">
        {abas.map((aba) => {
          const Icone = ICONE[aba.id as keyof typeof ICONE] ?? MapPin;
          const acesa = aba.id === ativaAgora;

          return (
            <Link
              key={aba.id}
              href={aba.href}
              className={[css.aba, acesa ? css.acesa : null].filter(Boolean).join(" ")}
              aria-current={acesa ? "page" : undefined}
              /*
                O badge entra no NOME da aba, e não como um nó solto ao lado do
                ícone: o número vem ANTES do rótulo na ordem do DOM, então sem um
                rótulo explícito o leitor de tela anunciaria "2 Grupos" — que lê
                como "dois grupos", e não como "Grupos, duas novidades".
              */
              aria-label={aba.badge ? `${aba.rotulo}, ${aba.badge} novidades` : undefined}
            >
              <span className={css.ladrilho}>
                <Icone size={20} strokeWidth={acesa ? 2.4 : 2} aria-hidden="true" />
                {aba.badge ? (
                  <span className={css.badge} aria-hidden="true">
                    {aba.badge}
                  </span>
                ) : null}
              </span>
              <span className={css.rotulo}>{aba.rotulo}</span>
            </Link>
          );
        })}
      </nav>
    </RodapeFixo>
  );
}

export default BottomNav;

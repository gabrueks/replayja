import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { arenasDoAdmin } from "@/db/queries/parceiro";
import BarraDaArena from "./_components/BarraDaArena";
import Navegacao from "./_components/Navegacao";
import css from "./painel.module.css";

// Painel do parceiro.
//
// ─── O GATE AQUI É SÓ DE LOGIN; A PERMISSÃO É POR ARENA ────────────────────
//
// Estar logado não faz ninguém admin de nada. Cada página abaixo resolve DE QUAL
// arena está falando e passa por `resolverArena` (`_lib/arena.ts`), que consulta
// `partner_admin` no banco, na hora.
//
// O cookie não carrega papel de propósito (ADR §4.4): "o cookie diz que sou admin
// de uma arena que já me removeu" é uma classe inteira de bug que some quando a
// resposta vem do banco a cada requisição de painel. O custo é uma consulta
// indexada por requisição — barato para a frequência de uso de um painel.
//
// ─── E É POR ISSO QUE A LISTA DE ARENAS PODE VIR DO LAYOUT ─────────────────
//
// `arenasDoAdmin` é a MESMA consulta que `resolverArena` já faz na página, e ela
// não é a barreira: ela só lista o que esta conta administra, a partir do `uid`
// da sessão. Trazê-la para cá é o que permite o seletor de arena no topo — sem
// ele, uma conta com duas arenas descobre que está na errada depois de ler os
// números. O custo é uma leitura indexada a mais por requisição, na mesma ordem
// de grandeza do que o layout já paga, e o gate continua sendo o da página.

export default async function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  const sessao = await getSession();
  if (!sessao) redirect("/entrar?redirectTo=/painel");

  // Sem banco a página mostra "Painel indisponível" — o topo não pode ser o que
  // derruba a tela que existe justamente para explicar que o banco caiu.
  const arenas = dbConfigured() ? await arenasDoAdmin(sessao).catch(() => []) : [];

  return (
    <div className={css.moldura}>
      <header className={css.topo}>
        <div className={css.topoInterno}>
          <Link className={css.marca} href="/painel">
            <Logo tamanho={30} />
            <span className={css.selo}>Painel da arena</span>
          </Link>

          {/*
            `useSearchParams` obriga a fronteira de Suspense em tudo que lê a
            arena escolhida. O fallback do topo é nada: o bloco é identidade, e
            um esqueleto piscando ao lado do logo por 30 ms é pior que o espaço.
          */}
          <Suspense fallback={null}>
            <BarraDaArena arenas={arenas} />
          </Suspense>

          <div className={css.conta}>
            <span className={css.email}>{sessao.email}</span>
            <Link className={css.sair} href="/sair">
              Sair
            </Link>
          </div>
        </div>
      </header>

      <div className={css.corpo}>
        {/*
          Aqui o fallback é uma faixa da mesma altura, e não nada: a navegação
          ocupa uma coluna inteira do grid no desktop, e trocá-la por zero altura
          faria o conteúdo saltar 370px para a esquerda e voltar.
        */}
        <Suspense fallback={<div className={css.lateralVazia} aria-hidden="true" />}>
          <Navegacao />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

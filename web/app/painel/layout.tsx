import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
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

export default async function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  const sessao = await getSession();
  if (!sessao) redirect("/entrar?redirectTo=/painel");

  return (
    <div className={css.moldura}>
      <header className={css.topo}>
        <Link className={css.marca} href="/painel">
          <Logo />
          <span className={css.selo}>Painel da arena</span>
        </Link>
        <div className={css.conta}>
          <span className={css.email}>{sessao.email}</span>
          <Link className={css.sair} href="/sair">
            Sair
          </Link>
        </div>
      </header>

      <div className={css.corpo}>
        {/*
          `useSearchParams` obriga a fronteira de Suspense: sem ela, o Next
          recusa o build estático da rota inteira. O fallback é uma faixa vazia
          da mesma altura — trocar a navegação por um esqueleto que pisca seria
          pior que um espaço parado por 30 ms.
        */}
        <Suspense fallback={<div className={css.lateralVazia} aria-hidden="true" />}>
          <Navegacao />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
import css from "./painel.module.css";

// Painel do parceiro (desktop 1280 no design).
//
// ─── O GATE AQUI É SÓ DE LOGIN; A PERMISSÃO É POR ARENA ────────────────────
//
// Estar logado não faz ninguém admin de nada. Cada página abaixo resolve DE QUAL
// arena está falando e chama `exigirAdminDaArena(sessao, partnerId, papel)` —
// que consulta `partner_admin` no banco, na hora.
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
        <nav className={css.nav} aria-label="Navegação do painel">
          <Link className={css.item} href="/painel">
            Visão geral
          </Link>
          <Link className={css.item} href="/painel/cameras">
            Quadras e câmeras
          </Link>
          <Link className={css.item} href="/sair">
            Sair
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

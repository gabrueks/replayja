import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Onboarding from "./Onboarding";
import css from "./bem-vindo.module.css";

export const metadata = {
  title: "Bem-vindo",
  robots: { index: false, follow: false },
};

/** Escuro, e a barra do sistema junto — senão a emenda denuncia o navegador. */
export const viewport: Viewport = { themeColor: "#16130F" };

/**
 * `/bem-vindo` — as três telas da primeira abertura.
 *
 * ─── POR QUE UM ONBOARDING NUM PRODUTO DE UMA AÇÃO ─────────────────────────
 *
 * Porque o produto tem uma peça de hardware que ninguém conhece. Quem chega pelo
 * link do WhatsApp não sabe que existe uma câmera na quadra nem que existe um
 * botão na beira dela — e sem saber disso, "entre para ver seus lances" é um
 * pedido de e-mail sem contrapartida explicada. Três telas, nove segundos, e a
 * pessoa entende o que está comprando com o e-mail dela.
 *
 * ─── SÓ DESLOGADO, E SÓ UMA VEZ ────────────────────────────────────────────
 *
 * Quem tem sessão já passou por aqui (ou já entendeu) e vai direto para `/app`.
 * O "já vi" fica no `localStorage` do navegador, escrito pela ilha de cliente —
 * não num cookie: não é dado de sessão, não precisa viajar em toda requisição, e
 * não deve criar um identificador novo no aparelho de quem ainda não entrou.
 * A consequência é que o onboarding aparece de novo em outro navegador, e isso
 * está certo: é outro aparelho, e a pessoa pode ser outra.
 *
 * ─── E ELE NÃO SEQUESTRA A ENTRADA ─────────────────────────────────────────
 *
 * Nenhuma rota redireciona para cá. `/bem-vindo` é um destino, não um pedágio:
 * quem chega por um link de arena vai para a arena. Só a home oferece o caminho,
 * e só na primeira abertura — um onboarding que intercepta um link compartilhado
 * é a forma mais rápida de perder a pessoa que o link trouxe.
 */
export default async function BemVindo() {
  const sessao = await getSession();
  if (sessao) redirect("/app");

  return (
    <main className={`${css.pagina} tinta`} id="conteudo">
      <Onboarding />
    </main>
  );
}

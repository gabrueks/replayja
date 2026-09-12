import Link from "next/link";
import { Button } from "@/components/ui";
import { clearSessionCookie } from "@/lib/session-cookie";
import { redirect } from "next/navigation";

// `/sair` — a saída, como AÇÃO DE FORMULÁRIO e não como link.
//
// Um link `GET /sair` que desloga é um convite a pré-busca: o Chrome e o
// WhatsApp abrem links em segundo plano, e a pessoa perderia a sessão sem ter
// clicado em nada. Por isso a página tem um botão que faz POST (Server Action).

export const metadata = { title: "Sair" };

async function sair() {
  "use server";
  const { cookies } = await import("next/headers");
  (await cookies()).set(clearSessionCookie());
  redirect("/");
}

export default function Sair() {
  return (
    <main className="pagina-estreita pilha" id="conteudo">
      <h1>Sair da conta</h1>
      <p className="apoio">
        Você continua podendo entrar depois com o mesmo e-mail — os seus grupos ficam salvos.
      </p>
      <form action={sair}>
        <Button type="submit" tamanho={56} largura="total" variante="perigo">
          Sair
        </Button>
      </form>
      <p>
        <Link className="apoio" href="/app">
          Voltar
        </Link>
      </p>
    </main>
  );
}

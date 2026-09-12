import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
import { googleConfigurado } from "@/lib/google-oidc";
import FormularioDeLogin from "./FormularioDeLogin";
import css from "./login.module.css";

export const metadata = {
  title: "Entrar",
  // A tela de login nunca entra no índice.
  robots: { index: false, follow: false },
};

// `/entrar` — duas etapas (e-mail → código), em pt-BR.
//
// ─── POR QUE DUAS ETAPAS E NÃO UMA TELA SÓ ─────────────────────────────────
//
// A tela do código tem estados próprios — reenvio com contagem, trocar e-mail,
// erro de código — e misturá-los com o campo de e-mail produz um formulário que
// não sabe o que está pedindo (`design/README.md`, decisão 3).
//
// O mesmo fluxo serve CADASTRO e LOGIN: se o e-mail não existe, a conta é criada
// na verificação. O usuário nunca vê a distinção, e é isso que faz o login "sem
// fricção" ser o diferencial que `concorrentes.md` identificou.

const MENSAGENS_DE_ERRO: Record<string, string> = {
  "google-cancelado": "Você cancelou a entrada pelo Google. Pode tentar de novo ou usar o e-mail.",
  "google-expirado": "A entrada pelo Google demorou demais. Tente de novo.",
  "google-state": "Não conseguimos confirmar essa entrada. Tente de novo.",
  "google-invalido": "Algo deu errado na volta do Google. Tente de novo.",
  "google-falhou": "Não conseguimos entrar pelo Google agora. Use o seu e-mail.",
};

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; erro?: string; arena?: string }>;
}) {
  const sessao = await getSession();
  const params = await searchParams;

  // Já logado: não mostrar formulário de login é o mínimo. O destino é o mesmo
  // que o gate teria usado.
  if (sessao) redirect(params.redirectTo ?? "/app");

  const erro = params.erro ? MENSAGENS_DE_ERRO[params.erro] : undefined;

  return (
    <main className={css.pagina} id="conteudo">
      <Logo />

      <header className={css.cabecalho}>
        <h1 className={css.titulo}>Entrar</h1>
        <p className={css.apoio}>
          Precisamos do seu e-mail para mostrar os lances e deixar você compartilhar. Sem
          senha, sem cadastro.
        </p>
      </header>

      {erro ? (
        <p className="erro" role="alert">
          {erro}
        </p>
      ) : null}

      <FormularioDeLogin
        redirectTo={params.redirectTo}
        partnerSlug={params.arena}
        googleDisponivel={googleConfigurado()}
      />
    </main>
  );
}

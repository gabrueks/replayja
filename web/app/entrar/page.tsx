import { redirect } from "next/navigation";
import { destinoSeguro } from "@/lib/destino";
import { getSession } from "@/lib/session";
import { googleConfigurado } from "@/lib/google-oidc";
import FormularioDeLogin from "./FormularioDeLogin";
import { Voltar } from "@/components/ui";
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
//
// ─── A FAIXA PRETA DO TOPO ─────────────────────────────────────────────────
//
// O login da v1 era um formulário solto no alto de uma página vazia — o sinal nº
// 11 do diagnóstico. Aqui ele ganha uma faixa de 214px com a marca e a frase da
// etapa em 38px. Não é enfeite: é o que diz de quem é esta tela, num momento em
// que a pessoa acabou de sair de um link do WhatsApp e está decidindo se digita
// o e-mail dela.
//
// A faixa é renderizada AQUI, no servidor, e não dentro da ilha de cliente: ela
// muda de texto entre as duas etapas, e o `FormularioDeLogin` recebe o cabeçalho
// como filho para que o React não precise hidratar a marca junto com o campo.

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; erro?: string; arena?: string }>;
}) {
  const sessao = await getSession();
  const params = await searchParams;

  // O DESTINO É SANITIZADO UMA VEZ, AQUI, E SÓ O SANITIZADO CIRCULA.
  //
  // `?redirectTo=` chega da URL — que é o que alguém cola num grupo de WhatsApp
  // — e termina em DOIS redirects: o de baixo (quem já está logado) e o
  // `router.push` do formulário, depois do código conferido. Sanitizar nos dois
  // lugares seria dar duas chances de esquecer; sanitizar na entrada é o que
  // garante que o valor cru não existe mais daqui para baixo.
  const destino = destinoSeguro(params.redirectTo);

  // Já logado: não mostrar formulário de login é o mínimo. O destino é o mesmo
  // que o gate teria usado.
  if (sessao) redirect(destino ?? "/app");

  return (
    <main className={css.pagina} id="conteudo">
      {/*
        A SAÍDA DO FUNIL (achado P2-37).

        `/entrar` e `/bem-vindo` não tinham volta para `/`. É funil, e é
        defensável — mas quem tocou "Entrar pra ver meus lances" por engano na
        home só saía pelo botão do navegador, que no app instalado na tela
        inicial simplesmente não existe.

        O `Voltar` é discreto e fica SOBRE a faixa preta do topo (`tom="escuro"`),
        onde ele não disputa espaço com o campo de e-mail. Quando há tela nossa
        atrás ele volta; quando a pessoa chegou direto, ele leva à home, que é
        onde o produto se explica.
      */}
      <div className={css.saida}>
        <Voltar para="/" rotulo="Voltar para o início" tom="escuro" />
      </div>

      <FormularioDeLogin
        redirectTo={destino}
        partnerSlug={params.arena}
        googleDisponivel={googleConfigurado()}
        erroDeEntrada={params.erro}
      />
    </main>
  );
}

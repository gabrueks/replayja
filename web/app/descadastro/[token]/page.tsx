import { BellOff, Check } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { lerDescadastro } from "@/lib/descadastro";
import { Sair } from "./Sair";
import css from "./descadastro.module.css";

export const metadata = {
  title: "Não quero mais receber",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// `/descadastro/[token]` — a saída da lista, explicada.
//
// ─── DUAS PORTAS PARA A MESMA SAÍDA ────────────────────────────────────────
//
// O botão "Cancelar inscrição" do Gmail bate em `/api/descadastro/[token]` e
// resolve tudo sem o usuário sair da caixa de entrada. Esta página é a outra
// porta: o link do RODAPÉ do e-mail, para quem quer entender antes de apertar.
//
// Ela é o único lugar do produto que diz, em uma frase, exatamente o que vai
// parar de chegar — e o que NÃO vai parar. O código de login continua vindo: uma
// tela de descadastro que insinua "você não receberá mais nada" produz a pessoa
// que não consegue entrar na conta e acha que cancelou o cadastro.
//
// ─── SEM LOGIN, E SEM DIZER DE QUEM É O ENDEREÇO ───────────────────────────
//
// A página não mostra e-mail, nome nem o grupo. O link circula dentro de um
// e-mail que pode ter sido encaminhado; qualquer dado exibido aqui vazaria para
// quem o recebeu de segunda mão. O que ela mostra é o que a AÇÃO faz.

export default async function Descadastro({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ feito?: string }>;
}) {
  const { token } = await params;
  const { feito } = await searchParams;

  const valido = Boolean(lerDescadastro(token));

  if (feito === "1") {
    return (
      <main className={css.pagina} id="conteudo">
        <EmptyState
          icone={<Check size={24} />}
          titulo="Pronto, parou."
          descricao="Você não recebe mais o resumo da rodada por e-mail. Os lances continuam todos lá, no link do grupo — e o código de login continua chegando normalmente."
          acoes={
            <Button href="/app/grupos" variante="secundario" largura="total">
              Ver minhas peladas
            </Button>
          }
        />
        <p className={css.nota}>
          Mudou de ideia? Em <strong>Perfil → Avisos por e-mail</strong> você liga de volta,
          grupo por grupo.
        </p>
      </main>
    );
  }

  if (!valido) {
    return (
      <main className={css.pagina} id="conteudo">
        <EmptyState
          icone={<BellOff size={24} />}
          titulo="Este link não vale mais"
          descricao="Ele pode ter vindo cortado por algum aplicativo de e-mail. Você desliga o resumo direto no seu perfil, grupo por grupo."
          acoes={
            <Button href="/app/perfil" largura="total">
              Abrir meu perfil
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className={css.pagina} id="conteudo">
      <span className={css.icone} aria-hidden="true">
        <BellOff size={26} strokeWidth={2.2} />
      </span>
      <h1 className={css.titulo}>Não quer mais o resumo?</h1>
      <p className={css.texto}>
        A gente para de mandar o e-mail que chega na manhã seguinte à pelada, com os lances da
        rodada. Sai na hora, sem login.
      </p>
      <p className={css.texto}>
        O que <strong>continua</strong>: o código de login, os convites que alguém te mandar, e a
        página do grupo com todos os lances.
      </p>

      <Sair token={token} />

      <Button href="/app/perfil" variante="fantasma" largura="total">
        Prefiro escolher grupo por grupo
      </Button>
    </main>
  );
}

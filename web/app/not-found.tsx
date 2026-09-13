import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { Button, EmptyState, Logo } from "@/components/ui";
import { ACHAR_LANCE } from "@/lib/copy";
import css from "./erro.module.css";

/**
 * A 404 — o destino de **17 chamadas de `notFound()`** em 9 rotas.
 *
 * ─── O QUE ESTAVA NO AR ────────────────────────────────────────────────────
 *
 * A página crua do Next: fundo **preto**, texto **em inglês** ("This page could
 * not be found."), sem marca, sem barra, **sem nenhum link de volta**. Num
 * produto claro em pt-BR cujo canal de distribuição é link colado no WhatsApp,
 * é a tela que mais gente vai ver por engano — o grupo apagado, o clipe que
 * saiu da retenção de 90 dias, o slug digitado errado no banner da quadra.
 *
 * Dois defeitos vinham de carona (achado P2-36): o `theme-color` continuava
 * `#F6F3EF` numa página preta, e o "Pular para o conteúdo" do layout raiz — a
 * primeira parada do Tab em TODA página — apontava para um `#conteudo` que não
 * existia ali. Os dois somem porque esta página é nossa: ela herda o tema claro
 * e tem o `id="conteudo"` no lugar.
 *
 * ─── AS TRÊS SAÍDAS, E POR QUE SÃO TRÊS ────────────────────────────────────
 *
 * Quem cai aqui chegou por um de três caminhos, e cada um quer uma coisa
 * diferente. Quem clicou num link de grupo apagado quer a arena; quem clicou
 * num clipe vencido quer o próprio lance; quem digitou errado quer a lista. Uma
 * saída só mandaria dois terços das pessoas para o lugar errado.
 *
 * O molde é `app/convite/[token]/page.tsx` (`<ConviteInvalido />`), que já
 * estava certo — a diferença é que lá o erro tem um motivo conhecido e aqui não,
 * então o texto não inventa um.
 */

export const metadata = {
  title: "Não achamos essa página",
  robots: { index: false, follow: false },
};

export default function NaoEncontrado() {
  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.marca}>
        <Link href="/" aria-label="Replay já — início">
          <Logo tamanho={34} />
        </Link>
      </header>

      <EmptyState
        ilustracao="apito"
        titulo="Esse link não leva a lugar nenhum."
        descricao={
          <>
            Ou o endereço veio com um erro de digitação, ou o que estava aqui saiu do ar — um
            grupo apagado, ou um lance que passou dos 90 dias que a gente guarda.
          </>
        }
        acoes={
          <>
            <Button href="/app" tamanho={56} largura="total" icone={<MapPin size={20} />}>
              Ver as arenas
            </Button>
            <Button
              href="/app/lances"
              variante="secundario"
              tamanho={52}
              largura="total"
              icone={<Search size={18} />}
            >
              {ACHAR_LANCE}
            </Button>
          </>
        }
        nota={
          <>
            Se o link veio de alguém do seu grupo, peça para mandarem de novo — o endereço da
            pelada não muda. Ou comece pela <Link href="/">página inicial</Link>.
          </>
        }
      />
    </main>
  );
}

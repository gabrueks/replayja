"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MapPin, RotateCcw } from "lucide-react";
import { Button, EmptyState, Logo } from "@/components/ui";
import css from "./erro.module.css";

/**
 * A tela de erro — o que existia antes era uma tela BRANCA.
 *
 * ─── O QUE ELA CONSERTA (achado P1-5) ──────────────────────────────────────
 *
 * As rotas mais pesadas do produto são `force-dynamic` com nove `await` de
 * banco. Qualquer exceção — o Neon dormindo, uma conexão derrubada no 4G da
 * quadra — virava tela branca, sem marca, sem explicação e sem "tentar de
 * novo". No celular, tela branca é indistinguível de app quebrado, e o atleta
 * fecha.
 *
 * ─── "NÃO FOI VOCÊ" NÃO É GENTILEZA, É INFORMAÇÃO ─────────────────────────
 *
 * Quem vê um erro depois de tocar num botão assume que tocou errado, e tenta
 * outra coisa — geralmente a errada. Dizer de quem é a culpa é o que faz a
 * pessoa apertar "Tentar de novo" em vez de sair.
 *
 * ─── O `reset()` É A AÇÃO PRINCIPAL, E ELE FUNCIONA ───────────────────────
 *
 * Ele remonta o segmento que falhou sem recarregar o documento: no 4G isso é a
 * diferença entre um novo `fetch` e baixar o app inteiro de novo. E quando a
 * falha for permanente, as duas saídas abaixo continuam lá — um botão de
 * "tentar de novo" que só tenta de novo é um beco com passo extra.
 *
 * ─── A MENSAGEM DO ERRO NÃO APARECE ───────────────────────────────────────
 *
 * `error.message` pode carregar nome de coluna, host do banco ou trecho de SQL.
 * O que a tela mostra é o `digest` — o mesmo identificador que sai no log da
 * Vercel, e o único dado que transforma "deu erro" num chamado que dá para
 * investigar.
 */

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O `console.error` é o que a observabilidade sem Sentry do produto lê
    // (README §7): a Vercel recolhe o `stderr` da função e o `digest` costura a
    // linha do log com o que a pessoa está vendo na tela.
    console.error("[erro-de-rota]", error.digest ?? "(sem digest)", error);
  }, [error]);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.marca}>
        <Link href="/" aria-label="Replay já — início">
          <Logo tamanho={34} />
        </Link>
      </header>

      <EmptyState
        ilustracao="camera"
        titulo="Deu ruim aqui. Não foi você."
        descricao="A gente não conseguiu carregar esta tela agora. Na quadra isso costuma ser o sinal oscilando — tentar de novo resolve quase sempre."
        acoes={
          <>
            <Button
              tamanho={56}
              largura="total"
              icone={<RotateCcw size={20} />}
              onClick={() => reset()}
            >
              Tentar de novo
            </Button>
            <Button
              href="/app"
              variante="secundario"
              tamanho={52}
              largura="total"
              icone={<MapPin size={18} />}
            >
              Ver as arenas
            </Button>
          </>
        }
        nota={
          error.digest ? (
            <>
              Se continuar assim, manda pra gente este código:{" "}
              <code className={css.digest}>{error.digest}</code>
            </>
          ) : (
            <>Se continuar assim, fala com a arena — os lances não se perdem por causa disto.</>
          )
        }
      />
    </main>
  );
}

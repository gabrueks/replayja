"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Ilustracao } from "@/components/ui";
import { ACHAR_LANCE } from "@/lib/copy";
import css from "./bem-vindo.module.css";

/**
 * As três telas da primeira abertura.
 *
 * ─── A ORDEM É A DO PRODUTO, NÃO A DA FEATURE ──────────────────────────────
 *
 * "A câmera já tá lá" → "Marcou? Aperta o botão." → "Entre e ache seu lance."
 * É a sequência em que as coisas acontecem NA QUADRA. Uma ordem por
 * funcionalidade ("busca", "compartilhamento", "grupos") descreveria o software;
 * esta descreve a noite de quem vai usar.
 *
 * ─── "PULAR" EXISTE E É VISÍVEL ────────────────────────────────────────────
 *
 * Onboarding sem saída é pedágio. A saída fica no canto superior, com alvo de
 * 44px, nas duas primeiras telas — na terceira ela some porque o botão já é o
 * próprio "vamos".
 */

const MARCA_DE_VISTO = "replayja:onboarding-visto";

type Tela = {
  ilustracao: "camera" | "botao" | "quadra";
  titulo: string[];
  texto: string;
};

const TELAS: Tela[] = [
  {
    ilustracao: "camera",
    titulo: ["A câmera", "já tá lá."],
    texto:
      "A arena instalou a câmera na quadra. Ela grava a pelada inteira, toda vez que vocês jogam.",
  },
  {
    ilustracao: "botao",
    titulo: ["Marcou?", "Aperta o botão."],
    texto:
      "O botão fica na beira da quadra. Um toque guarda os últimos 22 segundos — o lance que acabou de acontecer.",
  },
  {
    ilustracao: "quadra",
    titulo: ["Entre e ache", "seu lance."],
    texto: "Escolhe a arena, o horário que você jogou, e manda o golaço pro grupo em alta.",
  },
];

/** Marca o onboarding como visto. Exportada para a home ler a mesma chave. */
export function marcarComoVisto(): void {
  try {
    window.localStorage.setItem(MARCA_DE_VISTO, "1");
  } catch {
    // Navegação privada, cookies bloqueados, quota cheia: o onboarding volta a
    // aparecer, e isso é melhor que derrubar a tela por causa de um storage.
  }
}

export default function Onboarding() {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const tela = TELAS[indice] ?? TELAS[0]!;
  const ultima = indice === TELAS.length - 1;

  // Marca como visto já na PRIMEIRA tela, e não no fim: quem abandonou no meio
  // também já viu. Trazer de volta quem fechou seria repetir a mesma explicação
  // para alguém que a recusou.
  useEffect(() => {
    marcarComoVisto();
  }, []);

  const sair = useCallback(() => {
    marcarComoVisto();
    router.push("/entrar");
  }, [router]);

  return (
    <>
      <span className={css.brilho} aria-hidden="true" />

      <div className={css.topo}>
        {ultima ? null : (
          <button type="button" className={css.pular} onClick={sair}>
            Pular
          </button>
        )}
      </div>

      <div className={css.arte}>
        <Ilustracao nome={tela.ilustracao} tamanho={250} />
      </div>

      {/*
        `key` no bloco de texto: sem ele o React reaproveita os mesmos nós e a
        troca de tela não reinicia a animação de entrada — o conteúdo muda sem
        nenhum sinal de que houve uma transição.
      */}
      <div className={css.textos} key={indice}>
        <h1 className={css.titulo}>
          {tela.titulo[0]}
          <br />
          {tela.titulo[1]}
        </h1>
        <p className={css.apoio}>{tela.texto}</p>
      </div>

      <div className={css.rodape}>
        <div className={css.pontos} role="group" aria-label={`Tela ${indice + 1} de ${TELAS.length}`}>
          {TELAS.map((t, i) => (
            <span
              key={t.ilustracao}
              className={[css.ponto, i === indice ? css.pontoAtivo : null]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            />
          ))}
        </div>

        {ultima ? (
          <>
            <Button href="/entrar" tamanho={56} largura="total" onClick={marcarComoVisto}>
              {ACHAR_LANCE}
            </Button>
            <p className={css.nota}>Grátis pra quem joga. Sem instalar nada.</p>
          </>
        ) : (
          <Button
            variante="secundario"
            tamanho={56}
            largura="total"
            className={css.continuar}
            onClick={() => setIndice((n) => Math.min(n + 1, TELAS.length - 1))}
          >
            Continuar
          </Button>
        )}
      </div>
    </>
  );
}

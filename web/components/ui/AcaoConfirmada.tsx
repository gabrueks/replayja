"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type TamanhoDoBotao, type VarianteDoBotao } from "./Button";
import { useToast } from "./Toast";
import css from "./AcaoConfirmada.module.css";

/**
 * Um botão que pergunta antes de fazer — e pergunta NA PRÓPRIA TELA.
 *
 * ─── POR QUE NÃO `window.confirm` ──────────────────────────────────────────
 *
 * O diálogo nativo é a saída de uma linha, e ele é errado aqui por três
 * motivos concretos. Ele não aceita o desenho do produto (aparece como um alerta
 * do navegador em cima de um app que passou seis semanas sendo desenhado); o
 * texto dele vem com o domínio grudado ("replayja.com.br diz:"), que é a
 * aparência de um golpe; e nos navegadores EMBUTIDOS — o do WhatsApp e o do
 * Instagram, por onde metade dos links do produto é aberta — ele às vezes
 * simplesmente não aparece, e a ação acontece sem pergunta nenhuma.
 *
 * ─── E POR QUE NÃO UM MODAL ────────────────────────────────────────────────
 *
 * Um `<dialog>` com trava de foco é o certo para a folha de convite, que tem
 * conteúdo. Aqui o conteúdo é UMA frase. A pergunta abre no lugar do botão: o
 * polegar já está ali, e o gesto de confirmar acontece a um centímetro do gesto
 * que abriu a pergunta — em vez de no meio da tela, onde o dedo tem de viajar.
 *
 * ─── O CANCELAR VEM PRIMEIRO ───────────────────────────────────────────────
 *
 * A ordem é "Cancelar · Confirmar", com o confirmar à direita e na variante de
 * perigo. Quem tocou por engano encontra a saída no lugar onde o dedo já estava,
 * e a ação destrutiva exige mover a mão.
 */

export type ResultadoDaAcao = { ok: boolean; erro?: string; mensagem?: string };

export type AcaoConfirmadaProps = {
  /** O rótulo do botão em repouso: "Sair do grupo". */
  children: ReactNode;
  /** A frase da pergunta: "Sair do Fut de Sexta?". */
  pergunta: string;
  /** O rótulo do botão que confirma. Padrão: "Confirmar". */
  confirmar?: string;
  /** Uma server action já ligada aos argumentos dela. */
  aoConfirmar: () => Promise<ResultadoDaAcao>;
  /** Para onde navegar quando der certo. */
  destino?: string;
  variante?: VarianteDoBotao;
  tamanho?: TamanhoDoBotao;
  largura?: "total" | "auto";
  icone?: ReactNode;
  /** Mensagem de sucesso quando a ação não devolver uma. */
  sucesso?: string;
};

export function AcaoConfirmada({
  children,
  pergunta,
  confirmar = "Confirmar",
  aoConfirmar,
  destino,
  variante = "fantasma",
  tamanho = 44,
  largura = "auto",
  icone,
  sucesso,
}: AcaoConfirmadaProps) {
  const { mostrar } = useToast();
  const router = useRouter();
  const [perguntando, setPerguntando] = useState(false);
  const [correndo, comAcao] = useTransition();

  function executar() {
    comAcao(async () => {
      try {
        const r = await aoConfirmar();
        if (!r.ok) {
          mostrar(r.erro ?? "Não deu certo. Tenta de novo.", "erro");
          setPerguntando(false);
          return;
        }
        mostrar(r.mensagem ?? sucesso ?? "Pronto.", "ok");
        setPerguntando(false);
        if (destino) router.push(destino);
        else router.refresh();
      } catch {
        // A ação já registrou o erro do lado do servidor (`withRoute`/`logError`);
        // aqui o que falta é não deixar a tela travada no estado "perguntando".
        mostrar("Não deu certo agora. Tenta de novo daqui a pouco.", "erro");
        setPerguntando(false);
      }
    });
  }

  if (!perguntando) {
    return (
      <Button
        variante={variante}
        tamanho={tamanho}
        largura={largura}
        icone={icone}
        onClick={() => setPerguntando(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <div className={css.confirmacao} role="group" aria-label={pergunta}>
      <p className={css.pergunta}>{pergunta}</p>
      <div className={css.botoes}>
        <Button
          variante="fantasma"
          tamanho={tamanho}
          onClick={() => setPerguntando(false)}
          disabled={correndo}
        >
          Cancelar
        </Button>
        <Button variante="perigo" tamanho={tamanho} carregando={correndo} onClick={executar}>
          {confirmar}
        </Button>
      </div>
    </div>
  );
}

export default AcaoConfirmada;

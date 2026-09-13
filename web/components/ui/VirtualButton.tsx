"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import css from "./VirtualButton.module.css";

/**
 * O botão virtual — tratado como TELA-HERÓI, não como um widget numa página.
 *
 * ─── POR QUE ELE MERECE UMA TELA ───────────────────────────────────────────
 *
 * É o único momento em que o produto pede uma ação FÍSICA, com urgência real: o
 * gol acabou de sair e a janela são segundos. Na v1 ele era um círculo laranja
 * dentro de um card, entre um selo de status e um parágrafo — o mesmo peso de
 * tudo o mais na página. Agora ele é 206px no centro de uma tela escura com o
 * brilho da marca por trás e um anel de onda: o alvo é achado sem olhar, que é
 * exatamente o que o contexto exige.
 *
 * O escuro aqui não é estética: a tela é usada na beira da quadra, à noite, e
 * uma tela branca de 6 polegadas na mão é um farol que cega quem acabou de
 * olhar para o jogo.
 *
 * ─── ELE É COMPLEMENTO, NÃO SUBSTITUTO ─────────────────────────────────────
 *
 * O botão da quadra continua sendo o principal (decisão 10 do design). Este aqui
 * é para quem está DE FORA — no banco, na mureta, filmando.
 *
 * ─── O COOLDOWN É A LIÇÃO DO 1.0 ───────────────────────────────────────────
 *
 * Sem ele, dez pessoas apertam no mesmo gol e o relay recebe dez pedidos de
 * corte da MESMA janela. O anel mostra quanto falta — um botão que simplesmente
 * "não responde" faz a pessoa apertar mais forte, não esperar.
 *
 * ─── E A CONFIRMAÇÃO TEM HORÁRIO ───────────────────────────────────────────
 *
 * "Salvo às 20:47 — em 30 segundos ele aparece aqui" e não "Lance salvo": o
 * horário é o que o atleta vai usar para achar o vídeo depois, e é a prova de
 * que o toque pegou o momento certo — não o de 40 segundos atrás.
 */

export type VirtualButtonProps = {
  /**
   * Salva o lance. Pode devolver o horário formatado ("20:47") que o servidor
   * registrou — é ele que vale, não o relógio do celular.
   */
  onSalvar?: () => Promise<string | void> | string | void;
  /** Segundos de espera entre um toque e o próximo. */
  cooldownSegundos?: number;
  /** Desabilita quando não há sessão ao vivo. */
  disabled?: boolean;
  /** Explicação do porquê, quando desabilitado. */
  motivo?: string;
  /** Segundos do clipe — o "últimos 22 segundos" do canvas. */
  janelaSegundos?: number;
  /** Link "Ver" da confirmação. */
  hrefDoUltimoLance?: string | null;
  /** Relógio injetável (testes). */
  agora?: () => Date;
};

function horarioDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function VirtualButton({
  onSalvar,
  cooldownSegundos = 10,
  disabled,
  motivo,
  janelaSegundos = 22,
  hrefDoUltimoLance,
  agora,
}: VirtualButtonProps) {
  const [restante, setRestante] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Um `setInterval` de 1 s só enquanto o cooldown corre. Contagem regressiva
  // eterna é a forma mais fácil de manter a CPU do celular acordada.
  useEffect(() => {
    if (restante <= 0) return;
    const t = setInterval(() => setRestante((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [restante]);

  const salvar = useCallback(async () => {
    if (restante > 0 || salvando || disabled) return;
    setSalvando(true);
    try {
      const resposta = await onSalvar?.();
      const horario = typeof resposta === "string" ? resposta : horarioDe(agora ? agora() : new Date());
      if (!montado.current) return;
      setConfirmado(horario);
      setRestante(cooldownSegundos);
    } catch {
      // O gatilho foi RECUSADO (cooldown, câmera fora, relay fora). Quem chamou
      // já mostrou a frase da API — o que este componente tem de fazer é NÃO
      // confirmar e NÃO iniciar o cooldown: um "Salvo às 20:47" para um lance
      // que não existe é pior que erro nenhum, e travar o botão por 10 s depois
      // de uma recusa impediria a pessoa de tentar de novo quando a câmera
      // voltar.
      if (montado.current) setConfirmado(null);
    } finally {
      if (montado.current) setSalvando(false);
    }
  }, [restante, salvando, disabled, onSalvar, agora, cooldownSegundos]);

  const emEspera = restante > 0;
  const porcentagem = emEspera ? Math.round((restante / cooldownSegundos) * 100) : 0;

  return (
    <div className={css.raiz}>
      <div className={css.chamada}>
        {/*
          "Marcou?" é o título, e é a SITUAÇÃO — não "Salvar lance", que é a
          função. Quem está com o celular na mão acabou de ver o gol; a pergunta
          é a frase que ele diria em voz alta.
        */}
        <h1 className={css.titulo}>{emEspera ? "Boa!" : "Marcou?"}</h1>
        <p className={css.apoio}>
          {emEspera
            ? "Deixa o corte sair antes de apertar de novo."
            : `Aperta aqui e a gente guarda os últimos ${janelaSegundos} segundos.`}
        </p>
      </div>

      <div className={css.palco}>
        {/* Os dois anéis: o de fora pulsa como uma onda saindo do botão, o de
            dentro é fixo e dá o contorno. `prefers-reduced-motion` desliga a
            onda pela regra global. */}
        <span className={css.onda} aria-hidden="true" />
        <span className={css.anel} aria-hidden="true" />

        <button
          type="button"
          className={css.botao}
          onClick={salvar}
          disabled={disabled || emEspera || salvando}
          aria-live="off"
        >
          {emEspera ? (
            <span
              className={css.cooldown}
              style={{ ["--restante" as string]: porcentagem } as React.CSSProperties}
              aria-hidden="true"
            />
          ) : null}

          <RotateCcw size={44} strokeWidth={2.2} aria-hidden="true" />

          {emEspera ? (
            <>
              <span className={css.rotulo}>Aguarde</span>
              {/*
                A contagem fica no NOME do botão, não só no visual: um botão
                desabilitado que só diz "Aguarde" não explica por quanto tempo, e
                quem usa leitor de tela não tem como saber que ele volta.
              */}
              <span className={`${css.sub} tempo`}>Libera em {restante}s</span>
            </>
          ) : (
            <span className={css.rotulo}>{salvando ? "Salvando…" : "Salvar lance"}</span>
          )}
        </button>
      </div>

      {/*
        `role="status"`: a confirmação precisa ser anunciada SEM roubar o foco —
        quem apertou já está olhando para a tela, e quem usa leitor de tela
        precisa ouvir que pegou.
      */}
      {confirmado ? (
        <p className={css.confirmacao} role="status">
          <span className={css.marcaOk} aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </span>
          <span className={css.confirmacaoTexto}>
            <span className={css.confirmacaoTitulo}>
              Salvo às <span className="tempo">{confirmado}</span>
            </span>
            <span className={css.confirmacaoApoio}>Em 30 segundos ele aparece aqui.</span>
          </span>
          {hrefDoUltimoLance ? (
            <a className={css.verLance} href={hrefDoUltimoLance}>
              Ver
            </a>
          ) : null}
        </p>
      ) : null}

      {disabled && motivo ? <p className={css.nota}>{motivo}</p> : null}
    </div>
  );
}

export default VirtualButton;

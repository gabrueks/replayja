"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import css from "./VirtualButton.module.css";

/**
 * O botão virtual: "Salvar lance" com cooldown visível e confirmação.
 *
 * ─── ELE É COMPLEMENTO, NÃO SUBSTITUTO ─────────────────────────────────────
 *
 * O botão da quadra continua sendo o principal (decisão 10 do design). Este aqui
 * é para quem está DE FORA — no banco, na mureta, filmando. Por isso ele só
 * aparece para quem está logado e dentro do horário de uma sessão ao vivo.
 *
 * ─── O COOLDOWN É A LIÇÃO DO 1.0 ───────────────────────────────────────────
 *
 * Sem ele, dez pessoas apertam no mesmo gol e o relay recebe dez pedidos de
 * corte da MESMA janela. O anel mostra quanto falta — um botão que simplesmente
 * "não responde" faz a pessoa apertar mais forte, não esperar.
 *
 * ─── E A CONFIRMAÇÃO TEM HORÁRIO ───────────────────────────────────────────
 *
 * "Lance salvo às 20:47" e não "Lance salvo": o horário é o que o atleta vai
 * usar para achar o vídeo depois, e é a prova de que o toque pegou o momento
 * certo — não o de 40 segundos atrás.
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
      // confirmar e NÃO iniciar o cooldown: um "Lance salvo às 20:47" para um
      // lance que não existe é pior que erro nenhum, e travar o botão por 10 s
      // depois de uma recusa impediria a pessoa de tentar de novo quando a
      // câmera voltar.
      if (montado.current) setConfirmado(null);
    } finally {
      if (montado.current) setSalvando(false);
    }
  }, [restante, salvando, disabled, onSalvar, agora, cooldownSegundos]);

  const emEspera = restante > 0;
  const porcentagem = emEspera ? Math.round((restante / cooldownSegundos) * 100) : 0;

  return (
    <div className={css.raiz}>
      <button
        type="button"
        className={css.botao}
        onClick={salvar}
        disabled={disabled || emEspera || salvando}
        aria-live="off"
      >
        {emEspera ? (
          <span
            className={css.anel}
            style={{ ["--restante" as string]: porcentagem } as React.CSSProperties}
            aria-hidden="true"
          />
        ) : null}

        {emEspera ? (
          <>
            <span className={css.rotulo}>Aguarde</span>
            <span className={`${css.sub} ${css.contador}`}>Libera de novo em {restante}s</span>
          </>
        ) : (
          <>
            <span className={css.rotulo}>{salvando ? "Salvando…" : "Salvar lance"}</span>
            <span className={css.sub}>últimos {janelaSegundos} segundos</span>
          </>
        )}
      </button>

      {/*
        `role="status"`: a confirmação precisa ser anunciada SEM roubar o foco —
        quem apertou já está olhando para a tela, e quem usa leitor de tela
        precisa ouvir que pegou.
      */}
      {confirmado ? (
        <p className={css.confirmacao} role="status">
          <span className={css.marcaOk} aria-hidden="true">
            <Check size={18} />
          </span>
          <span className={css.confirmacaoTexto}>
            Lance salvo às <span className={css.confirmacaoHorario}>{confirmado}</span>
            <span className={css.confirmacaoApoio}>Fica pronto em alguns segundos.</span>
          </span>
          {hrefDoUltimoLance ? <a href={hrefDoUltimoLance}>Ver</a> : null}
        </p>
      ) : null}

      {disabled && motivo ? <p className={css.nota}>{motivo}</p> : null}
    </div>
  );
}

export default VirtualButton;

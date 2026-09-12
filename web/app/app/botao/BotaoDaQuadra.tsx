"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VirtualButton, useToast } from "@/components/ui";
import css from "./botao.module.css";

/**
 * O botão virtual ligado no `POST /api/triggers`, com o acompanhamento do job.
 *
 * ─── O QUE ESTA CASCA ACRESCENTA AO `VirtualButton` ────────────────────────
 *
 * O componente do design system sabe o toque, o cooldown e a confirmação. O que
 * ele não sabe é o que acontece DEPOIS: o corte leva de 15 a 40 segundos, e sem
 * nada na tela nesse intervalo o atleta conclui que não gravou e aperta de novo
 * — que foi exatamente o comportamento do 1.0.
 *
 * Então aqui: dispara o gatilho, guarda o `clipId` e pergunta a cada 2 s até o
 * clipe virar `pronto`, mostrando o link do player no fim.
 *
 * ─── O COOLDOWN APARECE ANTES DE O SERVIDOR RECUSAR ────────────────────────
 *
 * O teto de verdade é a coluna do banco (8 s por QUADRA, checada em
 * `criarGatilho`). O anel do botão é a mesma janela, desenhada: um botão que
 * simplesmente "não responde" faz a pessoa apertar mais forte, não esperar.
 *
 * ─── ERRO DE GATILHO É FRASE, NÃO CÓDIGO ───────────────────────────────────
 *
 * A API responde RFC 9457 com `detail` já escrito em pt-BR e pronto para exibir
 * (`lib/problem.ts`). O cliente mostra aquele texto — reescrevê-lo aqui criaria
 * duas versões da mesma mensagem, e uma delas ficaria velha.
 */

const INTERVALO_POLL_MS = 2000;
/** Desiste depois disso. O corte normal leva de 15 a 40 s; 2 min é o caso feio. */
const TETO_POLL_MS = 120_000;

type Estado =
  | { fase: "ocioso" }
  | { fase: "esperando"; clipId: string; horario: string }
  | { fase: "pronto"; clipId: string; horario: string; href: string; parcial: boolean }
  | { fase: "demorou"; clipId: string; horario: string }
  | { fase: "falhou"; motivo: string };

export function BotaoDaQuadra({
  courtId,
  quadra,
  arena,
  cooldownSegundos,
}: {
  courtId: string;
  quadra: string;
  arena: string;
  cooldownSegundos: number;
}) {
  const { mostrar } = useToast();
  const [estado, setEstado] = useState<Estado>({ fase: "ocioso" });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  // Sair da página no meio da espera não pode deixar um intervalo rodando: no
  // celular, um `setInterval` órfão mantém a CPU acordada.
  useEffect(() => pararPolling, [pararPolling]);

  const acompanhar = useCallback(
    (clipId: string, horario: string) => {
      pararPolling();
      const comecou = Date.now();
      timer.current = setInterval(async () => {
        if (Date.now() - comecou > TETO_POLL_MS) {
          pararPolling();
          setEstado({ fase: "demorou", clipId, horario });
          return;
        }
        try {
          const r = await fetch(`/api/clips/${clipId}`, { cache: "no-store" });
          if (!r.ok) return;
          const j = (await r.json()) as { estado: string; href: string | null };
          if ((j.estado === "pronto" || j.estado === "parcial") && j.href) {
            pararPolling();
            setEstado({
              fase: "pronto",
              clipId,
              horario,
              href: j.href,
              parcial: j.estado === "parcial",
            });
          } else if (j.estado === "falhou" || j.estado === "expirado") {
            pararPolling();
            setEstado({
              fase: "falhou",
              motivo:
                "O corte não pôde ser gerado — a câmera teve uma lacuna grande nesse trecho.",
            });
          }
        } catch {
          // Rede oscilou: o próximo ciclo tenta de novo. Nunca derruba a espera,
          // porque o job continua rodando do lado do servidor.
        }
      }, INTERVALO_POLL_MS);
    },
    [pararPolling],
  );

  const salvar = useCallback(async (): Promise<string> => {
    const r = await fetch("/api/triggers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Chave de idempotência: um toque que reenvia por timeout de rede não
        // pode virar dois clipes (`api/README.md` §5, camada 2).
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ courtId }),
    });

    if (!r.ok) {
      const problema = (await r.json().catch(() => null)) as { detail?: string } | null;
      const detalhe = problema?.detail ?? "Não foi possível salvar o lance agora.";
      mostrar(detalhe, "erro", 6000);
      setEstado({ fase: "falhou", motivo: detalhe });
      // Relança para o `VirtualButton` não mostrar a confirmação de um lance
      // que não existe.
      throw new Error(detalhe);
    }

    const j = (await r.json()) as { clipId: string | null; pressEstimatedAt?: string };
    const horario = j.pressEstimatedAt
      ? new Date(j.pressEstimatedAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    if (j.clipId) {
      setEstado({ fase: "esperando", clipId: j.clipId, horario });
      acompanhar(j.clipId, horario);
    }
    return horario;
  }, [courtId, acompanhar, mostrar]);

  return (
    <div className={css.raiz}>
      <VirtualButton
        onSalvar={salvar}
        cooldownSegundos={cooldownSegundos}
        hrefDoUltimoLance={estado.fase === "pronto" ? estado.href : null}
      />

      <div className={css.estado} role="status" aria-live="polite">
        {estado.fase === "esperando" ? (
          <p className={css.esperando}>
            Cortando o lance das {estado.horario} na {quadra}… isso leva alguns segundos.
          </p>
        ) : null}

        {estado.fase === "pronto" ? (
          <p className={css.pronto}>
            Lance das {estado.horario} está pronto.{" "}
            <a href={estado.href}>Assistir agora</a>
            {estado.parcial ? (
              <span className={css.nota}>
                Saiu mais curto que o normal: a câmera teve uma lacuna nesse trecho.
              </span>
            ) : null}
          </p>
        ) : null}

        {estado.fase === "demorou" ? (
          <p className={css.nota}>
            O corte está demorando mais que o normal. Ele não se perde — procure o lance das{" "}
            {estado.horario} em{" "}
            <a href={`/app/buscar?arena=${arena}`}>buscar por horário</a> daqui a pouco.
          </p>
        ) : null}

        {estado.fase === "falhou" ? <p className={css.erro}>{estado.motivo}</p> : null}
      </div>
    </div>
  );
}

export default BotaoDaQuadra;

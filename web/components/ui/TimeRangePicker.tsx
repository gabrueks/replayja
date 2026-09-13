"use client";

import { useId } from "react";
import { Chip, ChipFaixa } from "./Chip";
import css from "./TimeRangePicker.module.css";

/**
 * Data + início + fim, com os ATALHOS ANTES do seletor.
 *
 * ─── POR QUE OS ATALHOS VÊM PRIMEIRO ───────────────────────────────────────
 *
 * Decisão 4 do design: o caso comum é o atleta abrindo o celular AINDA NA
 * QUADRA, suado, dois minutos depois do gol. Ele não lembra que jogou "das 20:00
 * às 21:00" — ele lembra que foi "agora". Exigir o horário exato é o ponto fraco
 * dos concorrentes; um toque em "Agora" resolve o caso dominante e o seletor
 * atende o resto.
 *
 * ─── A JANELA MÁXIMA NÃO É DETALHE DE UI ───────────────────────────────────
 *
 * Seis horas é controle de PRIVACIDADE (`api/README.md` §3): nunca existe
 * "listar todos os lances da arena". O componente avisa antes do envio para o
 * atleta não descobrir o limite por um erro 422 do servidor — mas quem garante o
 * limite é a consulta, não este arquivo.
 */

export type Intervalo = {
  /** "2026-09-08" — o dia NO FUSO DA ARENA. */
  data: string;
  /** "20:00" */
  inicio: string;
  /** "21:00" */
  fim: string;
};

export type AtalhoDeTempo = "agora" | "ultima-hora" | "ontem-a-noite";

/*
 * "ACABEI DE JOGAR", E NÃO "AGORA".
 *
 * A folha de voz da v2: o rótulo descreve a SITUAÇÃO do atleta, não a função do
 * sistema. Quem abre o app na beira da quadra reconhece a própria frase; "Agora"
 * exige traduzir mentalmente para "o que aconteceu nos últimos 30 minutos".
 */
const ATALHOS: Array<{ id: AtalhoDeTempo; rotulo: string }> = [
  { id: "agora", rotulo: "Acabei de jogar" },
  { id: "ultima-hora", rotulo: "Última hora" },
  { id: "ontem-a-noite", rotulo: "Ontem à noite" },
];

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

export function comoData(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

export function comoHora(d: Date): string {
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/**
 * Traduz o atalho para um intervalo concreto.
 *
 * `agora` recebe a hora de referência como ARGUMENTO e não lê o relógio por
 * dentro: é o que torna o comportamento testável e o que evita que o servidor e
 * o cliente rendam horários diferentes na hidratação.
 */
export function calcularAtalho(atalho: AtalhoDeTempo, agora: Date): Intervalo {
  if (atalho === "ontem-a-noite") {
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    // 19:00–23:00: a faixa em que a pelada de fim de tarde/noite acontece no
    // Brasil. Quatro horas cabem no limite de seis.
    return { data: comoData(ontem), inicio: "19:00", fim: "23:00" };
  }

  const minutos = atalho === "agora" ? 30 : 60;
  const de = new Date(agora.getTime() - minutos * 60_000);
  // Se o recuo cruzou a meia-noite, a busca vira "do começo do dia até agora":
  // o seletor só tem UMA data, e mandar 23:30–00:05 devolveria uma janela
  // invertida no servidor.
  const cruzouODia = comoData(de) !== comoData(agora);
  return {
    data: comoData(agora),
    inicio: cruzouODia ? "00:00" : comoHora(de),
    fim: comoHora(agora),
  };
}

/** Minutos entre início e fim. Negativo quando o fim vem antes. */
export function duracaoEmMinutos(intervalo: Intervalo): number {
  const [h1 = "0", m1 = "0"] = intervalo.inicio.split(":");
  const [h2 = "0", m2 = "0"] = intervalo.fim.split(":");
  return Number(h2) * 60 + Number(m2) - (Number(h1) * 60 + Number(m1));
}

export type TimeRangePickerProps = {
  valor: Intervalo;
  onChange: (intervalo: Intervalo) => void;
  /** Atalho aceso. Some assim que a pessoa mexe num campo. */
  atalhoAtivo?: AtalhoDeTempo | null;
  onAtalho?: (atalho: AtalhoDeTempo, intervalo: Intervalo) => void;
  /** Hora de referência dos atalhos. Injetável para teste. */
  agora?: Date;
  /** Limite da janela, em horas. 6 é o do produto. */
  maxHoras?: number;
  /**
   * O botão quadrado de 62px ao lado de "Fim".
   *
   * A v1 punha "Buscar lances" numa linha inteira abaixo do seletor. Juntar a
   * ação aos dois campos que ela usa é o que faz a linha ler como UMA pergunta
   * ("destas 20:00 a estas 21:00, vai") em vez de três controles soltos — e
   * economiza uma altura de botão na tela mais rolada do produto.
   */
  acao?: React.ReactNode;
};

export function TimeRangePicker({
  valor,
  onChange,
  atalhoAtivo,
  onAtalho,
  agora,
  maxHoras = 6,
  acao,
}: TimeRangePickerProps) {
  const idData = useId();
  const idInicio = useId();
  const idFim = useId();

  const minutos = duracaoEmMinutos(valor);
  const invertido = minutos <= 0;
  const grande = minutos > maxHoras * 60;
  const aviso = invertido
    ? "O fim precisa vir depois do início."
    : grande
      ? `A busca cobre no máximo ${maxHoras} horas de uma vez.`
      : null;

  function aplicarAtalho(id: AtalhoDeTempo) {
    const intervalo = calcularAtalho(id, agora ?? new Date());
    onChange(intervalo);
    onAtalho?.(id, intervalo);
  }

  return (
    <div className={css.raiz}>
      <div className={css.grupo}>
        <span className="rotulo">Quando</span>
        <ChipFaixa rotulo="Atalhos de horário">
          {ATALHOS.map((a) => (
            <Chip
              key={a.id}
              suave
              ponto={a.id === "agora"}
              selecionado={atalhoAtivo === a.id}
              onClick={() => aplicarAtalho(a.id)}
            >
              {a.rotulo}
            </Chip>
          ))}
        </ChipFaixa>
      </div>

      <div className={css.grupo}>
        <div className={css.caixa}>
          <label className={css.rotuloCaixa} htmlFor={idData}>
            Data
          </label>
          <input
            id={idData}
            className={css.entrada}
            type="date"
            value={valor.data}
            onChange={(e) => onChange({ ...valor, data: e.target.value })}
          />
        </div>

        <div className={css.linha}>
          <div className={[css.caixa, aviso ? css.invalida : null].filter(Boolean).join(" ")}>
            <label className={css.rotuloCaixa} htmlFor={idInicio}>
              Início
            </label>
            <input
              id={idInicio}
              className={css.entrada}
              type="time"
              value={valor.inicio}
              onChange={(e) => onChange({ ...valor, inicio: e.target.value })}
            />
          </div>
          <div className={[css.caixa, aviso ? css.invalida : null].filter(Boolean).join(" ")}>
            <label className={css.rotuloCaixa} htmlFor={idFim}>
              Fim
            </label>
            <input
              id={idFim}
              className={css.entrada}
              type="time"
              value={valor.fim}
              onChange={(e) => onChange({ ...valor, fim: e.target.value })}
            />
          </div>
          {acao ? <div className={css.acao}>{acao}</div> : null}
        </div>

        {aviso ? (
          <p className={css.aviso} role="alert">
            {aviso}
          </p>
        ) : (
          <p className={css.resumo}>
            {Math.floor(minutos / 60) > 0 ? `${Math.floor(minutos / 60)}h ` : ""}
            {minutos % 60 > 0 ? `${minutos % 60}min` : ""} de busca
          </p>
        )}
      </div>
    </div>
  );
}

export default TimeRangePicker;

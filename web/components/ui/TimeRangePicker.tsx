"use client";

import { duracaoEmPalavras } from "@/lib/datas";
import { CampoDeData, CampoDeHorario } from "./CampoDeTempo";
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
 * ─── OS CAMPOS SÃO `CampoDeData` E `CampoDeHorario` ────────────────────────
 *
 * Eram três `<input type="date|time">` crus, e isso deu os dois P0 da revisão de
 * 13/09: a data saía `09/13/2026` no navegador que não estivesse em português
 * (P0-3) e o campo FIM engolia o sufixo AM/PM sem aviso, porque um seletor
 * posicional — `.caixa:first-child .entrada`, escrito para pegar só a DATA —
 * pegava também o INÍCIO e deixava os dois horários com tipografias diferentes
 * (P0-2). Os componentes novos mantêm o `<input>` nativo (o picker do iOS é bom
 * demais para abrir mão) e trocam só o que o olho vê.
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
        <CampoDeData
          rotulo="Data"
          valor={valor.data}
          onChange={(data) => onChange({ ...valor, data })}
          ajuda="O dia da pelada, no fuso da arena."
        />

        <div className={css.linha}>
          {/*
            Os dois horários são o MESMO componente. Era essa a diferença que o
            `:first-child` produzia sem querer, e ela custou o P0-2: o INÍCIO em
            16px de corpo e o FIM em 24px de display, com o AM/PM do FIM cortado
            sem nenhum aviso.
          */}
          <CampoDeHorario
            rotulo="Início"
            valor={valor.inicio}
            invalido={Boolean(aviso)}
            onChange={(inicio) => onChange({ ...valor, inicio })}
          />
          <CampoDeHorario
            rotulo="Fim"
            valor={valor.fim}
            invalido={Boolean(aviso)}
            onChange={(fim) => onChange({ ...valor, fim })}
          />
          {acao ? <div className={css.acao}>{acao}</div> : null}
        </div>

        {aviso ? (
          <p className={css.aviso} role="alert">
            {aviso}
          </p>
        ) : (
          /*
            Achado P2-27: eram três expressões concatenadas no JSX, e saía
            "30min de busca" (sem espaço) para meia hora e "2h  de busca" (com
            espaço duplo) para uma janela cheia.
          */
          <p className={css.resumo}>{duracaoEmPalavras(minutos)} de busca</p>
        )}
      </div>
    </div>
  );
}

export default TimeRangePicker;

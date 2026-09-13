"use client";

import { useId, type ReactNode } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { diaCurto, diaEMes, diaIsoDaData, hhmm } from "@/lib/datas";
import css from "./CampoDeTempo.module.css";

/**
 * `CampoDeData` e `CampoDeHorario` — o nativo por baixo, o pt-BR por cima.
 *
 * ─── OS DOIS BUGS QUE ELES FECHAM ──────────────────────────────────────────
 *
 * **P0-3.** A busca mostrava a data como `09/13/2026` — mês antes do dia. Não é
 * bug do valor (o `value` é `2026-09-13` e o servidor recebia certo):
 * `<input type="date">` renderiza no locale da INTERFACE DO NAVEGADOR, e
 * `<html lang="pt-BR">` não muda isso. Qualquer celular cujo Chrome não esteja
 * em português mostra o formato americano — e o atleta que "buscou dia 13/09"
 * pode ter buscado 9 de dezembro. Foi o print do fundador.
 *
 * **P0-2.** O campo FIM mostrava `07:47` e o INÍCIO, do lado, `07:17 AM`: os
 * dois eram `type="time"` de 112px, o sufixo não cabia no FIM e **sumia sem
 * nenhum aviso**. Dava para mandar uma busca das 07:47 achando que era 19:47 —
 * e um resultado vazio é indistinguível de "não gravou", que é exatamente a
 * falha que a v2 saiu para consertar.
 *
 * ─── POR QUE O NATIVO FICA ─────────────────────────────────────────────────
 *
 * Um seletor próprio seria mais bonito e pior: o nativo abre a roda de horas do
 * iOS e o calendário do Android, que a pessoa já sabe usar de cor; funciona com
 * leitor de tela sem nenhum trabalho nosso; e não custa um byte de JavaScript
 * no 4G da quadra. O que estava errado nunca foi o CONTROLE — era a EXIBIÇÃO.
 *
 * ─── ENTÃO O NATIVO CONTINUA, E FICA INVISÍVEL ────────────────────────────
 *
 * O `<input>` cobre a caixa inteira com `opacity: 0`. Ele continua sendo o
 * elemento que recebe o toque (o picker abre), o foco (o anel é desenhado pela
 * caixa com `:focus-within`), o teclado e o leitor de tela — `opacity` não tira
 * nada disso da árvore de acessibilidade, ao contrário de `display: none` ou
 * `visibility: hidden`. O que o olho vê é o texto que NÓS escrevemos, a partir
 * do mesmo `value`, sempre em pt-BR e sempre em 24 h.
 *
 * `opacity: 0` e não `color: transparent`: o segundo depende de acertar
 * `::-webkit-datetime-edit` e seus cinco pseudoelementos filhos, e o Firefox não
 * tem nenhum deles — sobraria o separador do navegador aparecendo por trás do
 * nosso texto em metade dos aparelhos.
 *
 * ─── E A TIPOGRAFIA É A MESMA NOS DOIS HORÁRIOS ───────────────────────────
 *
 * A causa do P0-2 era um seletor posicional: `.caixa:first-child .entrada`,
 * escrito para pegar só a DATA, pegava também o INÍCIO — que é `:first-child`
 * da própria linha. Data em 16px Archivo, início em 16px Archivo, fim em 24px
 * Bricolage. Aqui a distinção é o COMPONENTE, e não a posição: dois
 * `CampoDeHorario` são dois `CampoDeHorario`, em qualquer ordem, dentro de
 * qualquer contêiner.
 */

type CampoBaseProps = {
  /** O rótulo curto em caixa alta: "Data", "Início", "Fim". */
  rotulo: string;
  /** Marca a caixa com o anel de erro. */
  invalido?: boolean;
  /** Descrição para o leitor de tela, quando o rótulo sozinho não basta. */
  ajuda?: string;
  className?: string;
};

function Caixa({
  rotulo,
  invalido,
  ajuda,
  className,
  id,
  idAjuda,
  icone,
  leitura,
  vazio,
  input,
}: CampoBaseProps & {
  id: string;
  idAjuda: string;
  icone: ReactNode;
  /** O texto em pt-BR — o que o olho lê. */
  leitura: string;
  /** Verdadeiro quando ainda não há valor: a leitura vira marca-d'água. */
  vazio: boolean;
  input: ReactNode;
}) {
  return (
    <div className={[css.caixa, invalido ? css.invalida : null, className].filter(Boolean).join(" ")}>
      <label className={css.rotulo} htmlFor={id}>
        {rotulo}
      </label>

      {/*
        A LEITURA É `aria-hidden`, E ISSO É DE PROPÓSITO.

        O `<input>` logo abaixo já tem o valor e já é anunciado pelo leitor de
        tela, com o formato que a plataforma daquela pessoa usa. Expor o nosso
        texto também faria a mesma data ser lida duas vezes, de dois jeitos.
        Quem lê com os olhos vê o nosso; quem ouve, ouve o do sistema.
      */}
      <span className={css.linha} aria-hidden="true">
        <span className={css.icone}>{icone}</span>
        <span className={[css.leitura, vazio ? css.marcaDagua : null].filter(Boolean).join(" ")}>
          {leitura}
        </span>
      </span>

      {input}

      {ajuda ? (
        <span id={idAjuda} className="apenas-leitor">
          {ajuda}
        </span>
      ) : null}
    </div>
  );
}

export type CampoDeDataProps = CampoBaseProps & {
  /** `2026-09-13` — o dia NO FUSO DA ARENA. */
  valor: string;
  onChange: (valor: string) => void;
  /** `2026-01-01`, para não deixar escolher antes do começo do acervo. */
  min?: string;
  max?: string;
  name?: string;
};

/**
 * A data, mostrada como "13 de set · sáb" e editada no calendário do aparelho.
 *
 * O dia da semana entra porque a pergunta do atleta é "a pelada de terça": ele
 * confere o dia da semana antes de conferir o número.
 */
export function CampoDeData({
  valor,
  onChange,
  rotulo,
  invalido,
  ajuda,
  className,
  min,
  max,
  name,
}: CampoDeDataProps) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const iso = valor ? diaIsoDaData(valor) : null;

  return (
    <Caixa
      id={id}
      idAjuda={idAjuda}
      rotulo={rotulo}
      invalido={invalido}
      ajuda={ajuda}
      className={className}
      icone={<CalendarDays size={16} strokeWidth={2.2} />}
      vazio={!valor}
      leitura={valor ? diaEMes(valor) : "Escolher o dia"}
      input={
        <>
          <input
            id={id}
            name={name}
            className={css.nativo}
            type="date"
            value={valor}
            min={min}
            max={max}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={ajuda ? idAjuda : undefined}
          />
          {iso ? (
            <span className={css.sufixo} aria-hidden="true">
              {diaCurto(iso)}
            </span>
          ) : null}
        </>
      }
    />
  );
}

export type CampoDeHorarioProps = CampoBaseProps & {
  /** `20:00` — hora da ARENA, sempre em 24 h. */
  valor: string;
  onChange: (valor: string) => void;
  name?: string;
};

/**
 * O horário, mostrado como "19:47" e editado na roda do aparelho.
 *
 * Em 24 h SEMPRE, independentemente de o aparelho estar em 12 h — e o `value`
 * do `<input type="time">` já é 24 h por especificação, então não há conversão
 * nenhuma: o que havia era um sufixo AM/PM desenhado pelo navegador, que não
 * cabia e sumia.
 */
export function CampoDeHorario({
  valor,
  onChange,
  rotulo,
  invalido,
  ajuda,
  className,
  name,
}: CampoDeHorarioProps) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;

  return (
    <Caixa
      id={id}
      idAjuda={idAjuda}
      rotulo={rotulo}
      invalido={invalido}
      ajuda={ajuda}
      className={className}
      icone={<Clock size={16} strokeWidth={2.2} />}
      vazio={!valor}
      leitura={valor ? hhmm(valor) : "--:--"}
      input={
        <input
          id={id}
          name={name}
          className={css.nativo}
          type="time"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={ajuda ? idAjuda : undefined}
        />
      }
    />
  );
}

/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CampoDeData, CampoDeHorario } from "./CampoDeTempo";
import { TimeRangePicker } from "./TimeRangePicker";

/**
 * Os dois P0 da revisão de 13/09 vivem aqui.
 *
 * **P0-3.** `<input type="date">` renderiza no locale da INTERFACE DO NAVEGADOR,
 * e `<html lang="pt-BR">` não muda isso: em produção a busca mostrou
 * `09/13/2026`. O que a pessoa confere tem de ser texto NOSSO.
 *
 * **P0-2.** O campo FIM mostrava `07:47` e o INÍCIO, do lado, `07:17 AM` — o
 * sufixo não cabia e sumia sem aviso, e dava para buscar 07:47 achando que era
 * 19:47. A causa era um seletor posicional que dava tipografias diferentes aos
 * dois horários.
 */

describe("CampoDeData (P0-3)", () => {
  it("mostra a data em pt-BR, e NUNCA o valor cru do navegador", () => {
    render(<CampoDeData rotulo="Data" valor="2026-09-13" onChange={() => {}} />);

    // "13 de set", e não `09/13/2026` nem `2026-09-13`.
    expect(screen.getByText("13 de set")).toBeInTheDocument();
    expect(screen.queryByText("09/13/2026")).toBeNull();
    expect(screen.queryByText("2026-09-13")).toBeNull();
  });

  it("o dia da semana aparece — a pergunta é 'a pelada de terça?'", () => {
    // 13/09/2026 é um domingo.
    render(<CampoDeData rotulo="Data" valor="2026-09-13" onChange={() => {}} />);
    expect(screen.getByText("dom")).toBeInTheDocument();
  });

  it("o `<input type=date>` NATIVO continua lá, com o valor ISO", () => {
    // O picker do iOS e o calendário do Android são o melhor do nativo, e é por
    // isso que a correção trocou a EXIBIÇÃO e não o CONTROLE.
    const { container } = render(
      <CampoDeData rotulo="Data" valor="2026-09-13" onChange={() => {}} />,
    );
    const input = container.querySelector("input");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveValue("2026-09-13");
  });

  it("o rótulo continua ligado ao campo, para o leitor de tela", () => {
    render(<CampoDeData rotulo="Data" valor="2026-09-13" onChange={() => {}} />);
    expect(screen.getByLabelText("Data")).toHaveAttribute("type", "date");
  });

  it("a leitura em pt-BR é `aria-hidden` — a data não é anunciada duas vezes", () => {
    const { container } = render(
      <CampoDeData rotulo="Data" valor="2026-09-13" onChange={() => {}} />,
    );
    const leitura = screen.getByText("13 de set");
    expect(leitura.closest("[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("input")).not.toHaveAttribute("aria-hidden");
  });

  it("sem valor, convida em vez de mostrar vazio", () => {
    render(<CampoDeData rotulo="Data" valor="" onChange={() => {}} />);
    expect(screen.getByText("Escolher o dia")).toBeInTheDocument();
  });

  it("devolve o valor ISO CRU para quem chamou, e não o texto em pt-BR", () => {
    // A tela em volta (a busca) converte com `instanteNaArena`, que só entende
    // `AAAA-MM-DD`. Se este `onChange` um dia passasse a emitir "13 de set", a
    // busca voltaria vazia sem erro nenhum — que é a falha mais cara do produto.
    const mudou = vi.fn();
    render(<CampoDeData rotulo="Data" valor="2026-09-13" onChange={mudou} />);

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-20" } });
    expect(mudou).toHaveBeenCalledWith("2026-09-20");
  });
});

describe("CampoDeHorario (P0-2)", () => {
  it("mostra 24 h, sem nenhum AM/PM para caber ou não caber", () => {
    render(<CampoDeHorario rotulo="Fim" valor="19:47" onChange={() => {}} />);
    expect(screen.getByText("19:47")).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).toBeNull();
  });

  it("o `<input type=time>` nativo continua lá", () => {
    const { container } = render(
      <CampoDeHorario rotulo="Início" valor="20:00" onChange={() => {}} />,
    );
    const input = container.querySelector("input");
    expect(input).toHaveAttribute("type", "time");
    expect(input).toHaveValue("20:00");
  });

  it("normaliza o que viria torto de um `.slice(0, 5)`", () => {
    render(<CampoDeHorario rotulo="Início" valor="8:00" onChange={() => {}} />);
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  it("sem valor, mostra a marca-d'água e não uma caixa vazia", () => {
    render(<CampoDeHorario rotulo="Fim" valor="" onChange={() => {}} />);
    expect(screen.getByText("--:--")).toBeInTheDocument();
  });

  it("devolve `HH:MM` em 24 h para quem chamou", () => {
    const mudou = vi.fn();
    render(<CampoDeHorario rotulo="Fim" valor="20:00" onChange={mudou} />);
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "19:47" } });
    expect(mudou).toHaveBeenCalledWith("19:47");
  });
});

describe("os três campos juntos, no TimeRangePicker", () => {
  const intervalo = { data: "2026-09-13", inicio: "20:00", fim: "21:00" };

  it("INÍCIO e FIM são o MESMO componente — não há `:first-child` para acertar", () => {
    // Era esta a causa do P0-2: `.caixa:first-child .entrada`, escrita para
    // pegar só a DATA, pegava também o INÍCIO (que é `:first-child` da linha).
    const { container } = render(
      <TimeRangePicker valor={intervalo} onChange={() => {}} agora={new Date()} />,
    );

    const inicio = screen.getByLabelText("Início");
    const fim = screen.getByLabelText("Fim");

    // Mesma classe de leitura nos dois, que é o que garante a mesma tipografia.
    const classeDe = (input: HTMLElement) =>
      input.parentElement?.querySelector("span span:last-child")?.className;
    expect(classeDe(inicio)).toBe(classeDe(fim));

    // E os três campos continuam sendo inputs nativos.
    expect(container.querySelectorAll("input")).toHaveLength(3);
  });

  it("os três valores aparecem em pt-BR de uma vez", () => {
    render(<TimeRangePicker valor={intervalo} onChange={() => {}} agora={new Date()} />);
    expect(screen.getByText("13 de set")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.getByText("21:00")).toBeInTheDocument();
  });

  it("o resumo da janela não sai mais grudado nem com espaço duplo (P2-27)", () => {
    // Saía "30min de busca" para meia hora e "2h  de busca" para uma janela
    // cheia — três expressões concatenadas no JSX.
    const { rerender } = render(
      <TimeRangePicker
        valor={{ data: "2026-09-13", inicio: "20:00", fim: "20:30" }}
        onChange={() => {}}
        agora={new Date()}
      />,
    );
    expect(screen.getByText("30 min de busca")).toBeInTheDocument();

    rerender(
      <TimeRangePicker
        valor={{ data: "2026-09-13", inicio: "20:00", fim: "22:00" }}
        onChange={() => {}}
        agora={new Date()}
      />,
    );
    expect(screen.getByText("2 h de busca")).toBeInTheDocument();

    rerender(
      <TimeRangePicker
        valor={{ data: "2026-09-13", inicio: "20:00", fim: "22:30" }}
        onChange={() => {}}
        agora={new Date()}
      />,
    );
    expect(screen.getByText("2 h 30 min de busca")).toBeInTheDocument();
  });

  it("a janela inválida marca os DOIS horários, e não a data", () => {
    render(
      <TimeRangePicker
        valor={{ data: "2026-09-13", inicio: "21:00", fim: "20:00" }}
        onChange={() => {}}
        agora={new Date()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("O fim precisa vir depois do início.");
  });
});

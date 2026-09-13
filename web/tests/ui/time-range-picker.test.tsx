/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeRangePicker, calcularAtalho, duracaoEmMinutos } from "@/components/ui";

// Os atalhos de tempo são a decisão de UX que separa o produto dos concorrentes
// (decisão 4 do design): o atleta está na quadra e não lembra o horário exato.
// Se "Agora" devolve a janela errada, a busca volta vazia e ele conclui que o
// lance não foi gravado.

describe("calcularAtalho", () => {
  const agora = new Date("2026-09-08T21:07:00");

  it("'agora' cobre os últimos 30 minutos", () => {
    expect(calcularAtalho("agora", agora)).toEqual({
      data: "2026-09-08",
      inicio: "20:37",
      fim: "21:07",
    });
  });

  it("'última hora' cobre os últimos 60 minutos", () => {
    expect(calcularAtalho("ultima-hora", agora)).toEqual({
      data: "2026-09-08",
      inicio: "20:07",
      fim: "21:07",
    });
  });

  it("'ontem à noite' cai no dia anterior, das 19h às 23h", () => {
    expect(calcularAtalho("ontem-a-noite", agora)).toEqual({
      data: "2026-09-07",
      inicio: "19:00",
      fim: "23:00",
    });
  });

  it("não devolve janela invertida quando o recuo cruza a meia-noite", () => {
    // 00:12 menos uma hora seria 23:12 do dia ANTERIOR — com uma data só no
    // seletor, isso viraria 23:12–00:12 e o servidor recusaria a janela.
    const madrugada = new Date("2026-09-08T00:12:00");
    expect(calcularAtalho("ultima-hora", madrugada)).toEqual({
      data: "2026-09-08",
      inicio: "00:00",
      fim: "00:12",
    });
  });

  it("todo atalho cabe no limite de 6 horas do produto", () => {
    for (const atalho of ["agora", "ultima-hora", "ontem-a-noite"] as const) {
      const minutos = duracaoEmMinutos(calcularAtalho(atalho, agora));
      expect(minutos).toBeGreaterThan(0);
      expect(minutos).toBeLessThanOrEqual(6 * 60);
    }
  });
});

describe("TimeRangePicker", () => {
  const agora = new Date("2026-09-08T21:07:00");
  const intervalo = { data: "2026-09-08", inicio: "20:00", fim: "21:00" };

  it("aplica o atalho no valor e avisa quem chamou", async () => {
    const usuario = userEvent.setup();
    const mudou = vi.fn();
    const escolheu = vi.fn();

    render(
      <TimeRangePicker valor={intervalo} onChange={mudou} onAtalho={escolheu} agora={agora} />,
    );

    await usuario.click(screen.getByRole("button", { name: /última hora/i }));

    const esperado = { data: "2026-09-08", inicio: "20:07", fim: "21:07" };
    expect(mudou).toHaveBeenCalledWith(esperado);
    expect(escolheu).toHaveBeenCalledWith("ultima-hora", esperado);
  });

  it("avisa quando a janela passa de 6 horas", () => {
    render(
      <TimeRangePicker
        valor={{ data: "2026-09-08", inicio: "08:00", fim: "20:00" }}
        onChange={() => {}}
        agora={agora}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A busca cobre no máximo 6 horas de uma vez.",
    );
  });

  it("avisa quando o fim vem antes do início", () => {
    render(
      <TimeRangePicker
        valor={{ data: "2026-09-08", inicio: "21:00", fim: "20:00" }}
        onChange={() => {}}
        agora={agora}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("O fim precisa vir depois do início.");
  });

  it("marca o atalho aceso com aria-pressed", () => {
    render(
      <TimeRangePicker valor={intervalo} onChange={() => {}} atalhoAtivo="agora" agora={agora} />,
    );

    // "Acabei de jogar" e não "Agora": a folha de voz da v2 nomeia a SITUAÇÃO do
    // atleta, não a função do sistema.
    expect(screen.getByRole("button", { name: /acabei de jogar/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /ontem à noite/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

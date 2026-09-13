/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { VirtualButton } from "@/components/ui";

// O COOLDOWN É A LIÇÃO DO 1.0.
//
// Sem ele, dez pessoas apertam no mesmo gol e o relay recebe dez pedidos de
// corte da MESMA janela. O teste garante as três partes: o botão trava, a
// contagem aparece (um botão que só "não responde" faz a pessoa apertar mais
// forte) e ele volta sozinho.

describe("VirtualButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** `userEvent` não combina com timers falsos; o clique aqui é direto. */
  async function clicar(elemento: HTMLElement) {
    await act(async () => {
      elemento.click();
    });
  }

  async function avancar(segundos: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(segundos * 1000);
    });
  }

  it("trava, mostra a contagem e libera sozinho", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    render(<VirtualButton onSalvar={salvar} cooldownSegundos={10} agora={() => new Date("2026-09-08T20:47:00")} />);

    const botao = screen.getByRole("button", { name: /salvar lance/i });
    await clicar(botao);

    expect(salvar).toHaveBeenCalledTimes(1);

    const travado = screen.getByRole("button", { name: /libera em 10s/i });
    expect(travado).toBeDisabled();

    // Um segundo depois a contagem TEM de andar: contador parado é
    // indistinguível de tela travada.
    await avancar(1);
    expect(screen.getByRole("button", { name: /libera em 9s/i })).toBeDisabled();

    await avancar(9);
    const liberado = screen.getByRole("button", { name: /salvar lance/i });
    expect(liberado).toBeEnabled();
  });

  it("ignora o segundo toque enquanto o cooldown corre", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    render(<VirtualButton onSalvar={salvar} cooldownSegundos={5} />);

    const botao = screen.getByRole("button", { name: /salvar lance/i });
    await clicar(botao);
    await clicar(screen.getByRole("button"));
    await clicar(screen.getByRole("button"));

    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("confirma com o HORÁRIO — é por ele que o atleta acha o vídeo depois", async () => {
    render(
      <VirtualButton
        onSalvar={() => undefined}
        cooldownSegundos={5}
        agora={() => new Date("2026-09-08T20:47:00")}
      />,
    );

    await clicar(screen.getByRole("button", { name: /salvar lance/i }));

    const confirmacao = screen.getByRole("status");
    expect(confirmacao).toHaveTextContent("Salvo às 20:47");
  });

  it("prefere o horário que o servidor devolveu ao relógio do celular", async () => {
    render(
      <VirtualButton
        onSalvar={async () => "21:03"}
        cooldownSegundos={5}
        agora={() => new Date("2026-09-08T20:47:00")}
      />,
    );

    await clicar(screen.getByRole("button", { name: /salvar lance/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Salvo às 21:03");
  });

  it("desabilitado fora de sessão ao vivo, com o motivo na tela", () => {
    render(
      <VirtualButton
        disabled
        motivo="O botão virtual aparece durante uma sessão ao vivo da sua quadra."
      />,
    );

    expect(screen.getByRole("button", { name: /salvar lance/i })).toBeDisabled();
    // O motivo é texto visível, não `title`: `title` não existe no toque.
    expect(
      screen.getByText(/aparece durante uma sessão ao vivo/i),
    ).toBeInTheDocument();
  });
});

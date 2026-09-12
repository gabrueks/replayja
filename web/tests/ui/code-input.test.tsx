/**
 * @vitest-environment jsdom
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CodeInput } from "@/components/ui";

// O campo de código é o gargalo do login inteiro: se ele falha, ninguém entra no
// produto. Os três caminhos cobertos aqui são os que quebram na vida real —
// digitar com avanço automático, COLAR (como a maioria faz) e apagar.

function Anfitriao({ aoCompletar }: { aoCompletar?: (v: string) => void }) {
  const [valor, setValor] = useState("");
  return <CodeInput valor={valor} onChange={setValor} onCompleto={aoCompletar} />;
}

function caixas(): HTMLInputElement[] {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

describe("CodeInput", () => {
  it("avança sozinho a cada dígito digitado", async () => {
    const usuario = userEvent.setup();
    render(<Anfitriao />);

    const campos = caixas();
    expect(campos).toHaveLength(6);

    campos[0]?.focus();
    await usuario.keyboard("123");

    expect(campos[0]?.value).toBe("1");
    expect(campos[1]?.value).toBe("2");
    expect(campos[2]?.value).toBe("3");
    // O foco tem de estar na PRÓXIMA caixa vazia, senão o quarto dígito
    // sobrescreve o terceiro.
    expect(document.activeElement).toBe(campos[3]);
  });

  it("chama onCompleto quando o sexto dígito entra", async () => {
    const usuario = userEvent.setup();
    const completou = vi.fn();
    render(<Anfitriao aoCompletar={completou} />);

    caixas()[0]?.focus();
    await usuario.keyboard("482913");

    expect(completou).toHaveBeenCalledWith("482913");
  });

  it("preenche as seis caixas ao colar em qualquer uma delas", async () => {
    const usuario = userEvent.setup();
    const completou = vi.fn();
    render(<Anfitriao aoCompletar={completou} />);

    // Colar na TERCEIRA caixa: é o que acontece quando a pessoa toca no meio do
    // campo antes de colar.
    const campos = caixas();
    campos[2]?.focus();
    await usuario.paste("845 201");

    // Espaço e qualquer outro caractere não numérico são descartados.
    expect(campos.map((c) => c.value).join("")).toBe("845201");
    expect(completou).toHaveBeenCalledWith("845201");
  });

  it("ignora letras coladas e mantém só os dígitos", async () => {
    const usuario = userEvent.setup();
    render(<Anfitriao />);

    caixas()[0]?.focus();
    await usuario.paste("cod: 12ab34");

    expect(caixas().map((c) => c.value).join("")).toBe("1234");
  });

  it("volta e apaga quando o Backspace cai numa caixa vazia", async () => {
    const usuario = userEvent.setup();
    render(<Anfitriao />);

    const campos = caixas();
    campos[0]?.focus();
    await usuario.keyboard("12");

    // O foco está na terceira caixa, vazia. Backspace aqui tem de apagar o "2"
    // e voltar — senão a pessoa fica apertando sem efeito visível.
    await usuario.keyboard("{Backspace}");

    expect(campos[1]?.value).toBe("");
    expect(document.activeElement).toBe(campos[1]);
    expect(campos[0]?.value).toBe("1");
  });

  it("dá a cada caixa um rótulo próprio e marca o erro", () => {
    render(<CodeInput valor="12" onChange={() => {}} erro="Código inválido ou expirado." />);

    expect(screen.getByLabelText("Dígito 1 de 6")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Código inválido ou expirado.");
    expect(screen.getByLabelText("Dígito 1 de 6")).toHaveAttribute("aria-invalid", "true");
  });
});

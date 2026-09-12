/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareBar, ToastProvider, linkDoWhatsApp } from "@/components/ui";

// O FALLBACK É O CAMINHO PRINCIPAL, não a exceção.
//
// `navigator.share` não existe no Chrome de desktop nem no Firefox, e o produto
// é compartilhado do celular E do computador. Se o fallback quebra, o botão
// WhatsApp simplesmente não faz nada — e o compartilhamento é o motor de
// divulgação que a arena compra.

const URL_DO_LANCE = "https://replayja.com.br/arena-calabouco/s/2026-09-08-20h-21h";

function montar(props: Partial<Parameters<typeof ShareBar>[0]> = {}) {
  return render(
    <ToastProvider>
      <ShareBar url={URL_DO_LANCE} titulo="Lance das 20:47" urlDoArquivo="/baixar.mp4" {...props} />
    </ToastProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  // `navigator` é redefinido com `defineProperty` nos testes; limpar evita que o
  // `share` de um teste vaze para o seguinte.
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

describe("ShareBar — sem Web Share API", () => {
  it("abre o wa.me quando navigator.share não existe", async () => {
    const usuario = userEvent.setup();
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);

    montar();
    await usuario.click(screen.getByRole("button", { name: /whatsapp/i }));

    await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
    const [endereco] = abrir.mock.calls[0] as [string];
    expect(endereco).toBe(linkDoWhatsApp("Olha esse lance: Lance das 20:47", URL_DO_LANCE));
    expect(endereco).toContain(encodeURIComponent(URL_DO_LANCE));
  });

  it("copia o link pela área de transferência e confirma na tela", async () => {
    // A ORDEM IMPORTA: `userEvent.setup()` instala o próprio stub de
    // `navigator.clipboard`. Espionar antes dele seria espionar um objeto que o
    // Testing Library substitui em seguida.
    const usuario = userEvent.setup();
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: escrever },
      configurable: true,
    });

    montar();
    await usuario.click(screen.getByRole("button", { name: /copiar link/i }));

    expect(escrever).toHaveBeenCalledWith(URL_DO_LANCE);
    expect(await screen.findByRole("status")).toHaveTextContent("Link copiado");
    expect(await screen.findByRole("button", { name: /copiado/i })).toBeInTheDocument();
  });

  it("explica o caminho manual quando o Instagram não tem folha de compartilhamento", async () => {
    const usuario = userEvent.setup();

    montar();
    await usuario.click(screen.getByRole("button", { name: /instagram/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Baixe o vídeo e poste pelo app do Instagram.",
    );
  });
});

describe("ShareBar — com Web Share API", () => {
  it("usa a folha do sistema em vez do wa.me", async () => {
    const compartilhar = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: compartilhar, configurable: true });
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    const usuario = userEvent.setup();

    montar();
    await usuario.click(screen.getByRole("button", { name: /whatsapp/i }));

    await waitFor(() => expect(compartilhar).toHaveBeenCalledTimes(1));
    expect(abrir).not.toHaveBeenCalled();
    expect(compartilhar.mock.calls[0]?.[0]).toMatchObject({ url: URL_DO_LANCE });
  });

  it("cai no wa.me quando a folha do sistema falha", async () => {
    // Não é `AbortError` (que significa "a pessoa cancelou"): é erro de verdade,
    // e nesse caso o fallback tem de assumir.
    const compartilhar = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "share", { value: compartilhar, configurable: true });
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    const usuario = userEvent.setup();

    montar();
    await usuario.click(screen.getByRole("button", { name: /whatsapp/i }));

    await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
  });
});

describe("ShareBar — deslogado", () => {
  it("troca as quatro ações por links de login", () => {
    montar({ hrefDeLogin: "/entrar?redirectTo=%2Farena-calabouco" });

    // Nenhum botão: tudo vira link, e o link explica para onde leva.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("link", { name: /entrar para baixar/i })).toHaveAttribute(
      "href",
      "/entrar?redirectTo=%2Farena-calabouco",
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
});

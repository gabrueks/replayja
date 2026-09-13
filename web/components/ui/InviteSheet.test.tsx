/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InviteSheet } from "./InviteSheet";
import { ToastProvider } from "./Toast";

/**
 * A folha de convite aparecia TRANSPARENTE no celular do fundador (bug 4).
 *
 * A causa não estava nela: estava em QUEM A EMBALA. Ela é aberta de dentro do
 * cabeçalho `.tinta` da página do grupo, e um `<dialog>` — mesmo subindo para a
 * camada de topo com `showModal()` — continua herdando as variáveis de CSS do
 * pai NO DOM. Lá dentro `--cor-superficie` vale `rgba(255,255,255,0.07)`, então
 * `background: var(--cor-superficie)` pintava 7% de branco.
 *
 * O jsdom não resolve variável de CSS nem faz layout, então o que se pode prender
 * aqui é o MECANISMO: a folha veste `luz` (a classe que devolve a paleta clara à
 * subárvore) e continua sendo um `<dialog>` modal de verdade. O valor da cor em
 * si está preso em `chassi.test.ts`, que lê a folha de estilo.
 */

beforeAll(() => {
  // O jsdom não implementa `showModal`/`close` — sem isto o efeito do
  // componente explode antes de qualquer asserção.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

function abrirDentroDoEscuro() {
  return render(
    <ToastProvider>
      {/* `tinta` é a classe global do cabeçalho preto do grupo — é ELA que
          escurecia a folha. O teste reproduz a situação exata do bug. */}
      <div className="tinta">
        <InviteSheet
          aberto
          onFechar={vi.fn()}
          url="https://replayja.com.br/arena-vasco/fut-de-sexta"
          nomeDoGrupo="Fut de sexta"
        />
      </div>
    </ToastProvider>,
  );
}

describe("InviteSheet", () => {
  it("veste a paleta clara mesmo aberta de dentro de um bloco `.tinta`", () => {
    const { container } = abrirDentroDoEscuro();
    const dialogo = container.querySelector("dialog");

    expect(dialogo).not.toBeNull();
    // Sem `luz` a folha herda `--cor-superficie: rgba(255,255,255,0.07)` do
    // `.tinta` acima e desaparece.
    expect(dialogo?.classList.contains("luz")).toBe(true);
  });

  it("continua sendo um diálogo MODAL, e não um painel solto", () => {
    const { container } = abrirDentroDoEscuro();
    const dialogo = container.querySelector("dialog");
    // `showModal()` é o que traz trava de foco, Esc e `::backdrop`. Um
    // `open={aberto}` no JSX abriria o diálogo não modal — sem nada disso, e o
    // backdrop é metade da correção do bug 4.
    expect(dialogo?.open).toBe(true);
  });

  it("mostra os três caminhos do convite", () => {
    abrirDentroDoEscuro();
    expect(screen.getByRole("heading", { name: "Chamar a galera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Chamar no WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Convidar por e-mail/i })).toBeInTheDocument();
    // E a saída, que é o que fecha a folha para quem não conhece o gesto de
    // arrastar nem o toque no backdrop.
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });
});

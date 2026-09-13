/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { RodapeFixo } from "./RodapeFixo";

/**
 * A reserva de espaço do chassi fixo — o achado P0-1.
 *
 * O que dá para prender em jsdom não é o pixel (jsdom não faz layout: toda
 * medida é 0). É o MECANISMO: existe uma reserva, ela vem antes da barra, ela
 * acompanha a altura medida, e ela não desaba para zero quando a medida vem
 * zerada. Os três são exatamente os modos como este bug volta.
 */

type Callback = () => void;

let observados: Array<{ alvo: Element; disparar: Callback }> = [];
let desconectados = 0;

class ResizeObserverFalso {
  private cb: Callback;
  constructor(cb: Callback) {
    this.cb = cb;
  }
  observe(alvo: Element) {
    observados.push({ alvo, disparar: () => this.cb() });
  }
  disconnect() {
    desconectados += 1;
  }
  unobserve() {}
}

/** Faz a barra "ter" uma altura, que em jsdom é sempre 0. */
function fingirAltura(el: Element, altura: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    height: altura,
    width: 390,
    top: 0,
    left: 0,
    right: 390,
    bottom: altura,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

beforeEach(() => {
  observados = [];
  desconectados = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RodapeFixo", () => {
  it("desenha a reserva ANTES da barra, no fluxo", () => {
    // A ordem importa: a reserva tem de ser um bloco que o documento conta na
    // altura, e a barra sai do fluxo (`position: fixed`). Reserva depois da
    // barra continuaria funcionando, mas reserva DENTRO dela não — e é o erro
    // fácil de cometer na próxima edição.
    const { container } = render(
      <RodapeFixo>
        <span>barra</span>
      </RodapeFixo>,
    );

    const reserva = container.querySelector("[data-reserva-do-rodape]");
    expect(reserva).not.toBeNull();
    expect(container.firstElementChild).toBe(reserva);
    expect(reserva?.nextElementSibling?.textContent).toBe("barra");
  });

  it("a reserva é invisível para o leitor de tela e para o dedo", () => {
    const { container } = render(
      <RodapeFixo>
        <span>barra</span>
      </RodapeFixo>,
    );
    expect(container.querySelector("[data-reserva-do-rodape]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("antes de medir, usa a altura NOMINAL — que é o que o HTML do servidor leva", () => {
    // No 4G da quadra existe uma janela entre o HTML e a hidratação. Se a
    // reserva nascesse zerada, o bug apareceria justamente ali.
    const { container } = render(
      <RodapeFixo reservaInicial={76}>
        <span>barra</span>
      </RodapeFixo>,
    );

    const reserva = container.querySelector("[data-reserva-do-rodape]") as HTMLElement;
    // Em jsdom a medida é 0 e é descartada, então o nominal permanece.
    expect(reserva.style.getPropertyValue("--rodape-reserva")).toBe("76px");
    expect(reserva.style.height).toBe("");
  });

  it("uma medida ZERADA não vira reserva zero", () => {
    // Um `display: none` momentâneo (transição de rota, aba de fundo) mede 0.
    // Reservar 0 é reabrir o bug — e em jsdom TODA medida é 0, então este é
    // exatamente o caminho que o teste acima percorre.
    const { container } = render(
      <RodapeFixo reservaInicial={116}>
        <span>barra</span>
      </RodapeFixo>,
    );
    const reserva = container.querySelector("[data-reserva-do-rodape]") as HTMLElement;
    expect(reserva.style.height).not.toBe("0px");
  });

  it("quando a barra tem altura de verdade, a reserva vira exatamente ela", () => {
    const { container } = render(
      <RodapeFixo reservaInicial={116}>
        <span>barra</span>
      </RodapeFixo>,
    );

    const reserva = container.querySelector("[data-reserva-do-rodape]") as HTMLElement;
    const barra = reserva.nextElementSibling as HTMLElement;

    // 131 = um CTA com DUAS ações empilhadas. O número fixo de 116 errava aqui,
    // e era o caso do `/entrar` ("Continuar com o Google" embaixo).
    fingirAltura(barra, 131);
    act(() => {
      observados.forEach((o) => o.disparar());
    });

    expect(reserva.style.height).toBe("131px");
    // O nominal sai de cena: a medida já inclui a área segura do aparelho, e
    // somar o `env()` de novo reservaria o entalhe duas vezes.
    expect(reserva.style.getPropertyValue("--rodape-reserva")).toBe("");
  });

  it("observa a BARRA, e larga o observador ao desmontar", () => {
    const { container, unmount } = render(
      <RodapeFixo>
        <span>barra</span>
      </RodapeFixo>,
    );
    const barra = container.querySelector("[data-reserva-do-rodape]")?.nextElementSibling;

    expect(observados).toHaveLength(1);
    expect(observados[0]?.alvo).toBe(barra);

    unmount();
    expect(desconectados).toBe(1);
  });

  it("`semReserva` some com o bloco — e só com ele", () => {
    const { container } = render(
      <RodapeFixo semReserva>
        <span>barra</span>
      </RodapeFixo>,
    );
    expect(container.querySelector("[data-reserva-do-rodape]")).toBeNull();
    expect(container.textContent).toBe("barra");
  });

  it("sem `ResizeObserver` no navegador, a barra ainda sai e a reserva continua nominal", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { container } = render(
      <RodapeFixo reservaInicial={76}>
        <span>barra</span>
      </RodapeFixo>,
    );
    const reserva = container.querySelector("[data-reserva-do-rodape]") as HTMLElement;
    expect(reserva.style.getPropertyValue("--rodape-reserva")).toBe("76px");
    expect(container.textContent).toBe("barra");
  });
});

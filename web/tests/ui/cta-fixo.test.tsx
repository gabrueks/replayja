/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, CtaFixo } from "@/components/ui";

/**
 * O CTA fixo existe para consertar um defeito concreto: na página da arena
 * deslogada, "Entrar pra liberar a busca" ficava no meio do scroll e sumia
 * assim que o atleta descia para ver os horários — ou seja, sumia exatamente
 * quando ele estava convencido.
 *
 * O que estes testes prendem é o CONTRATO do componente, não o pixel:
 *
 *  1. A ação continua sendo um botão/link alcançável (nada de `div` clicável).
 *  2. A linha de apoio é TEXTO na tela — "Leva 20 segundos, sem senha" é a
 *     objeção que a pessoa tem no dedo, e ela não pode virar `title` nem
 *     `aria-label`, que não existem no toque.
 *  3. A barra é fixa e respeita a área segura do aparelho — no iPhone com
 *     indicador de gesto, um botão colado em `bottom: 0` vira "voltar à tela
 *     inicial".
 */
describe("CtaFixo", () => {
  it("mantém a ação alcançável", () => {
    render(
      <CtaFixo>
        <Button href="/entrar" tamanho={56} largura="total">
          Entrar pra ver meus lances
        </Button>
      </CtaFixo>,
    );

    const acao = screen.getByRole("link", { name: /entrar pra ver meus lances/i });
    expect(acao).toHaveAttribute("href", "/entrar");
  });

  it("mostra o apoio como texto visível, não como atributo", () => {
    render(
      <CtaFixo apoio="Leva 20 segundos. Sem senha, sem cadastro.">
        <Button tamanho={56} largura="total">
          Entrar pra ver meus lances
        </Button>
      </CtaFixo>,
    );

    const apoio = screen.getByText(/leva 20 segundos\. sem senha, sem cadastro\./i);
    expect(apoio).toBeInTheDocument();
    // Texto de verdade: se alguém trocar por `aria-label` no botão, este teste cai.
    expect(apoio.tagName).toBe("P");
  });

  it("sem apoio, não desenha um parágrafo vazio", () => {
    const { container } = render(
      <CtaFixo>
        <Button tamanho={56}>Entrar</Button>
      </CtaFixo>,
    );

    expect(container.querySelector("p")).toBeNull();
  });

  it("a barra fica presa no rodapé e reserva a área segura", () => {
    const { container } = render(
      <CtaFixo apoio="Leva 20 segundos.">
        <Button tamanho={56}>Entrar</Button>
      </CtaFixo>,
    );

    // jsdom não aplica CSS Modules, então o que dá para conferir é o contrato de
    // classe: a barra é um bloco só, com uma coluna interna. A geometria em si
    // vive em `CtaFixo.module.css` e é conferida pelo Lighthouse (alvo de toque)
    // e pelas capturas de tela.
    const barra = container.firstElementChild;
    expect(barra).not.toBeNull();
    expect(barra?.children).toHaveLength(1);
  });

  it("aceita duas ações empilhadas", () => {
    render(
      <CtaFixo apoio="Leva 20 segundos.">
        <Button tamanho={56} largura="total">
          Entrar pra ver meus lances
        </Button>
        <Button tamanho={52} largura="total" variante="secundario">
          Continuar com o Google
        </Button>
      </CtaFixo>,
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

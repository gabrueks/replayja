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

  it("reserva o próprio espaço, com um irmão no fluxo antes da barra", () => {
    const { container } = render(
      <CtaFixo apoio="Leva 20 segundos.">
        <Button tamanho={56}>Entrar</Button>
      </CtaFixo>,
    );

    // É a correção do P0-1. A reserva era `.com-cta`, uma classe global que a
    // TELA aplicava — e que o `padding` no atalho do módulo da página derrubava
    // em silêncio, deixando o CTA em cima do fim do conteúdo. Agora ela vem com
    // o componente, e vem ANTES da barra: é um bloco no fluxo do documento, que
    // é o que faz a página ficar mais alta em vez de ganhar um `padding`.
    const reserva = container.querySelector("[data-reserva-do-rodape]");
    expect(reserva).not.toBeNull();
    expect(container.firstElementChild).toBe(reserva);
    // Ela não existe para o leitor de tela nem para o dedo.
    expect(reserva).toHaveAttribute("aria-hidden", "true");

    // jsdom não aplica CSS Modules, então o que dá para conferir é o contrato de
    // estrutura: a barra é o irmão seguinte, com uma coluna interna. A geometria
    // vive em `RodapeFixo.module.css`/`CtaFixo.module.css` e é conferida pelo
    // Lighthouse e pelas capturas.
    const barra = reserva?.nextElementSibling;
    expect(barra).not.toBeNull();
    expect(barra?.children).toHaveLength(1);
  });

  it("`semReserva` desliga a reserva, para o catálogo que empilha exemplos", () => {
    const { container } = render(
      <CtaFixo semReserva>
        <Button tamanho={56}>Entrar</Button>
      </CtaFixo>,
    );

    expect(container.querySelector("[data-reserva-do-rodape]")).toBeNull();
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

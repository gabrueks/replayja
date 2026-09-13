/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipGrid } from "./ClipGrid";
import { ToastProvider } from "./Toast";
import type { Clipe } from "./tipos";

/**
 * Os achados de acessibilidade da revisão de 13/09 — P1-22, P2-29, P1-23, P2-35
 * e P2-38.
 *
 * Todos eles têm a mesma forma: um comentário no código PROMETIA o
 * comportamento, e a implementação não o entregava. É o tipo de defeito que
 * nenhuma revisão de código pega, porque o comentário parece a documentação de
 * uma coisa feita.
 */

const RAIZ = resolve(process.cwd());
function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/**
 * O arquivo SEM os comentários.
 *
 * Os blocos desta base explicam os defeitos pelo nome — inclusive os atributos
 * que estes testes proíbem. Comparar contra o arquivo cru acusaria a própria
 * documentação da correção.
 */
function lerCodigo(caminho: string): string {
  return ler(caminho)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function clipe(over: Partial<Clipe> = {}): Clipe {
  return {
    id: over.id ?? "c1",
    horario: "20:47",
    quandoIso: "2026-09-13T20:47:00",
    duracao: "0:22",
    quadra: "Quadra 2",
    estado: "pronto",
    href: "/arena-vasco/c/c1",
    ...over,
  };
}

describe("o toast de erro interrompe (P1-22)", () => {
  it("são DUAS regiões vivas, e as duas nascem montadas", () => {
    // O comentário do componente prometia que "o toast de erro sobe para
    // assertive". Havia UMA região `polite` com `role="alert"` no item dentro
    // dela — e a politeness de um anúncio é decidida pela região viva
    // ANCESTRAL, não pelo papel do nó inserido. "Sem conexão" chegava atrasado.
    const { container } = render(<ToastProvider>{null}</ToastProvider>);

    const polite = container.querySelector('[aria-live="polite"]');
    const assertive = container.querySelector('[aria-live="assertive"]');

    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    // Uma região viva criada no mesmo instante em que ganha conteúdo costuma não
    // ser anunciada: o leitor de tela precisa já estar observando o nó.
    expect(polite?.childElementCount).toBe(0);
    expect(assertive?.childElementCount).toBe(0);
  });

  it("o papel acompanha o `aria-live` no MESMO elemento", () => {
    const { container } = render(<ToastProvider>{null}</ToastProvider>);
    expect(container.querySelector('[aria-live="polite"]')).toHaveAttribute("role", "status");
    expect(container.querySelector('[aria-live="assertive"]')).toHaveAttribute("role", "alert");
  });

  it("nenhum item carrega o próprio `role` — era esse o erro", () => {
    const fonte = lerCodigo(join("components", "ui", "Toast.tsx"));
    expect(fonte).not.toMatch(/role=\{item\.tom === "erro"/);
  });
});

describe("o horário é um `<time>` (P2-35)", () => {
  it("o card marca o instante de forma legível por máquina", () => {
    // O repositório inteiro não tinha nenhum `<time>`: nenhum horário era
    // marcado semanticamente, e a regra global `.tempo, time` nunca casava pelo
    // segundo seletor.
    const { container } = render(<ClipGrid clipes={[clipe()]} />);
    const tempo = container.querySelector("time");
    expect(tempo).not.toBeNull();
    expect(tempo).toHaveAttribute("datetime", "2026-09-13T20:47:00");
    expect(tempo?.textContent).toBe("20:47");
  });

  it("`.contador` saiu da regra global — ela era letra morta", () => {
    // `.contador` só existe como classe de MÓDULO, e o nome que chega ao HTML é
    // hasheado: o seletor global nunca casava. Uma regra que não casa com nada é
    // pior que regra nenhuma — ela dá a impressão de que o problema está
    // resolvido.
    const globais = ler(join("app", "globals.css"));
    expect(globais).not.toMatch(/\.tempo, time, \.contador/);
    expect(globais).toMatch(/\.tempo,\s*\n\s*time \{/);
  });
});

describe("a transição 'Cortando… → pronto' é anunciada (P2-38)", () => {
  it("o selo que MUDA é o `role=\"status\"`, e não o card inteiro", () => {
    render(<ClipGrid clipes={[clipe({ estado: "processando", href: undefined })]} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Cortando");
  });

  it("a grade fica viva SÓ quando há algo em corte", () => {
    // Uma grade estática marcada como viva faria o leitor de tela reler a lista
    // inteira a cada busca nova.
    const { container: comCorte } = render(
      <ClipGrid clipes={[clipe({ estado: "processando", href: undefined })]} />,
    );
    expect(comCorte.querySelector("ul")).toHaveAttribute("aria-live", "polite");

    const { container: semCorte } = render(<ClipGrid clipes={[clipe()]} />);
    expect(semCorte.querySelector("ul")).not.toHaveAttribute("aria-live");
  });

  it("o card em corte deixou de ser um `role=\"group\"` sem foco e sem filhos rotulados", () => {
    const fonte = lerCodigo(join("components", "ui", "ClipCard.tsx"));
    expect(fonte).not.toMatch(/role="group"/);
  });

  it("a grade borrada continua invisível ao leitor de tela, e sem `aria-live`", () => {
    const { container } = render(
      <ClipGrid clipes={[clipe({ estado: "processando", href: undefined })]} borrada />,
    );
    const ul = container.querySelector("ul");
    expect(ul).toHaveAttribute("aria-hidden", "true");
    expect(ul).not.toHaveAttribute("aria-live");
  });
});

describe("o foco e o erro deixaram de ser o mesmo sinal (P2-29)", () => {
  it("o erro é mais grosso E tem fundo tingido, não só outra cor", () => {
    // O anel de foco é `#D93C06` e o de erro `#B5122E`: dois vermelhos-laranja
    // de 2,5px que, num campo de 390px, são o mesmo sinal — e em `/entrar` o
    // campo abre autofocado, parecendo um campo com erro antes de a pessoa
    // digitar qualquer coisa. Estado nunca é só cor; é a regra que o `StatusDot`
    // já respeitava.
    for (const arquivo of ["Input.module.css", "CampoDeTempo.module.css"]) {
      const css = ler(join("components", "ui", arquivo));
      expect(css, arquivo).toMatch(/box-shadow: 0 0 0 2\.5px var\(--cor-acao\)/);
      expect(css, arquivo).toMatch(/box-shadow: 0 0 0 3\.5px var\(--cor-erro\)/);
      expect(css, arquivo).toMatch(/background: var\(--cor-erro-fraca\)/);
    }
  });

  it("o erro VENCE o foco: um campo inválido focado continua lendo como inválido", () => {
    for (const arquivo of ["Input.module.css", "CampoDeTempo.module.css"]) {
      expect(ler(join("components", "ui", arquivo)), arquivo).toMatch(/invalida:focus-within/);
    }
  });
});

describe("o foco na folha de convite voltou a existir (P1-23)", () => {
  it("o anel é da CAIXA, com `:focus-within`", () => {
    // O `<input readOnly>` do link é o PRIMEIRO focável do `<dialog>`, ou seja, o
    // que recebe o foco de `showModal()`. Com `outline: none` nele e sem
    // `:focus-within` na caixa, abrir a folha pelo teclado deixava o foco
    // invisível — e some também no alto contraste do Windows.
    const css = ler(join("components", "ui", "InviteSheet.module.css"));
    expect(css).toMatch(/\.linkCaixa:focus-within \{[\s\S]*?box-shadow: 0 0 0 2\.5px var\(--cor-acao\)/);
  });
});

describe("os alvos de toque abaixo de 44px (P2-30)", () => {
  it("as quatro ações de texto do achado declaram o mínimo", () => {
    // "Trocar arena" media 75 × 20, "Ver todos" e "Limpar" ~18px de altura, e as
    // três ficavam AO LADO de alvos de 44+, o que é pior que um alvo pequeno
    // sozinho: o dedo mira pela vizinhança.
    const casos: Array<[string, string]> = [
      [join("app", "app", "buscar", "buscar.module.css"), "trocar"],
      [join("app", "app", "arenas.module.css"), "limpar"],
      [join("app", "app", "app.module.css"), "avatar"],
      [join("app", "[arenaSlug]", "grupos", "novo", "criar-grupo.module.css"), "caminho"],
    ];
    for (const [arquivo, classe] of casos) {
      expect(ler(arquivo), `${arquivo} → .${classe}`).toMatch(/var\(--toque-min\)/);
    }
  });
});

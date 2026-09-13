/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ABAS_DO_ATLETA, BottomNav, abaAtivaDe } from "@/components/ui";

/**
 * A barra inferior é o chassi do app: se a aba acesa estiver errada, o atleta
 * acha que está numa tela que não é a dele.
 *
 * O risco real não é a barra sumir — é ela MENTIR quando alguém acrescenta uma
 * rota. `/app/grupos` casa com o prefixo `/app` da aba "Arenas" E com `/app/grupos`
 * da aba "Grupos": sem a regra de "o prefixo mais longo ganha", a primeira aba
 * ganharia e "Arenas" ficaria acesa dentro de Grupos. É esse empate que os testes
 * abaixo prendem.
 */

// `usePathname` vem do roteador do Next, que não existe fora de uma página. O
// componente aceita `caminho` justamente para o teste não precisar montar um
// roteador inteiro — mas o mock ainda é necessário porque o hook é chamado
// incondicionalmente (regra dos hooks).
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("abaAtivaDe", () => {
  it("acende a aba exata", () => {
    expect(abaAtivaDe("/app")).toBe("arenas");
    expect(abaAtivaDe("/app/grupos")).toBe("grupos");
    expect(abaAtivaDe("/app/perfil")).toBe("perfil");
    expect(abaAtivaDe("/app/lances")).toBe("lances");
  });

  it("o prefixo MAIS LONGO ganha — /app/grupos não acende Arenas", () => {
    expect(abaAtivaDe("/app/grupos")).toBe("grupos");
    expect(abaAtivaDe("/app/grupos/qualquer-coisa")).toBe("grupos");
  });

  it("uma aba pode reivindicar mais de um prefixo", () => {
    // A busca por horário é a mesma coisa que "Lances" para quem navega — e ela
    // ganha de "/app" mesmo sendo a segunda aba da lista.
    expect(abaAtivaDe("/app/buscar")).toBe("lances");
    expect(abaAtivaDe("/app/lances")).toBe("lances");
  });

  it("uma rota filha desconhecida cai na aba pai", () => {
    // `/app/botao` não tem aba própria (a barra some lá), mas se a barra for
    // renderizada em algum lugar a aba pai é a resposta menos errada.
    expect(abaAtivaDe("/app/botao")).toBe("arenas");
  });

  it("fora da área do atleta, nenhuma aba acende", () => {
    expect(abaAtivaDe("/")).toBeNull();
    expect(abaAtivaDe("/entrar")).toBeNull();
    expect(abaAtivaDe("/arena-vasco")).toBeNull();
    // E "/aplicativo" não pode casar com o prefixo "/app" por ser um prefixo de
    // TEXTO: a comparação é por segmento de caminho.
    expect(abaAtivaDe("/aplicativo")).toBeNull();
  });
});

describe("BottomNav", () => {
  it("marca a aba da rota com aria-current, e só ela", () => {
    render(<BottomNav caminho="/app/grupos" />);

    const grupos = screen.getByRole("link", { name: /grupos/i });
    expect(grupos).toHaveAttribute("aria-current", "page");

    for (const rotulo of [/arenas/i, /lances/i, /perfil/i]) {
      expect(screen.getByRole("link", { name: rotulo })).not.toHaveAttribute("aria-current");
    }
  });

  it("as quatro abas são links de verdade, com destino", () => {
    render(<BottomNav caminho="/app" />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const aba of ABAS_DO_ATLETA) {
      expect(screen.getByRole("link", { name: new RegExp(aba.rotulo, "i") })).toHaveAttribute(
        "href",
        aba.href,
      );
    }
  });

  it("o badge entra no nome acessível — não é só um ponto colorido", () => {
    render(
      <BottomNav
        caminho="/app"
        abas={ABAS_DO_ATLETA.map((a) => (a.id === "grupos" ? { ...a, badge: 2 } : a))}
      />,
    );

    expect(screen.getByRole("link", { name: /grupos, 2 novidades/i })).toBeInTheDocument();
  });

  it("some nas telas imersivas", () => {
    // O botão virtual é tela de uma ação só: navegação no pé dela é convite para
    // sair no meio do lance.
    const { container } = render(<BottomNav caminho="/app/botao" esconderEm={["/app/botao"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("continua aparecendo nas rotas que NÃO estão na lista de exceção", () => {
    render(<BottomNav caminho="/app/grupos" esconderEm={["/app/botao"]} />);
    expect(screen.getByRole("navigation", { name: /navegação principal/i })).toBeInTheDocument();
  });
});

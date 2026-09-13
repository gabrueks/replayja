/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Voltar,
  decidirVoltar,
  esquecerVisitas,
  registrarVisita,
  visitasNoSite,
} from "./Voltar";

/**
 * A saída é o componente mais barato do produto e o de falha mais cara: quando
 * ela erra, a pessoa não vê um defeito — ela se sente presa e fecha o app. Foram
 * três dos seis bugs do teste em produção (player, criar grupo e grupo).
 *
 * O que estes testes prendem é a REGRA, e ela tem exatamente dois casos:
 *
 *  1. quem navegou aqui dentro volta no HISTÓRICO — senão o botão empilha uma
 *     entrada nova e "voltar" duas vezes vira um labirinto;
 *  2. quem caiu de um link do WhatsApp vai para a ALTERNATIVA — senão
 *     `router.back()` joga a pessoa para fora do site no primeiro toque, que é
 *     literalmente o oposto do que o botão promete.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn() }),
  usePathname: () => "/",
}));

beforeEach(() => {
  back.mockClear();
  esquecerVisitas();
});

/** Finge um `document.referrer`, que é somente-leitura no jsdom. */
function comReferrer(valor: string) {
  Object.defineProperty(document, "referrer", { value: valor, configurable: true });
}

describe("decidirVoltar", () => {
  it("com tela nossa atrás, volta no histórico", () => {
    expect(decidirVoltar({ visitas: 2 })).toBe("historico");
    expect(decidirVoltar({ visitas: 7 })).toBe("historico");
  });

  it("sem histórico nenhum, usa a alternativa", () => {
    // É o caso do link do WhatsApp: primeira (e única) tela desta aba.
    expect(decidirVoltar({ visitas: 1 })).toBe("alternativa");
    expect(decidirVoltar({ visitas: 0 })).toBe("alternativa");
  });

  it("um referrer do próprio site também conta como histórico", () => {
    // Navegação de documento inteiro dentro do site (um `redirect` de servidor):
    // o contador nasce em 1, mas existe uma tela nossa na entrada anterior.
    expect(
      decidirVoltar({
        visitas: 1,
        referencia: "https://replayja.com.br/arena-vasco",
        origem: "https://replayja.com.br",
      }),
    ).toBe("historico");
  });

  it("um referrer de fora NÃO conta — é justamente o caso do WhatsApp", () => {
    expect(
      decidirVoltar({
        visitas: 1,
        referencia: "https://web.whatsapp.com/",
        origem: "https://replayja.com.br",
      }),
    ).toBe("alternativa");
  });

  it("referrer vazio ou quebrado erra para o lado seguro", () => {
    const origem = "https://replayja.com.br";
    expect(decidirVoltar({ visitas: 1, referencia: "", origem })).toBe("alternativa");
    expect(decidirVoltar({ visitas: 1, referencia: "   ", origem })).toBe("alternativa");
    expect(decidirVoltar({ visitas: 1, referencia: "não é uma url", origem })).toBe("alternativa");
    // Errar para a alternativa nunca tira a pessoa do site; errar para o
    // histórico tira.
  });
});

describe("o contador de visitas", () => {
  it("conta uma tela por caminho, e ignora a repetição do mesmo", () => {
    // A repetição acontece de verdade: o React em modo estrito monta o efeito
    // duas vezes no desenvolvimento. Sem a guarda, toda tela nasceria achando
    // que tem histórico atrás.
    registrarVisita("/app");
    registrarVisita("/app");
    expect(visitasNoSite()).toBe(1);

    registrarVisita("/app/buscar");
    expect(visitasNoSite()).toBe(2);
  });

  it("voltar ao mesmo caminho conta de novo — é outra entrada no histórico", () => {
    registrarVisita("/app");
    registrarVisita("/arena-vasco");
    registrarVisita("/app");
    expect(visitasNoSite()).toBe(3);
  });
});

describe("Voltar", () => {
  it("é um link com destino ANTES de qualquer JavaScript", async () => {
    render(<Voltar para="/app/grupos" rotulo="Voltar" />);
    const link = screen.getByRole("link", { name: "Voltar" });
    // `<a href>` e não `<button>`: no 4G da quadra a tela existe antes de o
    // bundle hidratar, e um botão não hidratado é um botão que não sai.
    expect(link).toHaveAttribute("href", "/app/grupos");
  });

  it("com histórico do site, intercepta o toque e volta", async () => {
    registrarVisita("/app");
    registrarVisita("/arena-vasco/c/abc");

    render(<Voltar para="/app/buscar?arena=arena-vasco" rotulo="Fechar o lance" icone="fechar" />);
    await userEvent.click(screen.getByRole("link", { name: "Fechar o lance" }));

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("sem histórico do site, deixa o link levar à alternativa", async () => {
    comReferrer("https://web.whatsapp.com/");
    registrarVisita("/arena-vasco/c/abc"); // entrou direto no player

    render(<Voltar para="/app/buscar?arena=arena-vasco" rotulo="Fechar o lance" icone="fechar" />);
    await userEvent.click(screen.getByRole("link", { name: "Fechar o lance" }));

    // Nada de `back()`: quem veio do WhatsApp seria jogado para fora do site.
    expect(back).not.toHaveBeenCalled();
  });

  it("⌘/Ctrl-clique continua sendo do navegador", () => {
    registrarVisita("/app");
    registrarVisita("/arena-vasco/c/abc");

    render(<Voltar para="/app/buscar?arena=arena-vasco" rotulo="Fechar o lance" />);
    const link = screen.getByRole("link", { name: "Fechar o lance" });

    // `fireEvent` e não `userEvent`: o que está sob teste é a guarda de
    // modificador dentro do `onClick`, e é ela que precisa receber o `metaKey`.
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { shiftKey: true });
    fireEvent.click(link, { button: 1 });

    // Quem segurou a tecla pediu a URL — e a URL é a alternativa.
    expect(back).not.toHaveBeenCalled();
  });

  it("o nome acessível não depende de texto visível", () => {
    render(<Voltar para="/app" rotulo="Voltar para as arenas" />);
    // O círculo de 44px não tem rótulo na tela: sem `aria-label` o leitor de
    // tela anunciaria "link" e nada mais.
    expect(screen.getByRole("link", { name: "Voltar para as arenas" })).toBeInTheDocument();
  });
});

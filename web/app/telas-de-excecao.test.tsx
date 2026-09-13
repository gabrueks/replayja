/** @vitest-environment jsdom */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NaoEncontrado from "./not-found";
import Erro from "./error";

/**
 * As três telas que faltavam — achados P0-4, P1-5 e P2-36.
 *
 * A 404 do produto era a página CRUA do Next: fundo preto, texto em inglês, sem
 * marca, sem barra e sem nenhum link de volta — e ela é o destino de 17
 * chamadas de `notFound()` em 9 rotas, num produto cujo canal de distribuição é
 * link colado no WhatsApp. Não existia `error.tsx` (exceção de banco virava tela
 * branca) nem `loading.tsx` (o App Router congela a tela anterior).
 */

/** Caminho a partir de `web/app/`, resolvido contra a raiz do projeto. */
function emApp(caminho: string): string {
  return resolve(process.cwd(), "app", caminho);
}

function ler(caminho: string): string {
  return readFileSync(emApp(caminho), "utf8");
}

describe("a 404 (P0-4)", () => {
  it("fala português e diz o que aconteceu", () => {
    render(<NaoEncontrado />);
    expect(screen.getByText(/esse link não leva a lugar nenhum/i)).toBeInTheDocument();
    // "This page could not be found." era o que estava no ar.
    expect(document.body.textContent).not.toMatch(/could not be found/i);
  });

  it("tem SAÍDA — e mais de uma, porque quem chega aqui veio de caminhos diferentes", () => {
    render(<NaoEncontrado />);
    // Quem clicou num grupo apagado quer a arena; quem clicou num clipe vencido
    // quer o próprio lance; quem digitou errado quer a lista.
    expect(screen.getByRole("link", { name: /ver as arenas/i })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: /achar meu lance/i })).toHaveAttribute(
      "href",
      "/app/lances",
    );
    expect(screen.getByRole("link", { name: /página inicial/i })).toHaveAttribute("href", "/");
  });

  it("tem a marca, e ela leva para dentro do produto", () => {
    render(<NaoEncontrado />);
    expect(screen.getByRole("link", { name: /replay já/i })).toHaveAttribute("href", "/");
  });

  it("tem o `#conteudo` que o 'Pular para o conteúdo' procura (P2-36)", () => {
    // O atalho do layout raiz é a primeira parada do Tab em TODA página. Na 404
    // crua ele apontava para um alvo que não existia: o Tab levava a lugar
    // nenhum, exatamente na tela de quem já está perdido.
    const { container } = render(<NaoEncontrado />);
    expect(container.querySelector("#conteudo")).not.toBeNull();
  });

  it("não entra no índice de busca", () => {
    expect(ler("not-found.tsx")).toMatch(/robots: \{ index: false/);
  });
});

describe("a tela de erro (P1-5)", () => {
  const erro = Object.assign(new Error("select * from clip where partner_id = $1"), {
    digest: "3521800827",
  });

  it("diz de quem é a culpa — e não é de quem está lendo", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Erro error={erro} reset={() => {}} />);
    // Quem vê um erro depois de tocar num botão assume que tocou errado.
    expect(screen.getByText(/não foi você/i)).toBeInTheDocument();
  });

  it("o `reset()` é a ação principal, e ele é chamado de verdade", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tentar = vi.fn();
    render(<Erro error={erro} reset={tentar} />);

    screen.getByRole("button", { name: /tentar de novo/i }).click();
    expect(tentar).toHaveBeenCalledOnce();
  });

  it("continua tendo saída quando a falha é permanente", () => {
    // Um "tentar de novo" que só tenta de novo é um beco com um passo a mais.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Erro error={erro} reset={() => {}} />);
    expect(screen.getByRole("link", { name: /ver as arenas/i })).toHaveAttribute("href", "/app");
  });

  it("mostra o `digest` e NUNCA a mensagem do erro", () => {
    // `error.message` pode carregar nome de coluna, host do banco ou trecho de
    // SQL. O `digest` é o que costura a tela com a linha do log da Vercel.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Erro error={erro} reset={() => {}} />);

    expect(screen.getByText("3521800827")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/select \* from/i);
  });

  it("registra no log, que é a observabilidade sem Sentry do produto", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Erro error={erro} reset={() => {}} />);
    expect(log).toHaveBeenCalledWith("[erro-de-rota]", "3521800827", erro);
  });

  it("sem digest, ainda assim não quebra", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Erro error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
  });
});

describe("os `loading.tsx` das rotas pesadas (P1-5)", () => {
  it("existem onde a espera dói", () => {
    // As quatro rotas `force-dynamic` com consulta de banco antes da primeira
    // pintura. Sem `loading.tsx` o App Router congela a tela anterior, e no 4G
    // da quadra isso é indistinguível de app travado.
    for (const rota of [
      "loading.tsx",
      "[arenaSlug]/loading.tsx",
      "[arenaSlug]/[groupSlug]/loading.tsx",
      "app/buscar/loading.tsx",
      "app/lances/loading.tsx",
    ]) {
      expect(existsSync(emApp(rota)), rota).toBe(true);
    }
  });

  it("o painel NÃO ganhou um — ele ficou fora do escopo da v2", () => {
    // `design-system.md` §12.1. Um esqueleto com a forma do atleta numa tela de
    // painel prometeria a forma errada.
    expect(existsSync(emApp("painel/loading.tsx"))).toBe(false);
    // Na RAIZ não pode haver `loading.tsx`: ele envolve todos os segmentos e a
    // resposta passa a ser transmitida antes de qualquer `notFound()` — arena
    // ou grupo inexistente respondiam 200 com a tela de "não encontrada"
    // (visto em produção em 13/09). A existência é decidida nos layouts do
    // segmento, que renderizam fora do boundary do `loading` da rota.
    expect(existsSync(emApp("loading.tsx"))).toBe(false);
    expect(existsSync(emApp("[arenaSlug]/layout.tsx"))).toBe(true);
    expect(existsSync(emApp("[arenaSlug]/[groupSlug]/layout.tsx"))).toBe(true);
  });

  it("todo `loading.tsx` anuncia em pt-BR, sem despejar a forma no leitor de tela", () => {
    for (const rota of [
      "loading.tsx",
      "[arenaSlug]/loading.tsx",
      "[arenaSlug]/[groupSlug]/loading.tsx",
      "app/buscar/loading.tsx",
      "app/lances/loading.tsx",
    ]) {
      const fonte = ler(rota);
      expect(fonte, rota).toMatch(/rotulo="Carregando/);
      expect(fonte, rota).toMatch(/<Carregando/);
    }
  });
});

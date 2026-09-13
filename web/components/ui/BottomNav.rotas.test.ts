import { describe, expect, it } from "vitest";
import { abaAtivaDe } from "./BottomNav";

/**
 * A barra de abas fora de `/app`.
 *
 * Até a rodada de correções de UX de 2026-09-13 a barra só existia dentro de
 * `/app` — e as três telas em que o fundador se sentiu preso (o player, a página
 * do grupo e o criar grupo) vivem FORA de `/app`, sob o catch-all da arena.
 * Colocar a barra nelas exigiu ensinar `abaAtivaDe` a ler uma rota cujo primeiro
 * segmento é um SLUG, e não um prefixo que se possa declarar numa lista.
 *
 * O risco aqui é específico: como o catch-all ocupa a raiz do domínio, uma regra
 * frouxa acenderia uma aba em `/entrar`, em `/privacidade` e em `/painel` — que
 * não são arenas. É isso que a maior parte destes testes prende.
 *
 * (Os testes da regra de prefixo dentro de `/app` vivem em
 * `tests/ui/bottom-nav.test.tsx`, que é de onde esta suíte é a continuação.)
 */

describe("abaAtivaDe nas rotas de arena", () => {
  it("a página da arena acende Arenas", () => {
    expect(abaAtivaDe("/arena-vasco")).toBe("arenas");
    expect(abaAtivaDe("/quadra-do-ze")).toBe("arenas");
  });

  it("o player de um lance acende Lances", () => {
    // `/[arena]/c/[clipId]` — a pessoa está vendo um lance.
    expect(abaAtivaDe("/arena-vasco/c/0191f0a0-1111-7222-8333-444455556666")).toBe("lances");
  });

  it("a janela de jogo acende Lances — ela é uma lista de lances", () => {
    expect(abaAtivaDe("/arena-vasco/s/2026-09-12-2000-2100")).toBe("lances");
  });

  it("criar grupo acende Grupos", () => {
    // `grupos` é slug reservado de segundo nível, então não há grupo com esse
    // nome disputando a rota.
    expect(abaAtivaDe("/arena-vasco/grupos/novo")).toBe("grupos");
  });

  it("a página do grupo e as filhas dela acendem Grupos", () => {
    expect(abaAtivaDe("/arena-vasco/fut-de-sexta")).toBe("grupos");
    expect(abaAtivaDe("/arena-vasco/fut-de-sexta/editar")).toBe("grupos");
  });

  it("rota do sistema NÃO é arena — nenhuma aba acende", () => {
    // Estas são as que doem: `/entrar` com a aba "Arenas" acesa faria o login
    // parecer uma tela do app logado, e `/painel` é de outro produto.
    for (const caminho of [
      "/",
      "/entrar",
      "/sair",
      "/painel",
      "/painel/cameras",
      "/privacidade",
      "/termos",
      "/bem-vindo",
      "/convite/abc123",
      "/descadastro/abc123",
      "/dev/ui",
    ]) {
      expect(abaAtivaDe(caminho), caminho).toBeNull();
    }
  });

  it("um caminho que não é slug válido não acende nada", () => {
    expect(abaAtivaDe("/Arena_Vasco")).toBeNull();
    expect(abaAtivaDe("/arena--vasco")).toBeNull();
    expect(abaAtivaDe("/favicon.ico")).toBeNull();
  });

  it("a área do atleta continua ganhando da regra de arena", () => {
    // `/app` casa com o prefixo antes de a segunda passagem rodar — e tem de
    // continuar casando, senão "app" seria lido como slug de arena.
    expect(abaAtivaDe("/app")).toBe("arenas");
    expect(abaAtivaDe("/app/buscar")).toBe("lances");
    expect(abaAtivaDe("/app/grupos")).toBe("grupos");
    expect(abaAtivaDe("/app/perfil")).toBe("perfil");
  });

  it("uma lista de abas customizada não recebe a regra de arena", () => {
    // O catálogo `/dev/ui` passa abas próprias. A regra de arena é do PRODUTO,
    // não do componente: aplicá-la a uma lista arbitrária acenderia um id que
    // talvez nem exista naquela lista.
    const abas = [{ id: "x", rotulo: "X", href: "/x", prefixos: ["/x"] }];
    expect(abaAtivaDe("/arena-vasco", abas)).toBeNull();
    expect(abaAtivaDe("/x", abas)).toBe("x");
  });
});

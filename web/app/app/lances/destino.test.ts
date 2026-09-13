import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACHAR_MEU_LANCE, destinoDeAcharMeuLance } from "./destino";

/**
 * `/app/lances` tinha DOIS botões para o mesmo destino — "Buscar por horário"
 * dentro do estado vazio e "Bora achar seu lance" embaixo da grade (bug 5).
 *
 * Dois rótulos diferentes para o mesmo lugar não são duas opções: são uma
 * pergunta que o atleta não tem como responder ("qual é a diferença?"), e ele
 * responde parando. A correção é um CTA só, e o que estes testes prendem é isso
 * e o destino dele.
 */

/**
 * A página SEM os comentários.
 *
 * Os blocos de comentário desta base explicam os bugs pelo nome — inclusive os
 * rótulos antigos que este teste proíbe. Comparar contra o arquivo cru acusaria
 * a própria documentação da correção.
 */
const pagina = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("destinoDeAcharMeuLance", () => {
  it("com UMA arena, pula direto para a busca dela", () => {
    // Não há nada a escolher: mandar para `/app` seria pedir um toque que só
    // tem uma resposta possível.
    expect(destinoDeAcharMeuLance([{ slug: "arena-vasco" }])).toBe("/app/buscar?arena=arena-vasco");
  });

  it("com MAIS DE UMA, passa pela escolha da arena", () => {
    // A escolha da arena é o passo 1 do fluxo do PRD. Pular esse passo com um
    // palpite foi o que produziu o "busquei e não achou" que a v2 consertou.
    expect(destinoDeAcharMeuLance([{ slug: "arena-vasco" }, { slug: "quadra-do-ze" }])).toBe("/app");
  });

  it("sem arena nenhuma, também vai para a escolha", () => {
    expect(destinoDeAcharMeuLance([])).toBe("/app");
  });
});

describe("a página `/app/lances`", () => {
  it("tem UM rótulo de CTA, e ele vem de uma constante só", () => {
    // A forma de o rótulo divergir de novo é alguém editar um dos dois lugares
    // em que ele é escrito. Com a constante não há dois lugares.
    expect(ACHAR_MEU_LANCE).toBe("Achar meu lance");
    expect(pagina).not.toMatch(/Achar meu lance/);
    expect(pagina.match(/\{ACHAR_MEU_LANCE\}/g)?.length).toBe(3);
  });

  it("não carrega mais nenhum dos dois rótulos antigos", () => {
    expect(pagina).not.toMatch(/Buscar por horário/);
    expect(pagina).not.toMatch(/Bora achar seu lance/);
    expect(pagina).not.toMatch(/Escolher a arena/);
  });

  it("os dois lugares do CTA são mutuamente exclusivos", () => {
    // O de baixo só existe quando há grade; o do vazio só existe quando não há.
    // Nunca os dois na mesma tela — que era exatamente o que o fundador via.
    expect(pagina).toMatch(/\{clipes\.length > 0 \? \(\s*<Button href=\{destino\}/);
  });

  it("os dois apontam para o MESMO destino calculado", () => {
    expect(pagina.match(/href=\{destino\}/g)?.length).toBe(2);
    expect(pagina).toMatch(/const destino = destinoDeAcharMeuLance\(arenas\);/);
  });
});

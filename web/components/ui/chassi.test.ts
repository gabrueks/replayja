import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Os dois defeitos de CSS do teste em produção do fundador — a faixa de chips
 * batendo na borda (bug 1) e a folha de convite transparente (bug 4) — não são
 * visíveis em teste de componente: o jsdom não faz layout e não resolve variável
 * de CSS. O que dá para prender é a REGRA escrita na folha de estilo, e é o que
 * estes testes fazem.
 *
 * É um teste de texto, e ele sabe disso. Ele não jura que a tela está certa —
 * jura que a regra que a conserta não foi apagada por engano, que é o modo real
 * como este tipo de bug volta.
 */

function ler(caminho: string): string {
  return readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), "utf8");
}

const chip = ler("./Chip.module.css");
const globais = ler("../../app/globals.css");
const folha = ler("./InviteSheet.module.css");

describe("a faixa rolável de chips", () => {
  it("sangra e devolve o MESMO valor, e esse valor é um token do container", () => {
    // O bug: `padding: var(--e-4) var(--e-20)` com `margin` de -20 dentro de um
    // cartão de 14 de margem interna. A faixa passava 6px para fora do cartão,
    // o primeiro chip nascia colado na borda da tela e o selecionado era
    // fatiado pela quina arredondada.
    expect(chip).toMatch(/padding-inline:\s*var\(--faixa-recuo\)/);
    expect(chip).toMatch(/margin-inline:\s*calc\(-1 \* var\(--faixa-recuo\)\)/);
    // Sem `scroll-padding`, um chip trazido à vista por teclado ou por snap
    // encosta na parede e perde o respiro que o `padding` desenhou.
    expect(chip).toMatch(/scroll-padding-inline:\s*var\(--faixa-recuo\)/);
    // Nenhum 20 fixo sobrou no eixo horizontal.
    expect(chip).not.toMatch(/padding:\s*var\(--e-4\) var\(--e-20\)/);
  });

  it("reserva respiro vertical para a sombra do chip aceso", () => {
    // `overflow-x: auto` obriga o eixo vertical a `auto` também (regra do CSS),
    // então a sombra NÃO tem como escapar da faixa: o que não couber no padding
    // é cortado. Eram 4px, e `--sombra-1` borra 16.
    expect(chip).toMatch(/padding-block:\s*var\(--e-8\)/);
    expect(chip).toMatch(/margin-block:\s*calc\(-1 \* var\(--e-8\)\)/);
  });

  it("todo container que embala uma faixa declara o próprio recuo", () => {
    // A regra: `--faixa-recuo` TEM de ser a margem interna de quem embala. O
    // cartão da busca é o caso que quebrou — ele tem 14, e a faixa assumia 20.
    const busca = ler("../../app/app/buscar/buscar.module.css");
    expect(busca).toMatch(/--faixa-recuo:\s*var\(--e-14\)/);
    expect(busca).toMatch(/padding:\s*var\(--e-14\) var\(--e-14\) var\(--e-20\)/);

    // As duas outras fileiras do produto (arenas em `/app/lances`, quadras no
    // botão virtual) não usam `ChipFaixa`, mas copiam o mesmo desenho — e
    // copiavam junto o mesmo defeito.
    for (const arquivo of [
      "../../app/app/lances/lances.module.css",
      "../../app/app/botao/botao.module.css",
    ]) {
      const css = ler(arquivo);
      expect(css).toMatch(/--faixa-recuo:/);
      expect(css).toMatch(/scroll-padding-inline:\s*var\(--faixa-recuo\)/);
      expect(css).toMatch(/padding-block:\s*var\(--e-8\)/);
    }
  });
});

describe("a paleta clara aplicável a uma subárvore (`.luz`)", () => {
  it("é o MESMO bloco de `:root` — não uma segunda lista de hex", () => {
    // Duas listas de cor saem de sincronia; é uma questão de quando. Compartilhar
    // o seletor torna a divergência impossível.
    expect(globais).toMatch(/:root,\s*\n\.luz \{/);
  });

  it("cobre TODO token que `.noite`/`.tinta` redefinem", () => {
    // Esta é a guarda de verdade. Se alguém escurecer um token novo em `.noite`
    // e a folha de convite passar a herdá-lo, o teste cai aqui — e não no
    // celular do fundador.
    const bloco = /\.noite,\s*\n\.tinta \{([\s\S]*?)\n\}/.exec(globais);
    expect(bloco, "bloco `.noite, .tinta` não encontrado em globals.css").not.toBeNull();

    const escuros = new Set(
      [...(bloco?.[1] ?? "").matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1] as string),
    );
    expect(escuros.size).toBeGreaterThan(20);

    const claro = /:root,\s*\n\.luz \{([\s\S]*?)\n\}/.exec(globais);
    const claros = new Set(
      [...(claro?.[1] ?? "").matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1] as string),
    );

    const semPar = [...escuros].filter((t) => !claros.has(t));
    expect(semPar, `tokens escurecidos sem valor claro: ${semPar.join(", ")}`).toEqual([]);
  });
});

describe("a folha de convite", () => {
  it("tem fundo próprio, e não um herdado", () => {
    // O bug 4: aberta de dentro do cabeçalho `.tinta` do grupo, ela pedia
    // `--cor-superficie` e recebia `rgba(255,255,255,0.07)` — 7% de branco. A
    // folha aparecia transparente, com o grupo inteiro legível por baixo.
    expect(folha).toMatch(/--cor-superficie:\s*var\(--branco\)/);
    expect(folha).toMatch(/background:\s*var\(--cor-superficie\)/);
  });

  it("é uma camada fechada, com backdrop escuro e raio no topo", () => {
    expect(folha).toMatch(/isolation:\s*isolate/);
    expect(folha).toMatch(/z-index:\s*100/);
    expect(folha).toMatch(/border-radius:\s*var\(--raio-26\) var\(--raio-26\) 0 0/);
    expect(folha).toMatch(/\.sheet::backdrop \{ background: rgba\(22, 19, 15, 0\.66\); \}/);
  });
});

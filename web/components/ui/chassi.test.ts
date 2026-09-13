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

const globais = ler("../../app/globals.css");
const folha = ler("./InviteSheet.module.css");

describe("a faixa rolável", () => {
  const faixa = ler("./Faixa.module.css");

  it("a mecânica mora num arquivo SÓ (UX-6)", () => {
    // O bug 1 do teste em produção do fundador: `padding: var(--e-4) var(--e-20)`
    // com margem de -20 dentro de um cartão de 14 de margem interna. A faixa
    // passava 6px para fora do cartão, o primeiro chip nascia colado na borda da
    // tela e o selecionado era fatiado pela quina arredondada.
    //
    // Ele apareceu em TRÊS telas de uma vez porque o mesmo bloco de CSS estava
    // copiado em três arquivos — `Chip.module.css`, `app/app/lances` e
    // `app/app/botao`. Consertar em três lugares é consertar dois e esquecer o
    // terceiro.
    expect(faixa).toMatch(/padding-inline:\s*var\(--faixa-recuo\)/);
    expect(faixa).toMatch(/margin-inline:\s*calc\(-1 \* var\(--faixa-recuo\)\)/);
    // Sem `scroll-padding`, um item trazido à vista por teclado ou por snap
    // encosta na parede e perde o respiro que o `padding` desenhou.
    expect(faixa).toMatch(/scroll-padding-inline:\s*var\(--faixa-recuo\)/);
  });

  it("reserva respiro vertical para a sombra do item aceso", () => {
    // `overflow-x: auto` obriga o eixo vertical a `auto` também (regra do CSS),
    // então a sombra NÃO tem como escapar da faixa: o que não couber no padding
    // é cortado. Eram 4px, e `--sombra-1` borra 16.
    expect(faixa).toMatch(/padding-block:\s*var\(--e-8\)/);
    expect(faixa).toMatch(/margin-block:\s*calc\(-1 \* var\(--e-8\)\)/);
  });

  it("e NÃO sobrou cópia nenhuma nos três arquivos de onde ela saiu", () => {
    // Esta é a guarda de verdade: uma cópia que volta é como o bug volta.
    for (const arquivo of [
      "./Chip.module.css",
      "../../app/app/lances/lances.module.css",
      "../../app/app/botao/botao.module.css",
    ]) {
      const css = ler(arquivo);
      expect(css, arquivo).not.toMatch(/padding-inline:\s*var\(--faixa-recuo\)/);
      expect(css, arquivo).not.toMatch(/overflow-x:\s*auto/);
    }
  });

  it("todo container que embala uma faixa declara o próprio recuo", () => {
    // A regra: `--faixa-recuo` TEM de ser a margem interna de quem embala. O
    // cartão da busca é o caso que quebrou — ele tem 14, e a faixa assumia 20.
    const busca = ler("../../app/app/buscar/buscar.module.css");
    expect(busca).toMatch(/--faixa-recuo:\s*var\(--e-14\)/);
    expect(busca).toMatch(/padding:\s*var\(--e-14\) var\(--e-14\) var\(--e-20\)/);
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

describe("a reserva do chassi fixo", () => {
  const rodape = ler("./RodapeFixo.module.css");
  const rodapeTsx = ler("./RodapeFixo.tsx");

  it("é um irmão no FLUXO, e não um `padding` numa classe global", () => {
    // O bug P0-1: `.com-barra`/`.com-cta` e o `.pagina` do módulo da página têm a
    // mesma especificidade (0,1,0), e o `padding` no atalho do módulo zera o
    // `padding-bottom` da global. Quem ganha é quem o Next escrever por último —
    // e isso muda por rota. Foi assim que o CTA fixo cobriu o fim da página da
    // arena em produção, com o "Manda pro grupo" inteiro debaixo dele.
    //
    // A reserva agora é um bloco com ALTURA, no fluxo: não há `padding` para
    // ninguém derrubar.
    expect(rodape).toMatch(/\.reserva \{[\s\S]*?height:/);
    expect(rodape).toMatch(/\.barra \{[\s\S]*?position: fixed/);
  });

  it("a reserva não encolhe dentro da coluna flex de uma página", () => {
    // Toda página do produto é `display: flex; flex-direction: column`. Com o
    // `flex-shrink: 1` padrão, a reserva seria esmagada exatamente quando o
    // conteúdo é alto — que é o caso em que ela importa.
    expect(rodape).toMatch(/flex: 0 0 auto/);
  });

  it("a altura nominal do HTML já conta a área segura, e a medida não a conta duas vezes", () => {
    expect(rodape).toMatch(
      /height: calc\(var\(--rodape-reserva, 116px\) \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    // A medida vem de `getBoundingClientRect`, que já inclui o `padding-bottom`
    // de área segura da barra — então ela entra como `height` inline puro.
    expect(rodapeTsx).toMatch(/getBoundingClientRect\(\)\.height/);
    expect(rodapeTsx).toMatch(/\{ height: `\$\{altura\}px` \}/);
  });

  it("uma medida zerada NÃO vira reserva zero", () => {
    // Um `display: none` momentâneo (transição de rota) mede 0, e reservar 0 é
    // reabrir o bug.
    expect(rodapeTsx).toMatch(/if \(h > 0\) setAltura\(h\)/);
  });

  it("as duas classes globais foram APAGADAS, e nenhuma tela as aplica", () => {
    expect(globais).not.toMatch(/^\.com-barra/m);
    expect(globais).not.toMatch(/^\.com-cta/m);

    // E nenhuma página ficou com a classe pendurada no `<main>` — uma classe que
    // não existe mais não avisa ninguém, ela só não reserva nada.
    for (const tela of [
      "../../app/page.tsx",
      "../../app/app/layout.tsx",
      "../../app/[arenaSlug]/(arena)/page.tsx",
      "../../app/[arenaSlug]/s/[sessionSlug]/page.tsx",
      "../../app/[arenaSlug]/[groupSlug]/page.tsx",
      "../../app/[arenaSlug]/[groupSlug]/editar/page.tsx",
      "../../app/[arenaSlug]/grupos/novo/page.tsx",
    ]) {
      expect(ler(tela), tela).not.toMatch(/className=\{[^}]*com-(cta|barra)/);
    }
  });

  it("os dois chassis do rodapé alinham com a MESMA coluna de 640 (P2-34)", () => {
    // No desktop de 1280 as quatro abas se espalhavam por 320px cada enquanto o
    // conteúdo tinha 640 centrados. O `CtaFixo` já resolvia com `.dentro`.
    expect(ler("./BottomNav.module.css")).toMatch(/\.abas \{[\s\S]*?max-width: 640px/);
    expect(ler("./CtaFixo.module.css")).toMatch(/\.dentro \{[\s\S]*?max-width: 640px/);
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

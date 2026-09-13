import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { destinoSeguro } from "@/lib/destino";

// O DESTINO PÓS-LOGIN, E O ÚNICO JEITO DE CONFERI-LO QUE VALE ALGUMA COISA.
//
// ─── POR QUE ESTE ARQUIVO EXISTE, SE JÁ HÁ TESTE DE `destinoSeguro` ────────
//
// `tests/observabilidade.test.ts` confere a lista óbvia (`https://`, `//host`,
// `javascript:`). Ela passa, e mesmo assim o produto tinha um redirect aberto —
// porque a pergunta que a lista faz é "esta string parece absoluta?", e a
// pergunta que importa é OUTRA:
//
//   > depois de `new URL(destino, "https://replayja.com.br")`, a pessoa ainda
//   > está no nosso domínio?
//
// É essa a operação que as duas rotas de callback fazem de verdade
// (`app/api/auth/google/callback/route.ts`) e é ela que o `router.push` do
// formulário de login faz por dentro. E o parser de URL do WHATWG normaliza
// coisas que um `startsWith("//")` não vê:
//
//   "/\\evil.com"   → https://evil.com/     (barra invertida vira barra)
//   "/\t/evil.com"  → https://evil.com/     (TAB, CR e LF são REMOVIDOS antes)
//
// Então o teste não descreve a implementação: ele resolve a URL e olha o host.
// Qualquer bypass novo que alguém invente cai aqui sem precisar de caso novo.

const ORIGEM = "https://replayja.com.br";

/** O que o app faz de verdade com o destino, nas duas rotas de callback. */
function hostDepoisDeResolver(destino: string): string {
  return new URL(destino, ORIGEM).host;
}

describe("destinoSeguro — o que sobrevive ao parser de URL", () => {
  it("um destino aceito NUNCA resolve para outro host", () => {
    const tentativas = [
      // Os clássicos, que a lista antiga já pegava.
      "https://evil.com",
      "http://evil.com",
      "//evil.com",
      "///evil.com",
      "javascript:alert(1)",
      // A BARRA INVERTIDA. `startsWith("//")` não vê, e o WHATWG trata `\` como
      // `/` em esquemas especiais: `/\evil.com` vira `https://evil.com/`.
      "/\\evil.com",
      "/\\\\evil.com",
      "/\\/evil.com",
      // CARACTERES DE CONTROLE. TAB, LF e CR são REMOVIDOS pelo parser antes de
      // qualquer coisa, então `/<TAB>/evil.com` também vira `//evil.com`.
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\t\\evil.com",
      // Espaço no começo: `"  //evil.com"` é aparado pelo parser.
      "/ /evil.com",
    ];

    for (const bruto of tentativas) {
      const destino = destinoSeguro(bruto);
      if (destino === undefined) continue;
      expect(
        hostDepoisDeResolver(destino),
        `${JSON.stringify(bruto)} foi aceito e escapou do domínio`,
      ).toBe("replayja.com.br");
    }
  });

  it("continua aceitando o que o produto realmente usa", () => {
    for (const bom of [
      "/app",
      "/app/buscar?arena=arena-vasco",
      "/arena-vasco/fut-segunda",
      "/convite/abc123",
      "/painel?arena=arena-vasco",
      "/arena-vasco/c/01927f3a-0000-7000-8000-000000000000",
    ]) {
      expect(destinoSeguro(bom)).toBe(bom);
      expect(hostDepoisDeResolver(bom)).toBe("replayja.com.br");
    }
  });

  it("recusa o que não é caminho relativo", () => {
    for (const v of ["evil.com", "", null, undefined, 123, "/".repeat(600)]) {
      expect(destinoSeguro(v)).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * A SEGUNDA METADE DO DEFEITO: uma função de segurança que ninguém chama.
 *
 * `lib/destino.ts` existia e estava certa o bastante para o caso comum — e
 * `app/entrar/page.tsx` fazia `redirect(params.redirectTo ?? "/app")` sem
 * passar por ela, além de repassar o valor cru para o formulário, que termina
 * em `router.push`. Duas portas abertas com o cadeado pendurado do lado.
 *
 * Este teste lê o FONTE porque não há outro jeito honesto: o alvo é um Server
 * Component que só existe dentro do Next, e o defeito não é o que ele devolve —
 * é o que ele DEIXA DE CHAMAR.
 */
describe("quem lê `redirectTo` do cliente passa por `destinoSeguro`", () => {
  const raiz = process.cwd();

  /** Os arquivos que leem `redirectTo` de uma fonte controlada pelo cliente. */
  const suspeitos = [
    "app/entrar/page.tsx",
    "app/api/auth/otp/start/route.ts",
    "app/api/auth/google/start/route.ts",
  ];

  for (const rel of suspeitos) {
    it(`${rel} sanitiza antes de usar`, () => {
      const fonte = fs.readFileSync(path.join(raiz, rel), "utf8");
      expect(fonte, `${rel} lê redirectTo e não importa destinoSeguro`).toContain(
        "destinoSeguro",
      );
      // O uso cru: `redirect(params.redirectTo`, `?? "/app"` direto do params.
      expect(
        /redirect\(\s*(params|searchParams)\.redirectTo/.test(fonte),
        `${rel} redireciona direto para o valor cru de redirectTo`,
      ).toBe(false);
    });
  }
});

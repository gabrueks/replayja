import { describe, expect, it } from "vitest";
import { numero, palavra, percentual, plural } from "@/lib/plural";

describe("plural (P2-32)", () => {
  it("1 é singular e 2 é plural — o caso que estava errado em três telas", () => {
    // "1 lances em 30 dias" no painel, "1 quadras" na arena, "1 dias" no convite.
    expect(plural(1, "lance", "lances")).toBe("1 lance");
    expect(plural(2, "lance", "lances")).toBe("2 lances");
  });

  it("ZERO é plural em pt-BR", () => {
    // É onde `Intl.PluralRules` importa: em francês `0` é singular.
    expect(plural(0, "lance", "lances")).toBe("0 lances");
    expect(palavra(0, "quadra", "quadras")).toBe("quadras");
  });

  it("separa milhar de graça, que é o outro lado do P2-24", () => {
    // "1234 lances" era o que saía: não havia nenhum `Intl.NumberFormat` no
    // repositório inteiro.
    expect(plural(1234, "lance", "lances")).toBe("1.234 lances");
  });

  it("`palavra` devolve só a palavra, para quem já tem o número na tela", () => {
    // O contador da arena mostra o número em 34px e a palavra em 13px: são dois
    // nós diferentes, e juntá-los quebraria a tipografia.
    expect(palavra(1, "lance gravado hoje", "lances gravados hoje")).toBe("lance gravado hoje");
    expect(palavra(4, "lance gravado hoje", "lances gravados hoje")).toBe("lances gravados hoje");
  });
});

describe("numero", () => {
  it("usa vírgula decimal e ponto de milhar", () => {
    expect(numero(1234)).toBe("1.234");
    expect(numero(0.6, 1)).toBe("0,6");
    expect(numero(1234.5, 1)).toBe("1.234,5");
  });

  it("aceita a string que o `pg` devolve para `numeric`", () => {
    expect(numero("0.846", 2)).toBe("0,85");
  });

  it("não inventa número para nulo e para NaN", () => {
    expect(numero(null)).toBe("0");
    expect(numero(Number.NaN)).toBe("—");
    expect(numero(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("percentual (P2-24)", () => {
  it("recebe a FRAÇÃO e devolve com vírgula", () => {
    // "cobertura 24 h 85.2%" com ponto, três blocos abaixo de "média de 0,6 por
    // dia" com vírgula — duas convenções numéricas na mesma tela.
    expect(percentual(0.852)).toBe("85,2%");
    expect(percentual(0)).toBe("0,0%");
    expect(percentual(1)).toBe("100,0%");
  });

  it("as casas são de quem chama", () => {
    expect(percentual(0.852, 0)).toBe("85%");
    expect(percentual(0.8525, 2)).toBe("85,25%");
  });
});

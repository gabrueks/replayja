import { beforeAll, describe, expect, it } from "vitest";

// O segredo precisa existir ANTES de importar qualquer coisa que assine: o
// `appSecret()` lê `process.env` no uso, mas deixar isso explícito evita um teste
// que passa por acidente quando a ordem de import muda.
beforeAll(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-longo-o-bastante-para-hmac";
});

const { encodeChallenge, generateCode, verifyChallenge, decodeChallenge } = await import(
  "@/lib/otp"
);
const { safeEqualB64, signWithAppSecret } = await import("@/lib/app-secret");

describe("OTP — código", () => {
  it("gera sempre 6 dígitos, com zeros à esquerda preservados", () => {
    // 2.000 amostras: o caso que quebra implementações ingênuas é o número
    // pequeno virar "42" em vez de "000042", e ele é raro o bastante para passar
    // despercebido com 10 amostras.
    for (let i = 0; i < 2000; i++) {
      const c = generateCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
});

describe("OTP — desafio em cookie HMAC", () => {
  it("aceita o código certo do e-mail certo", () => {
    const cookie = encodeChallenge("atleta@exemplo.com", "123456");
    expect(verifyChallenge(cookie, "atleta@exemplo.com", "123456")).toBe(true);
  });

  it("recusa o código errado", () => {
    const cookie = encodeChallenge("atleta@exemplo.com", "123456");
    expect(verifyChallenge(cookie, "atleta@exemplo.com", "123457")).toBe(false);
  });

  it("recusa o código certo vindo de OUTRO e-mail", () => {
    // O desafio amarra e-mail e código. Sem isso, quem pedisse um código para si
    // poderia usá-lo para entrar como outra pessoa — o desafio é um cookie no
    // navegador DELE, e o e-mail viria do corpo da requisição.
    const cookie = encodeChallenge("atleta@exemplo.com", "123456");
    expect(verifyChallenge(cookie, "outro@exemplo.com", "123456")).toBe(false);
  });

  it("recusa cookie com payload adulterado", () => {
    const cookie = encodeChallenge("atleta@exemplo.com", "123456");
    const [payload, sig] = cookie.split(".");
    const bruto = JSON.parse(Buffer.from(payload!, "base64url").toString());
    bruto.email = "invasor@exemplo.com";
    const forjado = `${Buffer.from(JSON.stringify(bruto)).toString("base64url")}.${sig}`;
    expect(verifyChallenge(forjado, "invasor@exemplo.com", "123456")).toBe(false);
  });

  it("recusa desafio expirado", () => {
    const bruto = {
      email: "atleta@exemplo.com",
      codeHash: signWithAppSecret("atleta@exemplo.com:123456"),
      exp: Date.now() - 1000,
    };
    const payload = Buffer.from(JSON.stringify(bruto)).toString("base64url");
    const cookie = `${payload}.${signWithAppSecret(payload)}`;
    expect(verifyChallenge(cookie, "atleta@exemplo.com", "123456")).toBe(false);
    expect(decodeChallenge(cookie)).toBeNull();
  });

  it("recusa lixo sem lançar", () => {
    for (const v of [undefined, "", "semponto", "a.b", "...", "x".repeat(5000)]) {
      expect(() => verifyChallenge(v, "a@b.co", "123456")).not.toThrow();
      expect(verifyChallenge(v, "a@b.co", "123456")).toBe(false);
    }
  });

  it("carrega redirectTo e partnerSlug sem afetar a verificação", () => {
    const cookie = encodeChallenge("atleta@exemplo.com", "123456", {
      redirectTo: "/arena-calabouco/fut-segunda",
      partnerSlug: "arena-calabouco",
    });
    expect(verifyChallenge(cookie, "atleta@exemplo.com", "123456")).toBe(true);
    const d = decodeChallenge(cookie);
    expect(d?.redirectTo).toBe("/arena-calabouco/fut-segunda");
    expect(d?.partnerSlug).toBe("arena-calabouco");
  });
});

describe("safeEqualB64 — a comparação que não pode lançar", () => {
  it("é verdadeira para iguais e falsa para diferentes", () => {
    const a = signWithAppSecret("x");
    expect(safeEqualB64(a, a)).toBe(true);
    expect(safeEqualB64(a, signWithAppSecret("y"))).toBe(false);
  });

  it("NÃO lança com string multibyte do mesmo comprimento", () => {
    // Este é o bug real que o comentário do Sentinela documenta: uma assinatura
    // com o mesmo número de CARACTERES mas com um multibyte faz `timingSafeEqual`
    // lançar RangeError — que, solto, vira 500 em toda requisição enquanto o
    // cookie existir.
    const a = "abcd";
    const b = "abcé";
    expect(a.length).toBe(b.length);
    expect(() => safeEqualB64(a, b)).not.toThrow();
    expect(safeEqualB64(a, b)).toBe(false);
  });

  it("NÃO lança com base64url inválido", () => {
    expect(() => safeEqualB64("!!!!", "????")).not.toThrow();
  });
});

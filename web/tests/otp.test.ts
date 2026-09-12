import { afterEach, beforeAll, describe, expect, it } from "vitest";

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

// ─────────────────────────────────── bypass de login (OTP_BYPASS_EMAILS)
//
// Esta porta existe porque o domínio de envio ainda não está verificado no
// Resend e, sem ela, não há como testar o produto em produção. O que estes
// testes fixam é o que impede a porta de virar buraco: EM PRODUÇÃO o código
// fixo só vale para os e-mails EXATAMENTE listados.

const { testCodeFor, emailsDeBypass, ehEmailDeBypass } = await import("@/lib/otp");

describe("bypass de OTP", () => {
  const original = {
    node: process.env.NODE_ENV,
    lista: process.env.OTP_BYPASS_EMAILS,
    codigo: process.env.OTP_TEST_CODE,
  };

  function ambiente(node: string, lista?: string, codigo?: string) {
    // `NODE_ENV` é readonly no tipo do Node 22+, mas continua sendo uma
    // propriedade comum em runtime — e o teste precisa justamente do caso
    // "produção".
    (process.env as Record<string, string | undefined>).NODE_ENV = node;
    if (lista === undefined) delete process.env.OTP_BYPASS_EMAILS;
    else process.env.OTP_BYPASS_EMAILS = lista;
    if (codigo === undefined) delete process.env.OTP_TEST_CODE;
    else process.env.OTP_TEST_CODE = codigo;
  }

  afterEach(() => {
    ambiente(original.node ?? "test", original.lista, original.codigo);
  });

  it("EM PRODUÇÃO, e-mail fora da lista NÃO aceita o código fixo", () => {
    ambiente("production", "teste1@replayja.com.br,teste2@replayja.com.br", "123456");

    // O caso que importa: qualquer outro endereço, inclusive um do mesmo
    // domínio e um do sufixo de desenvolvimento.
    for (const email of [
      "atleta@gmail.com",
      "outro@replayja.com.br",
      "qualquer@replayja.test",
      "teste1@replayja.com.br.invasor.com",
      "xteste1@replayja.com.br",
    ]) {
      expect(testCodeFor(email)).toBeNull();
    }

    expect(testCodeFor("teste1@replayja.com.br")).toBe("123456");
    expect(testCodeFor("  TESTE2@Replayja.com.br ")).toBe("123456");
  });

  it("sem OTP_BYPASS_EMAILS, produção não tem bypass nenhum", () => {
    ambiente("production", undefined, "123456");
    expect(emailsDeBypass()).toEqual([]);
    expect(testCodeFor("teste1@replayja.com.br")).toBeNull();
    expect(testCodeFor("qualquer@replayja.test")).toBeNull();
  });

  it("sem OTP_TEST_CODE, estar na lista não basta", () => {
    ambiente("production", "teste1@replayja.com.br", undefined);
    expect(ehEmailDeBypass("teste1@replayja.com.br")).toBe(true);
    expect(testCodeFor("teste1@replayja.com.br")).toBeNull();
  });

  it("código fora do formato de 6 dígitos é ignorado", () => {
    // Um código de 4 dígitos passaria aqui e seria recusado pelo `verify`
    // (que exige `^\d{6}$`) — o sintoma seria "o código certo não funciona".
    for (const ruim of ["12345", "1234567", "abcdef", "12 34 56", ""]) {
      ambiente("production", "teste1@replayja.com.br", ruim);
      expect(testCodeFor("teste1@replayja.com.br")).toBeNull();
    }
  });

  it("fora de produção, `@replayja.test` continua funcionando sem lista", () => {
    ambiente("development", undefined, "123456");
    expect(testCodeFor("qualquer@replayja.test")).toBe("123456");
    expect(testCodeFor("atleta@gmail.com")).toBeNull();
  });
});

import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-longo-o-bastante-para-hmac";
});

const { fingerprintDe, novoTraceId } = await import("@/lib/app-error");
const { hmacHex, sha256Hex } = await import("@/lib/app-secret");
const { mascararEmail } = await import("@/db/queries/autorizacao");
const { destinoSeguro } = await import("@/lib/destino");

describe("app_error — o Sentry pobre", () => {
  it("o traceId tem 12 hex (curto o bastante para ditar por telefone)", () => {
    const t = novoTraceId();
    expect(t).toMatch(/^[0-9a-f]{12}$/);
    expect(novoTraceId()).not.toBe(t);
  });

  it("agrupa o MESMO defeito e separa defeitos diferentes", () => {
    const e1 = new Error("falha ao ler clipe 01927f3a-aaaa");
    const e2 = new Error("falha ao ler clipe 01927f3a-bbbb");
    // Mensagens costumam carregar id e timestamp. Se a fingerprint incluísse a
    // mensagem inteira, cada ocorrência viraria um grupo novo — que é
    // exatamente o problema que agrupar existe para resolver.
    expect(fingerprintDe(e1, "/api/clips")).toBe(fingerprintDe(e2, "/api/clips"));
    // Rota diferente é defeito diferente.
    expect(fingerprintDe(e1, "/api/clips")).not.toBe(fingerprintDe(e1, "/api/triggers"));
  });

  it("tipos de erro diferentes não se misturam", () => {
    const a = new TypeError("x");
    const b = new RangeError("x");
    expect(fingerprintDe(a, "/r")).not.toBe(fingerprintDe(b, "/r"));
  });

  it("aceita coisa que não é Error sem lançar", () => {
    expect(() => fingerprintDe("string solta", "/r")).not.toThrow();
    expect(() => fingerprintDe(null, undefined)).not.toThrow();
  });
});

describe("LGPD — pseudonimização", () => {
  it("hmacHex é estável e não é reversível por olho", () => {
    const a = hmacHex("atleta@exemplo.com");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacHex("atleta@exemplo.com")).toBe(a);
    expect(hmacHex("outro@exemplo.com")).not.toBe(a);
    expect(a).not.toContain("atleta");
  });

  it("sha256Hex é o hash de token de dispositivo", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("mascararEmail preserva o domínio e esconde o local", () => {
    // A lista de membros serve para saber quem está no grupo, não para extrair
    // base de contatos (`modelo-de-dados.md` §7.3).
    expect(mascararEmail("gabriel@gmail.com")).toBe("g***@gmail.com");
    expect(mascararEmail("a@b.co")).toBe("a***@b.co");
    expect(mascararEmail("sem-arroba")).toBe("***");
  });
});

describe("destino pós-login — redirect aberto", () => {
  it("aceita caminho relativo", () => {
    expect(destinoSeguro("/arena-calabouco/fut-segunda")).toBe("/arena-calabouco/fut-segunda");
    expect(destinoSeguro("/app/buscar?arena=x")).toBe("/app/buscar?arena=x");
  });

  it("recusa URL absoluta — redirect aberto numa tela de login é phishing", () => {
    for (const v of [
      "https://evil.com",
      "http://evil.com",
      "//evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      null,
      undefined,
      123,
    ]) {
      expect(destinoSeguro(v)).toBeUndefined();
    }
  });

  it("recusa caminho absurdamente longo", () => {
    expect(destinoSeguro(`/${"a".repeat(600)}`)).toBeUndefined();
  });
});

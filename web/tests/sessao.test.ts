import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-longo-o-bastante-para-hmac";
});

const { decodeSession, encodeSession } = await import("@/lib/session");
const { needsRenewal, MAX_AGE_S, RENEW_AFTER_MS } = await import("@/lib/session-cookie");
const { decodeSessionEdge, encodeSessionEdge } = await import("@/lib/session-edge");

const UID = "01927f3a-0000-7000-8000-000000000001";

describe("sessão — cookie HMAC", () => {
  it("ida e volta preserva uid e e-mail", () => {
    const s = decodeSession(encodeSession({ uid: UID, email: "atleta@exemplo.com" }));
    expect(s?.uid).toBe(UID);
    expect(s?.email).toBe("atleta@exemplo.com");
  });

  it("NÃO carrega nada de autorização", () => {
    // A decisão da ADR §4.4 em forma de teste: o cookie tem três campos e só. Se
    // alguém acrescentar `role` ou `partnerId` aqui, este teste cai — e é
    // exatamente essa a conversa que precisa acontecer antes do merge, porque
    // "cookie diz que sou admin de uma arena que já me removeu" é a classe de bug
    // que a consulta no banco existe para matar.
    const cookie = encodeSession({ uid: UID, email: "atleta@exemplo.com" });
    const payload = JSON.parse(Buffer.from(cookie.split(".")[0]!, "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["email", "exp", "uid"]);
  });

  it("recusa assinatura forjada", () => {
    const cookie = encodeSession({ uid: UID, email: "atleta@exemplo.com" });
    const [payload] = cookie.split(".");
    expect(decodeSession(`${payload}.assinaturaerrada`)).toBeNull();
  });

  it("recusa payload adulterado com a assinatura antiga", () => {
    const cookie = encodeSession({ uid: UID, email: "atleta@exemplo.com" });
    const [payload, sig] = cookie.split(".");
    const bruto = JSON.parse(Buffer.from(payload!, "base64url").toString());
    bruto.email = "invasor@exemplo.com";
    const forjado = `${Buffer.from(JSON.stringify(bruto)).toString("base64url")}.${sig}`;
    expect(decodeSession(forjado)).toBeNull();
  });

  it("recusa sessão vencida", () => {
    const vencida = { uid: UID, email: "a@b.co", exp: Date.now() - 1 };
    const payload = Buffer.from(JSON.stringify(vencida)).toString("base64url");
    // Assinatura VÁLIDA, conteúdo vencido: precisa cair pelo `exp`, não pela
    // assinatura.
    const cookie = encodeSession({ uid: UID, email: "a@b.co" });
    const sigValida = cookie.split(".")[1];
    expect(decodeSession(`${payload}.${sigValida}`)).toBeNull();
  });

  it("recusa cookie sem uid (formato do Sentinela, que só tinha e-mail)", () => {
    const antigo = { email: "a@b.co", exp: Date.now() + 1000 };
    const payload = Buffer.from(JSON.stringify(antigo)).toString("base64url");
    expect(decodeSession(payload)).toBeNull();
  });

  it("recusa lixo sem lançar", () => {
    for (const v of [undefined, "", "a", "a.b", "x".repeat(10_000)]) {
      expect(() => decodeSession(v)).not.toThrow();
      expect(decodeSession(v)).toBeNull();
    }
  });
});

describe("renovação deslizante", () => {
  it("cookie novo não precisa renovar", () => {
    expect(needsRenewal({ uid: UID, email: "a@b.co", exp: Date.now() + MAX_AGE_S * 1000 })).toBe(
      false,
    );
  });

  it("cookie com mais de 7 dias precisa renovar", () => {
    const exp = Date.now() + MAX_AGE_S * 1000 - RENEW_AFTER_MS - 1000;
    expect(needsRenewal({ uid: UID, email: "a@b.co", exp })).toBe(true);
  });
});

describe("compatibilidade Node ↔ Edge", () => {
  // O middleware roda no Edge (Web Crypto, assíncrono) e as rotas no Node
  // (`node:crypto`). Os dois PRECISAM ler o cookie um do outro: se o formato
  // divergir, a renovação do middleware emitiria um cookie que as rotas recusam —
  // e o sintoma seria "de vez em quando o usuário é deslogado sozinho", que é
  // caríssimo de diagnosticar em produção.

  it("cookie emitido no Node é aceito no Edge", async () => {
    const cookie = encodeSession({ uid: UID, email: "atleta@exemplo.com" });
    const s = await decodeSessionEdge(cookie);
    expect(s?.uid).toBe(UID);
    expect(s?.email).toBe("atleta@exemplo.com");
  });

  it("cookie emitido no Edge é aceito no Node", async () => {
    const cookie = await encodeSessionEdge({ uid: UID, email: "atleta@exemplo.com" });
    const s = decodeSession(cookie);
    expect(s?.uid).toBe(UID);
  });

  it("o Edge também recusa assinatura forjada", async () => {
    const cookie = encodeSession({ uid: UID, email: "atleta@exemplo.com" });
    const [payload] = cookie.split(".");
    expect(await decodeSessionEdge(`${payload}.errada`)).toBeNull();
  });

  it("as duas implementações produzem a MESMA assinatura", async () => {
    const { signWithAppSecret } = await import("@/lib/app-secret");
    const { assinarEdge } = await import("@/lib/session-edge");
    const payload = "um-payload-qualquer";
    expect(await assinarEdge(payload)).toBe(signWithAppSecret(payload));
  });
});

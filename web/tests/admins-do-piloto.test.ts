import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminsComBypass,
  emailsDeOperacao,
  normalizarLista,
} from "@/lib/admins-do-piloto";

// O SINTOMA QUE ABRIU ESTA AUDITORIA: "um usuário normal não pode ser admin da
// Arena Vasco".
//
// ─── O QUE O BANCO DE PRODUÇÃO DIZ (13/09/2026, leitura somente) ───────────
//
// `partner_admin` da `arena-vasco` tem DUAS linhas, as duas `owner`/`active`:
// `teste1@replayja.com.br` e `teste2@replayja.com.br`. `bolzi.gabriel@gmail.com`
// existe em `app_user` (entrou por OTP real em 13/09 às 10h24) e NÃO tem linha
// em `partner_admin`. Então o Gmail do fundador não é admin de nada, e o painel
// não está vazando — `resolverArena` consulta `partner_admin` a cada
// requisição e nega.
//
// ─── MAS O MECANISMO ESTAVA ARMADO ─────────────────────────────────────────
//
// `scripts/seed-piloto.ts` resolvia a lista de donos assim:
//
//     const emails = (args.emails ?? utilizavel(process.env.OTP_BYPASS_EMAILS) ?? "")
//
// `OTP_BYPASS_EMAILS` é a lista de LOGIN SEM E-MAIL (`lib/otp.ts`): a porta
// estreita aberta porque o domínio do Resend não estava verificado. Ela existe
// para o fundador conseguir ENTRAR em produção. Usá-la como fonte dos donos
// significa que o gesto de acrescentar um endereço ali para testar login
// promove aquela conta a DONA da Arena Vasco no próximo `pnpm seed:piloto` —
// com câmera, chave RTMP, token de botão, remoção de vídeo e equipe junto.
//
// A suspeita do fundador estava certa sobre o caminho; o que faltava era ter
// rodado o seed depois. Estes testes fecham o caminho.

describe("a lista de donos da arena NUNCA vem da lista de bypass de login", () => {
  it("sem fonte explícita, o seed RECUSA em vez de adivinhar", () => {
    // O comportamento antigo era cair em `OTP_BYPASS_EMAILS`. O novo é parar.
    expect(emailsDeOperacao({})).toEqual({ ok: false, motivo: "sem-fonte" });
    expect(emailsDeOperacao({ argumento: null, env: null })).toEqual({
      ok: false,
      motivo: "sem-fonte",
    });
    // `vercel env pull` grava `[SENSITIVE]` no lugar do valor de variáveis
    // marcadas como sensíveis. Isso não é uma fonte — é a ausência dela.
    expect(emailsDeOperacao({ env: "[SENSITIVE]" })).toEqual({
      ok: false,
      motivo: "sem-fonte",
    });
  });

  it("a assinatura não tem por onde receber `OTP_BYPASS_EMAILS`", () => {
    // O teste de verdade é o de tipo, que roda no `pnpm typecheck`. Aqui fica a
    // prova em runtime de que um campo com esse nome é simplesmente ignorado.
    const comLixo = { bypass: "invasor@gmail.com" } as Parameters<typeof emailsDeOperacao>[0];
    expect(emailsDeOperacao(comLixo)).toEqual({ ok: false, motivo: "sem-fonte" });
  });

  it("o argumento vence a variável de ambiente", () => {
    expect(
      emailsDeOperacao({ argumento: "a@x.com", env: "b@x.com" }),
    ).toEqual({ ok: true, emails: ["a@x.com"] });
  });

  it("`PILOT_ADMIN_EMAILS` é a fonte quando não há argumento", () => {
    expect(emailsDeOperacao({ env: "op1@replayja.com.br,op2@replayja.com.br" })).toEqual({
      ok: true,
      emails: ["op1@replayja.com.br", "op2@replayja.com.br"],
    });
  });

  it("uma fonte que existe mas só tem lixo também recusa", () => {
    // `--emails=,,` e `--emails=nao-e-email` não podem virar "zero donos" em
    // silêncio: o gatilho `partner_admin_exige_owner` recusaria o COMMIT, e o
    // erro sairia como violação de constraint em vez de frase em pt-BR.
    expect(emailsDeOperacao({ argumento: ",, ," })).toEqual({
      ok: false,
      motivo: "nenhum-valido",
    });
    expect(emailsDeOperacao({ argumento: "nao-e-email" })).toEqual({
      ok: false,
      motivo: "nenhum-valido",
    });
  });
});

describe("normalização da lista", () => {
  it("minúsculas, sem espaço, sem repetido, sem vazio", () => {
    expect(normalizarLista(" A@X.com , b@x.com ,, A@x.COM ")).toEqual(["a@x.com", "b@x.com"]);
  });

  it("descarta o que não é e-mail em vez de gravar lixo no banco", () => {
    expect(normalizarLista("a@x.com, sem-arroba, b@x, c@x.co")).toEqual(["a@x.com", "c@x.co"]);
  });
});

describe("a sobreposição com o bypass é AVISO, nunca fonte", () => {
  it("diz quais donos também entram com o código fixo", () => {
    const donos = ["op@replayja.com.br", "outro@replayja.com.br"];
    expect(adminsComBypass(donos, "OP@replayja.com.br, terceiro@gmail.com")).toEqual([
      "op@replayja.com.br",
    ]);
  });

  it("quem está só no bypass NÃO entra na lista de donos", () => {
    // O ponto inteiro: `bolzi.gabriel@gmail.com` na lista de login não pode
    // aparecer em lugar nenhum do resultado de donos.
    expect(adminsComBypass(["op@replayja.com.br"], "bolzi.gabriel@gmail.com")).toEqual([]);
  });
});

describe("o seed não lê a lista errada", () => {
  it("`seed-piloto.ts` não menciona OTP_BYPASS_EMAILS como fonte de admin", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "scripts/seed-piloto.ts"),
      "utf8",
    );
    // Ele PODE citar a variável para AVISAR sobre a sobreposição — o que não
    // pode é usá-la para decidir quem manda. Então a regra é: toda linha que
    // LÊ `process.env.OTP_BYPASS_EMAILS` tem de ser a do aviso.
    const leituras = fonte
      .split("\n")
      .filter((l) => l.includes("process.env.OTP_BYPASS_EMAILS"));
    for (const linha of leituras) {
      expect(linha, `leitura de OTP_BYPASS_EMAILS fora do aviso: ${linha.trim()}`).toContain(
        "adminsComBypass",
      );
    }
    // E a forma antiga — `const emails = (… ?? OTP_BYPASS_EMAILS …)` — não volta.
    expect(/\bemails\s*=[^\n]*OTP_BYPASS_EMAILS/.test(fonte)).toBe(false);
    expect(fonte).toContain("emailsDeOperacao");
  });
});

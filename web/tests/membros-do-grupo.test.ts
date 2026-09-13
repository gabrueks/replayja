import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// O E-MAIL DO MEMBRO — quem vê o quê, e o que a tela consegue imprimir.
//
// ─── A DECISÃO DO FUNDADOR (13/09) ─────────────────────────────────────────
//
// Qualquer membro vê NOME (ou o primeiro nome tirado do e-mail) e a máscara. O
// endereço completo é poder de dono de grupo, como convidar e remover.
//
// ─── O QUE ISTO PRENDE, ALÉM DA REGRA ──────────────────────────────────────
//
// A regra já existia antes desta leva, e ainda assim a página do grupo
// imprimia o endereço: o campo se chamava `email` tanto para o valor completo
// quanto para a máscara, e a tela escrevia `display_name ?? email` sem nunca
// perguntar qual dos dois tinha chegado. Uma lista de pelada é uma base de
// contatos pronta — 20 endereços de gente que se encontra toda segunda, num
// link que circula em grupo de WhatsApp.
//
// Então os casos abaixo cobrem DOIS níveis: a função devolve o certo, e nenhuma
// tela consegue imprimir o campo errado (varredura de fonte, a mesma disciplina
// de `tests/api-guardas.test.ts`).

const RAIZ = process.cwd();

const LINHAS = [
  {
    id: "m1",
    user_id: "u1",
    display_name: "Gabriel Bolzi",
    email: "bolzi.gabriel@gmail.com",
    role: "owner" as const,
    status: "active",
    accepted_at: new Date(),
  },
  {
    id: "m2",
    user_id: "u2",
    display_name: null,
    email: "lucas.farah@gmail.com",
    role: "member" as const,
    status: "active",
    accepted_at: new Date(),
  },
  {
    id: "m3",
    user_id: null,
    display_name: null,
    email: "pelezinho10@hotmail.com",
    role: "member" as const,
    status: "invited",
    accepted_at: null,
  },
];

/** Carrega `grupo.ts` com o banco e a autorização dublados. */
async function comPapel(papel: "owner" | "member" | null) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({
    query: vi.fn(async () => LINHAS),
    tryQuery: vi.fn(async () => []),
    transacao: vi.fn(),
    dbConfigured: () => true,
  }));
  vi.doMock("@/db/queries/autorizacao", async () => {
    const real = await vi.importActual<typeof import("@/db/queries/autorizacao")>(
      "@/db/queries/autorizacao",
    );
    return { ...real, papelNoGrupo: vi.fn(async () => papel) };
  });
  return import("@/db/queries/grupo");
}

const SESSAO = { uid: "u1", email: "bolzi.gabriel@gmail.com", exp: Date.now() + 3_600_000 };

describe("membrosDoGrupo: o endereço completo é poder de dono", () => {
  it("o DONO recebe o e-mail inteiro — e a máscara junto", async () => {
    const { membrosDoGrupo } = await comPapel("owner");
    const membros = await membrosDoGrupo(SESSAO, "g1");
    expect(membros).toHaveLength(3);
    expect(membros[0]!.email).toBe("bolzi.gabriel@gmail.com");
    expect(membros[1]!.email).toBe("lucas.farah@gmail.com");
    // A máscara vem SEMPRE, inclusive para o dono: a tela não precisa saber
    // quem está olhando para escolher um campo seguro.
    expect(membros[1]!.emailMascarado).toBe("l***@gmail.com");
  });

  it("um MEMBRO comum recebe `email: null` — nunca a máscara no lugar dele", async () => {
    const { membrosDoGrupo } = await comPapel("member");
    const membros = await membrosDoGrupo(SESSAO, "g1");
    for (const m of membros) {
      expect(m.email, "endereço completo vazou para quem não é dono").toBeNull();
    }
    expect(membros.map((m) => m.emailMascarado)).toEqual([
      "b***@gmail.com",
      "l***@gmail.com",
      "p***@hotmail.com",
    ]);
  });

  it("`null` e não a máscara, porque `null` quebra ALTO", async () => {
    // Se `email` carregasse ora o endereço ora a máscara, uma tela que
    // escolhesse o campo errado mostraria `l***@gmail.com` — indistinguível de
    // um e-mail estranho, e ninguém notaria nunca. O nulo aparece como campo
    // vazio na revisão e como erro de tipo no `tsc`.
    const { membrosDoGrupo } = await comPapel("member");
    const membros = await membrosDoGrupo(SESSAO, "g1");
    expect(membros[0]!.email).not.toBe("b***@gmail.com");
  });

  it("quem NÃO é membro não recebe lista nenhuma, nem mascarada", async () => {
    const { membrosDoGrupo } = await comPapel(null);
    expect(await membrosDoGrupo(SESSAO, "g1")).toEqual([]);
  });

  it("`nome` já vem resolvido, e nunca é um e-mail", async () => {
    const { membrosDoGrupo } = await comPapel("member");
    const membros = await membrosDoGrupo(SESSAO, "g1");
    expect(membros.map((m) => m.nome)).toEqual(["Gabriel Bolzi", "Lucas", "Pelezinho10"]);
    for (const m of membros) {
      expect(m.nome, `"${m.nome}" ainda é um endereço`).not.toContain("@");
    }
  });
});

describe("primeiroNomeDoEmail", () => {
  it("corta no primeiro separador e capitaliza", async () => {
    const { primeiroNomeDoEmail } = await comPapel("member");
    expect(primeiroNomeDoEmail("gabriel.bolzi@gmail.com")).toBe("Gabriel");
    expect(primeiroNomeDoEmail("lucas_farah@x.com")).toBe("Lucas");
    expect(primeiroNomeDoEmail("ana-paula@x.com")).toBe("Ana");
    expect(primeiroNomeDoEmail("joao+pelada@x.com")).toBe("Joao");
    // Sem separador nenhum: vira ele mesmo. Sobrenome e ano de nascimento é que
    // não passam — é informação que ninguém escolheu publicar no grupo.
    expect(primeiroNomeDoEmail("pelezinho10@x.com")).toBe("Pelezinho10");
  });

  it("não estoura com entrada torta", async () => {
    const { primeiroNomeDoEmail } = await comPapel("member");
    expect(primeiroNomeDoEmail("@x.com")).toBe("Alguém");
    expect(primeiroNomeDoEmail("")).toBe("Alguém");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("a varredura: nenhuma tela imprime o e-mail completo por engano", () => {
  /**
   * As telas que recebem `MembroRow`. Se nascer outra, ela entra aqui — e a
   * regra vale para a tela que alguém escreve amanhã, que é o ponto.
   */
  function telasComMembros(): Array<{ rel: string; fonte: string }> {
    const achados: Array<{ rel: string; fonte: string }> = [];
    const andar = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) andar(p);
        else if (/\.tsx?$/.test(e.name)) {
          const fonte = fs.readFileSync(p, "utf8");
          if (fonte.includes("membrosDoGrupo(")) {
            achados.push({ rel: path.relative(RAIZ, p).split(path.sep).join("/"), fonte });
          }
        }
      }
    };
    andar(path.join(RAIZ, "app"));
    return achados;
  }

  const TELAS = telasComMembros();

  it("a varredura acha as telas (senão o resto não prova nada)", () => {
    expect(TELAS.length).toBeGreaterThanOrEqual(2);
  });

  for (const { rel, fonte } of TELAS) {
    it(`${rel} não escreve o antigo \`display_name ?? email\``, () => {
      // O padrão que vazava: para quem não é dono, o `??` caía no endereço.
      // Agora `nome` vem resolvido da consulta e este `??` não deve existir.
      expect(
        /display_name\s*\?\?\s*m?\.?email/.test(fonte),
        `${rel} deriva o nome do e-mail na tela — use \`m.nome\`, que já vem pronto`,
      ).toBe(false);
    });
  }
});

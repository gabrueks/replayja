import { beforeEach, describe, expect, it, vi } from "vitest";

// A TROCA DE PAPEL NA EQUIPE DA ARENA — e a confirmação que mentia.
//
// ─── O DEFEITO ─────────────────────────────────────────────────────────────
//
// `alterarPapelDoAdmin` decidia se podia promover alguém a `owner` assim:
//
//     } else if (!admins.some((a) => a.id === adminId)) {
//
// `admins` vem de um `SELECT ... FOR UPDATE` SEM filtro de status, então a
// lista inclui quem já foi REMOVIDO da arena. Promover um removido passava
// nessa checagem, caía num `UPDATE ... AND status = 'active'` que não acha
// linha nenhuma — e a tela respondia "Papel atualizado.".
//
// É o pior formato de bug de permissão: não é acesso a mais, é uma
// CONFIRMAÇÃO FALSA. O dono da arena acha que devolveu acesso ao gerente que
// voltou, fecha a tela, e ninguém confere de novo — até o dia em que aquela
// pessoa precisa entrar no painel e não consegue, no meio de um jogo.
//
// O conserto tem duas partes, e as duas importam: a pergunta passa a incluir
// `status === "active"`, e a resposta passa a sair do que o banco FEZ
// (`RETURNING id`), nunca do que a rota quis fazer.

// `transacao` recebe um callback e lhe entrega a função de consulta. O duplo
// aqui grava as consultas e devolve o que o teste mandar.
const consultas: Array<{ sql: string; params: unknown[] }> = [];
let respostas: unknown[][] = [];

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  tryQuery: vi.fn(async () => []),
  transacao: async (fn: (q: (sql: string, p?: unknown[]) => Promise<unknown[]>) => unknown) =>
    fn(async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      return respostas.shift() ?? [];
    }),
}));

const { alterarPapelDoAdmin } = await import("@/db/queries/painel-equipe");

const DONO = { id: "a1", user_id: "u1", role: "owner", status: "active" };
const REMOVIDO = { id: "a2", user_id: "u2", role: "manager", status: "removed" };
const GERENTE = { id: "a3", user_id: "u3", role: "manager", status: "active" };

beforeEach(() => {
  consultas.length = 0;
  respostas = [];
});

describe("promover alguém que foi REMOVIDO da arena", () => {
  it("responde `nao-encontrado` em vez de confirmar o que não fez", async () => {
    // 1ª consulta: a lista travada. 2ª: o UPDATE, que não acha linha ativa.
    respostas = [[DONO, REMOVIDO], []];

    const r = await alterarPapelDoAdmin("p1", REMOVIDO.id, "owner");

    expect(r).toEqual({ ok: false, motivo: "nao-encontrado" });
  });

  it("o mesmo vale para rebaixar — `viewer` num removido não é 'atualizado'", async () => {
    respostas = [[DONO, REMOVIDO], []];

    const r = await alterarPapelDoAdmin("p1", REMOVIDO.id, "viewer");

    expect(r).toEqual({ ok: false, motivo: "nao-encontrado" });
  });
});

describe("o caminho que tem de continuar funcionando", () => {
  it("promove um gerente ATIVO a dono", async () => {
    respostas = [[DONO, GERENTE], [{ id: GERENTE.id }]];

    const r = await alterarPapelDoAdmin("p1", GERENTE.id, "owner");

    expect(r).toEqual({ ok: true });
    // O UPDATE é escopado pela arena — sem RLS, é a única barreira contra
    // trocar o papel de um admin de OUTRA arena com um id adivinhado.
    const update = consultas.find((c) => c.sql.includes("UPDATE partner_admin"));
    expect(update?.sql).toContain("partner_id = $1");
    expect(update?.params[0]).toBe("p1");
  });

  it("rebaixar o ÚLTIMO dono continua barrado com a frase certa", async () => {
    respostas = [[DONO, GERENTE]];

    const r = await alterarPapelDoAdmin("p1", DONO.id, "manager");

    expect(r).toEqual({ ok: false, motivo: "ultimo-owner" });
    // E não chegou a tentar o UPDATE.
    expect(consultas.some((c) => c.sql.includes("UPDATE partner_admin"))).toBe(false);
  });
});

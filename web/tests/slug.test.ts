import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatSessionSlug,
  normalizarSlug,
  parseSessionSlug,
  validarSlugDeArena,
  validarSlugDeGrupo,
} from "@/lib/slug";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

describe("normalização de slug", () => {
  it("remove diacríticos", () => {
    // O caso do documento: `Calabouço` → `calabouco`. Se isto falhar, o `ç` vira
    // `-` e a arena ganha um endereço que ninguém digita.
    expect(normalizarSlug("Arena Calabouço")).toBe("arena-calabouco");
    expect(normalizarSlug("Futevôlei São João")).toBe("futevolei-sao-joao");
  });

  it("colapsa separadores e apara as pontas", () => {
    expect(normalizarSlug("  Quadra   1  ")).toBe("quadra-1");
    expect(normalizarSlug("--a--b--")).toBe("a-b");
    expect(normalizarSlug("a_b.c")).toBe("a-b-c");
  });

  it("devolve string vazia quando não sobra nada", () => {
    expect(normalizarSlug("!!!")).toBe("");
  });
});

describe("validação de slug de arena", () => {
  it("aceita o formato da ADR §8", () => {
    for (const s of ["arena-calabouco", "abc", "a1-b2-c3", "quadra9"]) {
      expect(validarSlugDeArena(s)).toEqual({ ok: true, slug: s });
    }
  });

  it("recusa formato inválido", () => {
    for (const s of ["-abc", "abc-", "a--b", "a.b", "a_b", "ABC-maiuscula!", "ação"]) {
      const r = validarSlugDeArena(s);
      expect(r.ok).toBe(false);
    }
  });

  it("recusa curto e longo", () => {
    expect(validarSlugDeArena("ab")).toEqual({ ok: false, motivo: "curto" });
    expect(validarSlugDeArena("a".repeat(41))).toEqual({ ok: false, motivo: "longo" });
    expect(validarSlugDeArena("a".repeat(40)).ok).toBe(true);
  });

  it("recusa reservados — o catch-all ocupa a raiz do domínio", () => {
    // Uma arena chamada `app` derrubaria `/app`. Este é o teste que impede o
    // roteamento inteiro de colidir.
    for (const s of ["app", "api", "entrar", "painel", "sobre", "clipes"]) {
      expect(validarSlugDeArena(s)).toEqual({ ok: false, motivo: "reservado" });
    }
  });
});

describe("validação de slug de grupo", () => {
  it("tem teto menor que o de arena (30 vs 40)", () => {
    expect(validarSlugDeGrupo("a".repeat(30)).ok).toBe(true);
    expect(validarSlugDeGrupo("a".repeat(31))).toEqual({ ok: false, motivo: "longo" });
  });

  it("recusa reservados de segundo nível", () => {
    for (const s of ["sessoes", "membros", "convite", "sobre"]) {
      expect(validarSlugDeGrupo(s)).toEqual({ ok: false, motivo: "reservado" });
    }
  });

  it("`s` é barrado pelo tamanho antes de chegar à lista", () => {
    // `/arena/s/...` é a página de sessão, e um grupo chamado `s` a esconderia.
    // Ele está na lista de reservados, mas o teto de 3 caracteres o pega antes —
    // o motivo é "curto", e o que importa é que NÃO PASSA. Fixar isto em teste
    // evita alguém "consertar" a ordem das checagens e abrir a porta.
    const r = validarSlugDeGrupo("s");
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, motivo: "curto" });
  });

  it("aceita um slug de grupo normal", () => {
    expect(validarSlugDeGrupo("fut-segunda")).toEqual({ ok: true, slug: "fut-segunda" });
  });
});

describe("slug de sessão", () => {
  it("ida e volta, com os minutos omitidos na hora cheia", () => {
    const j = { localDate: "2026-09-08", startTime: "20:00", endTime: "21:30", courtSlug: null };
    const slug = formatSessionSlug(j);
    // `20h` e não `20h00m`: o caso comum é hora cheia e este link é colado numa
    // mensagem de WhatsApp.
    expect(slug).toBe("2026-09-08-20h-21h30m");
    expect(parseSessionSlug(slug)).toEqual(j);
  });

  it("aceita o formato antigo com `00m` — link já compartilhado não quebra", () => {
    expect(parseSessionSlug("2026-09-08-20h00m-21h30m")).toEqual({
      localDate: "2026-09-08",
      startTime: "20:00",
      endTime: "21:30",
      courtSlug: null,
    });
  });

  it("carrega a quadra como PREFIXO, mesmo com hífen no slug dela", () => {
    // O trecho final tem forma fixa, então a separação é inequívoca: tudo o que
    // vem antes da data é a quadra.
    const j = {
      localDate: "2026-09-12",
      startTime: "20:00",
      endTime: "21:00",
      courtSlug: "quadra-1",
    };
    expect(formatSessionSlug(j)).toBe("quadra-1-2026-09-12-20h-21h");
    expect(parseSessionSlug("quadra-1-2026-09-12-20h-21h")).toEqual(j);
    expect(parseSessionSlug("campo-de-areia-2-2026-09-12-20h-21h")?.courtSlug).toBe(
      "campo-de-areia-2",
    );
  });

  it("aceita janela que cruza a meia-noite", () => {
    // `end < start` é válido: a pelada das 23h à 0h30 existe.
    expect(parseSessionSlug("2026-09-08-23h00m-00h30m")).toEqual({
      localDate: "2026-09-08",
      startTime: "23:00",
      endTime: "00:30",
      courtSlug: null,
    });
  });

  it("recusa formato e valores impossíveis", () => {
    for (const s of [
      "2026-09-08",
      "2026-13-08-20h00m-21h00m",
      "2026-09-08-25h00m-21h00m",
      "2026-09-08-20h99m-21h00m",
      // Prefixo que não é slug válido: viraria um filtro de quadra que nunca
      // casa, e a sessão voltaria vazia sem explicação nenhuma.
      "Quadra--1-2026-09-12-20h-21h",
      "qualquer-coisa",
    ]) {
      expect(parseSessionSlug(s)).toBeNull();
    }
  });
});

describe("lista de reservados: código e migração não podem divergir", () => {
  // O teste que a ADR §8 pede. A lista vive no código (o middleware precisa dela
  // sem ida ao banco) E no banco (a validação de slug precisa dela em SQL). Se as
  // duas divergirem, um slug bloqueado num lugar passa no outro — e o sintoma é
  // uma arena que ocupa `/painel`.
  it("a SOMA das migrações semeia exatamente a lista do TS", () => {
    // Varre TODAS as migrações, e não só a 0009: uma migração já aplicada em
    // produção não pode ser editada (o runner confere checksum), então slug de
    // sistema novo entra por arquivo delta. Somar os `INSERT INTO reserved_slug`
    // é o que mantém o teste válido depois do primeiro delta.
    const dir = path.join(process.cwd(), "db/migrations");
    const noSql: string[] = [];

    for (const nome of fs.readdirSync(dir).sort()) {
      if (!nome.endsWith(".sql")) continue;
      const sql = fs.readFileSync(path.join(dir, nome), "utf8");
      const up = sql.split(/--\s*\+migrate\s+down/i)[0]!;
      const insercao = /INSERT\s+INTO\s+reserved_slug[^;]*;/gis;
      for (const bloco of up.match(insercao) ?? []) {
        noSql.push(...[...bloco.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]!));
      }
    }

    expect(noSql.length).toBe(RESERVED_SLUGS.length);
    expect([...noSql].sort()).toEqual([...RESERVED_SLUGS].sort());
  });

  it("não há duplicatas na lista do TS", () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length);
  });

  it("toda rota de sistema de primeiro nível está reservada", () => {
    // Se uma rota nova nascer em `app/`, ela precisa entrar na lista. Este teste
    // não varre o disco de propósito (nomes como `[arenaSlug]` não são rotas
    // fixas); ele fixa as que existem hoje.
    for (const rota of ["app", "api", "entrar", "sair", "painel", "s"]) {
      expect(RESERVED_SLUGS).toContain(rota);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //
  // O TESTE ACIMA É UMA LISTA ESCRITA À MÃO, E É ASSIM QUE `bem-vindo` PASSOU.
  //
  // Ele fixa as rotas "que existem hoje" — e "hoje" era três levas atrás.
  // `/bem-vindo`, `/convite`, `/descadastro` e `/dev` nasceram depois, e nenhuma
  // delas apareceu aqui, porque uma lista à mão só cobre o que alguém lembrou
  // de acrescentar. `bem-vindo` ficou de fora da lista de reservados inteira.
  //
  // O sintoma não é uma rota que quebra: no Next o segmento ESTÁTICO vence o
  // dinâmico, então a rota continua de pé e quem some é a ARENA. Uma parceira
  // chamada "Bem-Vindo" receberia `replayja.com.br/bem-vindo` como endereço,
  // imprimiria isso no banner da quadra, e o link abriria o onboarding do
  // produto para sempre — sem erro nenhum em lugar nenhum.
  //
  // Então este teste VARRE O DISCO. Diretório de primeiro nível em `app/` que
  // não seja dinâmico (`[x]`), privado (`_x`) nem grupo de rota (`(x)`) é uma
  // rota de sistema, e tem de estar reservado.
  it("varrendo `app/`: nenhum segmento de primeiro nível fica fora da lista", () => {
    const dir = path.join(process.cwd(), "app");
    const rotas = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => !n.startsWith("[") && !n.startsWith("_") && !n.startsWith("("));

    // Sanidade: se a varredura devolver pouca coisa, é ela que está quebrada.
    expect(rotas.length).toBeGreaterThanOrEqual(8);

    const faltando = rotas.filter((r) => !RESERVED_SLUGS.includes(r));
    expect(faltando, `rotas de sistema fora de RESERVED_SLUGS: ${faltando.join(", ")}`).toEqual(
      [],
    );
  });
});

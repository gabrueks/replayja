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
  it("ida e volta", () => {
    const j = { localDate: "2026-09-08", startTime: "20:00", endTime: "21:30" };
    const slug = formatSessionSlug(j);
    expect(slug).toBe("2026-09-08-20h00m-21h30m");
    expect(parseSessionSlug(slug)).toEqual(j);
  });

  it("aceita janela que cruza a meia-noite", () => {
    // `end < start` é válido: a pelada das 23h à 0h30 existe.
    expect(parseSessionSlug("2026-09-08-23h00m-00h30m")).toEqual({
      localDate: "2026-09-08",
      startTime: "23:00",
      endTime: "00:30",
    });
  });

  it("recusa formato e valores impossíveis", () => {
    for (const s of [
      "2026-09-08",
      "2026-09-08-20h-21h",
      "2026-13-08-20h00m-21h00m",
      "2026-09-08-25h00m-21h00m",
      "2026-09-08-20h99m-21h00m",
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
  it("a migração semeia exatamente a lista do TS", () => {
    const arquivo = path.join(
      process.cwd(),
      "db/migrations/2026-09-12-0009-slugs-reservados.sql",
    );
    const sql = fs.readFileSync(arquivo, "utf8");
    const bloco = sql.split(/--\s*\+migrate\s+down/i)[0]!;
    const noSql = [...bloco.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]!);

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
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACHAR_LANCE,
  ACHAR_LANCE_TITULO,
  ADMINISTRA_A_ARENA,
  CRIAR_GRUPO,
  DONO_DA_PELADA,
  ENTRAR,
  ENTRAR_APOIO,
  NA_PELADA,
  TITULOS,
  TROCAR_ARENA,
  naPelada,
} from "@/lib/copy";

/**
 * A REGRA Nº 3 DA FOLHA DE VOZ, VIRANDO TESTE.
 *
 * "A mesma ação tem UMA frase, repetida" (`design/v2/README.md`). A revisão de
 * 13/09 (achado P1-16) contou cinco frases para "achar um lance", quatro para
 * "criar um grupo", e "Trocar arena" ao lado de "Trocar de arena" NA MESMA TELA.
 *
 * Um dicionário de constantes só resolve isso enquanto alguém lembrar de usá-lo.
 * O que fecha a porta é esta varredura: ela falha quando a frase reaparece
 * ESCRITA À MÃO num `page.tsx` — inclusive num arquivo que ainda não existe, que
 * é o caso que importa.
 */

const RAIZ = resolve(process.cwd());

/**
 * As telas do ATLETA. O painel do parceiro ficou fora do escopo da v2
 * (`design-system.md` §12.1) e tem vocabulário próprio ("Visão geral",
 * "Cobertura"); varrê-lo aqui seria impor a folha de voz de um produto ao
 * outro. `app/dev/ui` é o catálogo: ele MOSTRA os rótulos, então precisa
 * escrevê-los.
 */
const IGNORADOS = [
  join("app", "painel"),
  join("app", "api"),
  join("app", "dev"),
  join("components", "ui", "Catalogo"),
];

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivos(caminho, saida);
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      saida.push(caminho);
    }
  }
  return saida;
}

const TELAS = [...arquivos(join(RAIZ, "app")), ...arquivos(join(RAIZ, "components"))].filter(
  (c) => !IGNORADOS.some((i) => relative(RAIZ, c).startsWith(i)),
);

/**
 * O arquivo SEM os comentários.
 *
 * Os blocos de comentário desta base explicam os bugs pelo nome — inclusive os
 * rótulos antigos que este teste proíbe. Comparar contra o arquivo cru acusaria
 * a própria documentação da correção.
 */
function semComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const FONTES = new Map(TELAS.map((c) => [relative(RAIZ, c), semComentarios(c)]));

/** Onde a frase aparece escrita à mão. `lib/copy.ts` não entra na varredura. */
function onde(frase: string): string[] {
  return [...FONTES.entries()]
    .filter(([caminho, fonte]) => caminho !== join("lib", "copy.ts") && fonte.includes(frase))
    .map(([caminho]) => caminho.split(sep).join("/"));
}

describe("a varredura pega as telas de verdade", () => {
  it("acha dezenas de arquivos, e não zero", () => {
    // Uma varredura que não varre nada passa sempre. Este é o teste do teste.
    expect(TELAS.length).toBeGreaterThan(30);
    expect(FONTES.has(join("app", "app", "buscar", "page.tsx"))).toBe(true);
    expect(FONTES.has(join("app", "[arenaSlug]", "page.tsx"))).toBe(true);
  });
});

describe("uma ação, uma frase (P1-16)", () => {
  const guardadas: Array<[string, string]> = [
    ["ACHAR_LANCE", ACHAR_LANCE],
    ["ACHAR_LANCE_TITULO", ACHAR_LANCE_TITULO],
    ["ENTRAR", ENTRAR],
    ["ENTRAR_APOIO", ENTRAR_APOIO],
    ["CRIAR_GRUPO", CRIAR_GRUPO],
    ["TROCAR_ARENA", TROCAR_ARENA],
    ["DONO_DA_PELADA", DONO_DA_PELADA],
    ["ADMINISTRA_A_ARENA", ADMINISTRA_A_ARENA],
  ];

  for (const [nome, frase] of guardadas) {
    it(`"${frase}" só existe em \`lib/copy.ts\` (${nome})`, () => {
      expect(onde(frase), `${nome} escrito à mão`).toEqual([]);
    });
  }
});

describe("as frases que a v2 aposentou", () => {
  // Elas não voltam por decreto: voltam por copy-paste de uma tela antiga.
  const aposentadas = [
    "Bora achar meu lance", // o botão diz "Achar meu lance"
    "Buscar por horário",
    "Buscar lances",
    "Trocar arena", // sem o "de" — estava ao lado do outro, na mesma tela
    "Joga toda semana? Vira grupo", // a chamada e o rótulo viraram duas constantes
    "AO VIVO", // o estado ao vivo é "Gravando agora"
    "Meus grupos", // o `<title>` da v1
    "Editar grupo",
    "Seu perfil",
  ];

  for (const frase of aposentadas) {
    it(`"${frase}" não reaparece em tela nenhuma`, () => {
      expect(onde(frase)).toEqual([]);
    });
  }
});

describe("o `<title>` fala a mesma língua da tela (P1-17)", () => {
  it("não sobrou nenhum título da v1 escrito à mão", () => {
    for (const [chave, titulo] of Object.entries(TITULOS)) {
      expect(typeof titulo, chave).toBe("string");
      expect(titulo.length, chave).toBeGreaterThan(0);
    }
  });

  it("as cinco rotas do achado usam a constante", () => {
    const rotas = [
      join("app", "app", "buscar", "page.tsx"),
      join("app", "app", "lances", "page.tsx"),
      join("app", "app", "grupos", "page.tsx"),
      join("app", "app", "perfil", "page.tsx"),
      join("app", "[arenaSlug]", "[groupSlug]", "editar", "page.tsx"),
    ];
    for (const rota of rotas) {
      expect(FONTES.get(rota), rota).toMatch(/title: TITULOS\./);
    }
  });
});

describe("contar gente de um grupo tem UMA palavra (P1-13)", () => {
  it("`naPelada` formata o número em pt-BR", () => {
    expect(naPelada(1)).toBe("1 na pelada");
    expect(naPelada(3)).toBe("3 na pelada");
    expect(naPelada(1234)).toBe("1.234 na pelada");
  });

  it("as três telas que contavam diferente não contam mais", () => {
    // "3 na pelada" ao lado dos avatares, "3 pessoas" no título de MEMBROS, e
    // "1 membro" na página da arena — o mesmo número, três palavras.
    for (const errada of ['? "pessoa" : "pessoas"', '? "membro" : "membros"']) {
      expect(onde(errada)).toEqual([]);
    }
  });

  it("`NA_PELADA` é o selo de quem só joga", () => {
    expect(NA_PELADA).toBe("Na pelada");
  });
});

describe("a palavra que confunde", () => {
  it('"admin" não aparece solto em nenhuma tela do atleta', () => {
    // D-1 do relatório de QA: "admin" serve para dono de grupo E para admin de
    // arena, e foi por servir para os dois que o fundador concluiu que um
    // usuário comum tinha virado admin da Arena Vasco.
    const suspeitas = [...FONTES.entries()].filter(
      ([caminho, fonte]) =>
        caminho !== join("lib", "copy.ts") && />\s*admin\s*</i.test(fonte),
    );
    expect(suspeitas.map(([c]) => c)).toEqual([]);
  });
});

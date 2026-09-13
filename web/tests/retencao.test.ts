import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIP_RETENTION_DIAS_PADRAO, PIN_EXTENSAO_DIAS } from "@/lib/limites";

// A RETENÇÃO DE 90 DIAS — que é uma promessa PUBLICADA, não uma preferência.
//
// ─── O DEFEITO ─────────────────────────────────────────────────────────────
//
// `clip.expires_at` é `NOT NULL` e nasce em `triggered_at + retention_days`
// desde a migração 0006. Existe até um índice para varrê-lo
// (`clip_expiry_idx`). O que não existe é ALGUÉM QUE OLHE PARA ELE:
//
//   • nenhuma consulta de `db/queries/clipe.ts` filtrava por `expires_at`;
//   • `purge_expired_clips` (04:00 BRT) aparece na ADR §4, em
//     `modelo-de-dados.md` §8 e num comentário de `lib/storage.ts` — e não
//     existe em lugar nenhum do código. `vercel.json` agenda UM cron, o do
//     resumo semanal;
//   • `status = 'expired'` só é escrito pelo takedown manual
//     (`db/queries/painel-privacidade.ts`).
//
// Somando: nada expira. Um lance de 2026 continua aparecendo na busca e
// continua baixável em 2027. A Política de Privacidade promete 90 dias
// (`decisoes.md` P-01/G-03, e `lib/limites.ts` diz por escrito que "publicar um
// prazo que o sistema não cumpre viola a LGPD").
//
// ─── POR QUE O CONSERTO É NO `WHERE`, E NÃO SÓ NO JOB ──────────────────────
//
// Um job de expurgo continua sendo necessário — é ele que tira os BYTES do S3 e
// do disco do relay. Mas ele é uma coisa que pode falhar, atrasar, ser
// desabilitada num deploy ou nunca ser escrita (foi o que aconteceu). O que o
// usuário vê não pode depender disso: enquanto a linha diz que o clipe venceu,
// a consulta não pode devolvê-lo. É a mesma disciplina de `deleted_at`, que
// nenhuma consulta esquece.
//
// `pinned` não precisa de exceção: baixar ou compartilhar EMPURRA `expires_at`
// em 180 dias (`registrarDownloadDoClipe`), então o link no grupo de WhatsApp
// continua vivo pelo prazo prometido — pela data, não por uma flag paralela.

const RAIZ = process.cwd();

/** As consultas de `clipe.ts` que servem o ATLETA e precisam do filtro. */
const CONSULTAS_DO_ATLETA = [
  "clipesDaArena",
  "clipePorId",
  "clipesDoGrupoPorSessao",
  "sessoesSemanaisDoGrupo",
] as const;

/** O corpo de uma função exportada de `clipe.ts`, da assinatura até a próxima. */
function corpoDaConsulta(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}`);
  expect(inicio, `não achei ${nome} em db/queries/clipe.ts`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.indexOf("\nexport ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

// ─── A VARREDURA, E POR QUE ELA SUBSTITUIU A LISTA ─────────────────────────
//
// A primeira versão deste arquivo listava à mão as quatro consultas "do
// atleta". Era a mesma armadilha do teste de slugs reservados (§3 do relatório
// de QA): uma lista do que existe HOJE não diz nada sobre a consulta que
// alguém escreve amanhã — e a consulta de amanhã é exatamente a que devolve o
// clipe vencido. Então a regra passou a valer para TODA instrução que lê
// `clip` em `db/queries/**`, com as isenções nomeadas uma a uma abaixo.

/**
 * Os módulos cuja leitura de `clip` SERVE UM HUMANO e, por isso, tem de
 * respeitar a retenção. `relay.ts` e `gatilho.ts` ficam de fora inteiros: eles
 * são o PIPELINE (reivindicar job, gravar status, confirmar upload), e um job
 * de corte que ignorasse o clipe recém-criado porque `expires_at` ainda não
 * existe é o contrário do que se quer.
 */
const MODULOS = [
  "clipe.ts",
  "grupo.ts",
  "parceiro.ts",
  "painel-visao.ts",
  "painel-quadras.ts",
  "painel-privacidade.ts",
  "saude.ts",
  "expurgo.ts",
] as const;

/**
 * As isenções, com o motivo. Cada uma é uma consulta que PRECISA enxergar o
 * clipe vencido — e se uma delas sumir do código, o teste avisa, porque uma
 * isenção sem dono vira um buraco silencioso.
 */
const ISENTAS: Record<string, string> = {
  clipeSumido: "é a consulta que sustenta o 410 — existe justamente para achar o vencido",
  arquivosDosClipes: "entrega as chaves de objeto AO EXPURGO; filtrar aqui não apagaria nada",
  marcarClipesRemovidos: "é a escrita do expurgo",
  clipesVencidosParaExpurgo: "é a varredura do job diário",
  marcarClipesExpurgados: "é a escrita do job diário",
  contarClipesVencidos: "é o termômetro do expurgo, e conta o que ainda não foi apagado",
};

/** Cada `export async function` de um módulo, com o corpo até a próxima. */
function funcoesDe(fonte: string): Array<{ nome: string; corpo: string }> {
  const partes: Array<{ nome: string; corpo: string }> = [];
  const re = /export async function (\w+)/g;
  const achados = [...fonte.matchAll(re)];
  for (let i = 0; i < achados.length; i++) {
    const atual = achados[i]!;
    const fim = achados[i + 1]?.index ?? fonte.length;
    partes.push({ nome: atual[1]!, corpo: fonte.slice(atual.index!, fim) });
  }
  return partes;
}

const LE_CLIP = /\b(FROM|JOIN)\s+clip\b(?!_)/i;
const FILTRA = /expires_at\s*(>|<=)\s*now\(\)/;

describe("a varredura: nenhuma consulta de `clip` escapa da retenção", () => {
  for (const modulo of MODULOS) {
    const fonte = fs.readFileSync(path.join(RAIZ, "db/queries", modulo), "utf8");
    for (const { nome, corpo } of funcoesDe(fonte)) {
      if (!LE_CLIP.test(corpo)) continue;
      const motivo = ISENTAS[nome];
      it(`${modulo}#${nome} ${motivo ? "está isenta, e a isenção tem dono" : "filtra por expires_at"}`, () => {
        if (motivo) {
          expect(motivo.length, `isenção de ${nome} sem motivo escrito`).toBeGreaterThan(10);
          return;
        }
        expect(
          FILTRA.test(corpo),
          `${modulo}#${nome} lê \`clip\` e não filtra \`expires_at\`. Ou acrescente o ` +
            `filtro, ou registre a isenção em ISENTAS com o motivo — um buraco na ` +
            `retenção não pode entrar sem alguém escrever por quê.`,
        ).toBe(true);
      });
    }
  }

  it("toda isenção declarada ainda existe no código", () => {
    const tudo = MODULOS.map((m) =>
      fs.readFileSync(path.join(RAIZ, "db/queries", m), "utf8"),
    ).join("\n");
    for (const nome of Object.keys(ISENTAS)) {
      expect(tudo.includes(`export async function ${nome}`), `isenção órfã: ${nome}`).toBe(true);
    }
  });
});

// ─── O 410, E NÃO O 404 ────────────────────────────────────────────────────
//
// Decisão do fundador (13/09): clipe vencido responde `410 clip-expired`. O
// catálogo de `lib/problem.ts` declarava o tipo desde o primeiro dia e ninguém
// o lançava — a única ocorrência da string no repositório era a do tipo.

describe("clipe vencido responde 410, não 404", () => {
  const rotas = [
    "app/api/clips/[clipId]/route.ts",
    "app/api/clips/[clipId]/download/route.ts",
  ];

  for (const rota of rotas) {
    it(`${rota} lança clipeExpirado antes de naoEncontrado`, () => {
      const fonte = fs.readFileSync(path.join(RAIZ, rota), "utf8");
      expect(fonte).toContain("clipeSumido");
      expect(fonte).toContain("clipeExpirado(");
      // A ordem importa: perguntar "existiu?" DEPOIS de já ter respondido 404
      // não muda resposta nenhuma.
      expect(fonte.indexOf("clipeExpirado(")).toBeLessThan(
        fonte.lastIndexOf("throw naoEncontrado()"),
      );
    });
  }

  it("`clipeExpirado` devolve 410 com o tipo do catálogo", () => {
    const fonte = fs.readFileSync(path.join(RAIZ, "lib/problem.ts"), "utf8");
    const inicio = fonte.indexOf("export const clipeExpirado");
    const corpo = fonte.slice(inicio, inicio + 600);
    expect(corpo).toContain('type: "clip-expired"');
    expect(corpo).toContain("status: 410");
    // A regra de copy do topo de `problem.ts`: `detail` NUNCA cita o prazo de
    // retenção, que é configurável por parceiro.
    expect(/\b(90|30)\s*dias/.test(corpo)).toBe(false);
  });
});

describe("o clipe vencido some da API, mesmo sem job de expurgo", () => {
  const clipe = fs.readFileSync(path.join(RAIZ, "db/queries/clipe.ts"), "utf8");

  for (const nome of CONSULTAS_DO_ATLETA) {
    it(`${nome} filtra por expires_at`, () => {
      const corpo = corpoDaConsulta(clipe, nome);
      expect(
        /expires_at\s*>\s*now\(\)/.test(corpo),
        `${nome} devolve clipe fora da retenção — a Política de Privacidade promete ` +
          `${CLIP_RETENTION_DIAS_PADRAO} dias`,
      ).toBe(true);
    });
  }

  it("o contador da página pública concorda com a busca", () => {
    // `lancesDeHojeNaArena` conta o que a tela mostra. Duas contagens da mesma
    // coisa sempre divergem, e a que mente é a que o usuário vê primeiro — o
    // argumento está escrito no próprio `parceiro.ts`.
    const parceiro = fs.readFileSync(path.join(RAIZ, "db/queries/parceiro.ts"), "utf8");
    const inicio = parceiro.indexOf("export async function lancesDeHojeNaArena");
    const corpo = parceiro.slice(inicio, inicio + 1200);
    expect(/expires_at\s*>\s*now\(\)/.test(corpo)).toBe(true);
  });

  it("baixar empurra a validade, então `pinned` não precisa de exceção", () => {
    // Se esta relação mudar, o filtro acima passa a cortar links que o produto
    // prometeu manter vivos — e é aqui que isso aparece.
    expect(PIN_EXTENSAO_DIAS).toBeGreaterThan(CLIP_RETENTION_DIAS_PADRAO);
    const clipeFonte = fs.readFileSync(path.join(RAIZ, "db/queries/clipe.ts"), "utf8");
    expect(clipeFonte).toContain("GREATEST(expires_at");
  });
});

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

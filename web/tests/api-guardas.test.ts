import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITES } from "@/lib/limites";

// AS GUARDAS QUE TODA ROTA DE API TEM DE TER — conferidas por varredura.
//
// ─── POR QUE UM TESTE QUE LÊ O FONTE ───────────────────────────────────────
//
// É a mesma disciplina do teste de reservados (`tests/slug.test.ts`): a regra
// vale para a rota que ALGUÉM VAI ESCREVER AMANHÃ, e um teste que exercita as
// rotas de hoje não diz nada sobre ela. Sem RLS e sem uma camada de framework
// que imponha isso, a varredura é a única coisa que transforma "a gente sempre
// faz assim" em algo que falha quando alguém não faz.
//
// Duas regras, e as duas nasceram de defeitos encontrados nesta auditoria.

const RAIZ = process.cwd();
const DIR_API = path.join(RAIZ, "app/api");

/** Todos os `route.ts` de `app/api`, com o caminho relativo à raiz. */
function rotas(): Array<{ rel: string; fonte: string }> {
  const achados: Array<{ rel: string; fonte: string }> = [];
  const andar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.name === "route.ts") {
        achados.push({
          rel: path.relative(RAIZ, p).split(path.sep).join("/"),
          fonte: fs.readFileSync(p, "utf8"),
        });
      }
    }
  };
  andar(DIR_API);
  return achados;
}

const TODAS = rotas();

it("a varredura acha as rotas (senão o resto deste arquivo não prova nada)", () => {
  expect(TODAS.length).toBeGreaterThanOrEqual(15);
});

const mudaEstado = (f: string) => /export const (POST|PUT|PATCH|DELETE)\b/.test(f);
const usaSessao = (f: string) => f.includes("getSession(");

// ─────────────────────────────────────────────────────────────────────────────

describe("CSRF: quem age em nome do COOKIE confere a origem", () => {
  // ─── POR QUE `SameSite=Lax` NÃO BASTA, PALAVRA POR PALAVRA ──────────────
  //
  // `lib/http-guards.ts` já explica: `Lax` é same-**site**, não same-**origin**.
  // `relay-1.replayja.com.br`, `cdn.` e `media.` são o MESMO site que
  // `replayja.com.br` — um XSS ou um arquivo servido em qualquer subdomínio faz
  // requisição autenticada com o cookie da sessão junto.
  //
  // `/api/triggers`, `/api/auth/otp/*` e `/api/auth/logout` conferem. Duas rotas
  // não conferiam, e as duas mudam estado de verdade:
  //
  //   POST /api/grupos/{id}/convite   cria share_link e MANDA E-MAIL do nosso
  //                                   domínio para um endereço do corpo
  //   DELETE /api/grupos/{id}/convite revoga o convite da pelada
  //   POST /api/shares                escreve share_event na métrica do parceiro
  //
  // E `lerJson` não salva: ele lê o corpo como TEXTO e dá `JSON.parse`, sem
  // olhar `Content-Type`. Um formulário `text/plain` cross-site chega inteiro.
  const isentas: Record<string, string> = {
    // Autenticada pelo TOKEN assinado, não por cookie. O `POST` do RFC 8058 vem
    // do servidor do Gmail, sem `Origin` e com `x-www-form-urlencoded`: exigir
    // qualquer das duas guardas quebraria o descadastro em um clique.
    "app/api/descadastro/[token]/route.ts": "token assinado, sem cookie (RFC 8058)",
    // Webhook de firmware de terceiro: `Content-Type` ignorado por contrato
    // (`docs/api/README.md` §4) e segredo no caminho.
    "app/api/triggers/b/[buttonToken]/route.ts": "botão físico, segredo no caminho",
  };

  for (const { rel, fonte } of TODAS) {
    if (!mudaEstado(fonte) || !usaSessao(fonte)) continue;
    if (isentas[rel]) continue;
    it(`${rel} chama mesmaOrigem`, () => {
      expect(fonte, `${rel} muda estado com o cookie e não confere a origem`).toContain(
        "mesmaOrigem(",
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

describe("e-mail: nenhuma rota manda mensagem sem um teto", () => {
  // ─── O ARGUMENTO ESTÁ ESCRITO NO PRÓPRIO REPOSITÓRIO ────────────────────
  //
  // `app/api/auth/otp/start/route.ts` explica por que o balde de e-mail vem
  // ANTES de tudo: "é o que protege a caixa postal da vítima de virar alvo de
  // email bombing e a quota diária do Resend de ser queimada". E
  // `docs/api/README.md` §6 lista o teto do convite de grupo — 100 por grupo
  // por dia — que nunca foi implementado.
  //
  // Sem ele, qualquer membro de qualquer grupo chama
  // `POST /api/grupos/{id}/convite` em laço com um endereço por vez e faz o
  // NOSSO domínio verificado entregar e-mail ilimitado a terceiros. O custo não
  // é a fatura do Resend: é a reputação do domínio — que é o mesmo que entrega
  // o código de login. Perder a entrega do OTP é perder o produto.
  const isentas: Record<string, string> = {
    // Cron autenticado por `CRON_SECRET`, com `TETO_DE_ENVIOS` próprio por
    // passada e idempotência por linha (`play_group_digest`). Não há chamador
    // de fora para limitar.
    "app/api/cron/resumo-semanal/route.ts": "cron com segredo e teto próprio",
  };

  for (const { rel, fonte } of TODAS) {
    if (!fonte.includes("sendEmail(")) continue;
    if (isentas[rel]) continue;
    it(`${rel} passa por rateLimit antes de enviar`, () => {
      expect(fonte, `${rel} manda e-mail sem teto de taxa`).toContain("rateLimit(");
    });
  }

  it("o teto do convite existe em LIMITES, como manda o contrato", () => {
    // `docs/api/README.md` §6: "POST /groups/{id}/members — 100 convites /
    // grupo / dia — Antiabuso de e-mail".
    expect(LIMITES).toHaveProperty("conviteGrupo");
    expect(LIMITES.conviteGrupo).toEqual([100, 24 * 60 * 60]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("cron: nenhum job roda sem o segredo", () => {
  // ─── POR QUE ISTO VIROU VARREDURA ───────────────────────────────────────
  //
  // Até 13/09 havia UM cron (`resumo-semanal`) e a conferência do `CRON_SECRET`
  // era um bloco copiado dentro dele. O segundo cron (`purge-clips`) é o que
  // torna o padrão uma regra: uma rota que APAGA VÍDEO aberta na internet é um
  // botão de destruição de acervo, e a diferença entre ter e não ter a guarda é
  // um `if` que ninguém revisa de novo.
  //
  // A forma é sempre a mesma: sem `CRON_SECRET` configurado a rota só roda em
  // desenvolvimento; com ele, exige `Authorization: Bearer $CRON_SECRET`. Um
  // cron que caia no `NODE_ENV === "development"` em produção não existe — a
  // Vercel define `NODE_ENV=production` em todo deploy.
  const crons = TODAS.filter((r) => r.rel.startsWith("app/api/cron/"));

  it("existe pelo menos um cron para conferir", () => {
    expect(crons.length).toBeGreaterThanOrEqual(2);
  });

  for (const { rel, fonte } of crons) {
    it(`${rel} recusa sem CRON_SECRET`, () => {
      expect(fonte, `${rel} não lê CRON_SECRET`).toContain("process.env.CRON_SECRET");
      expect(fonte, `${rel} não confere o Bearer`).toContain("Bearer ${segredo}");
      expect(fonte, `${rel} não recusa quem não passou na guarda`).toMatch(
        /if \(!autorizado\(req\)\) throw semPermissao\(\)/,
      );
    });
  }

  it("o expurgo está agendado, e às 04:00 de Brasília", () => {
    // `0 7 * * *` em UTC. Se alguém trocar o horário sem trocar este teste, a
    // conta de fuso aparece aqui — e não numa madrugada em que o job apagou
    // vídeo às 20h.
    const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    const agendados = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]));
    for (const { rel } of crons) {
      const rota = "/" + rel.replace(/^app\//, "").replace(/\/route\.ts$/, "");
      expect(agendados.has(rota), `${rota} não está em vercel.json`).toBe(true);
    }
    expect(agendados.get("/api/cron/purge-clips")).toBe("0 7 * * *");
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// OS TRÊS ACHADOS SOLTOS DA AUDITORIA DE 13/09 — A-11, A-12 e A-14.
//
// Cada um é pequeno. Estão juntos porque a coisa que os une é a auditoria, e
// porque um teste por achado espalhado em três arquivos é como um achado some
// da próxima revisão.

const RAIZ = process.cwd();

// ═══════════════════════════════════════════════════════════════════════════
// A-12 · o oráculo de enumeração do painel
// ═══════════════════════════════════════════════════════════════════════════

describe("A-12 · `resolverArena` não distingue 'não existe' de 'sem acesso'", () => {
  const fonte = fs.readFileSync(path.join(RAIZ, "app/painel/_lib/arena.ts"), "utf8");

  /** O corpo de `resolverArena`, da assinatura até a próxima exportada. */
  const corpo = (() => {
    const i = fonte.indexOf("export async function resolverArena");
    const resto = fonte.slice(i + 1);
    const f = resto.indexOf("\nexport ");
    return f === -1 ? resto : resto.slice(0, f);
  })();

  it("o caminho da arena inexistente devolve o MESMO motivo do sem-permissão", () => {
    // `docs/api/README.md` §6 e o comentário de `exigirArena`, vinte linhas
    // abaixo, dizem a mesma coisa: nunca distinguir as duas. A função dizia o
    // contrário, e a diferença entre as duas telas era um oráculo — dava para
    // descobrir, de fora, quais slugs de arena existem, inclusive os que ainda
    // não foram ao ar (`public_page_enabled = false`).
    expect(
      /if \(!parceiro\) return \{ ok: false, motivo: "sem-permissao"/.test(corpo),
      "arena inexistente voltou a ter resposta própria — é o oráculo de novo",
    ).toBe(true);
    expect(
      corpo.includes('motivo: "nao-encontrada"'),
      "`resolverArena` não pode devolver `nao-encontrada`",
    ).toBe(false);
  });

  it("a frase de `sem-permissao` cobre as duas situações sem dizer qual foi", () => {
    // O conserto barato seria colapsar tudo em "Arena não encontrada" — e essa
    // frase manda o gerente de duas arenas conferir um link que está certo,
    // que é o caso comum. A frase tem de servir aos dois.
    const tela = fs.readFileSync(
      path.join(RAIZ, "app/painel/_components/EstadoDaArena.tsx"),
      "utf8",
    );
    const i = tela.indexOf('estado.motivo === "sem-permissao"');
    const bloco = tela.slice(i, i + 900);
    expect(bloco).toContain("não administra a arena deste endereço");
    expect(bloco).toContain("ou o endereço não é de nenhuma arena");
    // E a saída continua sendo a lista — é o que resolve o link colado errado.
    expect(bloco).toContain("Ver minhas arenas");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A-14 · a câmera que nunca conectou
// ═══════════════════════════════════════════════════════════════════════════

describe("A-14 · câmera que nunca transmitiu é `down`, não `degraded`", () => {
  const fonte = fs.readFileSync(path.join(RAIZ, "db/queries/relay.ts"), "utf8");
  const i = fonte.indexOf("export async function registrarSaudeDoRelay");
  const corpo = fonte.slice(i);
  const inicioDoCase = corpo.indexOf("status = CASE");
  // O `WHERE id = $1` procurado A PARTIR do CASE: a consulta que confere se a
  // câmera é deste relay usa a mesma cláusula, e vem antes.
  const caseDeStatus = corpo.slice(inicioDoCase, corpo.indexOf("WHERE id = $1", inicioDoCase));

  it("o CASE tem a perna do 'nunca conectou', e ela vem antes da cobertura", () => {
    // Em produção `arenavascoq2` estava `degraded` com `last_segment_at = NULL`
    // e `coverage_24h = 0`: gravador de pé, câmera que nunca transmitiu. O CASE
    // só olhava `recorder_up` e a cobertura, então caía em `degraded` — que se
    // lê como "grava mal". A verdade era "nunca instalou", e as duas pedem
    // ações opostas: reiniciar vs. configurar.
    const nunca = caseDeStatus.indexOf("$2::timestamptz IS NULL AND last_segment_at IS NULL");
    const cobertura = caseDeStatus.indexOf("$3 < 0.90");
    expect(nunca, "a perna do 'nunca conectou' sumiu do CASE").toBeGreaterThan(-1);
    expect(cobertura).toBeGreaterThan(-1);
    expect(
      nunca,
      "a perna da cobertura vem antes e captura o caso: a câmera volta a ser `degraded`",
    ).toBeLessThan(cobertura);
  });

  it("a tela continua chamando isso de `aguardando`, e não de `offline`", async () => {
    // A coluna e a tela respondem a públicos diferentes: a coluna é o que um
    // alerta vai ler ("não está gravando"), a tela é o que o parceiro lê ("a
    // instalação não terminou"). `lerSaudeDaCamera` pergunta `last_segment_at`
    // ANTES de olhar o status, e é isso que mantém as duas coisas certas ao
    // mesmo tempo — este caso é o que impede alguém de "simplificar" essa ordem.
    const { lerSaudeDaCamera } = await import("@/lib/saude-visao");
    const leitura = lerSaudeDaCamera({
      enabled: true,
      status: "down",
      last_segment_at: null,
      coverage_24h: "0.000",
      since_seconds: null,
      relay_since_seconds: 12,
    } as never);
    expect(leitura.estado).toBe("aguardando");
    expect(leitura.rotulo).toBe("aguardando relay");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A-11 · o `sitemap.xml` que respondia 404
// ═══════════════════════════════════════════════════════════════════════════

describe("A-11 · o sitemap existe e só lista o que é público", () => {
  it("o `robots.txt` anuncia um sitemap que existe", () => {
    const robots = fs.readFileSync(path.join(RAIZ, "app/robots.ts"), "utf8");
    expect(robots).toContain("/sitemap.xml");
    expect(
      fs.existsSync(path.join(RAIZ, "app/sitemap.ts")),
      "o robots.txt anuncia um endereço que responde 404 — foi o achado A-11",
    ).toBe(true);
  });

  it("lista arena e grupo público, e mais nada", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ query: vi.fn(), dbConfigured: () => true }));
    vi.doMock("@/db/queries/sitemap", () => ({
      paginasPublicas: vi.fn(async () => ({
        arenas: [{ slug: "arena-vasco", atualizada_em: new Date("2026-09-12T00:00:00Z") }],
        grupos: [
          {
            partner_slug: "arena-vasco",
            slug: "fut-de-segunda",
            atualizada_em: new Date("2026-09-12T00:00:00Z"),
          },
        ],
      })),
    }));
    process.env.NEXT_PUBLIC_SITE_URL = "https://replayja.com.br";

    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toEqual([
      "https://replayja.com.br/",
      "https://replayja.com.br/arena-vasco",
      "https://replayja.com.br/arena-vasco/fut-de-segunda",
    ]);
  });

  it("nenhuma rota que leva a VÍDEO entra — é a mesma lista do `disallow`", () => {
    // Um sitemap é um CONVITE ao rastreador. Convidar para uma rota que o
    // `robots.txt` proíbe é mandar dois recados opostos, e o que vaza é o
    // segundo. As rotas de vídeo não podem aparecer nem por engano.
    // Só o CÓDIGO: os comentários dos dois arquivos citam as rotas proibidas
    // justamente para explicar por que elas não entram.
    const semComentarios = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    const fonte = semComentarios(
      fs.readFileSync(path.join(RAIZ, "app/sitemap.ts"), "utf8"),
    );
    const consulta = semComentarios(
      fs.readFileSync(path.join(RAIZ, "db/queries/sitemap.ts"), "utf8"),
    );
    for (const proibida of ["/c/", "/s/", "/painel", "/app", "/entrar"]) {
      expect(fonte.includes(proibida), `${proibida} entrou no sitemap`).toBe(false);
    }
    // E a consulta não pode ler `clip` nem projetar coluna de pessoa.
    expect(/\bFROM\s+clip\b/.test(consulta)).toBe(false);
    expect(/\bemail\b/.test(consulta)).toBe(false);
  });

  it("sem banco, o sitemap responde a home — e não um 500", async () => {
    // Um sitemap quebrado é PIOR que um sitemap magro: o Search Console marca
    // o arquivo como com erro e leva dias para voltar a tentar.
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ query: vi.fn(), dbConfigured: () => false }));
    const { default: sitemap } = await import("@/app/sitemap");
    expect((await sitemap()).map((e) => e.url)).toEqual(["https://replayja.com.br/"]);
  });
});

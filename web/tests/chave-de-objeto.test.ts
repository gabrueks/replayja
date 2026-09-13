import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-longo-o-bastante-para-hmac";
});

const { chaveDeClipe } = await import("@/lib/storage");

// A CHAVE DE OBJETO DO CLIPE — quem a escolhe, e o que acontece quando não é a
// gente.
//
// ─── O DEFEITO ─────────────────────────────────────────────────────────────
//
// `POST /api/relay/clips/{id}/upload-url` CALCULA a chave (é determinística por
// contrato, `api/README.md` §5 camada 4) e devolve URLs assinadas para ela. O
// relay sobe os bytes e chama `/confirm` — que, até aqui, aceitava de volta
// qualquer `objectKey` que viesse no corpo e a gravava em
// `clip.watermarked_object_key`.
//
// O que isso permite, para quem tiver a `RELAY_KEY` (ou para um relay com bug):
// confirmar o clipe apontando para a chave de OUTRA ARENA — ou para qualquer
// objeto do bucket privado. Depois disso `GET /api/clips/{id}/download` assina
// uma URL para aquele objeto e entrega a QUALQUER usuário logado, porque a
// rota confia na coluna.
//
// Não é uma falha explorável hoje por um usuário comum: `/api/relay/*` exige
// `x-relay-key`, que é segredo forte, e o relay é máquina nossa. Mas "o chamador
// é confiável" é exatamente o argumento que some no dia em que a chave vaza ou
// em que existem dois relays — e recalcular custa uma linha. O relay legítimo
// já devolve a chave que recebeu (`relay/clip-worker.py`, `alvo["objectKey"]`),
// então a conferência é um no-op para ele.

describe("a chave é derivada, e não há como um clipe apontar para outro", () => {
  const A = {
    partner: "59322e71-5f9d-452f-a8c6-2abeadb5fa7a",
    court: "0a52d94e-7033-4fd9-9520-6fdfecd41288",
    data: "2026-09-12",
    clip: "8f8c9eb1-5366-41c9-a604-8bdd05c3fb78",
  };

  it("reproduz a chave que está em produção hoje", () => {
    // Conferida por leitura no banco de produção em 13/09/2026. Se esta
    // afirmação quebrar, a conferência do `/confirm` passa a recusar clipe bom
    // — e é aqui que isso aparece, não na quadra.
    expect(chaveDeClipe(A.partner, A.court, A.data, A.clip, "watermarked")).toBe(
      `clips/${A.partner}/${A.court}/${A.data}/${A.clip}/wm.mp4`,
    );
    expect(chaveDeClipe(A.partner, A.court, A.data, A.clip, "thumbnail")).toBe(
      `clips/${A.partner}/${A.court}/${A.data}/${A.clip}/thumb.jpg`,
    );
    expect(chaveDeClipe(A.partner, A.court, A.data, A.clip, "og")).toBe(
      `clips/${A.partner}/${A.court}/${A.data}/${A.clip}/og.jpg`,
    );
  });

  it("é determinística — repetir o PUT sobrescreve os mesmos bytes", () => {
    expect(chaveDeClipe(A.partner, A.court, A.data, A.clip, "watermarked")).toBe(
      chaveDeClipe(A.partner, A.court, A.data, A.clip, "watermarked"),
    );
  });

  it("a chave de uma arena nunca é a de outra", () => {
    const outraArena = chaveDeClipe(
      "00000000-0000-4000-8000-000000000001",
      A.court,
      A.data,
      A.clip,
      "watermarked",
    );
    expect(outraArena).not.toBe(chaveDeClipe(A.partner, A.court, A.data, A.clip, "watermarked"));
  });
});

describe("/confirm não aceita chave de fora", () => {
  const fonte = fs.readFileSync(
    path.join(process.cwd(), "app/api/relay/clips/[clipId]/confirm/route.ts"),
    "utf8",
  );

  it("recalcula a chave em vez de gravar a do corpo", () => {
    expect(fonte, "confirm não deriva a chave").toContain("chaveDeClipe(");
    // A comparação tem de EXISTIR: derivar e não comparar não conserta nada.
    expect(/objectKey\s*!==\s*esperada/.test(fonte)).toBe(true);
  });

  it("o que vai para o banco é a chave derivada, não a recebida", () => {
    // `objectKey: esperada` — se alguém trocar de volta por `objectKey`, a
    // conferência vira decoração.
    expect(/objectKey:\s*esperada/.test(fonte)).toBe(true);
  });

  it("usa a MESMA conta de data local que a rota de upload-url", () => {
    // As duas precisam produzir a mesma string para o mesmo clipe; divergir aqui
    // faria todo `confirm` recusar e todo clipe ficar eternamente em
    // `processing` — com os bytes já no S3.
    const upload = fs.readFileSync(
      path.join(process.cwd(), "app/api/relay/clips/[clipId]/upload-url/route.ts"),
      "utf8",
    );
    const conta = /toLocaleDateString\("en-CA",\s*\{\s*timeZone:\s*clipe\.timezone,?\s*\}\)/;
    expect(conta.test(upload), "upload-url mudou a conta da data").toBe(true);
    expect(conta.test(fonte), "confirm não usa a mesma conta da data").toBe(true);
  });
});

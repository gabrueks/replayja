import { describe, expect, it } from "vitest";
import {
  MARCA_PADRAO,
  marcaDoJob,
  posicaoDaMarca,
  type BrandingDoJob,
} from "@/lib/marca-dagua";

// A regra que decide a marca de cada clipe. Ela é a razão pela qual todo clipe
// de produção saía com `watermark_applied = false`: o claim mandava
// `watermark: null` quando o parceiro não tinha PNG, e o relay entendia isso
// como "sem marca" em vez de "use a sua".
//
// Por isso o teste mais importante deste arquivo é o mais bobo: NENHUMA entrada
// produz clipe sem marca.

const parceiro = (over: Partial<BrandingDoJob> = {}): BrandingDoJob => ({
  watermark_enabled: true,
  watermark_object_key: "branding/p-1/watermark.png",
  watermark_version: 3,
  watermark_position: "bottom_left",
  watermark_opacity: "0.85",
  watermark_width_pct: "18.0",
  ...over,
});

describe("posição da marca", () => {
  it("traduz o enum do banco para o contrato do relay", () => {
    expect(posicaoDaMarca("bottom_right")).toBe("bottom-right");
    expect(posicaoDaMarca("top_left")).toBe("top-left");
  });

  it("aceita a grafia com hífen, que é a que o relay fala", () => {
    expect(posicaoDaMarca("bottom-left")).toBe("bottom-left");
  });

  it("cai no padrão em vez de propagar lixo", () => {
    // Uma posição inválida não pode custar a marca do clipe inteiro: `overlay=`
    // com coordenada indefinida derruba o ffmpeg e o job volta para a fila.
    expect(posicaoDaMarca("meio")).toBe("bottom-right");
    expect(posicaoDaMarca(null)).toBe("bottom-right");
    expect(posicaoDaMarca(undefined)).toBe("bottom-right");
  });
});

describe("marca do job", () => {
  it("usa a do parceiro quando há PNG e URL assinada", () => {
    const m = marcaDoJob(parceiro(), "https://s3/assinada");
    expect(m.kind).toBe("partner");
    expect(m.url).toBe("https://s3/assinada");
    expect(m.version).toBe(3);
    expect(m.position).toBe("bottom-left");
    expect(m.opacityPct).toBe(85);
    expect(m.widthPct).toBe(18);
  });

  it("cai na do Replay já quando o parceiro não enviou PNG", () => {
    const m = marcaDoJob(parceiro({ watermark_object_key: null }), null);
    expect(m.kind).toBe("default");
    expect(m.version).toBe(0);
    expect(m.widthPct).toBe(MARCA_PADRAO.widthPct);
    expect(m.position).toBe("bottom-right");
  });

  it("cai na do Replay já quando não dá para assinar a URL", () => {
    // Credencial de bucket errada não pode custar o lance do atleta.
    const m = marcaDoJob(parceiro(), null);
    expect(m.kind).toBe("default");
    expect(m.url).toBeNull();
  });

  it("parceiro sem branding nenhum ainda leva marca", () => {
    const m = marcaDoJob(null, null);
    expect(m.kind).toBe("default");
  });

  it("o toggle do parceiro desliga a marca DELE, não a nossa", () => {
    // Decisão deliberada: não existe clipe limpo. Um MP4 sem marca circula no
    // WhatsApp sem dizer de onde veio, que é o oposto do que o produto vende.
    const m = marcaDoJob(parceiro({ watermark_enabled: false }), "https://s3/assinada");
    expect(m.kind).toBe("default");
  });

  it("converte opacidade em fração para pontos percentuais", () => {
    // O banco guarda 0.85 desde a migração 0002; o contrato fala em 85.
    expect(marcaDoJob(parceiro({ watermark_opacity: "0.6" }), "u").opacityPct).toBe(60);
    expect(marcaDoJob(parceiro({ watermark_opacity: "85" }), "u").opacityPct).toBe(85);
  });

  it("lê largura em fração como o painel antigo escrevia (0.18 = 18%)", () => {
    // `watermark_scale` guardava fração. Quem migrar o valor sem multiplicar por
    // 100 mandaria 0,18% — uma marca de 3 pixels, invisível e indepurável.
    expect(marcaDoJob(parceiro({ watermark_width_pct: "0.18" }), "u").widthPct).toBe(18);
  });

  it("prende largura e opacidade em faixas que o ffmpeg aguenta", () => {
    expect(marcaDoJob(parceiro({ watermark_width_pct: "900" }), "u").widthPct).toBe(30);
    expect(marcaDoJob(parceiro({ watermark_opacity: "0" }), "u").opacityPct).toBe(85);
    expect(marcaDoJob(parceiro({ watermark_opacity: "-3" }), "u").opacityPct).toBe(85);
  });

  it("número ilegível vira o padrão, nunca NaN", () => {
    // `scale=NaN:-1` não é erro de sintaxe do filtergraph: é um clipe reprovado
    // no ffprobe, depois de pagar o re-encode inteiro.
    const m = marcaDoJob(parceiro({ watermark_width_pct: "abacaxi" }), "u");
    expect(m.widthPct).toBe(18);
    expect(Number.isFinite(m.widthPct)).toBe(true);
  });

  it("nunca devolve ausência de marca", () => {
    const entradas: Array<[BrandingDoJob | null, string | null]> = [
      [null, null],
      [parceiro(), "u"],
      [parceiro({ watermark_enabled: false }), null],
      [parceiro({ watermark_object_key: null }), "u"],
    ];
    for (const [b, url] of entradas) {
      const m = marcaDoJob(b, url);
      expect(["partner", "default"]).toContain(m.kind);
      expect(m.widthPct).toBeGreaterThan(0);
      expect(m.opacityPct).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import { formatarIdade, lerSaudeDaCamera, porcentagem } from "@/lib/saude-visao";
import type { SaudeDaCameraRow } from "@/db/queries/saude";

// O bug que estes testes prendem: as telas do painel comparavam
// `camera.status === "online"`, e `online` NÃO EXISTE no enum `camera_status`
// (`provisioned`, `recording`, `degraded`, `down`, `disabled`). Toda câmera
// aparecia offline — inclusive uma gravando perfeitamente.

function camera(over: Partial<SaudeDaCameraRow> = {}): SaudeDaCameraRow {
  return {
    id: "arenavascoq1",
    name: "Câmera Quadra 1",
    court: "Quadra 1",
    court_slug: "quadra-1",
    status: "recording",
    enabled: true,
    last_segment_at: new Date(),
    since_seconds: 3,
    coverage_24h: "0.960",
    coverage_1h: "0.980",
    long_segments_24h: 0,
    observed_bitrate_kbps: "3000.0",
    target_bitrate_kbps: 3000,
    recorded_until: null,
    rtmp_port: 19350,
    relay_node_id: "relay-1",
    relay_status: "active",
    relay_disk_free: "0.62",
    relay_last_seen_at: new Date(),
    relay_since_seconds: 20,
    amostra_em: new Date(),
    ...over,
  };
}

describe("lerSaudeDaCamera", () => {
  it("câmera gravando com boa cobertura é `gravando`", () => {
    const r = lerSaudeDaCamera(camera());
    expect(r.estado).toBe("gravando");
    expect(r.rotulo).toBe("gravando");
    expect(r.relayOnline).toBe(true);
  });

  it("cobertura abaixo de 0,90 é INSTÁVEL, não offline", () => {
    // A distinção importa: a ação é do lado do parceiro (uplink da arena), e
    // dizer "offline" para uma câmera que está gravando manda o suporte para o
    // lugar errado.
    const r = lerSaudeDaCamera(camera({ coverage_24h: "0.870" }));
    expect(r.estado).toBe("instavel");
    expect(r.ponto).not.toBe("offline");
  });

  it("`degraded` é instável mesmo com cobertura alta", () => {
    expect(lerSaudeDaCamera(camera({ status: "degraded" })).estado).toBe("instavel");
  });

  it("câmera que NUNCA conectou é `aguardando`, não `offline`", () => {
    // Instalação incompleta e queda pedem ações opostas: configurar a câmera
    // versus reiniciar o relay. Um rótulo só para as duas esconde a diferença.
    const r = lerSaudeDaCamera(
      camera({ status: "provisioned", last_segment_at: null, since_seconds: null, coverage_24h: null }),
    );
    expect(r.estado).toBe("aguardando");
    expect(r.rotulo).toBe("aguardando relay");
    expect(r.ultimoSegmento).toBe("nunca");
  });

  it("`down` e `disabled` são offline", () => {
    expect(lerSaudeDaCamera(camera({ status: "down" })).estado).toBe("offline");
    expect(lerSaudeDaCamera(camera({ status: "disabled", enabled: false })).estado).toBe("offline");
  });

  it("relay sem heartbeat há mais de 3 ciclos está offline", () => {
    expect(lerSaudeDaCamera(camera({ relay_since_seconds: 181 })).relayOnline).toBe(false);
    expect(lerSaudeDaCamera(camera({ relay_since_seconds: 179 })).relayOnline).toBe(true);
    expect(lerSaudeDaCamera(camera({ relay_since_seconds: null })).relayOnline).toBe(false);
  });
});

describe("formatação", () => {
  it("idade vira a unidade que cabe de relance", () => {
    expect(formatarIdade(12)).toBe("há 12s");
    expect(formatarIdade(240)).toBe("há 4min");
    expect(formatarIdade(10_800)).toBe("há 3h");
    expect(formatarIdade(172_800)).toBe("há 2d");
  });

  it("porcentagem lida com a ausência de amostra", () => {
    expect(porcentagem(0.9604)).toBe("96.0%");
    expect(porcentagem(null)).toBe("—");
  });
});

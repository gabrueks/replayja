import { ImageResponse } from "next/og";

/**
 * A arte compartilhada das imagens de Open Graph.
 *
 * ─── ONDE ISSO É GERADO, E POR QUÊ ─────────────────────────────────────────
 *
 * O ADR §4.1 diz que imagem de OG é produzida NA INGESTÃO e nunca em runtime —
 * porque crawler é agressivo e transformação de imagem em `gru1` é cobrada. Isso
 * continua valendo para a imagem QUE A ARENA ENVIA: quando `og_image_object_key`
 * existe, é ela que vai no metadata, e este arquivo nem roda.
 *
 * O que este arquivo cobre é o FALLBACK DE IDENTIDADE — a arena que ainda não
 * enviou arte, a sessão e o grupo, que não têm imagem própria e nunca terão uma
 * por upload. Sem isso, o link no WhatsApp aparece como um retângulo cinza, que é
 * o pior resultado possível para um produto que vive de link compartilhado.
 *
 * O custo é contido por três decisões:
 *
 *   1. `revalidate` de um dia em cada rota: o crawler bate uma vez e o resto sai
 *      do cache da borda.
 *   2. Desenho em caixas e texto, sem foto e sem fonte customizada — o
 *      `ImageResponse` resolve em milissegundos e sem baixar nada.
 *   3. Nada de dado pessoal na arte: nome da arena, horário e quadra. Nunca
 *      thumbnail, que é a superfície com imagem de pessoa.
 */

export const TAMANHO_OG = { width: 1200, height: 630 };
export const TIPO_OG = "image/png";

const FUNDO = "#0B0C0E";
const SUPERFICIE = "#15171A";
const BORDA = "#2A2E34";
const ACENTO = "#FF6B1F";
const TEXTO = "#F2F4F6";
const TEXTO_2 = "#9AA1AA";
const GRAMA_CLARA = "#1E7A42";
const GRAMA_ESCURA = "#0E3E23";

export function imagemDeCapa({
  arena,
  titulo,
  linha,
  selo,
}: {
  /** Nome da arena — o rótulo pequeno no topo. */
  arena: string;
  /** A linha grande. */
  titulo: string;
  /** A linha de apoio (horário, quadra, dias). */
  linha?: string;
  /** Pílula laranja no canto ("SESSÃO", "GRUPO"). */
  selo?: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: FUNDO,
          padding: 64,
          // O gradiente de grama no canto inferior direito é o que faz a arte ler
          // como "quadra" sem nenhuma foto.
          backgroundImage: `radial-gradient(900px 520px at 100% 120%, ${GRAMA_CLARA}55 0%, ${GRAMA_ESCURA}00 70%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background: ACENTO,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: FUNDO,
                fontSize: 40,
                fontWeight: 800,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", color: TEXTO_2, fontSize: 28, letterSpacing: 2 }}>
              replay já
            </div>
          </div>

          {selo ? (
            <div
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                background: ACENTO,
                color: FUNDO,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 3,
              }}
            >
              {selo}
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", color: ACENTO, fontSize: 30, letterSpacing: 4 }}>
            {arena.toUpperCase()}
          </div>
          <div
            style={{
              display: "flex",
              color: TEXTO,
              fontSize: 86,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {titulo}
          </div>
          {linha ? (
            <div style={{ display: "flex", color: TEXTO_2, fontSize: 34 }}>{linha}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "18px 26px",
            borderRadius: 18,
            background: SUPERFICIE,
            border: `1px solid ${BORDA}`,
            color: TEXTO_2,
            fontSize: 26,
            alignSelf: "flex-start",
          }}
        >
          Aperte o botão na quadra. O lance fica salvo.
        </div>
      </div>
    ),
    TAMANHO_OG,
  );
}

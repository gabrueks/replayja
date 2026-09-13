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

/*
 * ─── OS HEX LITERAIS SÃO A EXCEÇÃO DOCUMENTADA ────────────────────────────
 *
 * `globals.css` é o único lugar do produto com hex — menos aqui. O Satori
 * renderiza esta árvore fora do navegador: não há CSSOM, então `var(--cor-…)`
 * resolve para nada e a arte sai preta. Os valores abaixo são os tokens da v2
 * copiados à mão, e mudam JUNTO com eles.
 *
 * A arte segue escura mesmo com o app claro, e isso é escolha: a prévia do
 * WhatsApp aparece sobre a bolha do chat (clara no tema claro, escura no
 * escuro), e um cartão escuro com a marca laranja se destaca nas duas — um
 * cartão `#F6F3EF` sumiria dentro da conversa clara.
 */
const FUNDO = "#16130F";        /* --cor-tinta */
const SUPERFICIE = "#221D17";   /* tinta + 7% de branco, achatado para o Satori */
const BORDA = "#332B23";
const ACENTO = "#FF6B1F";       /* --cor-marca: sobre escuro ela é a marca */
const TINTA_SOBRE_ACENTO = "#1A0B02";
const TEXTO = "#FFFFFF";
const TEXTO_2 = "#A79D92";      /* --cor-texto-4, que só existe sobre escuro */
const GRAMA_CLARA = "#2C9256";  /* --quadra-clara */
const GRAMA_ESCURA = "#0E4224"; /* --quadra-escura */

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
                color: TINTA_SOBRE_ACENTO,
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
                color: TINTA_SOBRE_ACENTO,
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

import { QR_MARGEM, TextoLongoDemais, gerarQr, qrComoPath } from "../_lib/qr";
import css from "../painel.module.css";

/**
 * O QR de um texto, desenhado como SVG **no servidor**.
 *
 * ─── O SEGREDO NÃO PODE VIRAR QUERY STRING ─────────────────────────────────
 *
 * A tentação é `<img src="/api/painel/qr?dados=...">`. O que esse QR codifica é
 * a URL do webhook do botão — ou seja, o token — e query string entra no log de
 * acesso da Vercel, no `Referer` e no histórico do navegador. Um segredo de
 * dispositivo num arquivo que ninguém considera sensível é exatamente como ele
 * vaza.
 *
 * Renderizando aqui, o token chega ao HTML da página que já exige sessão e
 * papel de admin, e nada além disso.
 *
 * ─── A ZONA DE SILÊNCIO NÃO É MARGEM DE DESIGN ─────────────────────────────
 *
 * Os 4 módulos brancos em volta são exigência da norma: sem eles o leitor não
 * acha as bordas, e o sintoma é "funciona no meu celular e não no dele".
 *
 * ─── OS DOIS HEX ABAIXO SÃO EXCEÇÃO DOCUMENTADA ────────────────────────────
 *
 * `#fff` e `#000` não são cores do sistema: são o contraste máximo que a norma
 * do QR pede. Trocá-los por `--cor-superficie` e `--cor-texto` faria o código
 * sair em `#16130F` sobre um branco que vira TRANSLÚCIDO nas telas `.noite` — um
 * QR que o leitor do celular recusa. A moldura em volta (`.qr`) é que veste a
 * v2.
 */
export function QrCode({
  valor,
  descricao,
  lado = 176,
}: {
  valor: string;
  /** Texto alternativo — descreve o que o QR abre, nunca o segredo em si. */
  descricao: string;
  lado?: number;
}) {
  let caminho: string;
  let tamanho: number;
  try {
    const qr = gerarQr(valor);
    caminho = qrComoPath(qr);
    tamanho = qr.tamanho;
  } catch (err) {
    if (err instanceof TextoLongoDemais) {
      // Nenhum QR é melhor que um QR ilegível: o valor continua ao lado, com o
      // botão de copiar, que é o caminho que sempre funciona.
      return null;
    }
    throw err;
  }

  const total = tamanho + QR_MARGEM * 2;
  return (
    <svg
      className={css.qr}
      width={lado}
      height={lado}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={descricao}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#fff" />
      <g transform={`translate(${QR_MARGEM} ${QR_MARGEM})`}>
        <path d={caminho} fill="#000" />
      </g>
    </svg>
  );
}

export default QrCode;

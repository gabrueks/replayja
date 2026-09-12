/**
 * Gera os ícones PNG do PWA a partir da mesma forma do `public/icone.svg`.
 *
 * ─── POR QUE UM GERADOR E NÃO UM PNG COMMITADO ─────────────────────────────
 *
 * O ícone é a marca: quadrado laranja `#FF6B1F` com um "R" em `#0B0C0E`. Se o
 * acento mudar, um PNG binário no repositório vira mentira silenciosa — e
 * ninguém abre um .png para conferir. Aqui a cor sai do mesmo lugar que o token,
 * e `pnpm icones` regenera.
 *
 * ─── POR QUE NÃO USAR `sharp`/`canvas` ─────────────────────────────────────
 *
 * São dependências nativas pesadas para desenhar dois retângulos e uma letra. O
 * encoder abaixo é PNG puro com `zlib` da própria Node: ~90 linhas, zero
 * dependência, e o resultado é um arquivo válido e pequeno.
 *
 *   node scripts/gerar-icones.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LARANJA = [0xff, 0x6b, 0x1f];
const ESCURO = [0x0b, 0x0c, 0x0e];

/** Amostra 4x4 por pixel: sem isso as curvas do "R" saem serrilhadas. */
const AMOSTRAS = 4;

/** Distância de um ponto ao segmento AB — usada para desenhar traços grossos. */
function distanciaAoSegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** `true` quando o ponto (em coordenadas 0..1) faz parte do "R". */
function dentroDoR(x, y) {
  const grossura = 0.075;

  // Haste vertical.
  if (distanciaAoSegmento(x, y, 0.33, 0.24, 0.33, 0.77) <= grossura) return true;

  // Barriga: anel à direita da haste, só a metade de cima.
  const dx = x - 0.33;
  const dy = y - 0.385;
  const raio = Math.hypot(dx, dy * 1.05);
  if (raio <= 0.155 + grossura / 2 && raio >= 0.155 - grossura / 2 && x >= 0.33) return true;

  // Perna diagonal.
  if (distanciaAoSegmento(x, y, 0.42, 0.52, 0.67, 0.77) <= grossura) return true;

  return false;
}

/** `true` quando o ponto está dentro do quadrado de cantos arredondados. */
function dentroDaMoldura(x, y) {
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function desenhar(lado) {
  // RGBA, uma linha por vez, com o byte de filtro 0 na frente (PNG exige).
  const linhas = Buffer.alloc(lado * (lado * 4 + 1));
  let p = 0;
  for (let py = 0; py < lado; py += 1) {
    linhas[p] = 0;
    p += 1;
    for (let px = 0; px < lado; px += 1) {
      let dentroFundo = 0;
      let dentroLetra = 0;
      for (let sy = 0; sy < AMOSTRAS; sy += 1) {
        for (let sx = 0; sx < AMOSTRAS; sx += 1) {
          const x = (px + (sx + 0.5) / AMOSTRAS) / lado;
          const y = (py + (sy + 0.5) / AMOSTRAS) / lado;
          if (dentroDaMoldura(x, y)) dentroFundo += 1;
          if (dentroDoR(x, y)) dentroLetra += 1;
        }
      }
      const total = AMOSTRAS * AMOSTRAS;
      const alfaFundo = dentroFundo / total;
      const alfaLetra = (dentroLetra / total) * alfaFundo;

      for (let c = 0; c < 3; c += 1) {
        const cor = LARANJA[c] * (1 - alfaLetra) + ESCURO[c] * alfaLetra;
        linhas[p + c] = Math.round(cor);
      }
      linhas[p + 3] = Math.round(alfaFundo * 255);
      p += 4;
    }
  }
  return linhas;
}

function pedaco(tipo, dados) {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo) >>> 0, 0);
  return Buffer.concat([comprimento, corpo, crc]);
}

const TABELA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function png(lado) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(desenhar(lado), { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
for (const lado of [192, 512]) {
  const arquivo = join(raiz, `icone-${lado}.png`);
  writeFileSync(arquivo, png(lado));
  console.log(`ok ${arquivo}`);
}

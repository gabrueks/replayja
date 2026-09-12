import { describe, expect, it } from "vitest";
import { QR_CAPACIDADE_MAX, TextoLongoDemais, gerarQr, qrComoPath } from "@/app/painel/_lib/qr";

// O codificador de QR do painel.
//
// ─── COMO SE TESTA UM CODIFICADOR SEM UM DECODIFICADOR DE VERDADE ──────────
//
// O erro que importa aqui é silencioso: o QR SAI DESENHADO e a câmera do
// celular não lê. Conferir "tem quadradinhos" não prova nada — trocar dois
// termos no polinômio gerador, ou inverter uma máscara, produz uma imagem
// perfeitamente plausível e ilegível.
//
// Então este arquivo traz um LEITOR escrito no sentido inverso, a partir da
// norma, e não a partir do código do codificador: ele decide sozinho quais
// células são padrão de função, percorre o zigue-zague na mesma ordem, desfaz a
// máscara, desentrelaça os blocos e lê o cabeçalho de modo/comprimento. Se o
// texto voltar, placement, máscara e entrelaçamento estão certos.
//
// A parte que o leitor NÃO cobre é a correção de erro, porque ele não precisa
// dela para ler. Essa parte é fixada pelo teste do polinômio gerador contra a
// tabela publicada da norma — que é como um erro de aritmética em GF(256)
// aparece.

// ─────────────────────────────── o leitor independente

/** Nível M, versões 1 a 6: (dados, EC por bloco, blocos). Tabela da norma. */
const TABELA = [
  { versao: 1, dados: 16, ecPorBloco: 10, blocos: 1 },
  { versao: 2, dados: 28, ecPorBloco: 16, blocos: 1 },
  { versao: 3, dados: 44, ecPorBloco: 26, blocos: 1 },
  { versao: 4, dados: 64, ecPorBloco: 18, blocos: 2 },
  { versao: 5, dados: 86, ecPorBloco: 24, blocos: 2 },
  { versao: 6, dados: 108, ecPorBloco: 16, blocos: 4 },
];

const CENTROS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

/** As oito máscaras, transcritas da norma (i = linha, j = coluna). */
function mascarado(padrao: number, i: number, j: number): boolean {
  switch (padrao) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    default: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
  }
}

/**
 * Uma célula é de FUNÇÃO (não carrega dado)?
 *
 * Derivado da geometria da norma, não do código do codificador:
 *  · os três cantos de 9×9 (localizador + separador + área de formato);
 *  · a linha e a coluna 6 inteiras (temporização);
 *  · os alinhamentos 5×5 que não caem sobre um localizador.
 */
function ehFuncao(n: number, versao: number, r: number, c: number): boolean {
  if (r <= 8 && c <= 8) return true;
  if (r <= 8 && c >= n - 8) return true;
  if (r >= n - 8 && c <= 8) return true;
  if (r === 6 || c === 6) return true;
  for (const ar of CENTROS[versao] ?? []) {
    for (const ac of CENTROS[versao] ?? []) {
      // Para as versões 1–6, o único alinhamento que não pisa num localizador é
      // o de coordenadas diferentes de 6 nas duas direções.
      if (ar === 6 || ac === 6) continue;
      if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
    }
  }
  return false;
}

/** Lê os bytes de dados percorrendo o zigue-zague, para uma máscara dada. */
function lerCodewords(modulos: boolean[][], versao: number, padrao: number): number[] {
  const n = modulos.length;
  const bits: number[] = [];
  let inc = -1;
  let linha = n - 1;

  for (let coluna = n - 1; coluna > 0; coluna -= 2) {
    if (coluna === 6) coluna -= 1;
    for (;;) {
      for (let k = 0; k < 2; k++) {
        const col = coluna - k;
        if (!ehFuncao(n, versao, linha, col)) {
          const escuro = modulos[linha]![col]!;
          bits.push((mascarado(padrao, linha, col) ? !escuro : escuro) ? 1 : 0);
        }
      }
      linha += inc;
      if (linha < 0 || linha >= n) {
        linha -= inc;
        inc = -inc;
        break;
      }
    }
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
    bytes.push(b);
  }
  return bytes;
}

/** Desentrelaça e lê o cabeçalho byte-mode. `null` quando não faz sentido. */
function decodificar(modulos: boolean[][], versao: number, padrao: number): string | null {
  const tab = TABELA.find((t) => t.versao === versao)!;
  const entrelacado = lerCodewords(modulos, versao, padrao);
  if (entrelacado.length < tab.dados) return null;

  const porBloco = tab.dados / tab.blocos;
  const dados: number[] = new Array(tab.dados);
  for (let i = 0; i < porBloco; i++) {
    for (let b = 0; b < tab.blocos; b++) {
      dados[b * porBloco + i] = entrelacado[i * tab.blocos + b]!;
    }
  }

  // Modo em 4 bits, comprimento em 8 (versões 1–9), depois os bytes.
  const modo = dados[0]! >> 4;
  if (modo !== 0b0100) return null;
  const tamanho = ((dados[0]! & 0x0f) << 4) | (dados[1]! >> 4);
  if (tamanho > tab.dados - 2) return null;

  const saida = new Uint8Array(tamanho);
  for (let i = 0; i < tamanho; i++) {
    saida[i] = ((dados[1 + i]! & 0x0f) << 4) | (dados[2 + i]! >> 4);
  }
  return new TextDecoder().decode(saida);
}

/** Tenta as oito máscaras e devolve a que decodifica — é assim que o leitor
 *  real faz, e evita este teste depender do seletor de máscara do codificador. */
function ler(texto: ReturnType<typeof gerarQr>): { texto: string; padrao: number } | null {
  for (let padrao = 0; padrao < 8; padrao++) {
    const lido = decodificar(texto.modulos, texto.versao, padrao);
    if (lido !== null) return { texto: lido, padrao };
  }
  return null;
}

// ────────────────────────────────────────────── testes

describe("gerarQr — ida e volta", () => {
  const casos = [
    "https://replayja.com.br/api/triggers/b/AbC123dEf456GhI789jKlM012nOpQ345",
    "rtmp://stream.replayja.com.br:19350/live/3f2a1b9c8d7e6f5a4b3c2d1e",
    "replayja.com.br/arena-vasco",
    "a",
    "acentuação e cedilha: ção",
  ];

  for (const caso of casos) {
    it(`volta o mesmo texto: ${caso.slice(0, 34)}…`, () => {
      const qr = gerarQr(caso);
      const lido = ler(qr);
      expect(lido?.texto).toBe(caso);
    });
  }

  it("escolhe a menor versão que cabe", () => {
    expect(gerarQr("a").versao).toBe(1);
    // 16 codewords de dados na versão 1, menos 2 do cabeçalho = 14 bytes.
    expect(gerarQr("x".repeat(14)).versao).toBe(1);
    expect(gerarQr("x".repeat(15)).versao).toBe(2);
  });

  it("o lado é 17 + 4 × versão", () => {
    expect(gerarQr("a").tamanho).toBe(21);
    expect(gerarQr("x".repeat(100)).tamanho).toBe(17 + 4 * gerarQr("x".repeat(100)).versao);
  });
});

describe("gerarQr — estrutura", () => {
  const qr = gerarQr("https://replayja.com.br/api/triggers/b/AbC123dEf456GhI789jKlM012nOpQ345");
  const n = qr.tamanho;
  const em = (r: number, c: number) => qr.modulos[r]![c]!;

  it("tem os três localizadores, com o miolo e a borda certos", () => {
    for (const [lr, lc] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ] as const) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const borda = r === 0 || r === 6 || c === 0 || c === 6;
          const miolo = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          expect(em(lr + r, lc + c)).toBe(borda || miolo);
        }
      }
    }
  });

  it("o canto inferior direito NÃO tem localizador — é por ali que se acha a orientação", () => {
    const cantos = [em(n - 1, n - 1), em(n - 2, n - 2), em(n - 3, n - 3)];
    expect(cantos.every((v) => v === true)).toBe(false);
  });

  it("a temporização alterna a partir de um módulo escuro", () => {
    for (let i = 8; i < n - 8; i++) {
      expect(em(6, i)).toBe(i % 2 === 0);
      expect(em(i, 6)).toBe(i % 2 === 0);
    }
  });

  it("o módulo escuro fixo está ligado", () => {
    // A norma exige `(4 × versão + 9, 8)` sempre escuro. É o que os leitores
    // usam para confirmar que acharam a área de formato.
    expect(em(n - 8, 8)).toBe(true);
  });

  it("as DUAS cópias do bloco de formato dizem a mesma coisa", () => {
    // Um erro aqui é invisível na imagem e fatal na leitura: o leitor tenta a
    // segunda cópia quando a primeira está danificada, e as duas divergirem
    // produz um QR que funciona em um celular e não em outro.
    const vertical: boolean[] = [];
    const horizontal: boolean[] = [];
    for (let i = 0; i < 15; i++) {
      vertical.push(i < 6 ? em(i, 8) : i < 8 ? em(i + 1, 8) : em(n - 15 + i, 8));
      horizontal.push(i < 8 ? em(8, n - i - 1) : i < 9 ? em(8, 15 - i) : em(8, 15 - i - 1));
    }
    expect(vertical).toEqual(horizontal);
  });

  it("o mesmo texto produz sempre a mesma matriz", () => {
    const a = gerarQr("replayja.com.br/arena-vasco");
    const b = gerarQr("replayja.com.br/arena-vasco");
    expect(a.modulos).toEqual(b.modulos);
  });
});

describe("gerarQr — limites", () => {
  it("recusa acima da capacidade em vez de desenhar um QR ilegível", () => {
    // Recusar é melhor: um QR que a câmera do celular não lê é impossível de
    // depurar na quadra.
    expect(() => gerarQr("x".repeat(QR_CAPACIDADE_MAX + 1))).toThrow(TextoLongoDemais);
  });

  it("aceita exatamente a capacidade", () => {
    expect(() => gerarQr("x".repeat(QR_CAPACIDADE_MAX))).not.toThrow();
  });

  it("conta BYTES e não caracteres — acento ocupa dois", () => {
    expect(() => gerarQr("ç".repeat(QR_CAPACIDADE_MAX))).toThrow(TextoLongoDemais);
  });
});

describe("qrComoPath", () => {
  it("emite um comando por módulo escuro, e só", () => {
    const qr = gerarQr("a");
    const escuros = qr.modulos.flat().filter(Boolean).length;
    expect(qrComoPath(qr).split("M").length - 1).toBe(escuros);
  });
});

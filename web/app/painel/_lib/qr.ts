// QR Code — codificador mínimo, só o que o painel precisa.
//
// ─── POR QUE ESCREVER ISTO EM VEZ DE INSTALAR UMA BIBLIOTECA ───────────────
//
// O QR do painel codifica DOIS segredos: a URL do webhook do botão (que é o
// token) e a chave de transmissão da câmera. Gerar isso num serviço externo
// (as APIs de "qr code grátis" que aparecem primeiro) entregaria o segredo ao
// terceiro; gerar no cliente com uma dependência de 20 kB traria uma árvore de
// pacotes inteira para desenhar 41×41 quadrados.
//
// O que realmente pesou: o QR precisa ser renderizado NO SERVIDOR, dentro do
// componente, para que o token não viaje como query string de um `<img src>` —
// query string entra no log de acesso, e é assim que um segredo de dispositivo
// vaza para um arquivo que ninguém considera sensível.
//
// ─── O ESCOPO É PROPOSITALMENTE PEQUENO ────────────────────────────────────
//
// Modo BYTE, correção M, versões 1 a 6 (até 106 bytes). Cabe a URL do webhook
// (71 caracteres), a chave de transmissão e o link da página pública. A versão 7
// em diante exigiria o bloco de "version information", que é tabela nova para
// nenhum caso de uso nosso — então acima de 106 bytes a função RECUSA, em vez de
// desenhar um QR errado que só falha na câmera do celular do instalador.
//
// Referência: ISO/IEC 18004. A aritmética de GF(256) e a varredura em zigue-zague
// seguem a implementação canônica de referência.

export type Qr = {
  /** Lado em módulos (21 para a versão 1, 41 para a 6). */
  tamanho: number;
  /** `true` = módulo escuro. Índice `[linha][coluna]`. */
  modulos: boolean[][];
  versao: number;
};

// Nível M: (total de codewords de dados, codewords de EC por bloco, nº de blocos)
// para as versões 1 a 6. Todas têm blocos de tamanho UNIFORME neste intervalo, o
// que é a razão de o entrelaçamento abaixo caber em cinco linhas.
const VERSOES_M = [
  { versao: 1, dados: 16, ecPorBloco: 10, blocos: 1 },
  { versao: 2, dados: 28, ecPorBloco: 16, blocos: 1 },
  { versao: 3, dados: 44, ecPorBloco: 26, blocos: 1 },
  { versao: 4, dados: 64, ecPorBloco: 18, blocos: 2 },
  { versao: 5, dados: 86, ecPorBloco: 24, blocos: 2 },
  { versao: 6, dados: 108, ecPorBloco: 16, blocos: 4 },
] as const;

/** Centros dos padrões de alinhamento por versão (1 = nenhum). */
const ALINHAMENTO: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

export const QR_CAPACIDADE_MAX = 106;

// ───────────────────────────────────────────────── GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    // 0x11D é o polinômio primitivo que a norma fixa para o QR.
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

/** Polinômio gerador de grau `grau`. */
function gerador(grau: number): number[] {
  let p = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array<number>(p.length + 1).fill(0);
    // `p(x) * (x + α^i)`: o termo em `x` mantém o índice (a ordem é
    // decrescente), e o termo constante desloca um. Trocar os dois é o erro
    // silencioso clássico daqui — o QR sai desenhado e ilegível.
    for (let j = 0; j < p.length; j++) {
      novo[j] = (novo[j] ?? 0) ^ p[j]!;
      novo[j + 1] = (novo[j + 1] ?? 0) ^ mul(p[j]!, EXP[i]!);
    }
    p = novo;
  }
  return p;
}

/** Os `grau` codewords de correção de um bloco de dados. */
function correcao(dados: readonly number[], grau: number): number[] {
  const g = gerador(grau);
  const resto = new Array<number>(grau).fill(0);
  for (const byte of dados) {
    const fator = byte ^ resto[0]!;
    resto.shift();
    resto.push(0);
    if (fator !== 0) {
      for (let i = 0; i < grau; i++) {
        resto[i] = resto[i]! ^ mul(g[i + 1]!, fator);
      }
    }
  }
  return resto;
}

// ─────────────────────────────────────────────── máscaras

function mascara(padrao: number, i: number, j: number): boolean {
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

/** BCH(15,5) do bloco de formato, já com a máscara 0x5412 da norma. */
function bitsDeFormato(nivelM: number, padrao: number): number {
  const dados = (nivelM << 3) | padrao;
  let d = dados << 10;
  const G15 = 0b101_0011_0111;
  const grau = (n: number) => {
    let g = 0;
    while (n !== 0) {
      g++;
      n >>>= 1;
    }
    return g;
  };
  while (grau(d) - grau(G15) >= 0) d ^= G15 << (grau(d) - grau(G15));
  return ((dados << 10) | d) ^ 0b101_0100_0001_0010;
}

// ─────────────────────────────────────────── montagem da matriz

type Grade = Array<Array<boolean | null>>;

function novaGrade(tamanho: number): Grade {
  return Array.from({ length: tamanho }, () => new Array<boolean | null>(tamanho).fill(null));
}

function porFinder(g: Grade, linha: number, coluna: number): void {
  const n = g.length;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = linha + r;
      const x = coluna + c;
      if (y < 0 || y >= n || x < 0 || x >= n) continue;
      const borda = r === 0 || r === 6 || c === 0 || c === 6;
      const miolo = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      g[y]![x] = borda || miolo;
    }
  }
}

function porAlinhamento(g: Grade, versao: number): void {
  const centros = ALINHAMENTO[versao] ?? [];
  for (const linha of centros) {
    for (const coluna of centros) {
      // O padrão de alinhamento nunca se sobrepõe a um finder.
      if (g[linha]?.[coluna] !== null && g[linha]?.[coluna] !== undefined) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const extremo = Math.abs(r) === 2 || Math.abs(c) === 2;
          g[linha + r]![coluna + c] = extremo || (r === 0 && c === 0);
        }
      }
    }
  }
}

function porTempo(g: Grade): void {
  const n = g.length;
  for (let i = 8; i < n - 8; i++) {
    const escuro = i % 2 === 0;
    if (g[6]![i] === null) g[6]![i] = escuro;
    if (g[i]![6] === null) g[i]![6] = escuro;
  }
}

function porFormato(g: Grade, padrao: number): void {
  const n = g.length;
  const bits = bitsDeFormato(0 /* nível M */, padrao);
  for (let i = 0; i < 15; i++) {
    const escuro = ((bits >> i) & 1) === 1;
    if (i < 6) g[i]![8] = escuro;
    else if (i < 8) g[i + 1]![8] = escuro;
    else g[n - 15 + i]![8] = escuro;
  }
  for (let i = 0; i < 15; i++) {
    const escuro = ((bits >> i) & 1) === 1;
    if (i < 8) g[8]![n - i - 1] = escuro;
    else if (i < 9) g[8]![15 - i - 1 + 1] = escuro;
    else g[8]![15 - i - 1] = escuro;
  }
  // O "módulo escuro" fixo, que a norma exige ligado sempre.
  g[n - 8]![8] = true;
}

/** Reserva as células de formato para que a varredura não escreva nelas. */
function reservarFormato(g: Grade): void {
  porFormato(g, 0);
}

function escreverDados(g: Grade, bytes: readonly number[], padrao: number): void {
  const n = g.length;
  let inc = -1;
  let linha = n - 1;
  let bit = 7;
  let indice = 0;

  for (let coluna = n - 1; coluna > 0; coluna -= 2) {
    // A coluna 6 é a de temporização: pula inteira.
    if (coluna === 6) coluna -= 1;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (g[linha]![coluna - c] !== null) continue;
        let escuro = false;
        if (indice < bytes.length) escuro = ((bytes[indice]! >>> bit) & 1) === 1;
        if (mascara(padrao, linha, coluna - c)) escuro = !escuro;
        g[linha]![coluna - c] = escuro;
        bit -= 1;
        if (bit === -1) {
          indice += 1;
          bit = 7;
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
}

/** As quatro regras de penalidade da norma, para escolher a máscara. */
function penalidade(g: Grade): number {
  const n = g.length;
  const em = (r: number, c: number) => g[r]![c] === true;
  let total = 0;

  // Regra 1: sequências de 5+ módulos iguais em linha ou coluna.
  for (let r = 0; r < n; r++) {
    for (const vertical of [false, true]) {
      let contagem = 1;
      for (let c = 1; c < n; c++) {
        const atual = vertical ? em(c, r) : em(r, c);
        const anterior = vertical ? em(c - 1, r) : em(r, c - 1);
        if (atual === anterior) contagem++;
        else {
          if (contagem >= 5) total += 3 + (contagem - 5);
          contagem = 1;
        }
      }
      if (contagem >= 5) total += 3 + (contagem - 5);
    }
  }

  // Regra 2: blocos 2×2 da mesma cor.
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const a = em(r, c);
      if (a === em(r, c + 1) && a === em(r + 1, c) && a === em(r + 1, c + 1)) total += 3;
    }
  }

  // Regra 3: o padrão 1:1:3:1:1 com quatro claros de um lado — é o que confunde
  // o leitor com um finder.
  const alvo = [true, false, true, true, true, false, true, false, false, false, false];
  const alvoInverso = [...alvo].reverse();
  const casa = (linha: boolean[], inicio: number, padrao: boolean[]) =>
    padrao.every((v, k) => linha[inicio + k] === v);
  for (let r = 0; r < n; r++) {
    const horizontal: boolean[] = [];
    const vertical: boolean[] = [];
    for (let c = 0; c < n; c++) {
      horizontal.push(em(r, c));
      vertical.push(em(c, r));
    }
    for (let i = 0; i + 11 <= n; i++) {
      if (casa(horizontal, i, alvo) || casa(horizontal, i, alvoInverso)) total += 40;
      if (casa(vertical, i, alvo) || casa(vertical, i, alvoInverso)) total += 40;
    }
  }

  // Regra 4: desequilíbrio entre claro e escuro.
  let escuros = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (em(r, c)) escuros++;
  const proporcao = (escuros * 100) / (n * n);
  total += Math.floor(Math.abs(proporcao - 50) / 5) * 10;

  return total;
}

// ─────────────────────────────────────────────────── API

export class TextoLongoDemais extends Error {
  constructor(bytes: number) {
    super(`QR: ${bytes} bytes passam do limite de ${QR_CAPACIDADE_MAX}`);
    this.name = "TextoLongoDemais";
  }
}

/**
 * Gera a matriz do QR para o texto dado.
 *
 * Lança `TextoLongoDemais` acima de 106 bytes — recusar é melhor que emitir um
 * código que a câmera do celular não lê e que ninguém consegue depurar na
 * quadra.
 */
export function gerarQr(texto: string): Qr {
  const dados = Array.from(new TextEncoder().encode(texto));
  if (dados.length > QR_CAPACIDADE_MAX) throw new TextoLongoDemais(dados.length);

  const escolhida = VERSOES_M.find((v) => v.dados - 2 >= dados.length);
  if (!escolhida) throw new TextoLongoDemais(dados.length);

  // ── bitstream: modo 0100 (byte), contagem em 8 bits (versões 1–9), dados
  const bits: number[] = [];
  const empurrar = (valor: number, largura: number) => {
    for (let i = largura - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };
  empurrar(0b0100, 4);
  empurrar(dados.length, 8);
  for (const b of dados) empurrar(b, 8);

  const capacidadeBits = escolhida.dados * 8;
  // Terminador de até 4 zeros, depois alinhamento de byte.
  for (let i = 0; i < 4 && bits.length < capacidadeBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    codewords.push(byte);
  }
  // Os dois bytes de enchimento que a norma fixa, alternados.
  const ENCHIMENTO = [0xec, 0x11];
  let k = 0;
  while (codewords.length < escolhida.dados) codewords.push(ENCHIMENTO[k++ % 2]!);

  // ── blocos + correção de erro, entrelaçados
  const porBloco = escolhida.dados / escolhida.blocos;
  const blocosDados: number[][] = [];
  const blocosEc: number[][] = [];
  for (let b = 0; b < escolhida.blocos; b++) {
    const pedaco = codewords.slice(b * porBloco, (b + 1) * porBloco);
    blocosDados.push(pedaco);
    blocosEc.push(correcao(pedaco, escolhida.ecPorBloco));
  }
  const finais: number[] = [];
  for (let i = 0; i < porBloco; i++) for (const b of blocosDados) finais.push(b[i]!);
  for (let i = 0; i < escolhida.ecPorBloco; i++) for (const b of blocosEc) finais.push(b[i]!);

  // ── matriz, com as oito máscaras avaliadas
  const tamanho = 17 + 4 * escolhida.versao;
  let melhor: Grade | null = null;
  let melhorNota = Infinity;

  for (let padrao = 0; padrao < 8; padrao++) {
    const g = novaGrade(tamanho);
    porFinder(g, 0, 0);
    porFinder(g, tamanho - 7, 0);
    porFinder(g, 0, tamanho - 7);
    porAlinhamento(g, escolhida.versao);
    porTempo(g);
    reservarFormato(g);
    escreverDados(g, finais, padrao);
    porFormato(g, padrao);
    const nota = penalidade(g);
    if (nota < melhorNota) {
      melhorNota = nota;
      melhor = g;
    }
  }

  return {
    tamanho,
    versao: escolhida.versao,
    modulos: melhor!.map((linha) => linha.map((v) => v === true)),
  };
}

/**
 * O QR como um `path` de SVG — um só, com todos os módulos escuros.
 *
 * Um `<rect>` por módulo daria 1.681 elementos na versão 6 e um HTML enorme no
 * payload do React. Um `path` com `M x y h1 v1 h-1 z` por módulo é a mesma
 * imagem em um nó.
 */
export function qrComoPath(qr: Qr): string {
  const partes: string[] = [];
  for (let r = 0; r < qr.tamanho; r++) {
    for (let c = 0; c < qr.tamanho; c++) {
      if (qr.modulos[r]![c]) partes.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return partes.join("");
}

/** Lado do `viewBox`, já com a zona de silêncio de 4 módulos que a norma exige. */
export const QR_MARGEM = 4;

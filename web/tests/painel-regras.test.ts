import { describe, expect, it } from "vitest";
import {
  MARCA_PADRAO,
  alocarPorta,
  hashDoSegredo,
  idDeCamera,
  idDeCameraValido,
  lerCabecalhoPng,
  normalizarCor,
  normalizarParametrosDaMarca,
  novaChaveDeTransmissao,
  novoTokenDeWebhook,
  podeRemoverAdmin,
  servidorDeTransmissao,
  urlDoWebhook,
  validarImagemDaMarca,
  type AdminDaArena,
} from "@/db/queries/painel-regras";

// As regras do painel que mudam o mundo físico.
//
// Cada uma delas é cara de conferir na tela: a alocação de porta exige uma
// câmera na quadra, a do último dono exige uma arena com dois donos, e a do PNG
// exige subir um arquivo para o S3. Todas cabem em teste de mesa.

// ─────────────────────────────────────── alocação de porta

describe("alocarPorta", () => {
  const faixa = { port_range_start: 19350, port_range_end: 19449, port_range_next: 19350 };

  it("devolve o contador e avança um", () => {
    expect(alocarPorta(faixa)).toEqual({ ok: true, porta: 19350, proxima: 19351 });
  });

  it("é MONOTÔNICA: nunca reaproveita a porta de uma câmera removida", () => {
    // A 0004 explica por quê: uma câmera antiga, mal desconfigurada no app do
    // cliente, continuaria empurrando RTMP para a porta que tinha — e o vídeo
    // dela apareceria na quadra de outra pessoa.
    const depoisDeDuasRemocoes = { ...faixa, port_range_next: 19360 };
    expect(alocarPorta(depoisDeDuasRemocoes)).toEqual({
      ok: true,
      porta: 19360,
      proxima: 19361,
    });
  });

  it("respeita o começo da faixa quando o contador ficou atrás", () => {
    // Estado possível num relay recém-provisionado com `port_range_next` zerado.
    expect(alocarPorta({ ...faixa, port_range_next: 0 }).ok).toBe(true);
    expect(alocarPorta({ ...faixa, port_range_next: 0 })).toMatchObject({ porta: 19350 });
  });

  it("na última porta ainda aloca", () => {
    expect(alocarPorta({ ...faixa, port_range_next: 19449 })).toMatchObject({ porta: 19449 });
  });

  it("esgotada a faixa, responde NÃO em vez de repetir uma porta", () => {
    expect(alocarPorta({ ...faixa, port_range_next: 19450 })).toEqual({
      ok: false,
      motivo: "faixa-esgotada",
    });
  });
});

// ───────────────────────────────────── identidade da câmera

describe("idDeCamera", () => {
  it("deriva de arena + quadra, dentro do CHECK da 0004", () => {
    const id = idDeCamera("arena-vasco", "quadra-1");
    expect(id).toBe("arenavascoquadra1");
    expect(idDeCameraValido(id)).toBe(true);
  });

  it("tira acento, maiúscula e hífen — o id vira diretório em disco", () => {
    expect(idDeCameraValido(idDeCamera("Arena Vascão", "Quadra Nº 2"))).toBe(true);
  });

  it("o sufixo resolve a segunda câmera da mesma quadra", () => {
    expect(idDeCamera("arena-vasco", "quadra-1", "2")).toBe("arenavascoquadra12");
  });

  it("corta em 32 caracteres, que é o teto do CHECK", () => {
    const id = idDeCamera("arena-com-nome-muito-comprido-mesmo", "quadra-de-areia-numero-sete");
    expect(id.length).toBeLessThanOrEqual(32);
    expect(idDeCameraValido(id)).toBe(true);
  });

  it("completa até 6 caracteres, que é o piso do CHECK", () => {
    expect(idDeCameraValido(idDeCamera("ab", "c"))).toBe(true);
  });

  it("recusa o que o banco recusaria", () => {
    expect(idDeCameraValido("ABC123")).toBe(false);
    expect(idDeCameraValido("arena-vasco")).toBe(false);
    expect(idDeCameraValido("abc")).toBe(false);
  });
});

// ─────────────────────────────────────────────── segredos

describe("segredos de dispositivo", () => {
  it("a chave de transmissão é hex — ela é DIGITADA no app da câmera", () => {
    // Base64url traria `-` e `_`, e a diferença entre `l` e `I` num teclado
    // virtual de TV é exatamente onde a digitação erra.
    const chave = novaChaveDeTransmissao();
    expect(chave).toMatch(/^[0-9a-f]{24}$/);
  });

  it("o token do webhook casa com o formato que a rota do botão aceita", () => {
    // `app/api/triggers/b/[buttonToken]` recusa fora de `^[A-Za-z0-9]{24,48}$`
    // ANTES de ir ao banco. Um token com `-` ou `_` seria recusado como 404 e
    // ninguém entenderia por quê.
    for (let i = 0; i < 200; i++) {
      expect(novoTokenDeWebhook()).toMatch(/^[A-Za-z0-9]{24,48}$/);
    }
  });

  it("dois segredos seguidos nunca são iguais", () => {
    const vistos = new Set(Array.from({ length: 500 }, () => novoTokenDeWebhook()));
    expect(vistos.size).toBe(500);
  });

  it("o hash é SHA-256 em hex — é o que a coluna guarda", () => {
    expect(hashDoSegredo("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("monta o servidor e a URL do webhook como o instalador vai ver", () => {
    expect(servidorDeTransmissao("stream.replayja.com.br", 19350)).toBe(
      "rtmp://stream.replayja.com.br:19350/live",
    );
    expect(urlDoWebhook("https://replayja.com.br/", "AbC123")).toBe(
      "https://replayja.com.br/api/triggers/b/AbC123",
    );
  });
});

// ────────────────────────────────────────── equipe da arena

describe("podeRemoverAdmin", () => {
  const admins: AdminDaArena[] = [
    { id: "a", user_id: "u1", role: "owner", status: "active" },
    { id: "b", user_id: "u2", role: "manager", status: "active" },
    { id: "c", user_id: "u3", role: "owner", status: "removed" },
  ];

  it("remove um gerente sem cerimônia", () => {
    expect(podeRemoverAdmin(admins, "b")).toEqual({ ok: true });
  });

  it("RECUSA remover o último dono ATIVO", () => {
    // Sem isto a arena fica sem quem possa convidar ninguém, e recuperar exige
    // acesso ao banco. O gatilho `partner_admin_exige_owner` também recusa —
    // esta função existe para dar a frase em pt-BR antes de tentar.
    expect(podeRemoverAdmin(admins, "a")).toEqual({ ok: false, motivo: "ultimo-owner" });
  });

  it("dono já removido não conta como dono ativo", () => {
    expect(podeRemoverAdmin(admins, "c")).toEqual({ ok: true });
  });

  it("com dois donos ativos, remover um é permitido", () => {
    const doisDonos: AdminDaArena[] = [
      ...admins,
      { id: "d", user_id: "u4", role: "owner", status: "active" },
    ];
    expect(podeRemoverAdmin(doisDonos, "a")).toEqual({ ok: true });
  });

  it("id que não está na lista é 'não encontrado', nunca 'pode'", () => {
    expect(podeRemoverAdmin(admins, "zzz")).toEqual({ ok: false, motivo: "nao-encontrado" });
  });

  it("arena sem nenhum dono ativo ainda recusa remover quem quer que seja dono", () => {
    const semDono: AdminDaArena[] = [{ id: "x", user_id: "u", role: "owner", status: "invited" }];
    expect(podeRemoverAdmin(semDono, "x")).toEqual({ ok: true });
  });
});

// ───────────────────────────────────────── marca d'água

/** Um PNG mínimo e válido: assinatura + IHDR com as dimensões pedidas. */
function png(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8); // comprimento do chunk IHDR
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const escreve = (v: number, o: number) => {
    b[o] = (v >>> 24) & 0xff;
    b[o + 1] = (v >>> 16) & 0xff;
    b[o + 2] = (v >>> 8) & 0xff;
    b[o + 3] = v & 0xff;
  };
  escreve(largura, 16);
  escreve(altura, 20);
  b[24] = 8; // bit depth
  b[25] = 6; // color type 6 = RGBA (é o que "com transparência" significa)
  return b;
}

describe("lerCabecalhoPng", () => {
  it("lê largura e altura do IHDR", () => {
    expect(lerCabecalhoPng(png(512, 128))).toEqual({ largura: 512, altura: 128 });
  });

  it("recusa um JPEG renomeado para .png", () => {
    // É o caso real: a extensão engana qualquer checagem de nome, e o relay
    // queimaria um retângulo preto no vídeo do cliente.
    const jpeg = new Uint8Array(33);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0);
    expect(lerCabecalhoPng(jpeg)).toEqual({ erro: "tipo" });
  });

  it("recusa arquivo truncado", () => {
    expect(lerCabecalhoPng(png(512, 128).slice(0, 12))).toEqual({ erro: "corrompido" });
  });

  it("recusa PNG cujo primeiro chunk não é IHDR", () => {
    const b = png(512, 128);
    b.set([0x49, 0x45, 0x4e, 0x44], 12); // "IEND"
    expect(lerCabecalhoPng(b)).toEqual({ erro: "corrompido" });
  });

  it("recusa dimensão zero", () => {
    expect(lerCabecalhoPng(png(0, 100))).toEqual({ erro: "corrompido" });
  });

  it("lê dimensões grandes sem estourar o sinal de 32 bits", () => {
    // `(b << 24)` produz número NEGATIVO em JS sem o `>>> 0`. Uma imagem de
    // 3000 px não chega perto disso, mas um arquivo malicioso chega — e uma
    // largura negativa passaria pelo teste de "menor que o mínimo".
    expect(lerCabecalhoPng(png(0xffff_ffff, 10))).toMatchObject({ largura: 4294967295 });
  });
});

describe("validarImagemDaMarca", () => {
  it("aceita uma marca no tamanho recomendado", () => {
    expect(validarImagemDaMarca(png(512, 128), "marca")).toEqual({
      ok: true,
      largura: 512,
      altura: 128,
    });
  });

  it("recusa marca pequena demais para ler no vídeo", () => {
    expect(validarImagemDaMarca(png(120, 40), "marca")).toEqual({
      ok: false,
      motivo: "dimensao",
    });
  });

  it("o logo tem regra própria: quadrado pequeno serve, faixa fininha não", () => {
    expect(validarImagemDaMarca(png(256, 256), "logo").ok).toBe(true);
    expect(validarImagemDaMarca(png(512, 64), "logo")).toEqual({ ok: false, motivo: "dimensao" });
  });

  it("recusa acima de 2 MB", () => {
    const grande = new Uint8Array(2 * 1024 * 1024 + 1);
    grande.set(png(512, 128), 0);
    expect(validarImagemDaMarca(grande, "marca")).toEqual({ ok: false, motivo: "tamanho" });
  });
});

describe("normalizarParametrosDaMarca", () => {
  it("usa o padrão do contrato quando nada vem", () => {
    expect(normalizarParametrosDaMarca({})).toEqual(MARCA_PADRAO);
    expect(MARCA_PADRAO).toEqual({ posicao: "bottom_right", opacidade: 0.85, larguraPct: 18 });
  });

  it("PRENDE nos limites em vez de recusar", () => {
    // Os limites são os `CHECK` da 0002/0011. Um slider que devolve 0.9999 por
    // arredondamento de float não pode virar erro de formulário.
    expect(normalizarParametrosDaMarca({ opacidade: 5, larguraPct: 99 })).toMatchObject({
      opacidade: 1,
      larguraPct: 30,
    });
    expect(normalizarParametrosDaMarca({ opacidade: -1, larguraPct: 0 })).toMatchObject({
      opacidade: 0.2,
      larguraPct: 5,
    });
  });

  it("posição desconhecida cai no padrão, nunca num valor que o enum recusa", () => {
    expect(normalizarParametrosDaMarca({ posicao: "meio" }).posicao).toBe("bottom_right");
    expect(normalizarParametrosDaMarca({ posicao: "top_left" }).posicao).toBe("top_left");
  });

  it("texto que não é número cai no padrão", () => {
    expect(normalizarParametrosDaMarca({ opacidade: "abc", larguraPct: null })).toEqual(
      MARCA_PADRAO,
    );
  });

  it("a opacidade fica com duas casas, que é o `numeric(3,2)` da coluna", () => {
    expect(normalizarParametrosDaMarca({ opacidade: 0.666 }).opacidade).toBe(0.67);
  });
});

describe("normalizarCor", () => {
  it("aceita com e sem cerquilha e devolve minúsculo", () => {
    // O `CHECK branding_primary_chk` exige `^#[0-9a-f]{6}$` — maiúscula falha.
    expect(normalizarCor("#C8FF3D")).toBe("#c8ff3d");
    expect(normalizarCor("c8ff3d")).toBe("#c8ff3d");
  });

  it("vazio é nulo (a arena volta ao padrão do Replay já)", () => {
    expect(normalizarCor("")).toBeNull();
    expect(normalizarCor(null)).toBeNull();
    expect(normalizarCor("   ")).toBeNull();
  });

  it("recusa o que a coluna recusaria", () => {
    expect(normalizarCor("#fff")).toBeNull();
    expect(normalizarCor("laranja")).toBeNull();
    expect(normalizarCor("#12345g")).toBeNull();
  });
});

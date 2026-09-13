import { describe, expect, it } from "vitest";
import {
  contatoExibido,
  contatosParaLista,
  digitosDoWhatsApp,
  enderecoDaArena,
  linkDeMapa,
  usuarioDoInstagram,
} from "./contatos";

/**
 * O achado P1-19: a aba "Sobre" é o que a arena compra, e ela mostrava o
 * telefone, o WhatsApp e o Instagram como TEXTO MORTO dentro de um `<li>` — sem
 * `wa.me`, sem `tel:`, sem link para o mapa — e, como contato, o e-mail do
 * próprio Replay já.
 *
 * Estes testes cobrem a parte que é fácil de errar de novo: a conversão de cada
 * tipo em um endereço que ABRE.
 */

describe("o número do WhatsApp", () => {
  it("vira só dígitos — o `wa.me` recusa `+`, espaço e parêntese", () => {
    expect(digitosDoWhatsApp("(11) 98812-4477")).toBe("5511988124477");
    expect(digitosDoWhatsApp("11 98812 4477")).toBe("5511988124477");
  });

  it("ganha o 55 quando o número é nacional", () => {
    // Sem os dois dígitos, o link abre uma conversa com um número americano de
    // 11 dígitos — o erro que só aparece quando um cliente reclama.
    expect(digitosDoWhatsApp("11988124477")).toBe("5511988124477");
    expect(digitosDoWhatsApp("1132224477")).toBe("551132224477"); // fixo, 10 dígitos
  });

  it("NÃO ganha o 55 quando já veio com código de país", () => {
    expect(digitosDoWhatsApp("+55 11 98812-4477")).toBe("5511988124477");
    expect(digitosDoWhatsApp("+351 912 345 678")).toBe("351912345678");
  });

  it("recusa o que é curto demais para ser telefone", () => {
    expect(digitosDoWhatsApp("4477")).toBeNull();
    expect(digitosDoWhatsApp("fala com a gente")).toBeNull();
  });
});

describe("o usuário do Instagram", () => {
  it("aceita as três formas em que a arena escreve", () => {
    expect(usuarioDoInstagram("@arenavasco")).toBe("arenavasco");
    expect(usuarioDoInstagram("arenavasco")).toBe("arenavasco");
    expect(usuarioDoInstagram("https://instagram.com/arenavasco")).toBe("arenavasco");
    expect(usuarioDoInstagram("https://www.instagram.com/arena.vasco/")).toBe("arena.vasco");
  });

  it("recusa o que não é um usuário", () => {
    expect(usuarioDoInstagram("a arena não tem")).toBeNull();
    expect(usuarioDoInstagram("")).toBeNull();
  });
});

describe("contatoExibido", () => {
  it("WhatsApp abre o `wa.me`, em aba nova", () => {
    const c = contatoExibido({ kind: "whatsapp", label: null, value: "(11) 98812-4477" });
    expect(c?.href).toBe("https://wa.me/5511988124477");
    expect(c?.externo).toBe(true);
    expect(c?.rotulo).toBe("WhatsApp");
    // O texto continua sendo o que a arena digitou: é o número que a pessoa
    // reconhece, não o E.164.
    expect(c?.texto).toBe("(11) 98812-4477");
  });

  it("telefone abre o discador, na MESMA aba", () => {
    const c = contatoExibido({ kind: "phone", label: null, value: "+55 (11) 3222-4477" });
    expect(c?.href).toBe("tel:+551132224477");
    expect(c?.externo).toBe(false);
  });

  it("Instagram vira `@usuario` e link do perfil", () => {
    const c = contatoExibido({ kind: "instagram", label: null, value: "arenavasco" });
    expect(c?.texto).toBe("@arenavasco");
    expect(c?.href).toBe("https://instagram.com/arenavasco");
  });

  it("endereço vira busca no mapa", () => {
    const c = contatoExibido({
      kind: "address",
      label: null,
      value: "Rua Tobias Barreto, 1420",
    });
    expect(c?.href).toBe(linkDeMapa("Rua Tobias Barreto, 1420"));
    expect(c?.href).toContain("google.com/maps/search/");
  });

  it("site sem protocolo ganha `https://`, e o texto perde o protocolo", () => {
    const c = contatoExibido({ kind: "website", label: null, value: "arenavasco.com.br/" });
    expect(c?.href).toBe("https://arenavasco.com.br/");
    expect(c?.texto).toBe("arenavasco.com.br");
  });

  it("o rótulo da arena vence o rótulo padrão", () => {
    const c = contatoExibido({ kind: "phone", label: "Recepção", value: "1132224477" });
    expect(c?.rotulo).toBe("Recepção");
  });

  it("um valor que não dá para linkar continua legível, sem `href`", () => {
    // Melhor uma linha sem link do que um link que não abre.
    const c = contatoExibido({ kind: "whatsapp", label: null, value: "só no balcão" });
    expect(c?.texto).toBe("só no balcão");
    expect(c?.href).toBeNull();
  });

  it("valor vazio some da lista inteira", () => {
    expect(contatoExibido({ kind: "phone", label: null, value: "   " })).toBeNull();
  });
});

describe("a divisão da aba Sobre", () => {
  const contatos = [
    { kind: "address", label: null, value: "Rua Tobias Barreto, 1420" },
    { kind: "whatsapp", label: null, value: "(11) 98812-4477" },
    { kind: "instagram", label: null, value: "@arenavasco" },
    { kind: "email", label: null, value: "   " },
  ];

  it("o endereço tem seção própria — 'ONDE FICA' precisa dizer onde fica (P2-40)", () => {
    expect(enderecoDaArena(contatos)?.value).toBe("Rua Tobias Barreto, 1420");
  });

  it("e por isso ele NÃO se repete na lista de contato", () => {
    const lista = contatosParaLista(contatos);
    expect(lista.map((c) => c.rotulo)).toEqual(["WhatsApp", "Instagram"]);
  });

  it("sem endereço cadastrado, a seção sabe que não tem", () => {
    expect(enderecoDaArena([{ kind: "whatsapp", label: null, value: "1198812" }])).toBeNull();
    expect(enderecoDaArena([{ kind: "address", label: null, value: "  " }])).toBeNull();
  });
});

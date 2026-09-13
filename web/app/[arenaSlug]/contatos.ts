import type { ComponentType } from "react";
import { AtSign, Globe, Mail, MapPin, MessageCircle, Phone, type LucideProps } from "lucide-react";

/**
 * O CONTATO DA ARENA VIRANDO LINK — o achado P1-19.
 *
 * ─── O QUE ESTAVA ERRADO ───────────────────────────────────────────────────
 *
 * A aba "Sobre" é o que transforma a página em landing do parceiro, e é o que a
 * arena compra. Ela mostrava, como contato, `contato@replayja.com.br` — o
 * e-mail do *Replay já*, rotulado "Contato do piloto" — e, como endereço, "São
 * Paulo, SP": a cidade, sem rua.
 *
 * Pior: o telefone, o WhatsApp e o Instagram **já estão no banco**
 * (`partner_contact`, com o enum `contact_kind` e validação E.164 por `CHECK`) e
 * já chegam à página por `contatosDoParceiro`. Eles eram renderizados como
 * **texto morto dentro de um `<li>`** — sem `wa.me`, sem `tel:`, sem link para
 * o mapa. O dado estava lá; faltava o `href`.
 *
 * ─── POR QUE ISTO É UM MÓDULO, E NÃO UM `switch` NA PÁGINA ────────────────
 *
 * Porque a conversão de cada tipo tem uma regra que não é óbvia e que é fácil
 * de errar de novo — o `wa.me` não aceita `+`, nem espaço, nem parêntese; o
 * `tel:` aceita e prefere o E.164; o Instagram chega ora como `@arena`, ora
 * como `arena`, ora como a URL inteira. Uma tabela testada é a diferença entre
 * "o link do WhatsApp abre" e "o link do WhatsApp abre uma conversa com um
 * número que não existe".
 */

export type TipoDeContato =
  | "whatsapp"
  | "phone"
  | "email"
  | "instagram"
  | "website"
  | "address"
  | "maps";

export type ContatoDaArena = {
  kind: string;
  label: string | null;
  value: string;
};

export type ContatoExibido = {
  chave: string;
  Icone: ComponentType<LucideProps>;
  /** O que a pessoa lê: "(11) 98812-4477", "@arenavasco". */
  texto: string;
  /** O que o rótulo diz que é: "WhatsApp", "Telefone". */
  rotulo: string;
  /** `null` quando não dá para linkar — aí a linha é texto, e honesta. */
  href: string | null;
  /** Links para fora abrem em aba nova; `tel:` e `mailto:` não. */
  externo: boolean;
};

const ROTULO: Record<TipoDeContato, string> = {
  whatsapp: "WhatsApp",
  phone: "Telefone",
  email: "E-mail",
  instagram: "Instagram",
  website: "Site",
  address: "Endereço",
  maps: "Mapa",
};

const ICONE: Record<TipoDeContato, ComponentType<LucideProps>> = {
  whatsapp: MessageCircle,
  phone: Phone,
  email: Mail,
  // `lucide-react` não traz glifo de marca, e a folha do v2 manda um set só:
  // contorno, grade de 24, sem logotipo de terceiro. `@` é o que identifica um
  // perfil em qualquer rede, e é o que a própria arena escreve no cadastro.
  instagram: AtSign,
  website: Globe,
  address: MapPin,
  maps: MapPin,
};

/**
 * Só os dígitos, com o 55 do Brasil na frente quando ele não veio.
 *
 * O `wa.me` recusa `+`, espaço, parêntese e hífen — ele quer o E.164 CRU. E um
 * número guardado como "(11) 98812-4477" (que é como o painel deixa digitar)
 * não tem o país: sem os dois dígitos, o link abre uma conversa com um número
 * americano de 11 dígitos, que é o tipo de erro que só aparece quando um
 * cliente reclama.
 */
export function digitosDoWhatsApp(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  // 10 ou 11 dígitos é o número nacional (DDD + 8 ou 9). Acima disso já veio com
  // código de país, e não é nossa função adivinhar qual.
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

/** `@arenavasco`, `arenavasco` ou a URL inteira → `arenavasco`. */
export function usuarioDoInstagram(valor: string): string | null {
  const limpo = valor
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(limpo) ? limpo : null;
}

/**
 * O endereço vira uma busca no mapa, e não uma coordenada.
 *
 * `google.com/maps/search/?api=1&query=` é o endereço documentado e estável, e
 * ele abre o app nativo no Android e no iOS quando ele existe. Geocodificar por
 * conta própria exigiria uma chave de API e um cache, para resolver um problema
 * que o mapa já resolve.
 */
export function linkDeMapa(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

/**
 * Uma linha da aba Sobre, pronta para renderizar.
 *
 * Devolve `null` para o contato que não dá para mostrar (valor vazio, número
 * curto demais, usuário de Instagram inválido): melhor uma linha a menos do que
 * um link que não abre.
 */
export function contatoExibido(c: ContatoDaArena): ContatoExibido | null {
  const valor = c.value.trim();
  if (!valor) return null;

  const kind = c.kind as TipoDeContato;
  const Icone = ICONE[kind] ?? MessageCircle;
  const rotulo = c.label?.trim() || ROTULO[kind] || kind;
  const chave = `${c.kind}:${valor}`;

  switch (kind) {
    case "whatsapp": {
      const numero = digitosDoWhatsApp(valor);
      return {
        chave,
        Icone,
        texto: valor,
        rotulo,
        href: numero ? `https://wa.me/${numero}` : null,
        externo: true,
      };
    }
    case "phone":
      return {
        chave,
        Icone,
        texto: valor,
        rotulo,
        // `tel:` mantém o `+` e os dígitos; o resto o discador ignora.
        href: `tel:${valor.replace(/[^\d+]/g, "")}`,
        externo: false,
      };
    case "email":
      return {
        chave,
        Icone,
        texto: valor,
        rotulo,
        href: valor.includes("@") ? `mailto:${valor}` : null,
        externo: false,
      };
    case "instagram": {
      const usuario = usuarioDoInstagram(valor);
      return {
        chave,
        Icone,
        texto: usuario ? `@${usuario}` : valor,
        rotulo,
        href: usuario ? `https://instagram.com/${usuario}` : null,
        externo: true,
      };
    }
    case "website": {
      const url = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
      return {
        chave,
        Icone,
        texto: valor.replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
        rotulo,
        href: url,
        externo: true,
      };
    }
    case "address":
      return { chave, Icone, texto: valor, rotulo, href: linkDeMapa(valor), externo: true };
    case "maps":
      return {
        chave,
        Icone,
        texto: c.label?.trim() || "Ver no mapa",
        rotulo: "Mapa",
        href: /^https?:\/\//i.test(valor) ? valor : linkDeMapa(valor),
        externo: true,
      };
    default:
      return { chave, Icone, texto: valor, rotulo, href: null, externo: false };
  }
}

/**
 * O endereço da arena, se ela cadastrou um.
 *
 * "ONDE FICA" mostrava a cidade e repetia o tagline ao lado (achado P2-40) — a
 * seção do endereço não dava o endereço. Ele existe como `contact_kind`
 * `address`; o que faltava era ir buscá-lo.
 */
export function enderecoDaArena(contatos: readonly ContatoDaArena[]): ContatoDaArena | null {
  return contatos.find((c) => c.kind === "address" && c.value.trim()) ?? null;
}

/** Os contatos que NÃO são o endereço — o endereço tem seção própria. */
export function contatosParaLista(contatos: readonly ContatoDaArena[]): ContatoExibido[] {
  return contatos
    .filter((c) => c.kind !== "address")
    .map(contatoExibido)
    .filter((c): c is ContatoExibido => c !== null);
}

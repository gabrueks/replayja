// Prefixos do sistema que NÃO podem virar slug de arena.
//
// O catch-all `/[arenaSlug]` ocupa a raiz do domínio (ADR §8), então qualquer
// rota futura do sistema colide com um slug de arena. Esta lista é a fonte da
// verdade no CÓDIGO; a migração `0003_slugs_reservados.sql` a semeia na tabela
// `reserved_slug`, e o teste `tests/slug.test.ts` falha se as duas divergirem.
//
// Conteúdo inicial copiado de `docs/modelo-de-dados.md` §3.21. Acrescentar aqui
// SEMPRE que uma rota de sistema nova nascer — e rodar a migração de semeadura.

export const RESERVED_SLUGS: readonly string[] = [
  // rotas do app
  "app", "api", "admin", "auth", "entrar", "sair", "cadastro", "conta", "perfil",
  "s", "p", "g", "c", "d",
  // infraestrutura do Next / arquivos de raiz
  "_next", "static", "assets", "public", "cdn", "media", "img", "favicon.ico",
  "robots.txt", "sitemap.xml", "manifest.json", "sw.js", ".well-known",
  // institucional
  "blog", "ajuda", "suporte", "contato", "sobre", "precos", "planos", "termos",
  "privacidade", "lgpd",
  // domínio do produto
  "parceiro", "parceiros", "arena", "arenas", "quadra", "quadras", "grupo",
  "grupos", "clipe", "clipes", "video", "videos", "lance", "lances", "sessao",
  "sessoes", "download", "downloads", "buscar", "busca",
  // verbos e operação
  "novo", "new", "edit", "editar", "config", "configuracoes", "status", "health",
  "metrics", "webhook", "webhooks", "graphql", "rpc", "storage", "device",
  "devices", "dispositivo", "dispositivos",
  // marca e subdomínios
  "replayja", "replay", "www", "mail", "ftp", "ns1", "ns2", "m", "mobile",
  "test", "staging", "dev", "demo",
  // painel do parceiro (rota nova desta task — não está na lista do doc)
  "painel",
  // `/convite/[token]` — o aceite do convite de grupo. Precisa ser de PRIMEIRO
  // nível: o link é colado num grupo de WhatsApp por quem já está no grupo, e
  // `replayja.com.br/convite/xyz` é curto o bastante para caber na mensagem.
  // Sem reservar, uma arena chamada `convite` tornaria a rota inalcançável.
  "convite",
];

/** Reservados de SEGUNDO nível: `/[arenaSlug]/<isto>` é rota, não grupo. */
export const RESERVED_GROUP_SLUGS: readonly string[] = [
  // `c` é `/[arenaSlug]/c/[clipId]`, o player do lance. O segmento estático
  // vence o dinâmico no roteamento do Next, então um grupo chamado `c` não
  // quebraria a rota — ficaria INALCANÇÁVEL, que é pior: o dono criaria o grupo,
  // receberia o link e ele abriria um player vazio.
  "sessoes", "s", "c", "contato", "sobre", "membros", "convite", "admin", "novo",
  "grupos", "lances", "buscar",
];

const reservadosArena = new Set(RESERVED_SLUGS);
const reservadosGrupo = new Set(RESERVED_GROUP_SLUGS);

export function slugReservadoDeArena(slug: string): boolean {
  return reservadosArena.has(slug.toLowerCase());
}

export function slugReservadoDeGrupo(slug: string): boolean {
  return reservadosGrupo.has(slug.toLowerCase());
}

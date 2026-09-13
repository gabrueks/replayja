// A FOLHA DE VOZ VIRANDO CÓDIGO.
//
// ─── A REGRA Nº 3 DA v2 ────────────────────────────────────────────────────
//
// "A mesma ação tem UMA frase, repetida" (`design/v2/README.md`, Voz). É a
// regra que mais separa um produto de um protótipo gerado — porque variar o
// rótulo a cada tela é exatamente o que um gerador faz —, e até agora ela
// dependia de vigilância. A revisão de 13/09 (achado P1-16) mostrou o placar:
//
//   achar um lance   "Entrar pra ver meus lances" · "Bora achar meu lance" ·
//                    "Bora achar seu lance" · "Buscar por horário" ·
//                    "Buscar lances"                            → 5 frases
//   criar um grupo   "Joga toda semana? Vira grupo" · "Criar" ·
//                    "Criar o grupo da minha pelada" · "Vira grupo"  → 4
//   trocar de arena  "Trocar arena" e "Trocar de arena" NA MESMA TELA → 2
//   estado ao vivo   "Gravando agora" e "AO VIVO"                     → 2
//   o objeto grupo   "Grupos" · "Suas peladas" · "1 pelada salva" ·
//                    "1 GRUPO" · "turma"                              → 5
//
// ─── O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É ───────────────────────────────
//
// Ele NÃO é um dicionário de todas as strings do produto. Um arquivo com
// trezentas constantes de uma linha é pior que o problema: ninguém acha nada, e
// o texto deixa de ser lido junto com a tela em que aparece.
//
// Ele é a lista das **ações que aparecem em mais de uma tela** — e só delas. O
// teste vizinho (`lib/copy.test.ts`) varre `app/**` e falha se qualquer uma
// dessas frases reaparecer escrita à mão num `page.tsx`. É o que transforma a
// regra em algo que não depende de ninguém lembrar.
//
// Parágrafo de apoio, título de tela e microcópia de uma tela só continuam
// morando na tela. Eles são lidos no contexto; estes aqui, não.

// ─── AS AÇÕES ──────────────────────────────────────────────────────────────

/**
 * Achar um lance. A ação central do produto, e a que tinha cinco frases.
 *
 * "Achar meu lance" e não "Bora achar seu lance": a v2 fala em primeira pessoa
 * do ATLETA no rótulo de botão ("meu"), porque o botão é a fala dele; o produto
 * fala em segunda pessoa no texto em volta ("seus lances estão aqui"). Mantido
 * o que a correção do bug 5 já tinha escolhido em `/app/lances`.
 */
export const ACHAR_LANCE = "Achar meu lance";

/** Entrar. Uma frase, em toda tela, desde a v2. */
export const ENTRAR = "Entrar pra ver meus lances";

/**
 * O TÍTULO da busca — e ele é diferente do rótulo do botão de propósito.
 *
 * Regra nº 2 da folha de voz: "título é SITUAÇÃO, não funcionalidade". O título
 * descreve o que a pessoa veio fazer ("bora achar seu lance"); o botão nomeia a
 * ação em primeira pessoa dela ("achar meu lance"). São dois papéis, e a v2
 * pediu os dois.
 *
 * O que o achado P1-16 proíbe não é a existência de duas frases — é elas serem
 * escritas à mão em telas diferentes e saírem de sincronia. Esta é a frase do
 * TÍTULO, e ela é uma só: `/app` e `/app/buscar` usam esta constante.
 */
export const ACHAR_LANCE_TITULO = "Bora achar seu lance";

/** A linha de apoio que acompanha o ENTRAR, sempre. */
export const ENTRAR_APOIO = "Leva 20 segundos. Sem senha, sem cadastro.";

/** Criar um grupo — o rótulo de botão. */
export const CRIAR_GRUPO = "Criar o grupo da minha pelada";

/**
 * A PONTE de uma pelada avulsa para um grupo, quando ela aparece como convite e
 * não como botão ("Joga toda semana aqui?" + este rótulo).
 *
 * É a mesma ação de `CRIAR_GRUPO`, num lugar onde a frase longa não cabe — e
 * por isso ela é curta E derivada: quem lê as duas reconhece a mesma coisa.
 */
export const VIRAR_GRUPO = "Vira grupo";

/** A pergunta que abre a ponte. Uma só, na busca, na sessão e na arena. */
export const VIRAR_GRUPO_CHAMADA = "Joga toda semana aqui?";

/** Trocar de arena. Era "Trocar arena" no cabeçalho e "Trocar de arena" 300px abaixo. */
export const TROCAR_ARENA = "Trocar de arena";

/** Compartilhar — no produto inteiro, inclusive no rótulo da seção. */
export const MANDAR_PRO_GRUPO = "Manda pro grupo";

/** Convidar alguém para o grupo. */
export const CHAMAR_A_GALERA = "Chamar a galera";

/** O estado "a câmera está gravando agora". Era "Gravando agora" e "AO VIVO". */
export const AO_VIVO = "Gravando agora";

/** Editar o grupo. O título da tela e o rótulo que leva até ela. */
export const ARRUMAR_GRUPO = "Arrumar o grupo";

// ─── OS PAPÉIS ─────────────────────────────────────────────────────────────
//
// A auditoria de QA (D-1) descobriu que a confusão que custou uma auditoria
// inteira — "um usuário normal virou admin da Arena Vasco?" — nasceu na tela:
// dono de GRUPO edita a pelada, convida, remove membro e vê e-mail, o que tem
// cara de admin de ARENA. São dois conjuntos de poderes, e nenhuma tela dizia
// qual era qual.
//
// A palavra "admin" sozinha não aparece em lugar nenhum do produto do atleta:
// ela é a palavra que confunde, porque serve para os dois.

/** Quem criou a pelada e cuida dela. Não administra a arena. */
export const DONO_DA_PELADA = "Dono da pelada";

/** Quem só joga. */
export const NA_PELADA = "Na pelada";

/** Quem administra a ARENA — câmera, chave, botão, remoção de vídeo. */
export const ADMINISTRA_A_ARENA = "Administra a arena";

/** A linha de contexto para o dono, na própria página do grupo. */
export const VOCE_ORGANIZA = "Você organiza esta pelada";

// ─── O OBJETO "GRUPO" ──────────────────────────────────────────────────────
//
// "Grupo" é o nome do objeto na navegação e na URL (`/app/grupos`, a aba da
// barra inferior): é a palavra que o atleta procura quando quer achar a tela.
// "Pelada" é o nome dele na PROSA: é a palavra que ele usa quando fala da
// coisa. As duas convivem de propósito, e a fronteira é essa — o que a v2
// proíbe é uma terceira ("turma") e é contar a mesma coisa com duas palavras na
// mesma tela (achado P1-13: "3 na pelada" ao lado de "3 pessoas").

/** `1` → `"1 na pelada"`. A ÚNICA forma de contar gente de um grupo. */
export function naPelada(n: number): string {
  // Import local: `lib/plural.ts` é a casa do número, e reexportá-lo daqui
  // criaria uma segunda porta para a mesma função.
  return `${new Intl.NumberFormat("pt-BR").format(n)} na pelada`;
}

// ─── OS TÍTULOS DE ABA ─────────────────────────────────────────────────────
//
// Achado P1-17: o `<title>` falava a v1 enquanto a tela falava a v2 — "Buscar
// lances" × "Bora achar seu lance", "Meus grupos" × "Suas peladas.", "Editar
// grupo" × "Arrumar o grupo", "Seu perfil" × "Você". Quem tem oito abas abertas
// no celular lê só o `<title>`: ele é a primeira microcópia do produto, não a
// última.

export const TITULOS = {
  buscar: ACHAR_LANCE,
  lances: "Seus lances",
  grupos: "Suas peladas",
  editarGrupo: ARRUMAR_GRUPO,
  perfil: "Você",
  botao: "Botão da quadra",
  criarGrupo: CRIAR_GRUPO,
} as const;

/**
 * Os modelos de VISÃO do design system.
 *
 * Deliberadamente separados das linhas do banco (`db/queries/*`): o componente
 * não deve saber que `duration_seconds` vem como string do `pg`, nem que o
 * horário precisa ser convertido para o fuso da arena. Quem converte é a página
 * — o componente recebe texto pronto para mostrar.
 *
 * É essa fronteira que deixa o catálogo `/dev/ui` renderizar tudo sem banco, e a
 * página de busca (C4) trocar a fixture pela consulta real sem tocar em nenhum
 * componente.
 */

/**
 * O estado de um lance.
 *
 * - `pronto`      — o arquivo com marca d'água está no storage, dá para assistir.
 * - `processando` — o relay já subiu, o corte ainda está sendo gerado.
 * - `parcial`     — o corte saiu mais curto que os 22 s (a câmera teve lacuna).
 *                   O clipe É ASSISTÍVEL; o rótulo existe para o atleta não achar
 *                   que o produto comeu o lance dele.
 */
export type EstadoDoClipe = "pronto" | "processando" | "parcial";

export type Clipe = {
  id: string;
  /** Horário do acionamento no fuso DA ARENA, já formatado: "20:47". */
  horario: string;
  /**
   * O MESMO instante, legível por máquina: `2026-09-13T20:47:00`.
   *
   * É o `datetime` do `<time>` (achado P2-35). Sem ele o horário é só texto, e a
   * regra global `.tempo, time` não tem em que casar. É hora LOCAL DA ARENA, sem
   * sufixo de fuso — que é a única forma honesta: "20:47 na Arena Vasco" é o
   * dado, e carimbar um `-03:00` fixo seria congelar offset, o que
   * `docs/modelo-de-dados.md` §4 proíbe.
   */
  quandoIso?: string;
  /** Duração formatada: "0:22". */
  duracao: string;
  /** Nome da quadra: "Quadra 2". */
  quadra: string;
  /** Linha de apoio do card: "Hoje · Society". */
  contexto?: string;
  estado: EstadoDoClipe;
  /** Para onde o card leva. Sem href, o card vira um botão (`onSelecionar`). */
  href?: string;
  /** URL do thumbnail. Sem ela, o card desenha a grama em CSS. */
  thumbnailUrl?: string | null;
  /** Texto da marca d'água no canto da miniatura: "ARENA CALABOUÇO". */
  marca?: string;
};

/** Uma quadra, do jeito que o chip de filtro precisa. */
export type Quadra = {
  id: string;
  nome: string;
  esporte?: string;
};

/**
 * Estado de um ponto de status (câmera, sessão, corte).
 *
 * `cortando` entrou na v2 junto com a decisão de MOSTRAR o clipe em processamento
 * em vez de escondê-lo: o estado precisava de um selo próprio, no amarelo que o
 * sistema reserva para "premium e processando".
 */
export type Status = "online" | "offline" | "gravando" | "cortando";

import type { ClipeRow } from "@/db/queries/clipe";
import type { Clipe, EstadoDoClipe } from "@/components/ui/tipos";
import { diaRelativoNaArena } from "./datas";
import { duracaoFormatada, horaNaArena, relogioDe } from "./fuso";
import { urlPublica } from "./storage";

// A FRONTEIRA entre a linha do banco e o componente.
//
// `components/ui/tipos.ts` é explícito: o componente não deve saber que
// `duration_seconds` vem como string do `pg`, nem que o horário precisa ser
// convertido para o fuso da arena. Quem converte é a página — e "a página"
// acabou sendo este arquivo, porque a busca, a página da arena e o player
// precisam exatamente da mesma conversão, e três cópias divergiriam na primeira
// vez que alguém mexesse no rótulo.

/**
 * `clip_status` (8 valores) → o estado de VISÃO (3 valores).
 *
 * Os cinco estados intermediários do banco (`pending`, `cutting`, `processing`,
 * `uploading`) são a mesma coisa para quem espera: o vídeo ainda não dá para
 * assistir. Mostrar "uploading" ao atleta seria expor o nosso pipeline sem
 * responder a pergunta dele, que é "já posso ver?".
 */
export function estadoDeVisao(status: string): EstadoDoClipe {
  if (status === "ready") return "pronto";
  if (status === "partial") return "parcial";
  return "processando";
}

/** `urlPublica` lança sem CDN configurada; aqui a ausência de imagem é ok. */
export function thumbnailPublica(objectKey: string | null): string | null {
  if (!objectKey) return null;
  try {
    return urlPublica(objectKey);
  } catch {
    return null;
  }
}

export type OpcoesDeVisao = {
  /** `partner.timezone` — o fuso em que os horários são mostrados. */
  timezone: string;
  /** O slug da arena, para montar o link do player. */
  arenaSlug: string;
  /** Texto da marca d'água no canto da miniatura. */
  marca?: string;
  /** Referência de "hoje"/"ontem". Injetável para teste. */
  agora?: Date;
};

/**
 * Uma linha de `clip` vira um card.
 *
 * O clipe em processamento NÃO recebe `href`: o `ClipCard` transforma isso num
 * card não clicável com o selo "processando" — e um card que abrisse um player
 * vazio queimaria mais confiança do que um card que avisa.
 */
export function clipeDeVisao(row: ClipeRow, o: OpcoesDeVisao): Clipe {
  const estado = estadoDeVisao(row.status);
  const quando = new Date(row.triggered_at);

  return {
    id: row.id,
    horario: horaNaArena(quando, o.timezone),
    // `2026-09-13T20:47:00` — o mesmo instante, no relógio da arena, para o
    // `datetime` do `<time>` (achado P2-35).
    quandoIso: relogioDe(quando, o.timezone).iso,
    duracao: duracaoFormatada(row.duration_seconds),
    quadra: row.court_name,
    contexto: `${diaRelativoNaArena(quando, o.timezone, o.agora)} · ${row.court_name}`,
    estado,
    ...(estado === "processando" ? {} : { href: `/${o.arenaSlug}/c/${row.id}` }),
    thumbnailUrl: thumbnailPublica(row.thumbnail_object_key),
    ...(o.marca ? { marca: o.marca } : {}),
  };
}

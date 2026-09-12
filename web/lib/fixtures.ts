/**
 * DADOS DE EXEMPLO — nada aqui é real.
 *
 * ─── POR QUE EXISTEM ───────────────────────────────────────────────────────
 *
 * A C1 entrega o design system e aplica nas telas; as CONSULTAS de algumas delas
 * são de tasks posteriores (busca C4, player C5, sessão C6, grupo C7, métricas do
 * painel C9). Sem fixture, essas telas ficariam como caixas vazias e ninguém
 * conseguiria julgar o layout — que é justamente o que esta task entrega.
 *
 * ─── A REGRA QUE IMPEDE ISSO DE VAZAR PARA PRODUÇÃO ────────────────────────
 *
 * 1. Toda fixture tem `id` começando com `exemplo-`.
 * 2. Toda tela que usa fixture MOSTRA na interface que aquilo é exemplo
 *    (`AvisoDeExemplo`), em vez de fingir que é dado real.
 * 3. Quando a consulta real existir, a página deixa de importar deste arquivo —
 *    e o `grep fixtures` diz exatamente quantas telas ainda faltam.
 *
 * A arena fictícia é a "Arena Calabouço" do canvas de design, com quatro quadras
 * e horários de pelada reais (20h–21h na segunda).
 */

import type { Clipe, Quadra } from "@/components/ui/tipos";

export const ARENA_EXEMPLO = {
  slug: "arena-calabouco",
  nome: "Arena Calabouço",
  iniciais: "AC",
  cidade: "Vila Prudente",
  estado: "SP",
  tagline: "Society e futevôlei · 4 quadras · Vila Prudente, SP",
  endereco: "Rua Tobias Barreto, 1420",
  cep: "03181-000",
  whatsapp: "(11) 98812-4477",
  horarios: [
    { dia: "Segunda a sexta", horario: "07:00 – 00:00" },
    { dia: "Sábado", horario: "08:00 – 22:00" },
    { dia: "Domingo", horario: "08:00 – 18:00" },
  ],
} as const;

export const QUADRAS_EXEMPLO: Quadra[] = [
  { id: "exemplo-q1", nome: "Quadra 1", esporte: "Society" },
  { id: "exemplo-q2", nome: "Quadra 2", esporte: "Society" },
  { id: "exemplo-q3", nome: "Quadra 3", esporte: "Futevôlei" },
  { id: "exemplo-q4", nome: "Quadra 4", esporte: "Futevôlei" },
];

function clipe(
  horario: string,
  quadra: string,
  estado: Clipe["estado"] = "pronto",
  contexto = "Hoje · Society",
): Clipe {
  return {
    id: `exemplo-${quadra.replace(/\s+/g, "").toLowerCase()}-${horario.replace(":", "")}`,
    horario,
    duracao: estado === "parcial" ? "0:14" : "0:22",
    quadra,
    contexto,
    estado,
    marca: ARENA_EXEMPLO.nome.toUpperCase(),
    href: `/${ARENA_EXEMPLO.slug}?exemplo=${horario.replace(":", "")}`,
  };
}

/** A grade da busca: 20:00–21:00 na Quadra 2, com os três estados representados. */
export const CLIPES_EXEMPLO: Clipe[] = [
  clipe("20:47", "Quadra 2"),
  clipe("20:51", "Quadra 2"),
  clipe("20:58", "Quadra 2"),
  clipe("21:04", "Quadra 2", "processando"),
  clipe("21:09", "Quadra 2", "parcial"),
  clipe("21:12", "Quadra 2"),
];

/** Amostra curta para a grade borrada do gate — só forma, nada legível. */
export const CLIPES_BORRADOS_EXEMPLO: Clipe[] = [
  clipe("20:47", "Quadra 2"),
  clipe("20:51", "Quadra 2"),
  clipe("21:03", "Quadra 1", "pronto", "Hoje · Society"),
  clipe("21:12", "Quadra 4", "pronto", "Hoje · Futevôlei"),
];

export const SEMANAS_EXEMPLO = [
  {
    id: "exemplo-2026-09-08",
    titulo: "Segunda, 8 set",
    total: 18,
    clipes: [clipe("20:47", "Quadra 2"), clipe("20:51", "Quadra 2"), clipe("20:58", "Quadra 2")],
  },
  {
    id: "exemplo-2026-09-01",
    titulo: "Segunda, 1 set",
    total: 14,
    clipes: [
      clipe("20:12", "Quadra 2", "pronto", "1 set · Society"),
      clipe("20:33", "Quadra 2", "pronto", "1 set · Society"),
      clipe("20:58", "Quadra 2", "pronto", "1 set · Society"),
    ],
  },
];

export const MEMBROS_EXEMPLO = [
  { id: "exemplo-m1", nome: "Gabriel Bolzi" },
  { id: "exemplo-m2", nome: "Rafael Mendes" },
  { id: "exemplo-m3", nome: "Thiago Lima" },
  { id: "exemplo-m4", nome: "João Pedro" },
];

/** Sugestões do estado vazio propositivo — horários vizinhos COM lance. */
export const SUGESTOES_EXEMPLO = [
  { id: "exemplo-s1", titulo: "Ontem · 20:00 – 21:00", apoio: "Quadra 3 · 14 lances" },
  { id: "exemplo-s2", titulo: "Hoje · 07:00 – 08:00", apoio: "Quadra 3 · 9 lances" },
];

/**
 * Métricas do painel. A consulta real é da C9 — aqui são números do canvas, e a
 * tela os mostra com o aviso de exemplo por cima.
 */
export const METRICAS_EXEMPLO = [
  { id: "exemplo-k1", rotulo: "Lances hoje", valor: "132", apoio: "+18% vs. segunda passada" },
  { id: "exemplo-k2", rotulo: "Lances na semana", valor: "894", apoio: "média de 128 por dia" },
  { id: "exemplo-k3", rotulo: "Compartilhamentos", valor: "311", apoio: "com a marca da arena" },
  { id: "exemplo-k4", rotulo: "Atletas na semana", valor: "218", apoio: "64 em grupos salvos" },
];

/** Lances por horário — o gráfico de barras do painel. */
export const LANCES_POR_HORA_EXEMPLO = [
  { hora: "16h", valor: 6 },
  { hora: "17h", valor: 11 },
  { hora: "18h", valor: 17 },
  { hora: "19h", valor: 24 },
  { hora: "20h", valor: 29 },
  { hora: "21h", valor: 33 },
  { hora: "22h", valor: 18 },
  { hora: "23h", valor: 7 },
];

/** Câmeras do painel quando não há banco configurado (preview novo). */
export const CAMERAS_EXEMPLO = [
  { id: "exemplo-c1", quadra: "Quadra 1", esporte: "Society", status: "online" as const, sessao: "Gravando · 00:42:11", lances: 38 },
  { id: "exemplo-c2", quadra: "Quadra 2", esporte: "Society · Fut de segunda", status: "gravando" as const, sessao: "Gravando · 00:47:03", lances: 52 },
  { id: "exemplo-c3", quadra: "Quadra 3", esporte: "Futevôlei", status: "online" as const, sessao: "Sem sessão agora", lances: 42 },
  { id: "exemplo-c4", quadra: "Quadra 4", esporte: "Futevôlei", status: "offline" as const, sessao: "Parada", lances: 0 },
];

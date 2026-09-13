import css from "./selo.module.css";

/**
 * O selo de estado do painel — gravando, degradada, offline, aguardando relay.
 *
 * ─── POR QUE ELE NÃO É O `StatusDot` DO DESIGN SYSTEM ──────────────────────
 *
 * `StatusDot` fala a língua do ATLETA e tem quatro estados: online, offline,
 * gravando, cortando. O painel fala a língua da OPERAÇÃO e precisa de quatro
 * outros — e um deles, "instável", cai em `online` no mapeamento de
 * `lib/saude-visao.ts`, o que pinta de VERDE uma câmera que está gravando com
 * buracos. Verde é a cor de "pode ir dormir": é o sinal errado para o estado que
 * pede uma ligação para o provedor de internet da arena.
 *
 * A regra da casa diz para não editar `components/ui` para criar variante, e sim
 * ter o componente próprio aqui. É o que este arquivo é. A semântica:
 *
 *   gravando    verde      está tudo certo
 *   instavel    amarelo    grava com buracos — a ação é do lado da arena
 *   aguardando  neutro     cadastrada e nunca conectou: instalação incompleta
 *   offline     vermelho   caiu, ou foi desligada
 *
 * ─── COR NUNCA É O ÚNICO SINAL ─────────────────────────────────────────────
 *
 * Verde e vermelho são o par mais comum de confusão em daltonismo. Todo selo
 * carrega TEXTO, e a forma do ponto muda junto: cheio no que está no ar, anel
 * vazado no que está esperando, quadrado no que caiu.
 */

export type TomDoSelo =
  | "gravando"
  | "instavel"
  | "aguardando"
  | "offline"
  | "ok"
  | "atencao"
  | "neutro";

export function SeloDeEstado({
  tom,
  children,
}: {
  tom: TomDoSelo;
  children: React.ReactNode;
}) {
  return (
    <span className={`${css.selo} ${css[tom]}`}>
      <span className={css.ponto} aria-hidden="true" />
      <span className={css.texto}>{children}</span>
    </span>
  );
}

export default SeloDeEstado;

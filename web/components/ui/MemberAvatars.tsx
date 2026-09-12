import css from "./MemberAvatars.module.css";

/**
 * A fileira de membros do grupo: iniciais sobrepostas e "+6".
 *
 * ─── INICIAIS, NUNCA FOTO ──────────────────────────────────────────────────
 *
 * O produto não pede foto de perfil e não vai pedir: já grava imagem de pessoa
 * em espaço semipúblico, e acrescentar um segundo acervo de rosto aumentaria a
 * superfície de LGPD sem nenhum ganho. Iniciais bastam para "quem está no
 * grupo".
 *
 * A lista visível é decorativa (`aria-hidden`); a informação que importa —
 * "10 na pelada" — é o texto ao lado, que é o que o leitor de tela anuncia.
 */

export type Membro = {
  id: string;
  /** Nome ou e-mail — o componente extrai as iniciais. */
  nome: string;
};

export function iniciais(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return "?";
  // E-mail sem nome: usa as duas primeiras letras antes do arroba.
  const base = limpo.includes("@") ? (limpo.split("@")[0] ?? limpo) : limpo;
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? base[0] ?? "?";
  const segunda = partes.length > 1 ? (partes[1]?.[0] ?? "") : (base[1] ?? "");
  return (primeira + segunda).toUpperCase();
}

export function MemberAvatars({
  membros,
  total,
  limite = 4,
  rotulo,
}: {
  membros: Membro[];
  /** Total real de membros (pode ser maior que a lista recebida). */
  total?: number;
  limite?: number;
  /** Texto ao lado. Padrão: "N na pelada". */
  rotulo?: string;
}) {
  const contagem = total ?? membros.length;
  const visiveis = membros.slice(0, limite);
  const restante = contagem - visiveis.length;

  return (
    <div className={css.raiz}>
      <div className={css.pilha} aria-hidden="true">
        {visiveis.map((m) => (
          <span key={m.id} className={css.avatar}>
            {iniciais(m.nome)}
          </span>
        ))}
        {restante > 0 ? <span className={`${css.avatar} ${css.mais}`}>+{restante}</span> : null}
      </div>
      <span className={css.contagem}>{rotulo ?? `${contagem} na pelada`}</span>
    </div>
  );
}

export default MemberAvatars;

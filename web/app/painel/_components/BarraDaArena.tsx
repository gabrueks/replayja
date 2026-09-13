"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { iniciaisDaArena, rotuloDoPapel } from "../_lib/rotulos";
import css from "../painel.module.css";

/**
 * O bloco de identidade do topo: brasão, nome da arena e a troca de arena.
 *
 * ─── POR QUE ELE É CLIENTE, COMO A NAVEGAÇÃO ───────────────────────────────
 *
 * A arena escolhida vive em `?arena=` e o layout de uma rota do App Router não
 * recebe `searchParams`. A lista de arenas vem do servidor (o layout já tem a
 * sessão e a consulta é a mesma que `resolverArena` faz); QUAL delas está aberta
 * só o cliente sabe.
 *
 * ─── A REGRA DA ARENA ÚNICA É A MESMA DE `resolverArena` ───────────────────
 *
 * Uma arena só, sem `?arena=` na URL: o painel abre direto nela, então o topo
 * mostra ela. Duas ou mais sem `?arena=`: a tela é a de escolha, e o topo não
 * afirma arena nenhuma — dizer "Arena Vasco" enquanto o conteúdo pergunta qual
 * arena é a forma mais rápida de alguém clicar na errada.
 *
 * ─── TROCAR DE ARENA MANTÉM A SEÇÃO, MAS NUNCA O ITEM ──────────────────────
 *
 * Sair de `/painel/cameras` da arena A para `/painel/cameras` da arena B é o que
 * a pessoa quer. Sair de `/painel/cameras/arenavascoq1` para a MESMA URL na
 * arena B é um 404 garantido — aquele id não existe lá. Então a troca corta o
 * caminho em `/painel/<seção>` e nada além disso.
 */

export type ArenaDoTopo = { id: string; slug: string; display_name: string; role: string };

export function BarraDaArena({ arenas }: { arenas: ArenaDoTopo[] }) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const slug = busca.get("arena");

  if (arenas.length === 0) return null;

  const atual =
    arenas.find((a) => a.slug === slug) ?? (arenas.length === 1 ? arenas[0] : undefined);

  function irPara(destino: string) {
    // `/painel`, `/painel/cameras`, `/painel/cameras/<id>` → no máximo dois
    // segmentos. Ver o comentário do topo do arquivo.
    const partes = caminho.split("/").filter(Boolean).slice(0, 2);
    router.push(`/${partes.join("/")}?arena=${encodeURIComponent(destino)}`);
  }

  return (
    <div className={css.arena}>
      {atual ? (
        <>
          <span className={css.brasao} aria-hidden="true">
            {iniciaisDaArena(atual.display_name)}
          </span>
          <span className={css.arenaTextos}>
            <span className={css.arenaNome}>{atual.display_name}</span>
            <span className={css.arenaApoio}>{rotuloDoPapel(atual.role)}</span>
          </span>
        </>
      ) : null}

      {arenas.length > 1 ? (
        <>
          <label className="apenas-leitor" htmlFor="troca-de-arena">
            Trocar de arena
          </label>
          <select
            id="troca-de-arena"
            className={css.trocaArena}
            value={atual?.slug ?? ""}
            onChange={(e) => irPara(e.target.value)}
          >
            {atual ? null : (
              <option value="" disabled>
                Escolha a arena
              </option>
            )}
            {arenas.map((a) => (
              <option key={a.id} value={a.slug}>
                {a.display_name}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

export default BarraDaArena;

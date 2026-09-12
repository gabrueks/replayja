"use client";

import { useState } from "react";
import { Share2, UserPlus } from "lucide-react";
import { Button, InviteSheet, ShareBar } from "@/components/ui";

/**
 * As duas ações do cabeçalho do grupo: convidar e compartilhar.
 *
 * É a única ilha de cliente da página do grupo — a sheet precisa de estado e o
 * `ShareBar` precisa da Web Share API. Todo o resto (semanas, membros, cabeçalho)
 * continua sendo renderizado no servidor, que é o que mantém a página leve no 4G
 * da quadra.
 */
export function AcoesDoGrupo({
  url,
  nomeDoGrupo,
  arena,
  hrefDeLogin,
}: {
  url: string;
  nomeDoGrupo: string;
  arena: string;
  hrefDeLogin?: string | null;
}) {
  const [convite, setConvite] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-12)" }}>
      <div style={{ display: "flex", gap: "var(--e-8)" }}>
        <Button
          variante="secundario"
          tamanho={44}
          icone={<UserPlus size={16} />}
          onClick={() => setConvite(true)}
        >
          Convidar
        </Button>
        <Button
          variante="fantasma"
          tamanho={44}
          icone={<Share2 size={16} />}
          onClick={() => setCompartilhar((v) => !v)}
          aria-expanded={compartilhar}
        >
          Compartilhar
        </Button>
      </div>

      {compartilhar ? (
        <ShareBar
          url={url}
          titulo={`${nomeDoGrupo} · ${arena}`}
          texto={`Os lances do ${nomeDoGrupo}:`}
          hrefDeLogin={hrefDeLogin ?? null}
          nota="Quem abrir o link vê a página do grupo. Os vídeos continuam pedindo login."
        />
      ) : null}

      <InviteSheet
        aberto={convite}
        onFechar={() => setConvite(false)}
        url={url}
        nomeDoGrupo={nomeDoGrupo}
      />
    </div>
  );
}

export default AcoesDoGrupo;

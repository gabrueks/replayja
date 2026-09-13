"use client";

import { useState, useTransition } from "react";
import { Share2, UserPlus } from "lucide-react";
import { Button, InviteSheet, ShareBar, useToast } from "@/components/ui";
import css from "./grupo.module.css";

/**
 * As duas ações do cabeçalho do grupo: convidar e compartilhar.
 *
 * É a única ilha de cliente da página do grupo — a sheet precisa de estado e o
 * `ShareBar` precisa da Web Share API. Todo o resto (semanas, membros,
 * cabeçalho) continua sendo renderizado no servidor, que é o que mantém a
 * página leve no 4G da quadra.
 *
 * ─── O LINK DE CONVITE É PEDIDO NO TOQUE, NÃO NA RENDERIZAÇÃO ──────────────
 *
 * Criar o token ao montar a página gravaria uma linha de `share_link` em toda
 * visita — inclusive nas de quem só veio ver os vídeos. O token nasce quando
 * alguém toca em "Convidar", e a rota reaproveita o link vivo que essa mesma
 * pessoa já criou para este grupo (um convite revogável, não dezenas).
 */
export function AcoesDoGrupo({
  playGroupId,
  partnerId,
  url,
  nomeDoGrupo,
  arena,
  hrefDeLogin,
  podeConvidar,
}: {
  playGroupId: string;
  partnerId: string;
  url: string;
  nomeDoGrupo: string;
  arena: string;
  hrefDeLogin?: string | null;
  /** Só membro convida: quem ainda não entrou compartilha a página. */
  podeConvidar: boolean;
}) {
  const { mostrar } = useToast();
  const [convite, setConvite] = useState(false);
  const [urlDoConvite, setUrlDoConvite] = useState<string | null>(null);
  const [buscando, comBusca] = useTransition();
  const [compartilhar, setCompartilhar] = useState(false);

  function abrirConvite() {
    setConvite(true);
    if (urlDoConvite) return;
    comBusca(async () => {
      try {
        const r = await fetch(`/api/grupos/${playGroupId}/convite`, { method: "POST" });
        if (!r.ok) throw new Error(String(r.status));
        const corpo = (await r.json()) as { url?: string };
        if (corpo.url) setUrlDoConvite(corpo.url);
        else throw new Error("sem url");
      } catch {
        // O convite falhou, mas o link da página funciona: quem abrir vê o
        // grupo e o botão "Entrar no grupo". Melhor um convite mais fraco que
        // uma sheet vazia.
        mostrar("Não consegui gerar o convite agora. Mande o link do grupo.", "erro");
        setUrlDoConvite(url);
      }
    });
  }

  return (
    <div className={css.acoes}>
      <div className={css.acoesLinha}>
        {podeConvidar ? (
          <Button
            variante="secundario"
            tamanho={44}
            icone={<UserPlus size={16} />}
            onClick={abrirConvite}
          >
            Convidar
          </Button>
        ) : null}
        {/*
          Pílula clara e não `fantasma`: estas duas ações vivem sobre o
          cabeçalho PRETO do grupo, onde um botão sem fundo vira texto solto.
        */}
        <Button
          variante="secundario"
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
          registro={{ partnerId, alvo: "group" }}
          nota="Quem abrir o link vê a página do grupo. Os vídeos continuam pedindo login."
        />
      ) : null}

      <InviteSheet
        aberto={convite}
        onFechar={() => setConvite(false)}
        url={urlDoConvite ?? url}
        nomeDoGrupo={nomeDoGrupo}
        texto={
          buscando
            ? "Gerando o link do convite…"
            : "Quem entrar pelo convite vira membro e passa a receber os lances desse horário."
        }
      />
    </div>
  );
}

export default AcoesDoGrupo;

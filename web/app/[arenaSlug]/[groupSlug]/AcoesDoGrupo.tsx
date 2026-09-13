"use client";

import { useState, useTransition } from "react";
import { Settings, Share2, UserPlus } from "lucide-react";
import {
  Button,
  InviteSheet,
  ShareBar,
  useToast,
  type ResultadoDoEnvio,
} from "@/components/ui";
import css from "./grupo.module.css";

/**
 * As ações do cabeçalho do grupo: convidar, compartilhar e — para o dono —
 * arrumar.
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
 * alguém toca em "Convidar", e a rota reaproveita (renovando por mais 14 dias) o
 * link vivo que essa mesma pessoa já criou para este grupo: um convite
 * revogável, não dezenas.
 *
 * ─── O E-MAIL DO CONVITE PASSA PELA MESMA ROTA ─────────────────────────────
 *
 * `POST /api/grupos/{id}/convite` com `{ email }` devolve o MESMO link e manda a
 * mensagem pelo Resend. Reenviar é chamar de novo com o mesmo endereço — e o
 * e-mail leva o mesmo token, para que o primeiro (o que talvez esteja no spam)
 * não vire um convite morto.
 */
export function AcoesDoGrupo({
  playGroupId,
  partnerId,
  url,
  nomeDoGrupo,
  arena,
  hrefDeLogin,
  podeConvidar,
  hrefDeEdicao,
  validadeDoConvite,
}: {
  playGroupId: string;
  partnerId: string;
  url: string;
  nomeDoGrupo: string;
  arena: string;
  hrefDeLogin?: string | null;
  /** Só membro convida: quem ainda não entrou compartilha a página. */
  podeConvidar: boolean;
  /** Só o dono recebe — é a tela de "Arrumar o grupo". */
  hrefDeEdicao?: string | null;
  validadeDoConvite?: number;
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

  async function mandarPorEmail(email: string): Promise<ResultadoDoEnvio> {
    const r = await fetch(`/api/grupos/${playGroupId}/convite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!r.ok) return "falhou";
    const corpo = (await r.json()) as { url?: string; email?: ResultadoDoEnvio };
    // A resposta traz o link junto: se a sheet ainda estava esperando o token,
    // esta chamada já o entrega.
    if (corpo.url) setUrlDoConvite(corpo.url);
    return corpo.email ?? "falhou";
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
          Pílula clara e não `fantasma`: estas ações vivem sobre o cabeçalho
          PRETO do grupo, onde um botão sem fundo vira texto solto.
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
        {hrefDeEdicao ? (
          <Button
            href={hrefDeEdicao}
            variante="secundario"
            tamanho={44}
            icone={<Settings size={16} />}
            aria-label="Arrumar o grupo"
          >
            Arrumar
          </Button>
        ) : null}
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
        aoEnviarEmail={mandarPorEmail}
        {...(validadeDoConvite ? { validadeEmDias: validadeDoConvite } : {})}
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

import { Radio, Search, Users } from "lucide-react";
import { Button, Card, EmptyState, Secao } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { meusGrupos } from "@/db/queries/grupo";
import { arenaDeReferencia } from "@/db/queries/parceiro";
import pagina from "./meus-lances.module.css";

export const metadata = { title: "Meus lances", robots: { index: false, follow: false } };

/**
 * `/app` — a casa do atleta logado.
 *
 * Três blocos, nesta ordem de importância: achar o lance de hoje (busca), os
 * grupos salvos (o que faz ele voltar) e o botão virtual.
 *
 * ─── O BOTÃO VIRTUAL AGORA TEM PARA ONDE IR ────────────────────────────────
 *
 * Ele mora em `/app/botao?arena=…&quadra=…`, porque salvar um lance só faz
 * sentido dentro de UMA quadra — o gatilho é por quadra, o cooldown é por
 * quadra e a câmera é da quadra. A arena de destino sai de `arenaDeReferencia`
 * (aquela pela qual a pessoa entrou, ou a do grupo dela); quando não há
 * nenhuma, a seção explica em vez de mandar o atleta para uma tela vazia.
 */
export default async function AreaLogada() {
  const sessao = await getSession();
  const [grupos, arena] =
    sessao && dbConfigured()
      ? await Promise.all([meusGrupos(sessao), arenaDeReferencia(sessao)])
      : [[], null];

  return (
    <main className={pagina.pagina} id="conteudo">
      <header>
        <h1 className={pagina.titulo}>Seus lances</h1>
        <p className="apoio">Entrou como {sessao?.email}.</p>
      </header>

      <Card variante="painel" className={pagina.buscaCartao}>
        <h2 className={pagina.chamada}>Achar o lance de hoje</h2>
        <p className="apoio">
          Escolha a arena, a quadra e o horário — ou use o atalho &ldquo;agora&rdquo; se você
          acabou de sair da quadra.
        </p>
        <Button
          href={arena ? `/app/buscar?arena=${arena.slug}` : "/app/buscar"}
          tamanho={56}
          largura="total"
          icone={<Search size={20} />}
        >
          Buscar lances
        </Button>
      </Card>

      <Secao
        titulo="Meus grupos"
        acao={
          grupos.length > 0 ? (
            <Button href="/app/grupos" variante="fantasma" tamanho={44}>
              Ver todos
            </Button>
          ) : null
        }
      >
        {grupos.length === 0 ? (
          <EmptyState
            icone={<Users size={24} />}
            titulo="Você ainda não está em nenhum grupo"
            descricao="Salve um horário como grupo depois de achar seus lances: o link fica fixo e os vídeos de toda semana aparecem organizados, sem você precisar procurar."
          />
        ) : (
          <ul className={pagina.lista}>
            {grupos.map((g) => (
              <li key={g.id}>
                <Card href={`/${g.partner_slug}/${g.slug}`} titulo={g.name}>
                  <p className="apoio tempo">
                    {g.partner_display_name} · {g.start_time.slice(0, 5)}–{g.end_time.slice(0, 5)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Botão virtual">
        <Card>
          {arena ? (
            <>
              <p className="apoio">
                Está na quadra e o botão da arena não está por perto? Salve os últimos 22
                segundos por aqui — em {arena.display_name}.
              </p>
              <Button
                href={`/app/botao?arena=${arena.slug}`}
                tamanho={56}
                largura="total"
                icone={<Radio size={20} />}
              >
                Abrir o botão da quadra
              </Button>
            </>
          ) : (
            <p className="apoio">
              O botão virtual é sempre de uma quadra. Abra a página da sua arena e entre por lá —
              o botão físico da quadra continua funcionando sempre, inclusive com o app fechado.
            </p>
          )}
        </Card>
      </Secao>
    </main>
  );
}

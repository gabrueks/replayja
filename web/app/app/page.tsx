import { Search, Users } from "lucide-react";
import { Button, Card, EmptyState, Secao, VirtualButton } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { meusGrupos } from "@/db/queries/grupo";
import pagina from "./meus-lances.module.css";

export const metadata = { title: "Meus lances", robots: { index: false, follow: false } };

/**
 * `/app` — a casa do atleta logado.
 *
 * Três blocos, nesta ordem de importância: achar o lance de hoje (busca), os
 * grupos salvos (o que faz ele voltar) e o botão virtual.
 *
 * ─── O BOTÃO VIRTUAL APARECE DESABILITADO, E COM MOTIVO ────────────────────
 *
 * Ele só faz sentido durante uma sessão AO VIVO da quadra onde a pessoa está
 * (decisão 10 do design), e a consulta que responde "existe sessão ao vivo agora
 * para você?" é de outra task. Mostrar o botão apagado com a explicação é melhor
 * que escondê-lo: quem já ouviu falar dele procura e encontra, em vez de achar
 * que sumiu.
 */
export default async function AreaLogada() {
  const sessao = await getSession();
  const grupos = sessao && dbConfigured() ? await meusGrupos(sessao) : [];

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
        <Button href="/app/buscar" tamanho={56} largura="total" icone={<Search size={20} />}>
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
          <VirtualButton
            disabled
            motivo="O botão virtual aparece durante uma sessão ao vivo da sua quadra. O botão físico da arena continua funcionando sempre."
          />
        </Card>
      </Secao>
    </main>
  );
}

import Link from "next/link";
import { Search } from "lucide-react";
import { Button, ClipGrid, EmptyState, Secao } from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { JANELA_MAX_MS } from "@/lib/limites";
import { getSession } from "@/lib/session";
import { clipesDaArena } from "@/db/queries/clipe";
import { minhasArenas } from "@/db/queries/parceiro";
import { ACHAR_MEU_LANCE, destinoDeAcharMeuLance } from "./destino";
import css from "./lances.module.css";

export const metadata = { title: "Seus lances", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/lances` — a aba "Lances" da barra inferior.
 *
 * ─── POR QUE ELA PRECISOU EXISTIR ──────────────────────────────────────────
 *
 * A barra de quatro abas do design exige que as quatro levem a algum lugar. Três
 * já existiam; "Lances" não. A alternativa era apontar a aba para `/app/buscar`,
 * que RECUSA rodar sem `?arena=` e devolveria a pessoa para `/app` — uma aba que
 * pisca e volta é pior que aba nenhuma.
 *
 * ─── O QUE ELA MOSTRA ──────────────────────────────────────────────────────
 *
 * As últimas 6 horas da arena em que o atleta jogou por último, com atalho para
 * trocar de arena. É a resposta à pergunta que traz alguém para esta aba —
 * "cadê o lance que eu acabei de salvar?" — e usa a MESMA consulta da busca e da
 * página da arena, sem nenhuma consulta nova.
 *
 * Seis horas é o teto da consulta central, e ele é controle de PRIVACIDADE, não
 * limitação técnica (`api/README.md` §3): nunca existe "listar todos os lances
 * da arena". O resto sai pela busca por horário.
 *
 * ─── UM CTA. UM SÓ. ────────────────────────────────────────────────────────
 *
 * A tela tinha DOIS botões para a mesma coisa — "Buscar por horário" dentro do
 * estado vazio e "Bora achar seu lance" embaixo da grade —, os dois apontando
 * para `/app/buscar?arena=…`. Dois rótulos diferentes para o mesmo destino não
 * são duas opções: são uma pergunta ("qual é a diferença?") que o atleta não tem
 * como responder, e ele responde parando. Foi o bug 5 do teste em produção.
 *
 * Agora existe um só, "Achar meu lance", e ele muda de LUGAR conforme o estado:
 * dentro do vazio quando não há nada (é ali que o olho está) e abaixo da grade
 * quando há (a grade é a resposta; o botão é o próximo passo). Nunca os dois.
 */

export default async function MeusLances({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const sessao = await getSession();
  const { arena } = await searchParams;

  const arenas = dbConfigured() && sessao ? await minhasArenas(sessao) : [];
  const escolhida = (arena ? arenas.find((a) => a.slug === arena) : undefined) ?? arenas[0] ?? null;

  const agora = new Date();
  const linhas =
    escolhida && sessao
      ? await clipesDaArena(sessao, {
          partnerId: escolhida.id,
          de: new Date(agora.getTime() - JANELA_MAX_MS),
          ate: agora,
          // O lance recém-salvo tem de APARECER, ainda que como "cortando":
          // quem acabou de apertar o botão está olhando para esta tela.
          incluirProcessando: true,
        })
      : [];

  const clipes = escolhida
    ? linhas.map((l) =>
        clipeDeVisao(l, {
          timezone: escolhida.timezone,
          arenaSlug: escolhida.slug,
          marca: escolhida.display_name.toUpperCase(),
          agora,
        }),
      )
    : [];

  if (!escolhida) {
    return (
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Seus lances.</h1>
        <EmptyState
          ilustracao="camera"
          titulo="Você ainda não jogou numa arena com câmera."
          descricao="Escolha a arena onde você joga e a gente guarda os lances a partir da próxima pelada."
          acoes={
            <Button href="/app" tamanho={56} largura="total" icone={<Search size={20} />}>
              {ACHAR_MEU_LANCE}
            </Button>
          }
        />
      </main>
    );
  }

  // Um só destino para um só botão. `arenas` (e não `escolhida`) porque a
  // pergunta é "esta pessoa tem uma arena ou várias?".
  const destino = destinoDeAcharMeuLance(arenas);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <h1 className={css.titulo}>Seus lances.</h1>
        <p className={css.chamada}>Últimas 6 horas na {escolhida.display_name}.</p>
      </header>

      {arenas.length > 1 ? (
        <div className={css.faixa} role="group" aria-label="Arena">
          {arenas.map((a) => (
            <Link
              key={a.id}
              href={`/app/lances?arena=${a.slug}`}
              className={[css.arena, a.id === escolhida.id ? css.arenaAtiva : null]
                .filter(Boolean)
                .join(" ")}
              aria-current={a.id === escolhida.id ? "page" : undefined}
            >
              {a.display_name}
            </Link>
          ))}
        </div>
      ) : null}

      <Secao titulo={<span className="rotulo">O que saiu agora</span>}>
        <ClipGrid
          clipes={clipes}
          rotulo="Seus lances"
          vazio={
            <EmptyState
              ilustracao="botao"
              titulo="Nada nas últimas horas."
              descricao="A câmera está lá, mas ninguém apertou o botão nessa janela. Às vezes é a bateria do botão da quadra."
              // O CTA do vazio é o MESMO da tela — mesmo rótulo, mesmo destino.
              // Quando a grade está vazia ele mora aqui, porque é aqui que o
              // olho está; quando há lances ele desce para baixo da grade.
              acoes={
                <Button href={destino} tamanho={52} largura="total" variante="preto" icone={<Search size={18} />}>
                  {ACHAR_MEU_LANCE}
                </Button>
              }
            />
          }
        />
      </Secao>

      {clipes.length > 0 ? (
        <Button href={destino} tamanho={56} largura="total" icone={<Search size={20} />}>
          {ACHAR_MEU_LANCE}
        </Button>
      ) : null}
    </main>
  );
}

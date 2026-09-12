import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import {
  AvisoDeExemplo,
  Button,
  Card,
  ClipGrid,
  EmptyState,
  Secao,
  ShareBar,
} from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, parseSessionSlug } from "@/lib/slug";
import { CLIPES_EXEMPLO } from "@/lib/fixtures";
import { parceiroPublicoPorSlug } from "@/db/queries/parceiro";
import css from "./sessao.module.css";

// `/[arenaSlug]/s/[sessionSlug]` — A PÁGINA DA SESSÃO.
//
// ─── A SESSÃO É UMA JANELA, NÃO UMA LINHA ──────────────────────────────────
//
// O slug é `AAAA-MM-DD-HHhMMm-HHhMMm` no fuso DA ARENA: "os lances entre 20h e
// 21h30 do dia 8". Não existe tabela de sessão para isso — é por essa razão que
// `share_link.target_type = 'session'` não tem `target_id` e carrega
// `range_start`/`range_end`.
//
// É a ponte do caso de uso PONTUAL para o RECORRENTE: o CTA principal é "salvar
// este horário como grupo" (`design/README.md`, decisão 6). Por isso ele aparece
// ANTES da lista, e não escondido no fim.
//
// ─── QUEM ABRE O LINK NÃO PRECISA ESTAR LOGADO PARA VER QUE EXISTE ─────────
//
// Assistir é público; baixar e compartilhar pedem login (decisão 7). Sem isso,
// cada link no WhatsApp viraria um muro de cadastro e mataria a divulgação
// orgânica da arena — que é metade do valor que o parceiro compra.
//
// CUIDADO COM O NOME: `s` é slug reservado de segundo nível. Um grupo chamado "s"
// colidiria com esta rota — `lib/reserved-slugs.ts` bloqueia.

type Props = { params: Promise<{ arenaSlug: string; sessionSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionSlug } = await params;
  const janela = parseSessionSlug(sessionSlug);
  return {
    title: janela ? `Sessão de ${janela.localDate}` : "Sessão",
    // A sessão leva a vídeos específicos: nunca entra no índice.
    robots: { index: false, follow: false },
  };
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function porExtenso(iso: string): string {
  // `T12:00` evita o clássico "um dia a menos": `new Date('2026-09-08')` é lido
  // como UTC e volta para o dia 7 em qualquer fuso negativo.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = DIAS[d.getDay()] ?? "";
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()] ?? ""}`;
}

export default async function PaginaDaSessao({ params }: Props) {
  const { arenaSlug, sessionSlug } = await params;
  if (!ehSlugDeArena(arenaSlug)) notFound();

  const janela = parseSessionSlug(sessionSlug);
  if (!janela) notFound();

  const parceiro = dbConfigured() ? await parceiroPublicoPorSlug(arenaSlug) : null;
  if (!parceiro) notFound();

  const sessao = await getSession();
  const caminho = `/${arenaSlug}/s/${sessionSlug}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const url = `${base}${caminho}`;

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <Link className={css.arena} href={`/${arenaSlug}`}>
          <span className={css.brasao}>
            {parceiro.display_name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <span className={css.arenaNome}>{parceiro.display_name}</span>
            <span className={css.arenaApoio}>Sessão compartilhada</span>
          </span>
        </Link>

        <h1 className={css.titulo}>{porExtenso(janela.localDate)}</h1>
        <p className={`${css.janela} tempo`}>
          {janela.startTime} – {janela.endTime} · horário da arena
        </p>
      </header>

      {/*
        O CTA de virar grupo vem ANTES da lista: é a decisão de produto que
        transforma um link de uma noite em um endereço permanente da pelada.
      */}
      <Card variante="painel" className={css.chamada}>
        <h2 className={css.chamadaTitulo}>Joga aqui toda semana?</h2>
        <p className="apoio">
          Vira grupo: link fixo, vídeos separados por semana e a galera recebe sozinha.
        </p>
        <Button
          href={
            sessao
              ? `/app/grupos?arena=${arenaSlug}&de=${janela.startTime}&ate=${janela.endTime}`
              : `/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`
          }
          tamanho={52}
          largura="total"
          icone={<CalendarPlus size={18} />}
        >
          Salvar como grupo
        </Button>
      </Card>

      <Secao titulo="Lances da sessão" acao={<span className="apoio-3">mais recentes</span>}>
        {sessao ? (
          <>
            <AvisoDeExemplo o_que="Os lances abaixo" />
            <ClipGrid
              clipes={CLIPES_EXEMPLO}
              rotulo="Lances da sessão"
              vazio={
                <EmptyState
                  titulo="Nenhum lance nesta janela"
                  descricao="O botão da quadra não foi acionado entre esses horários."
                />
              }
            />
          </>
        ) : (
          <EmptyState
            titulo="Entre para ver os lances desta sessão"
            descricao="Assistir é público, mas a lista completa e o download pedem login. Leva 20 segundos, sem senha."
            acoes={
              <Button
                href={`/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`}
                largura="total"
              >
                Entrar
              </Button>
            }
          />
        )}
      </Secao>

      <Secao titulo="Compartilhar esta sessão">
        <ShareBar
          url={url}
          titulo={`Lances de ${porExtenso(janela.localDate)} na ${parceiro.display_name}`}
          texto={`Os lances da nossa pelada (${janela.startTime}–${janela.endTime}):`}
          hrefDeLogin={
            sessao ? null : `/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`
          }
          nota="Qualquer pessoa com este link assiste. Baixar e compartilhar pede login."
        />
      </Secao>
    </main>
  );
}

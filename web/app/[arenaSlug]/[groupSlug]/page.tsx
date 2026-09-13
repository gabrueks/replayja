import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Users } from "lucide-react";
import {
  Button,
  Card,
  CtaFixo,
  EmptyState,
  LoginGate,
  MemberAvatars,
  Secao,
  WeekSection,
  type Clipe,
} from "@/components/ui";
import { clipeDeVisao } from "@/lib/clipe-visao";
import { dbConfigured } from "@/lib/db";
import { CLIPES_BORRADOS_EXEMPLO } from "@/lib/fixtures";
import { proximaOcorrencia } from "@/lib/ocorrencias";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, ehSlugDeGrupo, formatSessionSlug } from "@/lib/slug";
import { papelNoGrupo } from "@/db/queries/autorizacao";
import { clipesDoGrupoPorSessao, sessoesSemanaisDoGrupo } from "@/db/queries/clipe";
import { grupoPorSlug, membrosDoGrupo } from "@/db/queries/grupo";
import { lancesDeHojeNaArena } from "@/db/queries/parceiro";
import { AcoesDoGrupo } from "./AcoesDoGrupo";
import css from "./grupo.module.css";

// `/[arenaSlug]/[groupSlug]` — A PÁGINA DO GRUPO.
//
// ─── O GRUPO NÃO É UM COFRE ────────────────────────────────────────────────
//
// Um grupo `private` esconde ESTA PÁGINA, as sessões organizadas e a lista de
// membros. Ele NÃO esconde os clipes: qualquer usuário logado que saiba a arena e
// o horário encontra os mesmos vídeos pela busca (`api/README.md` §3).
//
// O grupo é CONVENIÊNCIA e ORGANIZAÇÃO — "os vídeos já organizados por semana,
// atualizados sozinhos" — mais captura de e-mail para o parceiro. A UI precisa
// dizer "quem pode ver esta página", nunca "quem pode ver estes vídeos": prometer
// o segundo criaria uma expectativa que a busca desmente no primeiro teste.
//
// A página abre em MODO LEITURA para convidados; entrar vira membro e liga o
// aviso semanal por e-mail. É assim que o grupo captura e-mail sem bloquear quem
// só quer ver (`design/README.md`, decisão 8).
//
// ─── AS SEMANAS SÃO DERIVADAS, NÃO ARMAZENADAS ─────────────────────────────
//
// Não existe tabela de sessão. As últimas 8 ocorrências saem de `weekdays` +
// `start_time`/`end_time` + `timezone` com `AT TIME ZONE` em SQL
// (`db/queries/clipe.ts`), e os clipes de cada uma vêm da mesma derivação. É por
// isso que o grupo "se atualiza sozinho": não há nada para atualizar.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ arenaSlug: string; groupSlug: string }> };

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const DIAS_CURTOS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Quantas ocorrências a página mostra. Oito semanas é ~2 meses de pelada. */
const OCORRENCIAS = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { arenaSlug, groupSlug } = await params;
  if (!dbConfigured() || !ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) {
    return { title: "Grupo" };
  }
  // Metadados são gerados SEM sessão: o crawler do WhatsApp não tem cookie. Por
  // isso um grupo `private` não devolve nada aqui.
  const g = await grupoPorSlug(null, arenaSlug, groupSlug);
  if (!g) return { title: "Grupo", robots: { index: false, follow: false } };

  return {
    title: `${g.name} · ${g.partner_display_name}`,
    description:
      g.description ??
      `Os lances do ${g.name} na ${g.partner_display_name}, organizados por semana.`,
    alternates: { canonical: `/${arenaSlug}/${groupSlug}` },
    // Só grupo PÚBLICO entra no índice. `unlisted` existe justamente para viver
    // só no link compartilhado.
    robots:
      g.visibility === "public"
        ? { index: true, follow: true }
        : { index: false, follow: false },
    openGraph: {
      type: "website",
      title: g.name,
      description: g.description ?? `Lances do ${g.name}, semana a semana.`,
      locale: "pt_BR",
    },
  };
}

function dataCurta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = DIAS[d.getDay() === 0 ? 7 : d.getDay()] ?? "";
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${d.getDate()} ${MESES[d.getMonth()] ?? ""}`;
}

export default async function PaginaDoGrupo({ params }: Props) {
  const { arenaSlug, groupSlug } = await params;
  if (!dbConfigured() || !ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) notFound();

  const sessao = await getSession();
  const grupo = await grupoPorSlug(sessao, arenaSlug, groupSlug);
  // 404 e nunca 403: distinguir "não existe" de "você não pode ver" é um oráculo
  // de enumeração.
  if (!grupo) notFound();

  const [semanas, membros, papel, clipesPorSessao, lancesHoje] = await Promise.all([
    sessoesSemanaisDoGrupo(grupo.id, OCORRENCIAS),
    membrosDoGrupo(sessao, grupo.id),
    papelNoGrupo(sessao, grupo.id),
    // Os clipes exigem login — mesma regra da arena. Deslogado vê a estrutura
    // (as semanas e as contagens) e a grade borrada, nunca miniatura de verdade.
    sessao ? clipesDoGrupoPorSessao(sessao, grupo.id, OCORRENCIAS) : Promise.resolve([]),
    lancesDeHojeNaArena(grupo.partner_id, grupo.timezone),
  ]);

  // Agrupa os clipes por data local. O `Map` preserva a ordem da consulta
  // (`window_start DESC`), que é a ordem em que as semanas aparecem.
  const porData = new Map<string, Clipe[]>();
  for (const linha of clipesPorSessao) {
    if (!linha.id) continue; // ocorrência sem lance: a lateral devolveu nulos
    const lista = porData.get(linha.local_date) ?? [];
    lista.push(
      clipeDeVisao(linha, {
        timezone: grupo.timezone,
        arenaSlug,
        marca: grupo.partner_display_name.toUpperCase(),
      }),
    );
    porData.set(linha.local_date, lista);
  }

  // As últimas 8 OCORRÊNCIAS, e não as últimas 8 semanas: um grupo de três dias
  // da semana teria 24 seções em 8 semanas, e a tela viraria um rolo.
  const ocorrencias = semanas.slice(0, OCORRENCIAS);

  const caminho = `/${arenaSlug}/${groupSlug}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const hrefDeLogin = sessao
    ? null
    : `/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`;

  const quadraDoGrupo = grupo.all_courts ? "todas as quadras" : "uma quadra";

  // "Próxima pelada: sexta, 19 set às 20:00" — a linha que diz que o grupo está
  // VIVO. Sem ela, um grupo recém-criado (sem nenhuma sessão passada) parece
  // quebrado: a página abre com o vazio e nada explica quando ele vai encher.
  const proxima = proximaOcorrencia(
    {
      weekdays: grupo.weekdays,
      startTime: grupo.start_time,
      endTime: grupo.end_time,
      timezone: grupo.timezone,
    },
    new Date(),
  );

  return (
    <main className={`${css.pagina} ${sessao ? "" : "com-cta"}`} id="conteudo">
      {/*
        O CABEÇALHO DO GRUPO É PRETO, e é a única superfície escura do app fora
        do player e do botão virtual. A razão é de produto: o grupo é o endereço
        PERMANENTE da pelada — o link que fica fixado no tópico do WhatsApp por
        meses. Um cabeçalho que se destaca é o que faz a página ser reconhecida
        de relance, entre trinta mensagens.
      */}
      <header className={`${css.cabecalho} tinta`}>
        <span className={css.brilho} aria-hidden="true" />

        <div className={css.linhaTopo}>
          <Link className={css.redondo} href={`/${arenaSlug}`} aria-label="Voltar para a arena">
            <ArrowLeft size={20} strokeWidth={2.4} aria-hidden="true" />
          </Link>
        </div>

        <h1 className={css.titulo}>{grupo.name}</h1>
        <p className={css.linha}>
          {grupo.partner_display_name} · {quadraDoGrupo}
        </p>
        {grupo.description ? <p className={css.descricao}>{grupo.description}</p> : null}

        <p className={css.quando}>
          <Clock size={14} strokeWidth={2.4} aria-hidden="true" />
          <span className="tempo">
            {grupo.weekdays.map((d) => DIAS_CURTOS[d]).filter(Boolean).join(", ")} ·{" "}
            {grupo.start_time.slice(0, 5)}–{grupo.end_time.slice(0, 5)}
          </span>
        </p>

        {proxima ? (
          <p className={`${css.proxima} tempo`}>
            Próxima pelada: {dataCurta(proxima.localDate)} às {grupo.start_time.slice(0, 5)}
          </p>
        ) : null}

        <div className={css.membros}>
          <MemberAvatars
            membros={membros.map((m) => ({ id: m.id, nome: m.display_name ?? m.email }))}
            total={grupo.member_count}
          />
          <AcoesDoGrupo
            playGroupId={grupo.id}
            partnerId={grupo.partner_id}
            url={`${base}${caminho}`}
            nomeDoGrupo={grupo.name}
            arena={grupo.partner_display_name}
            hrefDeLogin={hrefDeLogin}
            podeConvidar={papel !== null}
          />
        </div>
      </header>

      <div className={css.rodadas}>
        {!sessao ? (
          <>
            <p className={css.contador}>
              <span className={`${css.contadorNumero} tempo`}>{lancesHoje}</span>
              <span className={css.contadorRotulo}>
                {lancesHoje === 1 ? "lance gravado hoje" : "lances gravados hoje"}
              </span>
            </p>

            <LoginGate
              amostra={CLIPES_BORRADOS_EXEMPLO}
              marca={grupo.partner_display_name.toUpperCase()}
              titulo="Os lances da pelada estão aqui."
            >
              <p className={css.rodapeDoGate}>
                A página do {grupo.name} é pública. O login só é pedido pra ver, baixar e
                compartilhar vídeo.
              </p>
            </LoginGate>

            <CtaFixo apoio="Leva 20 segundos. Sem senha, sem cadastro.">
              <Button href={hrefDeLogin ?? "/entrar"} tamanho={56} largura="total">
                Entrar pra ver meus lances
              </Button>
            </CtaFixo>
          </>
        ) : ocorrencias.length === 0 ? (
          <EmptyState
            ilustracao="quadra"
            titulo="A primeira rodada ainda não rolou."
            descricao={`Assim que alguém apertar o botão ${grupo.weekdays.map((d) => DIAS[d]).filter(Boolean).join(" ou ")} entre ${grupo.start_time.slice(0, 5)} e ${grupo.end_time.slice(0, 5)}, os lances aparecem aqui sozinhos.`}
          />
        ) : (
          ocorrencias.map((s, i) => (
            <WeekSection
              key={s.local_date}
              semana={{
                id: s.local_date,
                titulo: dataCurta(s.local_date),
                // A rodada é contada de trás para a frente a partir das
                // ocorrências conhecidas: a mais recente tem o número maior, que
                // é como uma tabela de campeonato numera.
                rodada: ocorrencias.length - i,
                total: s.clip_count,
                clipes: porData.get(s.local_date) ?? [],
              }}
              rodape={
                // A sessão daquela noite tem endereço próprio — é o link que se
                // manda no grupo, e é onde estão os lances que não couberam aqui.
                s.clip_count > 0 ? (
                  <Link
                    className={css.verSessao}
                    href={`/${arenaSlug}/s/${formatSessionSlug({
                      localDate: s.local_date,
                      startTime: grupo.start_time.slice(0, 5),
                      endTime: grupo.end_time.slice(0, 5),
                    })}`}
                  >
                    Ver {s.clip_count === 1 ? "o lance" : `os ${s.clip_count} lances`} desta rodada
                  </Link>
                ) : null
              }
            />
          ))
        )}
      </div>

      <Secao
        titulo={<span className="rotulo">Membros</span>}
        acao={
          <span className="apoio-3 tempo">
            {grupo.member_count} {grupo.member_count === 1 ? "pessoa" : "pessoas"}
          </span>
        }
      >
        {membros.length === 0 ? (
          <Card>
            <p className="apoio">
              <Users size={16} aria-hidden="true" /> Entra no grupo pra ver quem está aqui.
            </p>
          </Card>
        ) : (
          <ul className={css.listaMembros}>
            {membros.map((m) => (
              <li key={m.id} className={css.membro}>
                <span>{m.display_name ?? m.email}</span>
                {m.role === "owner" ? <span className={css.dono}>dono</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <p className={css.aviso}>
        Este grupo organiza os lances por semana. Ele não restringe quem pode ver os vídeos —
        qualquer pessoa logada que saiba a arena e o horário encontra os mesmos lances.
      </p>
    </main>
  );
}

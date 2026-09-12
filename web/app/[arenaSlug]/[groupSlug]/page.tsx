import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoDeExemplo, Card, MemberAvatars, Secao, WeekSection } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, ehSlugDeGrupo } from "@/lib/slug";
import { CLIPES_EXEMPLO } from "@/lib/fixtures";
import { grupoPorSlug, membrosDoGrupo } from "@/db/queries/grupo";
import { sessoesSemanaisDoGrupo } from "@/db/queries/clipe";
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

export const revalidate = 120;

type Props = { params: Promise<{ arenaSlug: string; groupSlug: string }> };

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const DIAS_CURTOS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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

  const [semanas, membros] = await Promise.all([
    sessoesSemanaisDoGrupo(grupo.id, 12),
    membrosDoGrupo(sessao, grupo.id),
  ]);

  const caminho = `/${arenaSlug}/${groupSlug}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const temLance = semanas.some((s) => s.clip_count > 0);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <p className={css.caminho}>
          <Link href={`/${arenaSlug}`}>{grupo.partner_display_name}</Link>
          <span aria-hidden="true"> / </span>
          <span className={css.slug}>{grupo.slug}</span>
        </p>

        <h1 className={css.titulo}>{grupo.name}</h1>
        <p className={`${css.linha} tempo`}>
          {grupo.weekdays.map((d) => DIAS_CURTOS[d]).filter(Boolean).join(", ")} ·{" "}
          {grupo.start_time.slice(0, 5)}–{grupo.end_time.slice(0, 5)}
        </p>
        {grupo.description ? <p className="apoio">{grupo.description}</p> : null}

        <div className={css.membros}>
          <MemberAvatars
            membros={membros.map((m) => ({ id: m.id, nome: m.display_name ?? m.email }))}
            total={grupo.member_count}
          />
          <AcoesDoGrupo
            url={`${base}${caminho}`}
            nomeDoGrupo={grupo.name}
            arena={grupo.partner_display_name}
            hrefDeLogin={
              sessao ? null : `/entrar?redirectTo=${encodeURIComponent(caminho)}&arena=${arenaSlug}`
            }
          />
        </div>
      </header>

      <Secao titulo="Semanas">
        {semanas.length === 0 ? (
          <Card>
            <p className="apoio">
              Ainda não há sessões deste grupo. A primeira aparece depois da próxima pelada no
              horário combinado.
            </p>
          </Card>
        ) : (
          <>
            {temLance ? <AvisoDeExemplo o_que="As miniaturas de cada semana" /> : null}
            {semanas.map((s) => (
              <WeekSection
                key={s.local_date}
                semana={{
                  id: s.local_date,
                  titulo: dataCurta(s.local_date),
                  total: s.clip_count,
                  // A contagem é REAL (consulta `sessoesSemanaisDoGrupo`); as
                  // miniaturas ainda são de exemplo até a consulta de clipes por
                  // sessão entrar. Semana sem lance mostra a explicação.
                  clipes: s.clip_count > 0 ? CLIPES_EXEMPLO.slice(0, 3) : [],
                }}
              />
            ))}
          </>
        )}
      </Secao>

      <Secao titulo="Membros">
        {membros.length === 0 ? (
          <Card>
            <p className="apoio">Entre no grupo para ver quem está aqui.</p>
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

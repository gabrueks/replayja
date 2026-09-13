import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import FormularioDeGrupo, { type PreenchimentoDoGrupo } from "./FormularioDeGrupo";
import css from "./criar-grupo.module.css";

export const metadata = { title: "Criar grupo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// `/[arenaSlug]/grupos/novo` — CRIAR GRUPO.
//
// ─── POR QUE DENTRO DA ARENA, E NÃO EM `/app/grupos/novo` ──────────────────
//
// O grupo VIVE numa arena (`/<arena>/<grupo>`), herda o fuso dela e só pode
// filtrar as quadras dela. Um formulário em `/app` teria de perguntar a arena
// como primeiro campo — e a pessoa chega aqui pelo botão "Salvar como grupo" da
// sessão ou da busca, quando a arena JÁ está escolhida. Perguntar de novo o que
// já se sabe é a fricção que a ponte existe para eliminar.
//
// `grupos` é slug reservado de segundo nível (`lib/reserved-slugs.ts`), então
// esta rota não pode ser sombreada por um grupo chamado "grupos".

type Props = {
  params: Promise<{ arenaSlug: string }>;
  searchParams: Promise<{
    data?: string;
    de?: string;
    ate?: string;
    dia?: string;
    quadra?: string;
    nome?: string;
  }>;
};

/** `AAAA-MM-DD` → dia da semana ISO (1 = segunda … 7 = domingo). */
function diaIsoDaData(iso: string): number | null {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function CriarGrupo({ params, searchParams }: Props) {
  const { arenaSlug } = await params;
  const q = await searchParams;

  if (!ehSlugDeArena(arenaSlug) || !dbConfigured()) notFound();

  const sessao = await getSession();
  if (!sessao) {
    // O middleware não cobre esta rota (ela está fora de `/app`), e criar grupo
    // é escrita: o gate fica aqui, com a volta para cá depois do login.
    const destino = `/${arenaSlug}/grupos/novo`;
    redirect(`/entrar?redirectTo=${encodeURIComponent(destino)}&arena=${arenaSlug}`);
  }

  const parceiro = await parceiroPublicoPorSlug(arenaSlug);
  if (!parceiro) notFound();

  const quadras = await quadrasDoParceiro(parceiro.id);

  // ─── O PREENCHIMENTO VEM DA SESSÃO QUE ORIGINOU O CTA ───────────────────
  //
  // `?data=` dá o DIA DA SEMANA (a pelada de 12/set vira "toda sexta"), `?de=`
  // e `?ate=` dão o horário, `?quadra=` dá a quadra. Nada aqui é confiável — é
  // query string — mas nada aqui é autorização: o pior caso é um formulário
  // aberto com um dia errado, que a pessoa corrige com um toque.
  const diaExplicito = q.dia ? Number(q.dia) : NaN;
  const dia =
    Number.isInteger(diaExplicito) && diaExplicito >= 1 && diaExplicito <= 7
      ? diaExplicito
      : q.data
        ? diaIsoDaData(q.data)
        : null;

  const quadraValida = q.quadra && quadras.some((c) => c.slug === q.quadra) ? q.quadra : "todas";

  const inicial: PreenchimentoDoGrupo = {
    ...(q.nome ? { nome: q.nome.slice(0, 60) } : {}),
    ...(dia ? { dias: [dia] } : {}),
    ...(q.de && HORA.test(q.de) ? { inicio: q.de } : {}),
    ...(q.ate && HORA.test(q.ate) ? { fim: q.ate } : {}),
    quadra: quadraValida,
  };

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br").replace(
    /^https?:\/\//,
    "",
  );

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <p className={css.caminho}>
          <Link href={`/${parceiro.slug}`}>{parceiro.display_name}</Link>
          <span aria-hidden="true"> / </span>
          <span>grupos</span>
        </p>
        <h1 className={css.titulo}>Vira grupo.</h1>
        <p className={css.chamada}>
          Salva o horário da pelada uma vez. Toda semana os lances aparecem sozinhos no mesmo
          link, separados por rodada, e quem você convidar acha tudo organizado.
        </p>
      </header>

      <FormularioDeGrupo
        arenaSlug={parceiro.slug}
        arenaNome={parceiro.display_name}
        quadras={quadras.map((c) => ({ id: c.slug, nome: c.name, esporte: c.sport }))}
        inicial={inicial}
        base={base}
      />

      <p className={css.aviso}>
        O grupo organiza os lances por rodada. Ele <strong>não</strong> restringe quem pode ver os
        vídeos — qualquer pessoa logada que saiba a arena e o horário encontra os mesmos lances
        pela busca.
      </p>
    </main>
  );
}

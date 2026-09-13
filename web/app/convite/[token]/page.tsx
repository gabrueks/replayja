import { redirect } from "next/navigation";
import { Clock, Users } from "lucide-react";
import { Button, EmptyState, MemberAvatars } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { contarAberturaDoLink, registrarCompartilhamento } from "@/db/queries/compartilhamento";
import { papelNoGrupo } from "@/db/queries/autorizacao";
import { grupoPorTokenDeConvite } from "@/db/queries/grupo";
import { Aceitar } from "./Aceitar";
import css from "./convite.module.css";

export const metadata = { title: "Convite", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// `/convite/[token]` — O ACEITE DO CONVITE.
//
// ─── É UMA ROTA DE PRIMEIRO NÍVEL, E ISSO CUSTOU UM SLUG RESERVADO ─────────
//
// `replayja.com.br/convite/xyz` é o que cabe numa mensagem de WhatsApp junto do
// texto. O catch-all `/[arenaSlug]` ocupa a raiz (ADR §8), então `convite` teve
// de entrar em `lib/reserved-slugs.ts` e numa migração delta — sem isso, uma
// arena chamada `convite` tornaria esta rota inalcançável.
//
// ─── A ORDEM É: TOKEN → CONVITE NA TELA → LOGIN → MEMBRO ───────────────────
//
// O token é resolvido ANTES do login, de propósito: um token morto tem de dizer
// "este convite não vale mais" em vez de mandar a pessoa fazer login para só
// então decepcioná-la.
//
// E entrar deixou de ser automático. A versão anterior adicionava a pessoa ao
// grupo na própria renderização — abrir o link já era entrar. Isso economizava
// um toque e custava três coisas: ninguém via NO QUE estava entrando, um `GET`
// mudava estado (qualquer pré-busca de link adicionava a pessoa), e o aceite
// ficava fora do alcance de qualquer confirmação. Agora a tela mostra o GRUPO, a
// ARENA, QUEM CHAMOU e QUANDO a pelada acontece — e o botão faz o resto.
//
// O grupo continua ABERTO por link (decisão 26): não há aprovação do dono. O que
// mudou é de quem é o consentimento, não quem decide.

export default async function Convite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!dbConfigured()) return <ConviteInvalido />;

  // O `CHECK` da tabela é `[A-Za-z0-9_-]{8,32}`; conferir aqui evita uma ida ao
  // banco por scanner.
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return <ConviteInvalido />;

  const grupo = await grupoPorTokenDeConvite(token);
  if (!grupo) return <ConviteInvalido />;

  const sessao = await getSession();
  const destino = `/${grupo.partner_slug}/${grupo.slug}`;

  // Quem já é membro não precisa de tela nenhuma: o link de convite reencaminhado
  // dentro do próprio grupo é o caso mais comum de reabertura, e mostrar "Entrar
  // no grupo" a quem já está nele parece que o produto perdeu a inscrição.
  if (sessao && (await papelNoGrupo(sessao, grupo.id))) redirect(destino);

  await contarAberturaDoLink(grupo.share_link_id);
  await registrarCompartilhamento(sessao, {
    partnerId: grupo.partner_id,
    action: "opened",
    channel: "unknown",
    shareLinkId: grupo.share_link_id,
  });

  const quem = grupo.convidou_nome?.trim() || grupo.convidou_email;
  const dias = grupo.weekdays.map((d) => DIAS[d]).filter(Boolean).join(", ");

  return (
    <main className={css.pagina} id="conteudo">
      <section className={css.cartao}>
        <p className={css.rotulo}>Convite</p>
        <h1 className={css.titulo}>{grupo.name}</h1>
        <p className={css.arena}>{grupo.partner_display_name}</p>

        <p className={`${css.quando} tempo`}>
          <Clock size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>
            {dias} · {grupo.start_time.slice(0, 5)}–{grupo.end_time.slice(0, 5)}
          </span>
        </p>

        {quem ? (
          <p className={css.quem}>
            <strong>{quem}</strong> te chamou.
          </p>
        ) : null}

        <MemberAvatars membros={[]} total={grupo.member_count} />
      </section>

      <p className={css.explicacao}>
        A câmera da quadra já tá lá. Quando alguém aperta o botão, a gente guarda os últimos 22
        segundos — e os lances ficam neste link, separados por rodada.
      </p>

      {sessao ? (
        <Aceitar token={token} />
      ) : (
        // Volta para CÁ depois do login, e não para a página do grupo: é a
        // segunda passagem por aqui que oferece o botão de entrar.
        <Button
          href={`/entrar?redirectTo=${encodeURIComponent(`/convite/${token}`)}&arena=${grupo.partner_slug}`}
          tamanho={56}
          largura="total"
        >
          Entrar pra ver meus lances
        </Button>
      )}

      <p className={css.nota}>
        Entrar no grupo liga o resumo semanal por e-mail — e ele se desliga num clique, no seu
        perfil ou no rodapé da mensagem. O grupo organiza os lances; ele não decide quem pode
        ver os vídeos.
      </p>

      <Button href={destino} variante="fantasma" largura="total">
        Só quero ver a página
      </Button>
    </main>
  );
}

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function ConviteInvalido() {
  return (
    <main className={css.pagina} id="conteudo">
      <EmptyState
        icone={<Users size={24} />}
        titulo="Este convite não vale mais"
        descricao="O link pode ter expirado (eles valem 14 dias), ter sido revogado, ou o grupo pode ter sido apagado. Peça um convite novo para quem te chamou."
        acoes={
          <Button href="/app" variante="secundario" largura="total">
            Ver as arenas
          </Button>
        }
      />
    </main>
  );
}

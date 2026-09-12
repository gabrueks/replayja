import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { contarAberturaDoLink, registrarCompartilhamento } from "@/db/queries/compartilhamento";
import { entrarNoGrupo, grupoPorTokenDeConvite } from "@/db/queries/grupo";
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
// ─── A ORDEM É: TOKEN → LOGIN → MEMBRO → GRUPO ─────────────────────────────
//
// O token é resolvido ANTES do login, de propósito: um token morto tem de dizer
// "este convite não vale mais" em vez de mandar a pessoa fazer login para só
// então decepcioná-la. Depois do login, entrar é automático — quem abriu um
// link de convite já disse o que queria, e uma tela de "confirmar" no meio só
// perde gente.
//
// O grupo é ABERTO por link (decisão do piloto, `db/queries/grupo.ts`): não há
// aprovação do dono. O grupo não esconde clipe nenhum, então uma fila de
// aprovação protegeria o que já não está protegido.

export default async function Convite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!dbConfigured()) notFound();

  // O `CHECK` da tabela é `[A-Za-z0-9_-]{8,32}`; conferir aqui evita uma ida ao
  // banco por scanner.
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return <ConviteInvalido />;

  const grupo = await grupoPorTokenDeConvite(token);
  if (!grupo) return <ConviteInvalido />;

  const sessao = await getSession();
  const destino = `/${grupo.partner_slug}/${grupo.slug}`;

  if (!sessao) {
    await contarAberturaDoLink(grupo.share_link_id);
    await registrarCompartilhamento(null, {
      partnerId: grupo.partner_id,
      action: "opened",
      channel: "unknown",
      shareLinkId: grupo.share_link_id,
    });
    // Volta para CÁ depois do login (e não para a página do grupo): é a segunda
    // passagem por aqui que adiciona a pessoa como membro.
    redirect(`/entrar?redirectTo=${encodeURIComponent(`/convite/${token}`)}&arena=${grupo.partner_slug}`);
  }

  const resultado = await entrarNoGrupo(sessao, grupo.id, grupo.created_by);

  await contarAberturaDoLink(grupo.share_link_id);
  await registrarCompartilhamento(sessao, {
    partnerId: grupo.partner_id,
    // `signup_from_link` é a conversão que o painel do parceiro mostra: o link
    // que virou membro, não só o link que foi aberto.
    action: resultado === "entrou" ? "signup_from_link" : "opened",
    channel: "unknown",
    shareLinkId: grupo.share_link_id,
  });

  redirect(destino);
}

function ConviteInvalido() {
  return (
    <main className={css.pagina} id="conteudo">
      <EmptyState
        icone={<Users size={24} />}
        titulo="Este convite não vale mais"
        descricao="O link pode ter sido revogado, ou o grupo pode ter sido apagado. Peça um convite novo para quem te chamou."
        acoes={
          <Button href="/app" variante="secundario" largura="total">
            Ver as arenas
          </Button>
        }
      />
    </main>
  );
}

import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck, Users } from "lucide-react";
import { Secao } from "@/components/ui";
import { iniciais } from "@/components/ui/MemberAvatars";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { meusGrupos } from "@/db/queries/grupo";
import { arenasDoAdmin } from "@/db/queries/parceiro";
import css from "./perfil.module.css";

export const metadata = { title: "Seu perfil", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/perfil` — a quarta aba.
 *
 * ─── ELA É CURTA DE PROPÓSITO ──────────────────────────────────────────────
 *
 * O produto não tem conta para configurar: não há senha, não há foto de perfil e
 * não vai haver (o produto já grava imagem de pessoa em espaço semipúblico;
 * abrir um segundo acervo de rosto aumentaria a superfície de LGPD sem nenhum
 * ganho). O que cabe aqui é: quem você é, o que é seu, e como sair.
 *
 * ─── "SAIR" MUDOU DE LUGAR, E ISSO É PRODUTO ───────────────────────────────
 *
 * Na v1 "Sair" era o único link do cabeçalho, visível em toda tela logada — o
 * link mais destacado de um app cujo objetivo é a pessoa ficar. Aqui ele existe,
 * em texto e sem ênfase, onde quem procura sair vai procurar.
 *
 * ─── O ATALHO DO PAINEL SÓ APARECE PARA QUEM É ADMIN ───────────────────────
 *
 * E o papel vem do BANCO (`arenasDoAdmin`), nunca do cookie: a ADR §4.4 tirou
 * autorização da sessão justamente para não existir "o cookie diz que sou admin
 * de uma arena que já me removeu".
 */
export default async function Perfil() {
  const sessao = await getSession();

  const [grupos, arenas] =
    dbConfigured() && sessao
      ? await Promise.all([meusGrupos(sessao), arenasDoAdmin(sessao).catch(() => [])])
      : [[], []];

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <span className={css.avatar} aria-hidden="true">
          {iniciais(sessao?.email ?? "?")}
        </span>
        <span className={css.textos}>
          <span className={css.titulo}>Você</span>
          <span className={css.email}>{sessao?.email}</span>
        </span>
      </header>

      <Secao titulo={<span className="rotulo">O que é seu</span>}>
        <ul className={css.lista}>
          <li>
            <Link className={css.item} href="/app/grupos">
              <span className={css.itemIcone} aria-hidden="true">
                <Users size={18} />
              </span>
              <span className={css.itemTextos}>
                <span className={css.itemNome}>Meus grupos</span>
                <span className={`${css.itemApoio} tempo`}>
                  {grupos.length} {grupos.length === 1 ? "pelada salva" : "peladas salvas"}
                </span>
              </span>
              <ChevronRight size={20} className={css.seta} aria-hidden="true" />
            </Link>
          </li>

          {arenas.length > 0 ? (
            <li>
              <Link className={css.item} href="/painel">
                <span className={css.itemIcone} aria-hidden="true">
                  <ShieldCheck size={18} />
                </span>
                <span className={css.itemTextos}>
                  <span className={css.itemNome}>Painel da arena</span>
                  <span className={css.itemApoio}>
                    {arenas.map((a) => a.display_name).join(" · ")}
                  </span>
                </span>
                <ChevronRight size={20} className={css.seta} aria-hidden="true" />
              </Link>
            </li>
          ) : null}
        </ul>
      </Secao>

      <Secao titulo={<span className="rotulo">Privacidade</span>}>
        <p className={css.aviso}>
          A gente guarda o seu e-mail para saber a quem mostrar os lances e para você
          compartilhar. Só isso — sem senha, sem foto de perfil, sem cadastro. As quadras são
          filmadas pela arena, e quem grava é ela: para pedir a remoção de um vídeo, fale com a
          arena onde você jogou.
        </p>
      </Secao>

      <Link className={css.sair} href="/sair">
        <LogOut size={18} aria-hidden="true" />
        Sair desta conta
      </Link>
    </main>
  );
}

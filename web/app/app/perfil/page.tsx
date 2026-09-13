import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck, Users } from "lucide-react";
import { Card, Interruptor, Secao } from "@/components/ui";
import { iniciais } from "@/components/ui/MemberAvatars";
import { dbConfigured } from "@/lib/db";
import { ADMINISTRA_A_ARENA, TITULOS } from "@/lib/copy";
import { diasCurtos, hhmm } from "@/lib/datas";
import { plural } from "@/lib/plural";
import { getSession } from "@/lib/session";
import { avisosDoUsuario, meusGrupos } from "@/db/queries/grupo";
import { arenasDoAdmin } from "@/db/queries/parceiro";
import { alternarAvisoDoGrupo } from "./acoes";
import css from "./perfil.module.css";

export const metadata = { title: TITULOS.perfil, robots: { index: false, follow: false } };
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

  const [grupos, arenas, avisos] =
    dbConfigured() && sessao
      ? await Promise.all([
          meusGrupos(sessao),
          arenasDoAdmin(sessao).catch(() => []),
          avisosDoUsuario(sessao),
        ])
      : [[], [], []];

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
                <span className={css.itemNome}>Suas peladas</span>
                <span className={`${css.itemApoio} tempo`}>
                  {plural(grupos.length, "pelada salva", "peladas salvas")}
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
                  {/*
                    "ADMINISTRA A ARENA", e nunca "admin" (D-1 do relatório de
                    QA). Dono de GRUPO e admin de ARENA são dois conjuntos de
                    poderes diferentes, e a confusão entre os dois custou uma
                    auditoria inteira: dono de grupo edita a pelada, convida e
                    remove membro; admin de arena mexe em câmera, chave RTMP,
                    botão e remoção de vídeo.

                    Esta linha é o único lugar do app do atleta em que o segundo
                    aparece, e é aqui que ele precisa dizer o próprio nome.
                  */}
                  <span className={css.itemNome}>{ADMINISTRA_A_ARENA}</span>
                  <span className={css.itemApoio}>
                    {arenas.map((a) => a.display_name).join(" · ")} · câmera, botão e vídeos
                  </span>
                </span>
                <ChevronRight size={20} className={css.seta} aria-hidden="true" />
              </Link>
            </li>
          ) : null}
        </ul>
      </Secao>

      {/*
        ─── AVISOS POR E-MAIL ───────────────────────────────────────────────
        O único lugar do produto onde a pessoa liga e desliga o que chega na
        caixa de entrada dela. A lista é POR GRUPO porque a preferência é por
        participação (`play_group_member.notify_weekly`): quem joga em três
        peladas costuma querer só a de sexta, e um interruptor único por conta
        faria "não quero o da terça" virar "não quero nenhum".

        O código de login NÃO aparece aqui, e a frase abaixo diz isso. Uma tela
        de notificações que parece controlar tudo produz a pessoa que desliga e
        depois não consegue entrar na conta.
      */}
      <Secao titulo={<span className="rotulo">Avisos por e-mail</span>}>
        {avisos.length === 0 ? (
          <Card>
            <p className="apoio">
              Você ainda não está em nenhum grupo. Quando entrar, o resumo da rodada chega aqui —
              e o interruptor pra desligar aparece nesta lista.
            </p>
          </Card>
        ) : (
          <ul className={css.lista}>
            {avisos.map((a) => (
              <li key={a.play_group_id}>
                <Interruptor
                  id={`aviso-${a.play_group_id}`}
                  ligado={a.notify_weekly}
                  aoMudar={alternarAvisoDoGrupo.bind(null, a.play_group_id)}
                  apoio={
                    <>
                      {a.partner_display_name} ·{" "}
                      {diasCurtos(a.weekdays)} às{" "}
                      {hhmm(a.start_time)}
                    </>
                  }
                >
                  {a.name}
                </Interruptor>
              </li>
            ))}
          </ul>
        )}
        <p className={css.aviso}>
          O resumo chega na manhã seguinte à pelada, com os lances daquela rodada. O código de
          login não passa por aqui — ele continua chegando sempre.
        </p>
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

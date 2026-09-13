import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogOut, Trash2 } from "lucide-react";
import { AcaoConfirmada, BottomNav, Card, Secao, Voltar } from "@/components/ui";
import { ARRUMAR_GRUPO, DONO_DA_PELADA, NA_PELADA, TITULOS, naPelada } from "@/lib/copy";
import { dataHoraNaArena, hhmm } from "@/lib/datas";
import { dbConfigured } from "@/lib/db";
import { plural } from "@/lib/plural";
import { getSession } from "@/lib/session";
import { ehSlugDeArena, ehSlugDeGrupo } from "@/lib/slug";
import { papelNoGrupo } from "@/db/queries/autorizacao";
import { convitesDoGrupo } from "@/db/queries/compartilhamento";
import { grupoParaEdicao, grupoPorSlug, membrosDoGrupo } from "@/db/queries/grupo";
import { quadrasDoParceiro } from "@/db/queries/parceiro";
import { removerMembro, revogarConvite, sairDoGrupoDaArena } from "../acoes";
import { FormularioDeEdicao } from "./FormularioDeEdicao";
import css from "./editar.module.css";

export const metadata: Metadata = {
  // "Editar grupo" na aba e "Arrumar o grupo" na tela (achado P1-17).
  title: TITULOS.editarGrupo,
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// `/[arenaSlug]/[groupSlug]/editar` — A TELA DO DONO.
//
// ─── UMA TELA SÓ, E NÃO QUATRO ─────────────────────────────────────────────
//
// Editar o horário, tirar alguém, cortar um convite e sair do grupo são quatro
// ações diferentes com um único público: quem cuida da pelada. Elas cabem numa
// tela porque é assim que a pergunta chega ("preciso arrumar o grupo"), e porque
// quatro telas exigiriam uma navegação própria para um espaço que a pessoa abre
// três vezes por ano.
//
// ─── 404 PARA QUEM NÃO É DONO, NUNCA 403 ───────────────────────────────────
//
// `grupoParaEdicao` passa por `exigirDonoDoGrupo`, que já lança 404 para quem
// não é membro e 403 para membro comum. Aqui a tela captura os dois e responde
// `notFound()`: distinguir "não existe" de "você não pode" é um oráculo de
// enumeração (`api/README.md` §6), e num endereço adivinhável como
// `/<arena>/<grupo>/editar` isso vale dobrado.
//
// `editar` NÃO precisou virar slug reservado: esta rota é de TERCEIRO nível
// (`/<arena>/<grupo>/editar`), e um grupo chamado "editar" viveria em
// `/<arena>/editar`, onde não existe rota estática nenhuma. O que precisa de
// reserva é segmento que dispute o mesmo nível — `s`, `c`, `convite`.

type Props = { params: Promise<{ arenaSlug: string; groupSlug: string }> };

export default async function EditarGrupo({ params }: Props) {
  const { arenaSlug, groupSlug } = await params;
  if (!dbConfigured() || !ehSlugDeArena(arenaSlug) || !ehSlugDeGrupo(groupSlug)) notFound();

  const sessao = await getSession();
  const grupoBase = await grupoPorSlug(sessao, arenaSlug, groupSlug);
  if (!grupoBase) notFound();

  // `papelNoGrupo` não lança: é ele que decide o que RENDERIZAR. Quem não é dono
  // some daqui com 404 — e continua vendo a página do grupo normalmente.
  const papel = await papelNoGrupo(sessao, grupoBase.id);
  if (papel !== "owner") notFound();

  const [grupo, membros, convites, quadras] = await Promise.all([
    grupoParaEdicao(sessao, grupoBase.id),
    membrosDoGrupo(sessao, grupoBase.id),
    convitesDoGrupo(sessao, grupoBase.id),
    quadrasDoParceiro(grupoBase.partner_id),
  ]);
  if (!grupo) notFound();

  const caminho = `/${arenaSlug}/${groupSlug}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  const editadoPor = grupo.updated_by_name ?? grupo.updated_by_email;

  return (
    <>
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <Voltar para={caminho} rotulo="Voltar para o grupo" />
        <div>
          <h1 className={css.titulo}>{ARRUMAR_GRUPO}</h1>
          <p className={css.apoio}>
            {grupo.name} · {grupo.partner_display_name}
          </p>
        </div>
      </header>

      {/*
        O ENDEREÇO APARECE, E APARECE TRAVADO. Esconder o campo faria parecer
        esquecimento; mostrá-lo desabilitado com a razão ao lado responde a
        pergunta antes de ela virar um chamado de suporte.
      */}
      <Card>
        <p className={css.enderecoRotulo}>Endereço fixo</p>
        <p className={`${css.endereco} tempo`}>
          {base.replace(/^https?:\/\//, "")}
          {caminho}
        </p>
        <p className={css.enderecoNota}>
          O endereço não muda quando o nome muda. Ele está fixado no WhatsApp da turma há semanas
          — trocá-lo quebraria todo link já compartilhado, em silêncio.
        </p>
      </Card>

      <FormularioDeEdicao
        arenaSlug={arenaSlug}
        groupSlug={groupSlug}
        quadras={quadras.map((q) => ({
          id: q.slug,
          nome: q.name,
          esporte: q.sport,
        }))}
        inicial={{
          nome: grupo.name,
          descricao: grupo.description ?? "",
          esporte: grupo.sport ?? "quadra",
          dias: grupo.weekdays,
          inicio: hhmm(grupo.start_time),
          fim: hhmm(grupo.end_time),
          quadra: grupo.all_courts ? "todas" : (grupo.court_slug ?? "todas"),
          visibilidade: grupo.visibility,
        }}
      />

      <p className={css.historico}>
        {/*
          "ÚLTIMA MUDANÇA 13 DE SET., 10:45" COM O RELÓGIO DA ARENA EM 07:45
          (achado P1-10). Três horas à frente: estava em UTC.

          A causa era um `new Intl.DateTimeFormat("pt-BR", {…})` SEM `timeZone`,
          num Server Component — e na Vercel a máquina roda em UTC. Num produto
          cujo dado central é horário, a tela do dono mostrava a hora errada.

          `dataHoraNaArena` exige o fuso como argumento, sem valor padrão: não há
          como escrever esta linha errada de novo sem o TypeScript reclamar.
        */}
        Última mudança {dataHoraNaArena(new Date(grupo.updated_at), grupo.timezone)}
        {editadoPor ? `, por ${editadoPor}` : ""}.
      </p>

      <Secao
        titulo={<span className="rotulo">Quem está no grupo</span>}
        /* Uma palavra por contagem — a mesma da página do grupo (P1-13). */
        acao={<span className="apoio-3 tempo">{naPelada(grupo.member_count)}</span>}
      >
        <ul className={css.lista}>
          {membros.map((m) => (
            <li key={m.id} className={css.item}>
              <span className={css.itemTextos}>
                <span className={css.itemNome}>{m.nome}</span>
                <span className={css.itemApoio}>
                  {/* Esta página é só do dono, então `email` vem preenchido. A máscara é a
                      rede: se a regra de autorização mudar, some o endereço, não
                      aparece "null". */}
                  {`${m.email ?? m.emailMascarado} · `}
                  {/* "Dono da pelada", nunca "dono" solto — dono de QUÊ era a
                      pergunta que abriu a auditoria de QA (D-1). */}
                  {m.role === "owner"
                    ? DONO_DA_PELADA
                    : m.status === "invited"
                      ? "Convidado"
                      : NA_PELADA}
                </span>
              </span>
              {m.user_id === sessao?.uid ? (
                <span className={css.voce}>você</span>
              ) : (
                <AcaoConfirmada
                  pergunta={`Tirar ${m.nome} do grupo?`}
                  confirmar="Tirar"
                  icone={<Trash2 size={16} />}
                  aoConfirmar={removerMembro.bind(null, arenaSlug, groupSlug, m.id)}
                  sucesso="Pronto, tirei do grupo."
                >
                  Tirar
                </AcaoConfirmada>
              )}
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo={<span className="rotulo">Convites valendo</span>}>
        {convites.length === 0 ? (
          <Card>
            <p className="apoio">
              Nenhum convite aberto. O botão &ldquo;Convidar&rdquo; na página do grupo cria um —
              ele vale 14 dias.
            </p>
          </Card>
        ) : (
          <ul className={css.lista}>
            {convites.map((c) => (
              <li key={c.id} className={css.item}>
                <span className={css.itemTextos}>
                  <span className={`${css.itemNome} tempo`}>/convite/{c.token}</span>
                  <span className={css.itemApoio}>
                    {c.criado_por_nome ?? c.criado_por_email ?? "alguém"} ·{" "}
                    {c.expires_at
                      ? `vale até ${dataHoraNaArena(new Date(c.expires_at), grupo.timezone)}`
                      : "sem prazo"}{" "}
                    · {plural(c.view_count, "abertura", "aberturas")} ·{" "}
                    {c.entradas} {c.entradas === 1 ? "entrou" : "entraram"}
                  </span>
                </span>
                <AcaoConfirmada
                  pergunta="Cortar este convite? Quem já entrou continua no grupo."
                  confirmar="Cortar"
                  icone={<Trash2 size={16} />}
                  aoConfirmar={revogarConvite.bind(null, arenaSlug, groupSlug, c.id)}
                  sucesso="Convite cortado. O link parou de valer."
                >
                  Cortar
                </AcaoConfirmada>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={<span className="rotulo">Sair</span>}>
        <Card>
          <p className="apoio">
            Se você sair, o grupo continua vivo: o banco promove automaticamente a pessoa mais
            antiga da pelada a dono, e o link fixo segue funcionando.
          </p>
          <div className={css.sair}>
            <AcaoConfirmada
              pergunta={`Sair do ${grupo.name}?`}
              confirmar="Sair"
              icone={<LogOut size={16} />}
              aoConfirmar={sairDoGrupoDaArena.bind(null, arenaSlug, groupSlug)}
              destino="/app/grupos"
            >
              Sair do grupo
            </AcaoConfirmada>
          </div>
        </Card>
      </Secao>
    </main>
    {/* Editar exige ser dono, logo exige login: a barra é sempre renderizada. */}
    <BottomNav />
    </>
  );
}

import Link from "next/link";
import { Users } from "lucide-react";
import { Button, EmptyState, Secao } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { diaRelativoNaArena, horaNaArena, relogioDe } from "@/lib/fuso";
import { getSession } from "@/lib/session";
import { meusGruposDetalhado } from "@/db/queries/grupo";
import css from "./grupos.module.css";

export const metadata = { title: "Meus grupos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DIAS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const DIAS_LONGOS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/**
 * `/app/grupos` — os grupos de que o atleta faz parte.
 *
 * ─── AS DUAS LINHAS QUE FAZEM ALGUÉM VOLTAR ────────────────────────────────
 *
 * "Próximo: sexta, 20:00" e "Último lance: ontem às 21:03". Uma lista de nomes
 * de grupo é um índice; estas duas linhas são a razão de abrir o app sem ter
 * recebido link nenhum. As duas saem do SQL com `AT TIME ZONE` da arena — e o
 * "último lance" é filtrado pela JANELA do grupo, senão seria o último lance da
 * arena inteira e uma pelada de segunda mostraria o gol de quinta de outra
 * turma.
 *
 * ─── A CRIAÇÃO COMEÇA NA ARENA, NÃO AQUI ───────────────────────────────────
 *
 * O fluxo natural é "achei meus lances → esse horário se repete → salvar como
 * grupo", e o formulário mora em `/[arena]/grupos/novo` porque o grupo vive
 * dentro de uma arena. Um "criar grupo" nesta tela pediria arena, quadra, dias e
 * horário do zero — a fricção que a ponte pela sessão elimina. O que esta tela
 * oferece é o caminho: escolher a arena.
 */
export default async function Grupos() {
  const sessao = await getSession();
  const grupos = sessao && dbConfigured() ? await meusGruposDetalhado(sessao) : [];
  const agora = new Date();

  return (
    <main className={css.pagina} id="conteudo">
      <header>
        <h1 className={css.titulo}>Meus grupos</h1>
        <p className="apoio">O link fixo da pelada, com os vídeos separados por semana.</p>
      </header>

      <Secao titulo={`${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`}>
        {grupos.length === 0 ? (
          <EmptyState
            icone={<Users size={24} />}
            titulo="Nenhum grupo ainda"
            descricao="Ache os lances de uma pelada e salve aquele horário como grupo. Toda semana os vídeos aparecem sozinhos no mesmo link, e quem você convidar entra com um toque."
            acoes={
              <Button href="/app" variante="secundario" largura="total">
                Escolher a arena
              </Button>
            }
          />
        ) : (
          <ul className={css.lista}>
            {grupos.map((g) => {
              const ultimo = g.ultimo_lance_em ? new Date(g.ultimo_lance_em) : null;
              return (
                <li key={g.id}>
                  <Link className={css.grupo} href={`/${g.partner_slug}/${g.slug}`}>
                    <span className={css.nome}>{g.name}</span>
                    <span className={`${css.apoio} tempo`}>
                      {g.partner_display_name} ·{" "}
                      {g.weekdays.map((d) => DIAS[d]).filter(Boolean).join(", ")} ·{" "}
                      {g.start_time.slice(0, 5)}–{g.end_time.slice(0, 5)}
                    </span>
                    <span className={css.linhas}>
                      <span className={`${css.proximo} tempo`}>
                        {g.proxima_data
                          ? `Próximo: ${diaDaProxima(g.proxima_data, g.timezone, agora)} às ${g.start_time.slice(0, 5)}`
                          : "Sem próximo horário"}
                      </span>
                      <span className={`${css.ultimo} tempo`}>
                        {ultimo
                          ? `Último lance ${diaRelativoNaArena(ultimo, g.timezone, agora).toLowerCase()} às ${horaNaArena(ultimo, g.timezone)}`
                          : "Nenhum lance ainda"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <p className={css.nota}>
        Para criar um grupo novo, abra a arena e busque o horário da pelada: o botão &ldquo;Salvar
        como grupo&rdquo; já leva quadra, dia e horário preenchidos.
      </p>
    </main>
  );
}

/**
 * "hoje", "amanhã" ou "sexta" — a partir da data local que o SQL devolveu.
 *
 * A comparação é entre DATAS LOCAIS DA ARENA (texto `AAAA-MM-DD`), nunca contra
 * o relógio da máquina: a função da Vercel roda em UTC, e às 21h de São Paulo já
 * é o dia seguinte lá — a pelada de hoje viraria "amanhã".
 */
function diaDaProxima(iso: string, tz: string, agora: Date): string {
  if (iso === relogioDe(agora, tz).data) return "hoje";
  if (iso === relogioDe(new Date(agora.getTime() + 86_400_000), tz).data) return "amanhã";
  // `T12:00:00Z` no meio do dia: qualquer fuso do Brasil cai no mesmo dia, e o
  // clássico "um dia a menos" de `new Date('2026-09-08')` não acontece.
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 12));
  if (Number.isNaN(d.getTime())) return iso;
  const iso7 = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return DIAS_LONGOS[iso7] ?? iso;
}

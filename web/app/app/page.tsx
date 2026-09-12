import Link from "next/link";
import { MapPin, Search, Users } from "lucide-react";
import { Button, EmptyState, Secao, StatusDot } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { diaRelativoNaArena, horaNaArena } from "@/lib/fuso";
import { getSession } from "@/lib/session";
import { urlPublica } from "@/lib/storage";
import { meusGrupos } from "@/db/queries/grupo";
import { arenasPublicas, minhasArenas, type ArenaDaListaRow } from "@/db/queries/parceiro";
import pagina from "./arenas.module.css";

export const metadata = { title: "Onde você jogou?", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app` — a ESCOLHA DA ARENA, e só ela.
 *
 * ─── POR QUE ESTA TELA EXISTE (E POR QUE A BUSCA SAIU DAQUI) ───────────────
 *
 * O PRD define o fluxo em duas etapas: "Arena/parceiro → horário → vídeos".
 * A versão anterior pulava a primeira: `/app` levava direto a "Buscar lances",
 * que já abria ancorado numa arena ADIVINHADA (`arenaDeReferencia`). Quando o
 * palpite estava errado — e ele está errado para qualquer pessoa que jogue em
 * mais de um lugar, ou que ainda não tenha história nenhuma — o atleta via
 * "nenhum lance nesse horário" e concluía que o produto não gravou. O sintoma
 * ("meio bugado") era de tela; a causa era de fluxo.
 *
 * Agora a arena é sempre uma ESCOLHA, e `/app/buscar` recusa rodar sem ela.
 *
 * ─── A BUSCA DE ARENA É UM `<form method="get">` ───────────────────────────
 *
 * Sem ilha de cliente: o formulário navega para `/app?q=…` e quem consulta é
 * esta página. O resultado vira link (dá para mandar `/app?q=vasco` no
 * WhatsApp), o botão voltar funciona, e a tela continua chegando pronta no 4G da
 * quadra — que é onde ela é usada.
 */
export default async function EscolherArena({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await getSession();
  const { q } = await searchParams;
  const termo = (q ?? "").trim();
  const buscando = termo.length > 0;

  const [minhas, todas, grupos] =
    dbConfigured() && sessao
      ? await Promise.all([
          buscando ? Promise.resolve([]) : minhasArenas(sessao),
          arenasPublicas(termo),
          meusGrupos(sessao),
        ])
      : [[], [], []];

  // Uma arena que já está em "Minhas arenas" não se repete logo abaixo: a mesma
  // linha duas vezes na mesma tela faz o atleta achar que são lugares diferentes.
  const jaListadas = new Set(minhas.map((a) => a.id));
  const outras = todas.filter((a) => !jaListadas.has(a.id));

  return (
    <main className={pagina.pagina} id="conteudo">
      <header className={pagina.cabecalho}>
        <h1 className={pagina.titulo}>Onde você jogou?</h1>
        <p className="apoio">
          Escolha a arena para ver os lances dela. Entrou como {sessao?.email}.
        </p>
      </header>

      <form className={pagina.busca} action="/app" method="get" role="search">
        <label className="apenas-leitor" htmlFor="q">
          Arena, quadra ou cidade
        </label>
        <div className={pagina.campo}>
          <Search size={20} aria-hidden="true" className={pagina.campoIcone} />
          <input
            id="q"
            name="q"
            className={pagina.entrada}
            placeholder="Arena, quadra ou cidade"
            defaultValue={termo}
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <Button type="submit" tamanho={52} icone={<Search size={18} />}>
          Buscar
        </Button>
      </form>

      {minhas.length > 0 ? (
        <Secao titulo="Você jogou aqui">
          <ListaDeArenas arenas={minhas} />
        </Secao>
      ) : null}

      <Secao
        titulo={buscando ? `Resultados para “${termo}”` : "Todas as arenas"}
        acao={
          buscando ? (
            <Link className={pagina.limpar} href="/app">
              Limpar
            </Link>
          ) : null
        }
      >
        {outras.length === 0 ? (
          <EmptyState
            icone={<MapPin size={24} />}
            titulo={buscando ? "Nenhuma arena com esse nome" : "Nenhuma arena disponível ainda"}
            descricao={
              buscando
                ? "Tente pelo nome da cidade, ou abra o endereço que a arena divulga (replayja.com.br/nome-da-arena)."
                : "Assim que uma arena publicar a página dela, ela aparece aqui."
            }
            acoes={
              buscando ? (
                <Button href="/app" variante="secundario" largura="total">
                  Ver todas as arenas
                </Button>
              ) : null
            }
          />
        ) : (
          <ListaDeArenas arenas={outras} />
        )}
      </Secao>

      {grupos.length > 0 ? (
        <Secao
          titulo="Seus grupos"
          acao={
            <Button href="/app/grupos" variante="fantasma" tamanho={44}>
              Ver todos
            </Button>
          }
        >
          <ul className={pagina.lista}>
            {grupos.slice(0, 3).map((g) => (
              <li key={g.id}>
                <Link className={pagina.grupo} href={`/${g.partner_slug}/${g.slug}`}>
                  <span className={pagina.grupoIcone} aria-hidden="true">
                    <Users size={18} />
                  </span>
                  <span>
                    <span className={pagina.grupoNome}>{g.name}</span>
                    <span className={`${pagina.grupoApoio} tempo`}>
                      {g.partner_display_name} · {g.start_time.slice(0, 5)}–
                      {g.end_time.slice(0, 5)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}
    </main>
  );
}

function iniciaisDe(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "A";
  const b = partes.length > 1 ? (partes[1]?.[0] ?? "") : (partes[0]?.[1] ?? "");
  return (a + b).toUpperCase();
}

function logoSegura(objectKey: string | null): string | null {
  if (!objectKey) return null;
  try {
    return urlPublica(objectKey);
  } catch {
    return null;
  }
}

/** "gravando agora" quando o último segmento tem menos de 2 minutos. */
const GRAVANDO_MS = 2 * 60 * 1000;

function ListaDeArenas({ arenas }: { arenas: ArenaDaListaRow[] }) {
  const agora = new Date();

  return (
    <ul className={pagina.lista}>
      {arenas.map((a) => {
        const local = [a.city, a.state].filter(Boolean).join(" · ");
        const logo = logoSegura(a.logo_object_key);
        const ultima = a.ultima_gravacao ? new Date(a.ultima_gravacao) : null;
        const aoVivo = ultima !== null && agora.getTime() - ultima.getTime() < GRAVANDO_MS;

        return (
          <li key={a.id}>
            {/*
              O destino é `/app/buscar?arena=<slug>` e não a página pública da
              arena: quem está aqui já entrou e quer o horário dele. A página
              pública continua sendo o endereço que a ARENA divulga.
            */}
            <Link className={pagina.arena} href={`/app/buscar?arena=${a.slug}`}>
              <span className={pagina.brasao} aria-hidden="true">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className={pagina.logo} />
                ) : (
                  iniciaisDe(a.display_name)
                )}
              </span>

              <span className={pagina.arenaTexto}>
                <span className={pagina.arenaNome}>{a.display_name}</span>
                <span className={`${pagina.arenaApoio} tempo`}>
                  {[local || null, `${a.quadras} ${a.quadras === 1 ? "quadra" : "quadras"}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className={`${pagina.arenaApoio} tempo`}>
                  {ultima
                    ? `Última gravação ${diaRelativoNaArena(ultima, a.timezone, agora).toLowerCase()} às ${horaNaArena(ultima, a.timezone)}`
                    : "Sem gravação registrada ainda"}
                </span>
              </span>

              {aoVivo ? <StatusDot status="gravando" rotulo="ao vivo" pilula /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

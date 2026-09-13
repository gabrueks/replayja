import Link from "next/link";
import { Search, Users } from "lucide-react";
import { ArenaCard, EmptyState, Secao } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { ACHAR_LANCE_TITULO } from "@/lib/copy";
import { getSession } from "@/lib/session";
import { urlPublica } from "@/lib/storage";
import { meusGrupos } from "@/db/queries/grupo";
import { arenasPublicas, minhasArenas, type ArenaDaListaRow } from "@/db/queries/parceiro";
import pagina from "./arenas.module.css";

export const metadata = { title: ACHAR_LANCE_TITULO, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/app` — a ESCOLHA DA ARENA, e só ela.
 *
 * ─── POR QUE ESTA TELA EXISTE (E POR QUE A BUSCA SAIU DAQUI) ───────────────
 *
 * O PRD define o fluxo em duas etapas: "Arena/parceiro → horário → vídeos".
 * A versão anterior pulava a primeira: `/app` levava direto a "Buscar lances",
 * que já abria ancorado numa arena ADIVINHADA. Quando o palpite estava errado —
 * e ele está errado para qualquer pessoa que jogue em mais de um lugar — o
 * atleta via "nenhum lance nesse horário" e concluía que o produto não gravou. O
 * sintoma ("meio bugado") era de tela; a causa era de fluxo.
 *
 * ─── E POR QUE ELA VIROU UMA TELA DE FOTOS ─────────────────────────────────
 *
 * A arena que PAGA aparecia como um quadradinho de duas letras numa linha de
 * lista de 72px. Agora é um `ArenaCard` com 152px de capa, o estado "gravando
 * agora" no canto e o nome em display — é assim que o Zé mostra uma loja, e é o
 * que faz o card ser tocado a um braço de distância, de pé na quadra.
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

  // Uma arena que já está em "Você jogou aqui" não se repete logo abaixo: a
  // mesma linha duas vezes na mesma tela faz o atleta achar que são lugares
  // diferentes.
  const jaListadas = new Set(minhas.map((a) => a.id));
  const outras = todas.filter((a) => !jaListadas.has(a.id));

  return (
    <main className={pagina.pagina} id="conteudo">
      <header className={pagina.cabecalho}>
        {/*
          O título é a SITUAÇÃO, e ele é sempre o mesmo (`ACHAR_LANCE_TITULO`) — em
          toda tela onde a ação é a mesma (folha de voz da v2, regra 3). O que
          muda por tela é a linha de apoio, que diz o que fazer aqui.
        */}
        <h1 className={pagina.titulo}>
          Bora achar
          <br />
          seu lance.
        </h1>
        <p className={pagina.chamada}>Escolha a arena onde você jogou hoje.</p>
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
      </form>

      {minhas.length > 0 ? (
        <Secao titulo={<span className="rotulo">Você jogou aqui</span>}>
          <ListaDeArenas arenas={minhas} destaque />
        </Secao>
      ) : null}

      {/*
        O cadastro inteiro vazio (ou sem nenhuma arena pública) é o único caso em
        que a tela ficaria muda depois da correção do P1-12 — porque "Outras
        arenas" some quando não há outras. Aqui ele tem tela própria.
      */}
      {minhas.length === 0 && outras.length === 0 && !buscando ? (
        <EmptyState
          ilustracao="quadra"
          titulo="Nenhuma arena por aqui ainda."
          descricao="Assim que uma arena publicar a página dela, ela aparece aqui. Se você já joga numa arena com câmera, abre o endereço que ela divulga: replayja.com.br/nome-da-arena."
        />
      ) : null}

      {/*
        A SEÇÃO SOME QUANDO NÃO HÁ O QUE MOSTRAR (achado P1-12).

        A consulta de "todas" exclui as arenas já listadas em "você jogou aqui" —
        e o estado vazio não sabia disso. Com a Arena Vasco visível 40px acima, a
        seção logo abaixo dizia "Nenhuma arena por aqui ainda / Assim que uma
        arena publicar a página dela, ela aparece aqui". O produto se
        contradizendo na mesma tela, e lendo como bug de carregamento.

        Buscando, o vazio CONTINUA aparecendo: ali ele é a resposta à pergunta
        que a pessoa fez, e some-lo seria pior.
      */}
      {outras.length > 0 || buscando ? (
        <Secao
          titulo={
            <span className="rotulo">
              {buscando ? `Resultados para “${termo}”` : "Outras arenas"}
            </span>
          }
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
              ilustracao="quadra"
              titulo="Nenhuma arena com esse nome."
              descricao="Tenta pelo nome da cidade — ou abre o endereço que a arena divulga, replayja.com.br/nome-da-arena."
              nota={<Link href="/app">Ver todas as arenas</Link>}
            />
          ) : (
            <ListaDeArenas arenas={outras} />
          )}
        </Secao>
      ) : null}

      {grupos.length > 0 ? (
        <Secao
          titulo={<span className="rotulo">Seus grupos</span>}
          acao={
            <Link className={pagina.limpar} href="/app/grupos">
              Ver todos
            </Link>
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

function ListaDeArenas({ arenas, destaque }: { arenas: ArenaDaListaRow[]; destaque?: boolean }) {
  const agora = new Date();

  return (
    <ul className={pagina.lista}>
      {arenas.map((a) => {
        const local = [a.city, a.state].filter(Boolean).join(" · ");
        const ultima = a.ultima_gravacao ? new Date(a.ultima_gravacao) : null;
        const aoVivo = ultima !== null && agora.getTime() - ultima.getTime() < GRAVANDO_MS;

        return (
          <li key={a.id}>
            {/*
              O destino é `/app/buscar?arena=<slug>` e não a página pública da
              arena: quem está aqui já entrou e quer o horário dele. A página
              pública continua sendo o endereço que a ARENA divulga.
            */}
            <ArenaCard
              href={`/app/buscar?arena=${a.slug}`}
              nome={a.display_name}
              iniciais={iniciaisDe(a.display_name)}
              apoio={
                local ||
                a.tagline ||
                `${a.quadras} ${a.quadras === 1 ? "quadra" : "quadras"} com câmera`
              }
              logoUrl={logoSegura(a.logo_object_key)}
              gravando={aoVivo}
              selo={`${a.quadras} ${a.quadras === 1 ? "quadra" : "quadras"}`}
              altura={destaque ? 152 : 128}
            />
          </li>
        );
      })}
    </ul>
  );
}

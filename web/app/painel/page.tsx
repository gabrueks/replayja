import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  AvisoDeExemplo,
  Button,
  Card,
  EmptyState,
  Secao,
  StatusDot,
  type Status,
} from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { LANCES_POR_HORA_EXEMPLO, METRICAS_EXEMPLO } from "@/lib/fixtures";
import { exigirAdminDaArena } from "@/db/queries/autorizacao";
import { arenasDoAdmin, parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import { saudeDasCameras } from "@/db/queries/saude";
import MarcaDagua from "./MarcaDagua";
import css from "./painel.module.css";

export const metadata = { title: "Painel do parceiro", robots: { index: false, follow: false } };

/**
 * `/painel` — a visão geral da arena.
 *
 * ─── O PAINEL COMEÇA PELA PERGUNTA CERTA ───────────────────────────────────
 *
 * DE QUAIS ARENAS VOCÊ É ADMIN. A consulta (`arenasDoAdmin`) parte do `uid` da
 * sessão e não aceita `partnerId` de lugar nenhum. Quando a URL traz `?arena=`,
 * esse slug ainda passa por `exigirAdminDaArena` antes de qualquer dado da
 * operação aparecer — sem RLS, é essa chamada que separa "admin" de "logado".
 *
 * ─── O QUE É REAL E O QUE É EXEMPLO ────────────────────────────────────────
 *
 * Real: a lista de arenas, as quadras, a saúde das câmeras e o branding salvo.
 * Exemplo (com aviso na tela): os KPIs e o gráfico por horário — as consultas de
 * métrica são da C9. A tarja existe para o parceiro não ler "132 lances hoje"
 * como número dele.
 */
export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const sessao = await getSession();
  const { arena } = await searchParams;
  const arenas = dbConfigured() ? await arenasDoAdmin(sessao) : [];

  // Uma arena só? Abre direto nela. Fazer o dono de uma arena escolher entre uma
  // opção é um clique que não decide nada.
  const escolhida =
    (arena && ehSlugDeArena(arena) ? arena : null) ??
    (arenas.length === 1 ? (arenas[0]?.slug ?? null) : null);

  if (arenas.length === 0) {
    return (
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Painel</h1>
        <EmptyState
          titulo="Esta conta não administra nenhuma arena"
          descricao={`${sessao?.email ?? "Você"} não é admin de nenhuma arena parceira. Se você é dono de uma arena, peça o convite a quem já administra.`}
          acoes={
            <Button href="/app" variante="secundario" largura="total">
              Ir para a área do atleta
            </Button>
          }
        />
      </main>
    );
  }

  if (!escolhida) {
    return (
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Painel</h1>
        <Secao titulo="Escolha a arena">
          <ul className={css.cameras}>
            {arenas.map((a) => (
              <li key={a.id}>
                <Card href={`/painel?arena=${a.slug}`} titulo={a.display_name}>
                  <p className="apoio">{a.role}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Secao>
      </main>
    );
  }

  const parceiro = await parceiroPublicoPorSlug(escolhida);
  if (!parceiro) {
    return (
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Painel</h1>
        <p className="apoio">Arena não encontrada.</p>
      </main>
    );
  }

  // A CHECAGEM QUE IMPORTA. Sem ela, `?arena=` bastaria para ver a operação de
  // qualquer arena — e sem RLS não há nada no banco que barre isso.
  await exigirAdminDaArena(sessao, parceiro.id, "viewer");

  const [quadras, cameras] = await Promise.all([
    quadrasDoParceiro(parceiro.id),
    saudeDasCameras(parceiro.id),
  ]);

  const online = cameras.filter((c) => c.status === "online").length;
  const pico = Math.max(...LANCES_POR_HORA_EXEMPLO.map((h) => h.valor));
  const iniciais = parceiro.display_name.slice(0, 2).toUpperCase();

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>{parceiro.display_name}</h1>
          <p className={css.subtitulo}>
            Visão geral · {quadras.length} {quadras.length === 1 ? "quadra" : "quadras"}
          </p>
        </div>
        <Button
          href={`/${parceiro.slug}`}
          variante="secundario"
          tamanho={44}
          iconeDepois={<ExternalLink size={16} />}
        >
          Ver página pública
        </Button>
      </header>

      <Secao titulo="Números da semana">
        <AvisoDeExemplo o_que="Os quatro números abaixo e o gráfico por horário" />
        <ul className={css.kpis}>
          {METRICAS_EXEMPLO.map((m) => (
            <li key={m.id} className={css.kpi}>
              <span className={css.kpiRotulo}>{m.rotulo}</span>
              <span className={css.kpiValor}>{m.valor}</span>
              <span className={css.kpiApoio}>{m.apoio}</span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="Câmeras e gravação"
        acao={
          <span className="apoio-3">
            {online} de {cameras.length} online
          </span>
        }
      >
        {cameras.length === 0 ? (
          <Card>
            <p className="apoio">
              Nenhuma câmera cadastrada nesta arena ainda. O provisionamento é feito pela equipe
              do Replay já junto com a instalação.
            </p>
          </Card>
        ) : (
          <ul className={css.cameras}>
            {cameras.map((c) => {
              const cobertura = c.coverage_24h === null ? null : Number(c.coverage_24h);
              // 0,95–0,96 é câmera saudável; a mediana da frota é ~0,92; abaixo
              // de 0,90 é problema real, não ruído. Julgar SEMPRE pela janela de
              // 24 h: a de 1 h engana logo depois de qualquer reinício.
              const saudavel = cobertura !== null && cobertura >= 0.9;
              const estado: Status =
                c.status !== "online" ? "offline" : saudavel ? "online" : "gravando";
              return (
                <li key={c.id} className={css.camera}>
                  <div className={css.cameraTopo}>
                    <span className={css.cameraNome}>{c.court}</span>
                    <StatusDot
                      status={estado}
                      rotulo={c.status === "online" ? (saudavel ? "online" : "instável") : "offline"}
                      pilula
                    />
                  </div>
                  <span className={css.cameraApoio}>{c.name}</span>
                  <span className={css.cameraApoio}>
                    último segmento:{" "}
                    {c.since_seconds === null ? "nunca" : `há ${c.since_seconds}s`}
                    {cobertura !== null ? ` · cobertura ${(cobertura * 100).toFixed(1)}%` : ""}
                  </span>
                  <span className={css.cameraApoio}>
                    {c.long_segments_24h} oscilações em 24 h
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link className="apoio" href={`/painel/cameras?arena=${parceiro.slug}`}>
          Ver detalhe de cada câmera
        </Link>
      </Secao>

      <Secao titulo="Lances por horário" nivel={2}>
        <Card variante="painel" acessorio={`pico às ${LANCES_POR_HORA_EXEMPLO.find((h) => h.valor === pico)?.hora ?? ""}`}>
          {/*
            Um gráfico de barras em CSS puro: oito valores não justificam uma
            biblioteca de 40 kB no celular. A tabela acessível vem embaixo, porque
            barra desenhada com `div` não é lida por leitor de tela.
          */}
          <div className={css.grafico} aria-hidden="true">
            {LANCES_POR_HORA_EXEMPLO.map((h) => (
              <div key={h.hora} className={css.coluna}>
                <div
                  className={[css.barra, h.valor === pico ? css.barraPico : null]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ height: `${Math.round((h.valor / pico) * 100)}%` }}
                />
                <span className={css.horaRotulo}>{h.hora}</span>
              </div>
            ))}
          </div>
          <p className="apenas-leitor">
            Lances por horário:{" "}
            {LANCES_POR_HORA_EXEMPLO.map((h) => `${h.hora}, ${h.valor} lances`).join("; ")}.
          </p>
        </Card>
      </Secao>

      <Secao titulo="Página da arena">
        <Card variante="painel">
          <div className={css.branding}>
            <div className={css.campoBranding}>
              <span className="rotulo">Logo</span>
              <div className={css.logoLinha}>
                <span className={css.logoCaixa}>{iniciais}</span>
                <div>
                  <p className="apoio">PNG com fundo transparente, 512px.</p>
                  <Button variante="secundario" tamanho={44} disabled>
                    Trocar imagem
                  </Button>
                </div>
              </div>
            </div>

            <div className={css.campoBranding}>
              <span className="rotulo">Cor de destaque</span>
              {/*
                Os três hex ao lado do acento NÃO são tokens do sistema: são as
                alternativas que o canvas oferecia no chip de marca, mostradas
                aqui só como amostra do que a arena poderá escolher. Todo o resto
                do produto usa `var(--cor-acento)`.
              */}
              <div className={css.cores}>
                {["var(--cor-acento)", "#C8FF3D", "#31D0FF", "#FF3D6E"].map((cor, i) => (
                  <span
                    key={cor}
                    className={[css.cor, i === 0 ? css.corAtiva : null].filter(Boolean).join(" ")}
                    style={{ background: cor }}
                    title={i === 0 ? "Laranja do Replay já (padrão)" : cor}
                  />
                ))}
              </div>
              <p className="apoio-3">
                A cor da arena entra junto com o upload de logo. Hoje todas as páginas usam o
                laranja do Replay já.
              </p>
            </div>
          </div>
        </Card>
      </Secao>

      <Secao titulo={<>Marca d&rsquo;água</>}>
        <Card variante="painel">
          <MarcaDagua
            arena={parceiro.display_name}
            iniciais={iniciais}
            ativa={parceiro.watermark_enabled}
          />
        </Card>
      </Secao>
    </main>
  );
}

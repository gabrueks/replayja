import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button, Card, EmptyState, Secao, StatusDot } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { formatarIdade, lerSaudeDaCamera, porcentagem } from "@/lib/saude-visao";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { exigirAdminDaArena } from "@/db/queries/autorizacao";
import { arenasDoAdmin, parceiroPublicoPorSlug, quadrasDoParceiro } from "@/db/queries/parceiro";
import {
  lancesPorHoraNaArena,
  metricasDaArena,
  saudeDasCameras,
  saudeDoRelay,
} from "@/db/queries/saude";
import MarcaDagua from "./MarcaDagua";
import css from "./painel.module.css";

export const metadata = { title: "Painel do parceiro", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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
 * ─── NÃO HÁ MAIS FIXTURE AQUI ──────────────────────────────────────────────
 *
 * Os KPIs e o gráfico por horário vinham de `lib/fixtures.ts` com uma tarja de
 * aviso. Num piloto real isso é pior que não ter número nenhum: "132 lances
 * hoje" numa arena que gravou 4 é exatamente o tipo de coisa que o parceiro
 * printa e manda no grupo dele. Agora tudo vem de `clip`/`trigger_event`, e o
 * zero aparece como zero.
 *
 * ─── E O ESTADO DA CÂMERA VEM DO ENUM DE VERDADE ───────────────────────────
 *
 * `camera_status` é `provisioned | recording | degraded | down | disabled` — não
 * existe `online`. A leitura mora em `lib/saude-visao.ts`, com teste, porque
 * comparar com a string errada fazia TODA câmera aparecer offline.
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

  const [quadras, cameras, metricas, porHora] = await Promise.all([
    quadrasDoParceiro(parceiro.id),
    saudeDasCameras(parceiro.id),
    metricasDaArena(parceiro.id, parceiro.timezone),
    lancesPorHoraNaArena(parceiro.id, parceiro.timezone),
  ]);

  const relay = await saudeDoRelay(cameras[0]?.relay_node_id ?? null).catch(() => null);

  const leituras = cameras.map((c) => ({ camera: c, saude: lerSaudeDaCamera(c) }));
  const gravando = leituras.filter((l) => l.saude.estado === "gravando").length;
  const aguardando = leituras.filter((l) => l.saude.estado === "aguardando").length;

  const pico = porHora.reduce((m, h) => Math.max(m, h.total), 0);
  const iniciais = parceiro.display_name.slice(0, 2).toUpperCase();

  const kpis = [
    { id: "hoje", rotulo: "Lances hoje", valor: metricas.lances_hoje, apoio: "no horário da arena" },
    { id: "semana", rotulo: "Lances na semana", valor: metricas.lances_7d, apoio: "últimos 7 dias" },
    { id: "atletas", rotulo: "Atletas na semana", valor: metricas.atletas_7d, apoio: "salvaram ao menos um lance" },
    {
      id: "share",
      rotulo: "Compartilhamentos",
      valor: metricas.compartilhamentos_7d,
      apoio: "com a marca da arena",
    },
  ];

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
        <ul className={css.kpis}>
          {kpis.map((m) => (
            <li key={m.id} className={css.kpi}>
              <span className={css.kpiRotulo}>{m.rotulo}</span>
              <span className={css.kpiValor}>{m.valor}</span>
              <span className={css.kpiApoio}>{m.apoio}</span>
            </li>
          ))}
        </ul>
        {metricas.gatilhos_recusados_24h > 0 ? (
          <p className="apoio-3">
            {metricas.gatilhos_recusados_24h} acionamento
            {metricas.gatilhos_recusados_24h === 1 ? " foi recusado" : "s foram recusados"} nas
            últimas 24 h (câmera fora do ar, toque repetido ou quadra sem câmera).
            {metricas.clipes_parciais_7d > 0
              ? ` ${metricas.clipes_parciais_7d} lance(s) saíram parciais na semana.`
              : ""}
          </p>
        ) : null}
      </Secao>

      <Secao
        titulo="Câmeras e gravação"
        acao={
          <span className="apoio-3">
            {gravando} de {cameras.length} gravando
            {aguardando > 0 ? ` · ${aguardando} aguardando relay` : ""}
          </span>
        }
      >
        {relay ? (
          <p className="apoio-3">
            Relay {relay.id}:{" "}
            {relay.ultimo_heartbeat
              ? `último sinal ${formatarIdade(relay.desde_segundos ?? 0)}`
              : "nunca reportou"}
            {relay.disco_livre ? ` · ${porcentagem(Number(relay.disco_livre), 0)} de disco livre` : ""}
            {relay.jobs_pendentes > 0 ? ` · ${relay.jobs_pendentes} corte(s) na fila` : ""}
          </p>
        ) : null}

        {cameras.length === 0 ? (
          <Card>
            <p className="apoio">
              Nenhuma câmera cadastrada nesta arena ainda. O provisionamento é feito pela equipe
              do Replay já junto com a instalação.
            </p>
          </Card>
        ) : (
          <ul className={css.cameras}>
            {leituras.map(({ camera: c, saude }) => (
              <li key={c.id} className={css.camera}>
                <div className={css.cameraTopo}>
                  <span className={css.cameraNome}>{c.court}</span>
                  <StatusDot status={saude.ponto} rotulo={saude.rotulo} pilula />
                </div>
                <span className={css.cameraApoio}>{c.name}</span>
                <span className={css.cameraApoio}>
                  {saude.estado === "aguardando"
                    ? "nenhum segmento recebido ainda — a câmera nunca conectou no relay"
                    : `último segmento ${saude.ultimoSegmento}${
                        saude.cobertura !== null
                          ? ` · cobertura 24 h ${porcentagem(saude.cobertura)}`
                          : ""
                      }`}
                </span>
                <span className={css.cameraApoio}>
                  {c.long_segments_24h} oscilações em 24 h
                  {!saude.relayOnline ? " · relay sem sinal" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link className="apoio" href={`/painel/cameras?arena=${parceiro.slug}`}>
          Ver detalhe de cada câmera
        </Link>
      </Secao>

      <Secao titulo="Lances por horário" nivel={2}>
        <Card
          variante="painel"
          acessorio={
            pico > 0 ? `pico às ${porHora.find((h) => h.total === pico)?.hora ?? ""}` : "sem dados"
          }
        >
          {porHora.length === 0 ? (
            <p className="apoio">
              Nenhum lance gravado nos últimos 7 dias. O gráfico aparece assim que o primeiro
              botão for apertado.
            </p>
          ) : (
            <>
              {/*
                Um gráfico de barras em CSS puro: poucos valores não justificam
                uma biblioteca de 40 kB no celular. A tabela acessível vem
                embaixo, porque barra desenhada com `div` não é lida por leitor
                de tela.
              */}
              <div className={css.grafico} aria-hidden="true">
                {porHora.map((h) => (
                  <div key={h.hora} className={css.coluna}>
                    <div
                      className={[css.barra, h.total === pico ? css.barraPico : null]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ height: `${Math.round((h.total / pico) * 100)}%` }}
                    />
                    <span className={css.horaRotulo}>{h.hora}</span>
                  </div>
                ))}
              </div>
              <p className="apenas-leitor">
                Lances por horário nos últimos 7 dias:{" "}
                {porHora.map((h) => `${h.hora}, ${h.total} lances`).join("; ")}.
              </p>
            </>
          )}
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

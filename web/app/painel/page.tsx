import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button, Card, EmptyState, Secao, StatusDot } from "@/components/ui";
import { formatarIdade, lerSaudeDaCamera, porcentagem } from "@/lib/saude-visao";
import { quadrasDoParceiro } from "@/db/queries/parceiro";
import { lancesPorHoraNaArena, saudeDasCameras, saudeDoRelay } from "@/db/queries/saude";
import {
  compartilhamentosPorCanal,
  gravacaoPorQuadra,
  metricasDoPainel,
} from "@/db/queries/painel-visao";
import EstadoDaArena from "./_components/EstadoDaArena";
import { comArena, resolverArena } from "./_lib/arena";
import css from "./painel.module.css";

export const metadata = { title: "Painel do parceiro", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/painel` — a visão geral da arena.
 *
 * ─── O PAINEL COMEÇA PELA PERGUNTA CERTA ───────────────────────────────────
 *
 * DE QUAIS ARENAS VOCÊ É ADMIN. `resolverArena` parte do `uid` da sessão e não
 * aceita `partnerId` de lugar nenhum; quando a URL traz `?arena=`, esse slug
 * ainda passa por `partner_admin` antes de qualquer dado da operação aparecer —
 * sem RLS, é essa consulta que separa "admin" de "logado".
 *
 * ─── NÃO HÁ FIXTURE AQUI ───────────────────────────────────────────────────
 *
 * Todos os números saem de `clip`, `trigger_event` e `share_event`, com
 * `AT TIME ZONE` da arena, e o zero aparece como zero. "132 lances hoje" numa
 * arena que gravou 4 é exatamente o número que o parceiro printa e manda no
 * grupo dele.
 *
 * ─── A LEITURA É POR QUADRA, NÃO POR CÂMERA ────────────────────────────────
 *
 * O parceiro não pensa em câmera, pensa em quadra: "a quadra 3 está gravando?".
 * `gravacaoPorQuadra` parte de `court`, então uma quadra cadastrada e ainda sem
 * câmera APARECE — que é o único jeito de descobrir que faltou instalar uma.
 */
export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Painel" />;

  const { parceiro } = resolucao;

  const [quadras, cameras, metricas, porHora, canais, gravacao] = await Promise.all([
    quadrasDoParceiro(parceiro.id),
    saudeDasCameras(parceiro.id),
    metricasDoPainel(parceiro.id, parceiro.timezone),
    lancesPorHoraNaArena(parceiro.id, parceiro.timezone),
    compartilhamentosPorCanal(parceiro.id, 30),
    gravacaoPorQuadra(parceiro.id),
  ]);

  const relay = await saudeDoRelay(cameras[0]?.relay_node_id ?? null).catch(() => null);

  const leituras = cameras.map((c) => ({ camera: c, saude: lerSaudeDaCamera(c) }));
  const gravando = leituras.filter((l) => l.saude.estado === "gravando").length;
  const aguardando = leituras.filter((l) => l.saude.estado === "aguardando").length;

  const pico = porHora.reduce((m, h) => Math.max(m, h.total), 0);
  const maiorCanal = canais.reduce((m, c) => Math.max(m, c.total), 0);

  const kpis = [
    { id: "hoje", rotulo: "Lances hoje", valor: metricas.lances_hoje, apoio: "no horário da arena" },
    { id: "semana", rotulo: "Lances em 7 dias", valor: metricas.lances_7d, apoio: "última semana" },
    { id: "mes", rotulo: "Lances em 30 dias", valor: metricas.lances_30d, apoio: "último mês" },
    {
      id: "atletas",
      rotulo: "Atletas na semana",
      valor: metricas.atletas_7d,
      apoio: `${metricas.atletas_30d} em 30 dias`,
    },
    {
      id: "share",
      rotulo: "Compartilhamentos",
      valor: metricas.compartilhamentos_7d,
      apoio: "com a marca da arena, em 7 dias",
    },
    {
      id: "grupos",
      rotulo: "Grupos ativos",
      valor: metricas.grupos_ativos,
      apoio: "com pelo menos um membro",
    },
  ];

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>{parceiro.display_name}</h1>
          <p className={css.subtitulo}>
            Visão geral · {quadras.length} {quadras.length === 1 ? "quadra" : "quadras"} ·{" "}
            {parceiro.timezone.replace("_", " ")}
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

      <Secao titulo="Números">
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
            últimas 24 h (câmera fora do ar, toque repetido, quadra sem câmera
            {metricas.bloqueados_24h > 0
              ? ` ou horário bloqueado — ${metricas.bloqueados_24h} deste último`
              : ""}
            ).
            {metricas.clipes_parciais_7d > 0
              ? ` ${metricas.clipes_parciais_7d} lance(s) saíram parciais na semana.`
              : ""}
          </p>
        ) : null}
      </Secao>

      <Secao
        titulo="Gravação por quadra"
        acao={
          <span className="apoio-3">
            {gravando} de {cameras.length} câmera{cameras.length === 1 ? "" : "s"} gravando
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
            {relay.disco_livre
              ? ` · ${porcentagem(Number(relay.disco_livre), 0)} de disco livre`
              : ""}
            {relay.jobs_pendentes > 0 ? ` · ${relay.jobs_pendentes} corte(s) na fila` : ""}
          </p>
        ) : null}

        {gravacao.length === 0 ? (
          <EmptyState
            titulo="Nenhuma quadra cadastrada"
            descricao="Cadastre as quadras da arena para depois vincular câmera e botão a cada uma."
            acoes={
              <Button href={comArena("/painel/quadras", parceiro.slug)} variante="secundario">
                Cadastrar quadra
              </Button>
            }
          />
        ) : (
          <ul className={css.cameras}>
            {gravacao.map((q) => {
              const leitura = leituras.find((l) => l.camera.id === q.camera_id);
              return (
                <li key={q.court_id} className={css.camera}>
                  <div className={css.cameraTopo}>
                    <span className={css.cameraNome}>{q.court}</span>
                    {leitura ? (
                      <StatusDot status={leitura.saude.ponto} rotulo={leitura.saude.rotulo} pilula />
                    ) : (
                      <StatusDot status="offline" rotulo="sem câmera" pilula />
                    )}
                  </div>
                  <span className={css.cameraApoio}>
                    {q.camera_id
                      ? `última gravação ${
                          q.ultima_gravacao_segundos === null
                            ? "nunca"
                            : formatarIdade(q.ultima_gravacao_segundos)
                        }`
                      : "nenhuma câmera vinculada a esta quadra"}
                  </span>
                  <span className={css.cameraApoio}>
                    cobertura 24 h {porcentagem(q.cobertura_24h === null ? null : Number(q.cobertura_24h))}
                    {" · "}
                    {q.lances_7d} lance{q.lances_7d === 1 ? "" : "s"} em 7 dias
                    {q.tem_botao ? "" : " · sem botão"}
                  </span>
                  {q.camera_id ? (
                    <Link
                      className="apoio"
                      href={comArena(`/painel/cameras/${q.camera_id}`, parceiro.slug)}
                    >
                      Configurar câmera
                    </Link>
                  ) : (
                    <Link className="apoio" href={comArena("/painel/cameras", parceiro.slug)}>
                      Cadastrar câmera
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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

      <Secao titulo="Compartilhamentos por canal" nivel={2}>
        <Card variante="painel" acessorio="últimos 30 dias">
          {canais.length === 0 ? (
            <p className="apoio">
              Nenhum compartilhamento registrado ainda. Cada vez que um atleta manda um lance no
              WhatsApp, a marca da arena vai junto — e aparece aqui.
            </p>
          ) : (
            <ul className={css.canais}>
              {canais.map((c) => (
                <li key={c.channel} className={css.canal}>
                  <span className={css.canalNome}>{rotuloDoCanal(c.channel)}</span>
                  <span className={css.canalTrilho}>
                    <span
                      className={css.canalBarra}
                      style={{ width: `${Math.round((c.total / maiorCanal) * 100)}%`, display: "block" }}
                    />
                  </span>
                  <span className={css.canalTotal}>{c.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Secao>
    </main>
  );
}

/** Os valores do enum `share_channel`, em pt-BR. */
function rotuloDoCanal(canal: string): string {
  const mapa: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    instagram_stories: "Stories",
    tiktok: "TikTok",
    copy_link: "Copiar link",
    native_share: "Compartilhar",
    direct: "Direto",
    unknown: "Não identificado",
  };
  return mapa[canal] ?? canal;
}

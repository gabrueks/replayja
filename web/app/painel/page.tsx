import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button, Card, EmptyState, Secao } from "@/components/ui";
import { formatarIdade, lerSaudeDaCamera, porcentagem } from "@/lib/saude-visao";
import { quadrasDoParceiro } from "@/db/queries/parceiro";
import { lancesPorHoraNaArena, saudeDasCameras, saudeDoRelay } from "@/db/queries/saude";
import {
  compartilhamentosPorCanal,
  gravacaoPorQuadra,
  metricasDoPainel,
} from "@/db/queries/painel-visao";
import EstadoDaArena from "./_components/EstadoDaArena";
import GraficoDeBarras from "./_components/GraficoDeBarras";
import SeloDeEstado from "./_components/SeloDeEstado";
import StatTile from "./_components/StatTile";
import { comArena, resolverArena } from "./_lib/arena";
import { mediaDiariaDaSemana, mediaSemanalAnterior, variacao } from "./_lib/tendencia";
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
 *
 * ─── A VARIAÇÃO DOS LADRILHOS É DERIVADA, E O RÓTULO DIZ DE QUÊ ────────────
 *
 * `_lib/tendencia.ts` explica a conta: as duas janelas de `metricasDoPainel` já
 * contêm o período anterior, então a seta sai sem uma consulta nova. O que ela
 * compara está escrito no ladrilho — "contra a média das semanas anteriores", e
 * não "semana passada", que seria uma promessa que a conta não cumpre.
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
  const caidas = leituras.filter((l) => l.saude.estado === "offline").length;

  const pico = porHora.reduce((m, h) => Math.max(m, h.total), 0);
  const maiorCanal = canais.reduce((m, c) => Math.max(m, c.total), 0);

  const mediaDiaria = mediaDiariaDaSemana(metricas.lances_7d);
  const mediaSemanal = mediaSemanalAnterior(metricas.lances_30d, metricas.lances_7d);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Visão geral</h1>
          <p className={css.subtitulo}>
            {parceiro.display_name} · {quadras.length}{" "}
            {quadras.length === 1 ? "quadra" : "quadras"} · {parceiro.timezone.replace("_", " ")}
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

      <Secao titulo="Os números da semana">
        <ul className={css.kpis}>
          {/*
            "HOJE" NÃO GANHA SETA, E ISSO É METODOLOGIA E NÃO ESPAÇO.
            Hoje é um dia PELA METADE: às 10h da manhã ele sempre estaria
            "−100% contra a média diária", e às 23h quase sempre acima. Uma seta
            que oscila com a hora do relógio não informa nada e ensina o parceiro
            a ignorar as outras. A média diária da semana fica como APOIO, que é
            a referência sem a falsa precisão.
          */}
          <StatTile
            rotulo="Lances hoje"
            valor={metricas.lances_hoje}
            apoio={
              mediaDiaria === null
                ? "no horário da arena"
                : `média de ${mediaDiaria.toFixed(1).replace(".", ",")} por dia na semana`
            }
          />
          <StatTile
            rotulo="Lances em 7 dias"
            valor={metricas.lances_7d}
            apoio="última semana"
            tendencia={
              mediaSemanal === null
                ? null
                : variacao(
                    metricas.lances_7d,
                    mediaSemanal,
                    "contra a média das semanas anteriores",
                  )
            }
          />
          <StatTile rotulo="Lances em 30 dias" valor={metricas.lances_30d} apoio="último mês" />
          <StatTile
            rotulo="Atletas na semana"
            valor={metricas.atletas_7d}
            apoio={`${metricas.atletas_30d} em 30 dias`}
          />
          <StatTile
            rotulo="Compartilhamentos"
            valor={metricas.compartilhamentos_7d}
            apoio="com a marca da arena, em 7 dias"
          />
          <StatTile
            rotulo="Grupos ativos"
            valor={metricas.grupos_ativos}
            apoio="com pelo menos um membro"
          />
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
          cameras.length > 0 ? (
            <span className={css.linhaAcoes}>
              {/* Verde só quando ALGUMA está gravando: "0 de 2 gravando" numa
                  pílula verde é o contrário do que a pílula significa. */}
              <SeloDeEstado tom={gravando > 0 ? "gravando" : "neutro"}>
                {gravando} de {cameras.length} gravando
              </SeloDeEstado>
              {aguardando > 0 ? (
                <SeloDeEstado tom="aguardando">{aguardando} aguardando relay</SeloDeEstado>
              ) : null}
              {caidas > 0 ? (
                <SeloDeEstado tom="offline">
                  {caidas} fora do ar
                </SeloDeEstado>
              ) : null}
            </span>
          ) : undefined
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
            ilustracao="quadra"
            titulo="Nenhuma quadra ainda"
            descricao="A quadra é o que liga a câmera ao botão. Cadastre a primeira e depois vincule o equipamento a ela."
            acoes={
              <Button href={comArena("/painel/quadras", parceiro.slug)} variante="preto">
                Cadastrar quadra
              </Button>
            }
          />
        ) : (
          <ul className={css.cameras}>
            {gravacao.map((q) => {
              const leitura = leituras.find((l) => l.camera.id === q.camera_id);
              const cobertura = q.cobertura_24h === null ? null : Number(q.cobertura_24h);
              // "0% — abaixo dos 90%" numa câmera que NUNCA conectou é ruído: o
              // problema dela é a instalação, não a cobertura, e o selo já disse
              // isso. O aviso fica para quem grava mal, que é outra conversa.
              const aguardando = leitura?.saude.estado === "aguardando";
              const baixa = !aguardando && cobertura !== null && cobertura < 0.9;
              return (
                <li key={q.court_id} className={css.camera}>
                  <div className={css.cameraTopo}>
                    <span className={css.cameraNome}>{q.court}</span>
                    {leitura ? (
                      <SeloDeEstado tom={leitura.saude.estado}>{leitura.saude.rotulo}</SeloDeEstado>
                    ) : (
                      <SeloDeEstado tom="neutro">sem câmera</SeloDeEstado>
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

                  {/*
                    A RÉGUA DIZ O QUE O NÚMERO NÃO DIZ. "95.4%" não responde
                    "está bom?" sem que alguém guarde o corte de cabeça; a barra
                    responde de longe, e o número continua escrito ao lado
                    porque cor e comprimento sozinhos não informam.
                  */}
                  {cobertura !== null ? (
                    <>
                      <span className={css.regua}>
                        <span
                          className={[css.reguaPreenchida, baixa ? css.reguaAlerta : null]
                            .filter(Boolean)
                            .join(" ")}
                          style={{ width: `${Math.round(cobertura * 100)}%` }}
                        />
                      </span>
                      <span className={css.cameraApoio}>
                        cobertura 24 h {porcentagem(cobertura)}
                        {baixa ? " — abaixo dos 90%" : ""}
                      </span>
                    </>
                  ) : null}

                  <span className={css.cameraApoio}>
                    {q.lances_7d} lance{q.lances_7d === 1 ? "" : "s"} em 7 dias
                    {q.tem_botao ? "" : " · sem botão"}
                  </span>

                  {q.camera_id ? (
                    <Link
                      className={css.cameraLink}
                      href={comArena(`/painel/cameras/${q.camera_id}`, parceiro.slug)}
                    >
                      Configurar câmera
                    </Link>
                  ) : (
                    <Link
                      className={css.cameraLink}
                      href={comArena("/painel/cameras", parceiro.slug)}
                    >
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
        <Card variante="painel" acessorio="últimos 7 dias">
          {porHora.length === 0 ? (
            <p className="apoio">
              Nenhum lance nos últimos 7 dias. O gráfico aparece assim que o primeiro botão for
              apertado.
            </p>
          ) : (
            <GraficoDeBarras
              maximo={pico}
              colunas={porHora.map((h) => ({
                rotulo: h.hora,
                valor: h.total,
                tom: h.total === pico && pico > 0 ? "pico" : "base",
              }))}
              descricao="Lances por horário nos últimos 7 dias"
              legenda={[
                "cada coluna é uma hora do relógio da arena",
                pico > 0
                  ? `enche às ${porHora.find((h) => h.total === pico)?.hora ?? ""}`
                  : "sem dados",
              ]}
            />
          )}
        </Card>
      </Secao>

      <Secao titulo="Compartilhamentos por canal" nivel={2}>
        <Card variante="painel" acessorio="últimos 30 dias">
          {canais.length === 0 ? (
            <p className="apoio">
              Nenhum compartilhamento ainda. Cada vez que um atleta manda um lance no WhatsApp, a
              marca da arena vai junto — e aparece aqui.
            </p>
          ) : (
            <ul className={css.canais}>
              {canais.map((c) => (
                <li key={c.channel} className={css.canal}>
                  <span className={css.canalNome}>{rotuloDoCanal(c.channel)}</span>
                  <span className={css.canalTrilho}>
                    <span
                      className={css.canalBarra}
                      style={{
                        width: `${Math.round((c.total / maiorCanal) * 100)}%`,
                        display: "block",
                      }}
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

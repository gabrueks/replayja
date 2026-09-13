import { notFound } from "next/navigation";
import { Button, Card, Secao } from "@/components/ui";
import { formatarIdade, lerSaudeDaCamera, porcentagem } from "@/lib/saude-visao";
import { cameraDoPainel, coberturaDaCamera } from "@/db/queries/relay";
import { servidorDeTransmissao } from "@/db/queries/painel-regras";
import AcoesDaCamera from "../../_components/AcoesDaCamera";
import Copiavel from "../../_components/Copiavel";
import EstadoDaArena from "../../_components/EstadoDaArena";
import GraficoDeBarras from "../../_components/GraficoDeBarras";
import QrCode from "../../_components/QrCode";
import SeloDeEstado from "../../_components/SeloDeEstado";
import { comArena, resolverArena } from "../../_lib/arena";
import css from "../../painel.module.css";

export const metadata = { title: "Câmera", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/painel/cameras/<id>` — tudo o que o instalador precisa, numa tela.
 *
 * ─── ESTA É A ÚNICA TELA DO PRODUTO QUE MOSTRA A CHAVE DE TRANSMISSÃO ──────
 *
 * A chave fica DIGITADA dentro da câmera, na quadra, e o app do fabricante não
 * tem "importar configuração". Alguém precisa lê-la de algum lugar, e a
 * alternativa real (mandar por WhatsApp quando o cliente pedir) é pior sob todo
 * aspecto: fica no celular de duas pessoas, não expira, e não registra nada.
 *
 * As barreiras são: sessão, papel de admin DESTA arena (`resolverArena`), e a
 * consulta que projeta a chave (`cameraDoPainel`) tem `partner_id` no WHERE —
 * sem isso, um id de câmera adivinhável (`arenavascoq1`) devolveria a chave de
 * outra arena.
 *
 * `viewer` não vê a chave. É o papel de quem acompanha, e uma credencial que
 * derruba a quadra não é relatório.
 */
export default async function DetalheDaCamera({
  params,
  searchParams,
}: {
  params: Promise<{ cameraId: string }>;
  searchParams: Promise<{ arena?: string }>;
}) {
  const { cameraId } = await params;
  const { arena } = await searchParams;

  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Câmera" />;

  const { parceiro, papel } = resolucao;
  // O formato é conferido antes da ida ao banco: o `CHECK` da 0004 exige
  // `[a-z0-9]{6,32}`, e recusar lixo aqui poupa uma consulta por scanner.
  if (!/^[a-z0-9]{6,32}$/.test(cameraId)) notFound();

  const camera = await cameraDoPainel(parceiro.id, cameraId);
  if (!camera) notFound();

  const serie = await coberturaDaCamera(parceiro.id, cameraId);

  const saude = lerSaudeDaCamera({
    id: camera.id,
    name: camera.name,
    court: camera.court,
    court_id: camera.court_id,
    court_slug: camera.court_slug,
    status: camera.status,
    enabled: camera.enabled,
    last_segment_at: camera.last_segment_at,
    since_seconds: camera.since_seconds,
    coverage_24h: camera.coverage_24h,
    coverage_1h: camera.coverage_1h,
    long_segments_24h: camera.long_segments_24h,
    observed_bitrate_kbps: camera.observed_bitrate_kbps,
    target_bitrate_kbps: camera.target_bitrate_kbps,
    recorded_until: camera.recorded_until,
    rtmp_port: camera.rtmp_port,
    relay_node_id: camera.relay_node_id,
    relay_status: camera.relay_status,
    relay_disk_free: null,
    relay_last_seen_at: null,
    // O detalhe não lê o heartbeat do relay (a lista já o mostra no topo).
    // `lerSaudeDaCamera` usa isso só para a linha "relay sem sinal", que aqui
    // seria ruído: quem abre esta tela quer configurar a câmera.
    relay_since_seconds: 0,
    amostra_em: camera.amostra_em,
  });

  const mostrarSegredo = papel !== "viewer";
  const servidor = servidorDeTransmissao(camera.rtmp_host, camera.rtmp_port);
  const picoDaSerie = serie.reduce(
    (m, s) => Math.max(m, s.cobertura === null ? 0 : Number(s.cobertura)),
    0,
  );

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>{camera.name}</h1>
          <p className={css.subtitulo}>
            {camera.court ?? "sem quadra — o relay não grava esta câmera"} ·{" "}
            <span className="tempo">{camera.id}</span>
          </p>
        </div>
        <Button
          href={comArena("/painel/cameras", parceiro.slug)}
          variante="secundario"
          tamanho={44}
        >
          Todas as câmeras
        </Button>
      </header>

      <Card variante="painel">
        <div className={css.linhaAcoes}>
          <SeloDeEstado tom={saude.estado}>{saude.rotulo}</SeloDeEstado>
          <span className="apoio-3 tempo">
            {saude.estado === "aguardando"
              ? "nenhum segmento recebido — a câmera nunca conectou no relay"
              : `último segmento ${saude.ultimoSegmento}`}
            {camera.key_rotated_at
              ? ` · chave v${camera.key_version}, trocada em ${camera.key_rotated_at.toLocaleDateString("pt-BR")}`
              : ` · chave v${camera.key_version}`}
          </span>
        </div>
      </Card>

      {mostrarSegredo ? (
        <Secao titulo="Configuração da câmera">
          <Card variante="painel">
            <p className="apoio-3">
              Digite estes dois valores no aplicativo da câmera, na seção de transmissão ao vivo
              (RTMP). O QR traz os dois juntos, no formato que a maioria dos apps aceita colar num
              campo só.
            </p>
            <div className={css.qrLinha}>
              <div className={css.qrColuna}>
                <div className={css.campo}>
                  <span className="rotulo">Servidor</span>
                  <Copiavel valor={servidor} rotulo="o servidor" />
                </div>
                <div className={css.campo}>
                  <span className="rotulo">Chave de transmissão</span>
                  {camera.rtmp_key ? (
                    <Copiavel valor={camera.rtmp_key} rotulo="a chave de transmissão" />
                  ) : (
                    <p className="apoio">
                      Sem chave definida. Gere uma nova abaixo antes de configurar o equipamento.
                    </p>
                  )}
                </div>
              </div>
              {camera.rtmp_key ? (
                <span className={css.qrCaixa}>
                  <QrCode
                    valor={`${servidor}/${camera.rtmp_key}`}
                    descricao="QR com o endereço de transmissão da câmera"
                  />
                  <span className={css.qrApoio}>Aponte a câmera do celular</span>
                </span>
              ) : null}
            </div>
          </Card>
        </Secao>
      ) : null}

      <Secao titulo="Estado" nivel={2}>
        <Card variante="painel">
          <dl className={css.definicoes}>
            <div>
              <dt>Cobertura 24 h</dt>
              <dd>{porcentagem(saude.cobertura)}</dd>
            </div>
            <div>
              <dt>Cobertura 1 h</dt>
              <dd>
                {porcentagem(camera.coverage_1h === null ? null : Number(camera.coverage_1h))}
              </dd>
            </div>
            <div>
              <dt>Bitrate observado</dt>
              <dd>
                {camera.observed_bitrate_kbps
                  ? `${Math.round(Number(camera.observed_bitrate_kbps))} kbps`
                  : "—"}
                <span className="apoio-3"> alvo {camera.target_bitrate_kbps}</span>
              </dd>
            </div>
            <div>
              <dt>Último segmento</dt>
              <dd>{saude.ultimoSegmento}</dd>
            </div>
            <div>
              <dt>Primeira conexão</dt>
              <dd>
                {camera.first_connected_at
                  ? camera.first_connected_at.toLocaleString("pt-BR")
                  : "nunca conectou"}
              </dd>
            </div>
            <div>
              <dt>Gravado desde</dt>
              <dd>
                {camera.recorded_until ? camera.recorded_until.toLocaleString("pt-BR") : "—"}
              </dd>
            </div>
            <div>
              <dt>Oscilações 24 h</dt>
              <dd>{camera.long_segments_24h}</dd>
            </div>
            <div>
              <dt>Lances em 7 dias</dt>
              <dd>{camera.lances_7d}</dd>
            </div>
            <div>
              <dt>Formato</dt>
              <dd>
                {camera.width}×{camera.height} · {camera.fps} fps
              </dd>
            </div>
            <div>
              <dt>Relay</dt>
              <dd className="tempo">
                {camera.relay_node_id} · {camera.relay_status}
              </dd>
            </div>
          </dl>
          <p className="apoio-3">
            A última amostra de saúde chegou{" "}
            {camera.amostra_em
              ? formatarIdade(Math.round((Date.now() - camera.amostra_em.getTime()) / 1000))
              : "nunca"}
            . Cobertura abaixo de 90% em 24 h é problema real; a de 1 h engana depois de qualquer
            reinício.
          </p>
        </Card>
      </Secao>

      <Secao titulo="Cobertura hora a hora" nivel={2}>
        <Card variante="painel" acessorio="últimas 24 h">
          {serie.length === 0 ? (
            <p className="apoio">
              Nenhuma amostra nas últimas 24 horas. O relay envia uma por minuto enquanto estiver
              no ar.
            </p>
          ) : (
            /*
              AQUI O EIXO É SAÚDE, NÃO VOLUME — e por isso as barras são verdes e
              vermelhas em vez da escala laranja da visão geral. Verde acima dos
              90%, vermelho abaixo: a hora em que a câmera engasgou salta sem que
              ninguém compare porcentagens de quatro dígitos entre si.
            */
            <GraficoDeBarras
              maximo={picoDaSerie || 1}
              colunas={serie.map((s) => {
                const v = s.cobertura === null ? 0 : Number(s.cobertura);
                return {
                  rotulo: s.hora,
                  valor: v,
                  texto: porcentagem(s.cobertura === null ? null : v),
                  tom: v < 0.9 ? ("alerta" as const) : ("ok" as const),
                };
              })}
              descricao="Cobertura por hora nas últimas 24 horas"
              legenda={["vermelho é hora com cobertura abaixo de 90%", "uma amostra por minuto"]}
            />
          )}
        </Card>
      </Secao>

      <Secao titulo="Ações" nivel={2}>
        <AcoesDaCamera
          arenaSlug={parceiro.slug}
          cameraId={camera.id}
          nome={camera.name}
          ativa={camera.enabled}
          podeEditar={papel !== "viewer"}
        />
      </Secao>
    </main>
  );
}

import Link from "next/link";
import { Button, Card, EmptyState, Secao, StatusDot } from "@/components/ui";
import { formatarIdade, lerSaudeDaCamera, porcentagem } from "@/lib/saude-visao";
import { quadrasDoPainel } from "@/db/queries/painel-quadras";
import { saudeDasCameras, saudeDoRelay } from "@/db/queries/saude";
import EstadoDaArena from "../_components/EstadoDaArena";
import NovaCamera from "../_components/NovaCamera";
import { comArena, resolverArena } from "../_lib/arena";
import css from "../painel.module.css";
import tabela from "./cameras.module.css";

export const metadata = { title: "Câmeras", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Status das câmeras — é o que a arena abre quando um atleta reclama.
//
// ─── COMO LER `coverage_24h` ───────────────────────────────────────────────
//
// Números medidos na frota do Sentinela (19–24 câmeras, set/2026):
//
//   0,95–0,96   câmera saudável
//   ~0,92       mediana da frota
//   < 0,90      PROBLEMA REAL, não ruído
//
// Julgar SEMPRE pela janela de 24 h. A de 1 h engana logo após qualquer reinício
// da frota, que abre 30–90 s de lacuna por câmera. A tabela abaixo COLORE por
// esse critério — e escreve o número do lado, porque cor sozinha não informa.
//
// ─── "AGUARDANDO RELAY" É UM ESTADO PRÓPRIO ────────────────────────────────
//
// Câmera cadastrada que NUNCA mandou segmento não é câmera caída: é instalação
// incompleta. Misturar as duas manda o suporte reiniciar um relay que está
// funcionando, em vez de conferir a chave digitada na câmera.

export default async function Cameras({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Câmeras" />;

  const { parceiro, papel } = resolucao;
  const [cameras, quadras] = await Promise.all([
    saudeDasCameras(parceiro.id),
    quadrasDoPainel(parceiro.id),
  ]);
  const relay = await saudeDoRelay(cameras[0]?.relay_node_id ?? null).catch(() => null);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Câmeras</h1>
          <p className={css.subtitulo}>{parceiro.display_name}</p>
        </div>
        <Button href={comArena("/painel", parceiro.slug)} variante="secundario" tamanho={44}>
          Visão geral
        </Button>
      </header>

      {relay ? (
        <Card variante="painel">
          <div className={tabela.relay}>
            <StatusDot
              status={
                relay.desde_segundos !== null && relay.desde_segundos <= 180 ? "online" : "offline"
              }
              rotulo={
                relay.ultimo_heartbeat
                  ? `relay ${relay.id} · sinal ${formatarIdade(relay.desde_segundos ?? 0)}`
                  : `relay ${relay.id} · nunca reportou`
              }
              pilula
            />
            <span className="apoio-3 tempo">
              {relay.agent_version ? `versão ${relay.agent_version} · ` : ""}
              {relay.disco_livre
                ? `${porcentagem(Number(relay.disco_livre), 0)} de disco livre · `
                : ""}
              {relay.jobs_pendentes} corte(s) na fila
            </span>
          </div>
          {!relay.ultimo_heartbeat ? (
            <p className="apoio-3">
              O relay ainda não enviou nenhum heartbeat. Enquanto isso, as câmeras aparecem como
              &ldquo;aguardando relay&rdquo; e os acionamentos são recusados.
            </p>
          ) : null}
        </Card>
      ) : null}

      {papel !== "viewer" ? (
        <NovaCamera
          arenaSlug={parceiro.slug}
          quadras={quadras.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
        />
      ) : null}

      <Secao titulo={`${cameras.length} ${cameras.length === 1 ? "câmera" : "câmeras"}`}>
        {cameras.length === 0 ? (
          <EmptyState
            titulo="Nenhuma câmera cadastrada"
            descricao="Cadastre a câmera para receber o endereço de transmissão e a chave que vão dentro do equipamento."
          />
        ) : (
          <div className={tabela.rolagem}>
            <table className={tabela.tabela}>
              <caption className="apenas-leitor">
                Saúde das câmeras da {parceiro.display_name}: quadra, estado, cobertura das
                últimas 24 horas, último segmento recebido e oscilações.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Quadra</th>
                  <th scope="col">Câmera</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Cobertura 24 h</th>
                  <th scope="col">Último segmento</th>
                  <th scope="col">Oscilações 24 h</th>
                  <th scope="col">Configuração</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((c) => {
                  const saude = lerSaudeDaCamera(c);
                  const alerta = saude.estado === "instavel" || saude.estado === "offline";
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        {c.court ?? <span className={tabela.alerta}>sem quadra</span>}
                      </th>
                      <td>{c.name}</td>
                      <td>
                        <StatusDot status={saude.ponto} rotulo={saude.rotulo} pilula />
                      </td>
                      <td className={`tempo ${alerta ? tabela.alerta : ""}`}>
                        {porcentagem(saude.cobertura)}
                      </td>
                      <td className="tempo">{saude.ultimoSegmento}</td>
                      <td className="tempo">{c.long_segments_24h}</td>
                      <td>
                        <Link href={comArena(`/painel/cameras/${c.id}`, parceiro.slug)}>
                          Ver detalhe
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="apoio-3">
          Cobertura abaixo de 90% em 24 h é problema real, não ruído. A janela de 1 hora engana
          logo depois de qualquer reinício da frota.
        </p>
      </Secao>
    </main>
  );
}

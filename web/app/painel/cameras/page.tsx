import { Button, Card, EmptyState, Secao, StatusDot, type Status } from "@/components/ui";
import { dbConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ehSlugDeArena } from "@/lib/slug";
import { exigirAdminDaArena } from "@/db/queries/autorizacao";
import { parceiroPublicoPorSlug } from "@/db/queries/parceiro";
import { saudeDasCameras } from "@/db/queries/saude";
import css from "../painel.module.css";
import tabela from "./cameras.module.css";

export const metadata = { title: "Câmeras", robots: { index: false, follow: false } };

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

export default async function Cameras({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const sessao = await getSession();
  const { arena } = await searchParams;

  if (!dbConfigured() || !arena || !ehSlugDeArena(arena)) {
    return (
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Câmeras</h1>
        <EmptyState
          titulo="Escolha uma arena"
          descricao="A saúde das câmeras é sempre de uma arena específica."
          acoes={
            <Button href="/painel" variante="secundario" largura="total">
              Voltar ao painel
            </Button>
          }
        />
      </main>
    );
  }

  const parceiro = await parceiroPublicoPorSlug(arena);
  if (!parceiro) {
    return (
      <main className={css.pagina} id="conteudo">
        <h1 className={css.titulo}>Câmeras</h1>
        <p className="apoio">Arena não encontrada.</p>
      </main>
    );
  }

  // A CHECAGEM QUE IMPORTA. Sem ela, `?arena=` bastaria para ver a operação de
  // qualquer arena — e sem RLS não há nada no banco que barre isso.
  await exigirAdminDaArena(sessao, parceiro.id, "viewer");

  const cameras = await saudeDasCameras(parceiro.id);

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Câmeras</h1>
          <p className={css.subtitulo}>{parceiro.display_name}</p>
        </div>
        <Button href={`/painel?arena=${parceiro.slug}`} variante="secundario" tamanho={44}>
          Visão geral
        </Button>
      </header>

      <Secao titulo={`${cameras.length} ${cameras.length === 1 ? "câmera" : "câmeras"}`}>
        {cameras.length === 0 ? (
          <Card>
            <p className="apoio">Nenhuma câmera cadastrada nesta arena.</p>
          </Card>
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
                </tr>
              </thead>
              <tbody>
                {cameras.map((c) => {
                  const cobertura = c.coverage_24h === null ? null : Number(c.coverage_24h);
                  const saudavel = cobertura !== null && cobertura >= 0.9;
                  const estado: Status =
                    c.status !== "online" ? "offline" : saudavel ? "online" : "gravando";
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.court}</th>
                      <td>{c.name}</td>
                      <td>
                        <StatusDot
                          status={estado}
                          rotulo={
                            c.status === "online" ? (saudavel ? "online" : "instável") : c.status
                          }
                          pilula
                        />
                      </td>
                      <td className={`tempo ${saudavel ? "" : tabela.alerta}`}>
                        {cobertura === null ? "—" : `${(cobertura * 100).toFixed(1)}%`}
                      </td>
                      <td className="tempo">
                        {c.since_seconds === null ? "nunca" : `há ${c.since_seconds}s`}
                      </td>
                      <td className="tempo">{c.long_segments_24h}</td>
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

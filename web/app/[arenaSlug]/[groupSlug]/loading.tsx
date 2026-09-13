import { Carregando, Esqueleto, EsqueletoDeLances } from "@/components/ui";

/**
 * A página do grupo carregando.
 *
 * É `force-dynamic` e faz quatro consultas em paralelo — incluindo a derivação
 * das 53 ocorrências semanais, que é a mais cara do produto do atleta. É também
 * a página que fica FIXADA no tópico do WhatsApp da turma, ou seja, a que é
 * reaberta mais vezes.
 *
 * O bloco escuro no topo é o cabeçalho do grupo (a única superfície `.tinta` do
 * app fora do player): sem reservá-lo, a tela troca de cor quando o conteúdo
 * chega.
 */
export default function CarregandoGrupo() {
  return (
    <Carregando rotulo="Carregando a pelada">
      <Esqueleto forma="card" altura={210} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-12)" }}>
        <Esqueleto altura={14} largura="40%" />
        <EsqueletoDeLances quantos={3} />
      </div>
    </Carregando>
  );
}

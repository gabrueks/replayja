import { Carregando, Esqueleto, EsqueletoDeLances } from "@/components/ui";

/**
 * A página da arena carregando — a rota pública mais pesada e mais divulgada.
 *
 * Ela faz cinco consultas em paralelo (parceiro, quadras, grupos, contatos,
 * contador de hoje) mais a janela de seis horas de clipes, e é o endereço que a
 * arena cola no Instagram dela: é a tela em que o congelamento de `loading`
 * ausente mais aparecia.
 *
 * O esqueleto começa pela CAPA de 230px, porque é ela que define a altura da
 * dobra: sem reservá-la, o conteúdo sobe e desce quando o cabeçalho chega.
 */
export default function CarregandoArena() {
  return (
    <Carregando rotulo="Carregando a arena">
      <Esqueleto forma="card" altura={230} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-12)" }}>
        <Esqueleto altura={30} largura="60%" />
        <Esqueleto altura={14} largura="80%" />
      </div>
      <EsqueletoDeLances />
    </Carregando>
  );
}

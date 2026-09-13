import { Carregando, Esqueleto, EsqueletoDeLances } from "@/components/ui";

/**
 * A aba "Lances" carregando — a resposta à pergunta "cadê o lance que eu acabei
 * de salvar?".
 *
 * É `force-dynamic` e consulta as arenas do atleta antes de qualquer coisa. Quem
 * abre esta aba está na beira da quadra, com o celular na mão, segundos depois
 * de apertar o botão: é onde a tela congelada mais parecia "o app comeu meu
 * lance".
 */
export default function CarregandoLances() {
  return (
    <Carregando rotulo="Carregando seus lances">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-8)" }}>
        <Esqueleto altura={34} largura="56%" />
        <Esqueleto altura={14} largura="74%" />
      </div>
      <EsqueletoDeLances quantos={6} />
    </Carregando>
  );
}

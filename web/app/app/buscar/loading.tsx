import { Carregando, Esqueleto, EsqueletoDeLances } from "@/components/ui";

/**
 * A busca carregando.
 *
 * Ela é `force-dynamic` e, quando vem com `?data=&de=&ate=`, roda a consulta
 * central do produto antes de pintar qualquer coisa. É a tela em que a espera
 * dói mais: quem está aqui acabou de jogar e quer ver o gol.
 *
 * O esqueleto reproduz o CARTÃO de busca inteiro — chips de quadra, atalhos e os
 * três campos de 62px —, porque a pessoa volta a esta tela para MEXER no
 * horário, e um cartão que aparece do nada empurra a grade para baixo depois de
 * o dedo já estar a caminho.
 */
export default function CarregandoBusca() {
  return (
    <Carregando rotulo="Carregando a busca">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-8)" }}>
        <Esqueleto altura={14} largura="46%" />
        <Esqueleto altura={34} largura="72%" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-12)" }}>
        <Esqueleto forma="ladrilho" altura={44} />
        <div style={{ display: "flex", gap: "10px" }}>
          <Esqueleto forma="ladrilho" altura={62} />
          <Esqueleto forma="ladrilho" altura={62} />
          <Esqueleto forma="ladrilho" altura={62} largura={62} />
        </div>
      </div>
      <EsqueletoDeLances />
    </Carregando>
  );
}

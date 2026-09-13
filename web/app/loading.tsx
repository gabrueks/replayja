import { Carregando, Esqueleto, EsqueletoDeLances } from "@/components/ui";

/**
 * O carregamento PADRÃO — o que vale para toda rota sem um `loading.tsx` mais
 * perto dela.
 *
 * ─── O QUE ELE CONSERTA (achado P1-5) ──────────────────────────────────────
 *
 * Não existia nenhum `loading.tsx` no produto. Sem ele o App Router **congela a
 * tela anterior** até o servidor responder — e as rotas mais pesadas são
 * `force-dynamic` com nove `await` de banco. No 4G da quadra, o toque não
 * produzia nada por segundos, o que é indistinguível de app travado.
 *
 * O esqueleto imita a forma do que vem: título grande, linha de apoio, grade de
 * lances. Assim a página não PULA quando o conteúdo chega — e no celular, com a
 * rolagem já começada, pular é perder o lugar.
 */
export default function CarregandoPadrao() {
  return (
    <Carregando rotulo="Carregando">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--e-8)" }}>
        <Esqueleto altura={34} largura="68%" />
        <Esqueleto altura={14} largura="86%" />
      </div>
      <EsqueletoDeLances />
    </Carregando>
  );
}

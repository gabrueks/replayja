/**
 * A tarja "conteúdo de exemplo".
 *
 * Toda tela que ainda desenha a partir de `lib/fixtures.ts` mostra isto. É
 * honestidade com quem abre um preview: um painel com "132 lances hoje" sem
 * aviso faz o parceiro achar que o número é dele — e esse é o tipo de mal-
 * entendido que custa uma reunião inteira para desfazer.
 *
 * Quando a consulta real entra, some o import da fixture E some este aviso.
 */
export function AvisoDeExemplo({ o_que }: { o_que: string }) {
  return (
    <p
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--e-8)",
        margin: 0,
        padding: "var(--e-8) var(--e-12)",
        borderRadius: "var(--raio-10)",
        border: "1px dashed var(--cor-borda-forte)",
        background: "var(--cor-superficie)",
        color: "var(--cor-texto-3)",
        fontSize: "var(--texto-12)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--cor-acento)",
          flexShrink: 0,
        }}
      />
      {o_que} são dados de exemplo — a consulta real entra numa task seguinte.
    </p>
  );
}

export default AvisoDeExemplo;

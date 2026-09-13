import { beforeAll, describe, expect, it } from "vitest";

// As duas peças PURAS que a rodada de grupos v2 acrescentou: o arquivo de
// calendário da pelada e o token de descadastro do resumo semanal.
//
// As duas são testáveis sem banco e sem rede, e as duas têm o mesmo tipo de
// pegadinha — formato de texto com regra escrita por um RFC, onde o defeito não
// aparece como exceção: aparece como um arquivo que um calendário abre e outro
// recusa, ou como um botão de "cancelar inscrição" que responde erro.

beforeAll(() => {
  // `lib/app-secret.ts` LANÇA fora de desenvolvimento quando a variável não
  // existe — de propósito. O teste precisa de um valor qualquer, e ele não
  // protege nada aqui.
  process.env.SESSION_SECRET ??= "segredo-de-teste-0123456789-abcdefghij";
});

describe("ics da pelada", () => {
  const BASE = {
    uid: "grupo-abc@replayja.com.br",
    titulo: "Fut de Sexta",
    descricao: "Os lances desta pelada ficam em https://replayja.com.br/arena-vasco/fut-sexta",
    local: "Arena Vasco",
    url: "https://replayja.com.br/arena-vasco/fut-sexta",
    // 2026-09-18T23:00:00Z = sexta, 20h em São Paulo.
    inicio: new Date("2026-09-18T23:00:00Z"),
    fim: new Date("2026-09-19T00:00:00Z"),
    weekdays: [5],
    agora: new Date("2026-09-13T10:00:00Z"),
  };

  it("carimba os instantes em UTC, no formato do RFC 5545", async () => {
    const { carimboUtc } = await import("@/lib/ics");
    expect(carimboUtc(new Date("2026-09-18T23:00:00Z"))).toBe("20260918T230000Z");
    // Meia-noite e virada de mês: o formato não pode perder o zero à esquerda.
    expect(carimboUtc(new Date("2026-10-01T00:00:00Z"))).toBe("20261001T000000Z");
  });

  it("escapa TEXT com a barra invertida ANTES da vírgula", async () => {
    const { escaparTexto } = await import("@/lib/ics");
    // O "escape do escape": escapar a vírgula primeiro produziria `\,` e a
    // passada seguinte transformaria aquela barra em `\\,`, que o calendário lê
    // como barra literal seguida de fim de valor.
    expect(escaparTexto("a\\b,c;d")).toBe("a\\\\b\\,c\\;d");
    expect(escaparTexto("linha um\nlinha dois")).toBe("linha um\\nlinha dois");
    expect(escaparTexto("linha um\r\nlinha dois")).toBe("linha um\\nlinha dois");
  });

  it("dobra a linha em 75 OCTETOS e nunca no meio de um caractere", async () => {
    const { dobrarLinha } = await import("@/lib/ics");

    // 100 acentos = 200 octetos. Um corte por CARACTERE passaria do limite; um
    // corte por octeto mal feito partiria o "á" ao meio e o arquivo sairia com
    // losangos (ou seria recusado inteiro).
    const longa = `SUMMARY:${"á".repeat(100)}`;
    const dobrada = dobrarLinha(longa);

    const partes = dobrada.split("\r\n ");
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) {
      expect(Buffer.from(p, "utf8").length).toBeLessThanOrEqual(75);
    }
    // Desdobrar tem de devolver exatamente o original — é o que prova que
    // nenhum caractere foi partido.
    expect(partes.join("")).toBe(longa);
  });

  it("não dobra o que já cabe", async () => {
    const { dobrarLinha } = await import("@/lib/ics");
    expect(dobrarLinha("SUMMARY:Fut de Sexta")).toBe("SUMMARY:Fut de Sexta");
  });

  it("monta um VCALENDAR com CRLF, UID estável e recorrência limitada", async () => {
    const { icsDaPelada } = await import("@/lib/ics");
    const ics = icsDaPelada(BASE);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // `LF` sozinho é o que o Outlook recusa. Nenhum pode escapar.
    expect(/[^\r]\n/.test(ics)).toBe(false);

    expect(ics).toContain("UID:grupo-abc@replayja.com.br");
    expect(ics).toContain("DTSTAMP:20260913T100000Z");
    expect(ics).toContain("DTSTART:20260918T230000Z");
    expect(ics).toContain("DTEND:20260919T000000Z");
    // A recorrência é CURTA de propósito: em UTC ela congelaria o offset se o
    // Brasil reintroduzisse horário de verão (ver o comentário do arquivo).
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=12");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("traduz os dias ISO para os códigos do RFC, ordenados e sem repetir", async () => {
    const { icsDaPelada } = await import("@/lib/ics");
    const ics = icsDaPelada({ ...BASE, weekdays: [3, 1, 1, 7] });
    expect(ics).toContain("BYDAY=MO,WE,SU");
  });

  it("um grupo sem dia válido sai sem RRULE, e não com um RRULE vazio", async () => {
    const { icsDaPelada } = await import("@/lib/ics");
    // `BYDAY=` vazio é um arquivo que alguns calendários recusam inteiro; a
    // ausência da linha é lida como "evento único", que é a verdade.
    const ics = icsDaPelada({ ...BASE, weekdays: [] });
    expect(ics).not.toContain("RRULE");
    expect(ics).toContain("DTSTART:20260918T230000Z");
  });
});

describe("token de descadastro", () => {
  const USUARIO = "0b6f1a2c-3d4e-4f50-8a9b-0c1d2e3f4a5b";
  const GRUPO = "11111111-2222-4333-8444-555555555555";

  it("assina e relê o alvo", async () => {
    const { assinarDescadastro, lerDescadastro } = await import("@/lib/descadastro");
    const token = assinarDescadastro({ userId: USUARIO, playGroupId: GRUPO });
    expect(lerDescadastro(token)).toEqual({ userId: USUARIO, playGroupId: GRUPO });
  });

  it("aceita o alvo sem grupo — 'desliga tudo'", async () => {
    const { assinarDescadastro, lerDescadastro } = await import("@/lib/descadastro");
    const token = assinarDescadastro({ userId: USUARIO, playGroupId: null });
    expect(lerDescadastro(token)).toEqual({ userId: USUARIO, playGroupId: null });
  });

  it("recusa payload adulterado", async () => {
    const { assinarDescadastro, lerDescadastro } = await import("@/lib/descadastro");
    const outro = "99999999-8888-4777-8666-555555555555";
    const token = assinarDescadastro({ userId: USUARIO, playGroupId: GRUPO });

    // Troca o corpo mantendo a assinatura: é o ataque óbvio — descadastrar
    // outra pessoa.
    const corpoFalso = Buffer.from(JSON.stringify({ u: outro }), "utf8").toString("base64url");
    const assinatura = token.slice(token.lastIndexOf(".") + 1);
    expect(lerDescadastro(`${corpoFalso}.${assinatura}`)).toBeNull();
  });

  it("recusa assinatura trocada, token sem ponto e lixo", async () => {
    const { assinarDescadastro, lerDescadastro } = await import("@/lib/descadastro");
    const token = assinarDescadastro({ userId: USUARIO, playGroupId: null });
    const corpo = token.slice(0, token.lastIndexOf("."));

    expect(lerDescadastro(`${corpo}.assinatura-errada`)).toBeNull();
    expect(lerDescadastro(corpo)).toBeNull();
    expect(lerDescadastro("")).toBeNull();
    expect(lerDescadastro(".")).toBeNull();
    // Base64url válido com JSON inválido dentro: não pode LANÇAR, porque esta
    // função roda numa rota que o cliente de e-mail abre sozinho.
    const lixo = Buffer.from("nao é json", "utf8").toString("base64url");
    expect(lerDescadastro(`${lixo}.x`)).toBeNull();
  });

  it("recusa id que não é uuid, mesmo com assinatura boa", async () => {
    const { lerDescadastro } = await import("@/lib/descadastro");
    const { signWithAppSecret } = await import("@/lib/app-secret");
    // O payload é nosso e está assinado — mas um `u` que não é uuid só pode ter
    // vindo de código errado, e ele iria direto para um `WHERE user_id = $1`.
    const corpo = Buffer.from(JSON.stringify({ u: "admin" }), "utf8").toString("base64url");
    expect(lerDescadastro(`${corpo}.${signWithAppSecret(corpo)}`)).toBeNull();
  });

  it("monta as duas URLs: a que a pessoa clica e a que o Gmail chama", async () => {
    const { urlDeDescadastro, urlDeDescadastroUmClique } = await import("@/lib/descadastro");
    const alvo = { userId: USUARIO, playGroupId: GRUPO };
    const base = "https://replayja.com.br";

    // A do rodapé abre uma PÁGINA que explica; a do cabeçalho é a rota de API
    // que aceita o `POST` do RFC 8058. As duas carregam o mesmo token.
    expect(urlDeDescadastro(base, alvo)).toMatch(/^https:\/\/replayja\.com\.br\/descadastro\//);
    expect(urlDeDescadastroUmClique(base, alvo)).toMatch(
      /^https:\/\/replayja\.com\.br\/api\/descadastro\//,
    );
    expect(urlDeDescadastro(base, alvo).split("/descadastro/")[1]).toBe(
      urlDeDescadastroUmClique(base, alvo).split("/descadastro/")[1],
    );
  });
});

describe("e-mails do grupo", () => {
  it("o assunto do resumo é a rodada e a contagem, e nada mais", async () => {
    const { emailResumoDaRodada } = await import("@/lib/email");
    const montado = emailResumoDaRodada({
      grupo: "Fut de Sexta",
      arena: "Arena Vasco",
      dia: "sexta",
      data: "12 set",
      lances: 7,
      thumbs: [],
      url: "https://replayja.com.br/arena-vasco/fut-sexta",
      urlDeDescadastro: "https://replayja.com.br/descadastro/abc.def",
    });
    // Metade das pessoas lê só isto, na notificação do celular.
    expect(montado.subject).toBe("Rodada de sexta: 7 lances");
    expect(montado.text).toContain("https://replayja.com.br/arena-vasco/fut-sexta");
    // O descadastro está no corpo em texto puro TAMBÉM: cliente que só mostra
    // texto não pode esconder a saída.
    expect(montado.text).toContain("https://replayja.com.br/descadastro/abc.def");
    expect(montado.html).toContain("https://replayja.com.br/descadastro/abc.def");
  });

  it("o singular do assunto não sai errado", async () => {
    const { emailResumoDaRodada } = await import("@/lib/email");
    const um = emailResumoDaRodada({
      grupo: "G",
      arena: "A",
      dia: "terça",
      data: "9 set",
      lances: 1,
      thumbs: [],
      url: "https://x/y",
      urlDeDescadastro: "https://x/d",
    });
    expect(um.subject).toBe("Rodada de terça: 1 lance");
  });

  it("o convite diz quem chamou, e escapa o que veio de fora", async () => {
    const { emailConviteDeGrupo } = await import("@/lib/email");
    const montado = emailConviteDeGrupo({
      grupo: "Fut <script>",
      arena: "Arena & Cia",
      convidadoPor: "Gabriel",
      quando: "Toda sexta, das 20:00 às 21:00.",
      url: "https://replayja.com.br/convite/abc",
      validadeDias: 14,
    });
    expect(montado.subject).toBe("Gabriel te chamou pro Fut <script>");
    // O nome do grupo é digitado por um usuário e vai parar num HTML.
    expect(montado.html).toContain("Fut &lt;script&gt;");
    expect(montado.html).not.toContain("<script>");
    expect(montado.html).toContain("Arena &amp; Cia");
    expect(montado.text).toContain("O convite vale por 14 dias.");
  });

  it("o convite sem nome de quem chamou continua fazendo sentido", async () => {
    const { emailConviteDeGrupo } = await import("@/lib/email");
    const montado = emailConviteDeGrupo({
      grupo: "Fut de Sexta",
      arena: "Arena Vasco",
      convidadoPor: null,
      url: "https://replayja.com.br/convite/abc",
    });
    expect(montado.subject).toBe("Te chamaram pro Fut de Sexta");
  });

  it("o cabeçalho de descadastro habilita o um clique do RFC 8058", async () => {
    const { cabecalhosDeDescadastro } = await import("@/lib/email");
    const h = cabecalhosDeDescadastro("https://replayja.com.br/api/descadastro/abc.def");
    // Sem os DOIS cabeçalhos o Gmail não mostra o botão nativo — e quem não
    // acha "cancelar inscrição" aperta "isto é spam", que queima o domínio que
    // também manda o código de login.
    expect(h["List-Unsubscribe"]).toBe("<https://replayja.com.br/api/descadastro/abc.def>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

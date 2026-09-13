"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "./Button";
import { copiarTexto, linkDoWhatsApp } from "./ShareBar";
import { useToast } from "./Toast";
import css from "./InviteSheet.module.css";

/**
 * O convite do grupo: link, WhatsApp e e-mail.
 *
 * ─── TRÊS CAMINHOS PORQUE O GRUPO É COMO O PARCEIRO CAPTURA E-MAIL ─────────
 *
 * A página do grupo abre em modo LEITURA para convidado; entrar vira membro e
 * liga o aviso semanal (decisão 8 do design). O convite é o que move alguém de
 * "vi o link" para "recebo sozinho" — então ele tem de caber no meio em que a
 * pelada já conversa (WhatsApp), no que a arena usa para lista (e-mail) e no
 * genérico (link copiado).
 */

export type ResultadoDoEnvio = "enviado" | "sem-provedor" | "falhou";

export type InviteSheetProps = {
  aberto: boolean;
  onFechar: () => void;
  /** O link do grupo. */
  url: string;
  titulo?: string;
  texto?: string;
  /** Nome do grupo, usado na mensagem pronta. */
  nomeDoGrupo: string;
  /**
   * Manda o convite por e-mail pelo Resend. Sem ela, o botão de e-mail continua
   * sendo o `mailto:` de sempre — que abre o app de e-mail da pessoa.
   */
  aoEnviarEmail?: (email: string) => Promise<ResultadoDoEnvio>;
  /** Quantos dias o convite vale. Aparece na folha, e é para aparecer. */
  validadeEmDias?: number;
};

export function InviteSheet({
  aberto,
  onFechar,
  url,
  titulo = "Chamar a galera",
  texto = "Quem entrar pelo convite passa a receber os lances desse horário.",
  nomeDoGrupo,
  aoEnviarEmail,
  validadeEmDias,
}: InviteSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { mostrar } = useToast();
  const [copiado, setCopiado] = useState(false);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    // `showModal` é o que liga a trava de foco e o `::backdrop`. `open={aberto}`
    // no JSX abriria o diálogo NÃO modal — sem trava e sem Esc.
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  const mensagem = `Entra no ${nomeDoGrupo} no Replay já — os lances da pelada ficam salvos aqui:`;

  async function aoCopiar() {
    const ok = await copiarTexto(url);
    setCopiado(ok);
    mostrar(ok ? "Link copiado" : "Não consegui copiar o link.", ok ? "ok" : "erro", 2500);
    if (ok) setTimeout(() => setCopiado(false), 2500);
  }

  /**
   * O envio por e-mail nunca "falha" a ponto de deixar a folha inútil.
   *
   * O envio pode falhar por teto de plano, endereço inexistente ou provedor
   * fora do ar — e a resposta certa é lembrar que o WhatsApp e o link continuam
   * ali em cima, não pintar a folha de vermelho.
   */
  async function aoMandarEmail(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!aoEnviarEmail) return;
    const destino = email.trim();
    if (!destino) return;

    setEnviando(true);
    try {
      const r = await aoEnviarEmail(destino);
      if (r === "enviado") {
        setEnviadoPara(destino);
        setEmail("");
        mostrar(`Convite a caminho de ${destino}.`, "ok");
      } else {
        mostrar("O e-mail não saiu. Manda o link pelo WhatsApp — ele funciona sempre.", "erro");
      }
    } catch {
      mostrar("O e-mail não saiu. Manda o link pelo WhatsApp — ele funciona sempre.", "erro");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={ref}
      /*
        `luz` é a classe GLOBAL da paleta clara, e ela não é enfeite: a folha é
        aberta de dentro do cabeçalho `.tinta` do grupo, e um `<dialog>` herda
        as variáveis do pai no DOM mesmo subindo para a camada de topo. Sem ela
        a folha pedia `--cor-superficie` e recebia 7% de branco — ou seja,
        aparecia transparente.
      */
      className={`${css.sheet} luz`}
      aria-label={titulo}
      // Clicar fora (no `::backdrop`) fecha — é o gesto esperado numa sheet.
      onClick={(e) => {
        if (e.target === ref.current) onFechar();
      }}
      onClose={onFechar}
    >
      <div className={css.alca} aria-hidden="true" />
      <h2 className={css.titulo}>{titulo}</h2>
      <p className={css.texto}>{texto}</p>

      <div className={css.linkCaixa}>
        <input
          className={css.link}
          value={url}
          readOnly
          aria-label="Link do grupo"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className={css.copiar} onClick={aoCopiar}>
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>

      <div className={css.acoes}>
        <Button
          href={linkDoWhatsApp(mensagem, url)}
          target="_blank"
          rel="noopener noreferrer"
          variante="secundario"
          icone={<MessageCircle size={18} />}
          largura="total"
        >
          Chamar no WhatsApp
        </Button>
        {aoEnviarEmail ? null : (
          <Button
            href={`mailto:?subject=${encodeURIComponent(`Entra no ${nomeDoGrupo}`)}&body=${encodeURIComponent(
              `${mensagem}\n${url}`,
            )}`}
            variante="secundario"
            icone={<Mail size={18} />}
            largura="total"
          >
            Convidar por e-mail
          </Button>
        )}
      </div>

      {aoEnviarEmail ? (
        <form className={css.email} onSubmit={aoMandarEmail}>
          <label className={css.emailRotulo} htmlFor="convite-email">
            Ou manda por e-mail
          </label>
          <div className={css.emailLinha}>
            <input
              id="convite-email"
              className={css.emailCampo}
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="nome@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" tamanho={44} carregando={enviando} disabled={!email.trim()}>
              {enviadoPara && !email.trim() ? "Reenviar" : "Mandar"}
            </Button>
          </div>
          {enviadoPara ? (
            <p className={css.emailAviso} aria-live="polite">
              Mandei para {enviadoPara}. Não chegou? Confere o spam — ou manda o link pelo
              WhatsApp.
            </p>
          ) : null}
        </form>
      ) : null}

      {validadeEmDias ? (
        <p className={css.validade}>
          Este convite vale por {validadeEmDias} dias. Quem cuida do grupo pode cortá-lo a
          qualquer momento em &ldquo;Arrumar o grupo&rdquo;.
        </p>
      ) : null}

      <button type="button" className={css.fechar} onClick={onFechar}>
        Fechar
      </button>
    </dialog>
  );
}

export default InviteSheet;

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

export type InviteSheetProps = {
  aberto: boolean;
  onFechar: () => void;
  /** O link do grupo. */
  url: string;
  titulo?: string;
  texto?: string;
  /** Nome do grupo, usado na mensagem pronta. */
  nomeDoGrupo: string;
};

export function InviteSheet({
  aberto,
  onFechar,
  url,
  titulo = "Chamar a galera",
  texto = "Quem entrar pelo convite passa a receber os lances desse horário.",
  nomeDoGrupo,
}: InviteSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { mostrar } = useToast();
  const [copiado, setCopiado] = useState(false);

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

  return (
    <dialog
      ref={ref}
      className={css.sheet}
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
      </div>

      <button type="button" className={css.fechar} onClick={onFechar}>
        Fechar
      </button>
    </dialog>
  );
}

export default InviteSheet;

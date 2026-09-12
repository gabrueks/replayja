"use client";

import { useState } from "react";
import { Check, Download, Link2, MessageCircle } from "lucide-react";
import { useToast } from "./Toast";
import css from "./ShareBar.module.css";

/**
 * Baixar · WhatsApp · Instagram · Copiar link.
 *
 * ─── TRÊS CAMINHOS, NESTA ORDEM ────────────────────────────────────────────
 *
 * 1. `navigator.share` COM ARQUIVO. É o único jeito de o vídeo chegar ao
 *    Instagram pelo navegador: o Instagram não tem intent de web, mas aceita o
 *    arquivo pela folha de compartilhamento do sistema. Testado por
 *    `navigator.canShare({ files })` — `canShare` sem argumento mente.
 * 2. `navigator.share` SÓ COM LINK. Serve para qualquer app e é o que roda em
 *    iOS quando o arquivo é grande demais.
 * 3. FALLBACK DE WEB. `wa.me` para o WhatsApp, download direto pelo `<a download>`
 *    e cópia para a área de transferência. É o que roda no desktop, onde
 *    `navigator.share` não existe em boa parte dos navegadores.
 *
 * ─── O QUE NÃO DÁ PARA CONSERTAR AQUI ──────────────────────────────────────
 *
 * `<a download>` só funciona em MESMA ORIGEM. O clipe vem do CloudFront, então o
 * atributo é ignorado e o navegador NAVEGA para o vídeo. Por isso `urlDoArquivo`
 * deve apontar para uma rota nossa que devolva `Content-Disposition: attachment`
 * (pendência registrada em `web/docs/design-system.md`).
 */

export type ShareBarProps = {
  /** O link público do lance/sessão/grupo. */
  url: string;
  /** Título que vai na folha de compartilhamento. */
  titulo: string;
  /** Texto que acompanha o link no WhatsApp. */
  texto?: string;
  /** URL do arquivo para baixar. Sem ela, "Baixar" fica desabilitado. */
  urlDoArquivo?: string | null;
  /** Nome sugerido do arquivo: "arena-calabouco-20-47.mp4". */
  nomeDoArquivo?: string;
  /** A linha explicativa embaixo da barra. */
  nota?: string;
  /** Quando o atleta não está logado, as ações levam ao login em vez de agir. */
  hrefDeLogin?: string | null;
};

/**
 * O glifo do Instagram desenhado à mão.
 *
 * A `lucide-react` tirou os ícones de marca na v1 (questão de licença de
 * trademark), então o que sobra é um contorno genérico de câmera — quadrado com
 * cantos arredondados, círculo e ponto. Traço 1.8 para casar com o resto dos
 * ícones do sistema.
 */
function IconeInstagram({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Copia um texto com o caminho moderno e o antigo. Exportado para os testes. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Contexto inseguro (http) ou permissão negada: cai no caminho antigo.
  }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(campo);
    return ok;
  } catch {
    return false;
  }
}

/** Monta o link de fallback do WhatsApp. Exportado para os testes. */
export function linkDoWhatsApp(texto: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`.trim())}`;
}

async function arquivoParaCompartilhar(
  urlDoArquivo: string,
  nome: string,
): Promise<File | null> {
  try {
    const resposta = await fetch(urlDoArquivo);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return new File([blob], nome, { type: blob.type || "video/mp4" });
  } catch {
    return null;
  }
}

export function ShareBar({
  url,
  titulo,
  texto,
  urlDoArquivo,
  nomeDoArquivo = "lance.mp4",
  nota,
  hrefDeLogin,
}: ShareBarProps) {
  const { mostrar } = useToast();
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const mensagem = texto ?? `Olha esse lance: ${titulo}`;

  /** Tenta a folha do sistema; devolve false quando não rolou (aí vai o fallback). */
  async function compartilharNativo(comArquivo: boolean): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.share) return false;

    if (comArquivo && urlDoArquivo && typeof navigator.canShare === "function") {
      const arquivo = await arquivoParaCompartilhar(urlDoArquivo, nomeDoArquivo);
      if (arquivo && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: titulo, text: mensagem });
          return true;
        } catch (e) {
          // Cancelar não é erro: a pessoa fechou a folha de propósito.
          if (e instanceof Error && e.name === "AbortError") return true;
        }
      }
    }

    try {
      await navigator.share({ title: titulo, text: mensagem, url });
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return true;
      return false;
    }
  }

  async function aoWhatsApp() {
    if (hrefDeLogin) return;
    setOcupado("whatsapp");
    try {
      const deu = await compartilharNativo(false);
      if (!deu) window.open(linkDoWhatsApp(mensagem, url), "_blank", "noopener,noreferrer");
    } finally {
      setOcupado(null);
    }
  }

  async function aoInstagram() {
    if (hrefDeLogin) return;
    setOcupado("instagram");
    try {
      const deu = await compartilharNativo(true);
      if (!deu) {
        // O Instagram não aceita link de vídeo pela web. Sem folha de
        // compartilhamento, o caminho honesto é baixar e postar pelo app.
        mostrar("Baixe o vídeo e poste pelo app do Instagram.", "info");
      }
    } finally {
      setOcupado(null);
    }
  }

  async function aoCopiar() {
    if (hrefDeLogin) return;
    const ok = await copiarTexto(url);
    if (ok) {
      setCopiado(true);
      mostrar("Link copiado", "ok", 2500);
      setTimeout(() => setCopiado(false), 2500);
    } else {
      mostrar("Não consegui copiar. Selecione o link e copie à mão.", "erro");
    }
  }

  const podeBaixar = Boolean(urlDoArquivo);

  /*
   * DESLOGADO, AS QUATRO AÇÕES VIRAM UM LINK DE LOGIN — e não botões
   * desabilitados. Assistir é público; baixar e compartilhar pedem login
   * (decisão 7 do design). Um botão cinza não explica isso; um link que leva ao
   * login, e volta para cá depois, explica.
   */
  if (hrefDeLogin) {
    return (
      <div>
        <div className={css.barra}>
          <a className={`${css.acao} ${css.principal}`} href={hrefDeLogin}>
            <span className={css.icone} aria-hidden="true">
              <Download size={20} />
            </span>
            Entrar para baixar
          </a>
          <a className={css.acao} href={hrefDeLogin}>
            <span className={`${css.icone} ${css.whatsapp}`} aria-hidden="true">
              <MessageCircle size={18} />
            </span>
            WhatsApp
          </a>
          <a className={css.acao} href={hrefDeLogin}>
            <span className={css.icone} aria-hidden="true">
              <IconeInstagram size={18} />
            </span>
            Instagram
          </a>
          <a className={css.acao} href={hrefDeLogin}>
            <span className={css.icone} aria-hidden="true">
              <Link2 size={18} />
            </span>
            Copiar link
          </a>
        </div>
        {nota ? <p className={css.nota}>{nota}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className={css.barra}>
        <a
          className={`${css.acao} ${css.principal}`}
          href={urlDoArquivo ?? "#"}
          download={nomeDoArquivo}
          aria-disabled={podeBaixar ? undefined : true}
          onClick={(e) => {
            if (!podeBaixar) e.preventDefault();
          }}
        >
          <span className={css.icone} aria-hidden="true">
            <Download size={20} />
          </span>
          Baixar em alta
        </a>

        <button
          type="button"
          className={css.acao}
          onClick={aoWhatsApp}
          disabled={ocupado === "whatsapp"}
        >
          <span className={`${css.icone} ${css.whatsapp}`} aria-hidden="true">
            <MessageCircle size={18} />
          </span>
          WhatsApp
        </button>

        <button
          type="button"
          className={css.acao}
          onClick={aoInstagram}
          disabled={ocupado === "instagram"}
        >
          <span className={css.icone} aria-hidden="true">
            <IconeInstagram size={18} />
          </span>
          Instagram
        </button>

        <button type="button" className={css.acao} onClick={aoCopiar}>
          <span className={css.icone} aria-hidden="true">
            {copiado ? <Check size={18} /> : <Link2 size={18} />}
          </span>
          {copiado ? "Copiado" : "Copiar link"}
        </button>
      </div>

      {nota ? <p className={css.nota}>{nota}</p> : null}
    </div>
  );
}

export default ShareBar;

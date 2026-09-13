"use client";

import { useState } from "react";
import { Check, Download, Link2 } from "lucide-react";
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

/**
 * O que registrar em `share_event` quando a pessoa compartilha.
 *
 * Opcional: sem isto a barra continua funcionando e nada é gravado — é assim
 * que ela roda no catálogo `/dev/ui` e nos testes, sem banco nem rede.
 */
export type RegistroDeCompartilhamento = {
  partnerId: string;
  alvo: "clip" | "session" | "group" | "partner";
  clipId?: string | null;
};

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
  /**
   * O título acima da barra — a folha de voz da v2 manda "Achou o golaço? Manda
   * pro grupo." Fica opcional porque quem já está dentro de uma `Secao` com
   * título não pode ganhar um segundo `<h2>` com o mesmo assunto.
   */
  chamada?: string;
  /** A linha explicativa embaixo da barra. */
  nota?: string;
  /** Quando o atleta não está logado, as ações levam ao login em vez de agir. */
  hrefDeLogin?: string | null;
  /** Quando presente, cada canal usado vira uma linha de `share_event`. */
  registro?: RegistroDeCompartilhamento | null;
};

/**
 * Os glifos de marca, desenhados à mão.
 *
 * A `lucide-react` tirou os ícones de marca na v1 (questão de licença de
 * trademark), e o que sobra é um contorno genérico que ninguém reconhece. Como a
 * v2 dá IDENTIDADE aos dois canais — verde cheio no WhatsApp, gradiente no
 * Instagram — o glifo genérico passou a destoar: um balão de conversa dentro de
 * um botão `#25D366` lê como erro, não como WhatsApp.
 *
 * Os dois desenhos abaixo são os únicos do produto fora do set de contorno, e a
 * razão é a mesma que justifica as cores: identidade de terceiro é reconhecida
 * ou não é — não existe meio-termo estilizado.
 */
function IconeWhatsApp({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2.5c-5.24 0-9.5 4.26-9.5 9.5 0 1.68.44 3.32 1.28 4.77L2.5 21.5l4.86-1.27a9.46 9.46 0 0 0 4.68 1.22h.01c5.24 0 9.5-4.26 9.5-9.5s-4.26-9.45-9.51-9.45zm5.53 13.42c-.24.66-1.39 1.27-1.9 1.32-.49.05-.95.23-3.2-.67-2.7-1.06-4.4-3.8-4.53-3.98-.13-.18-1.08-1.44-1.08-2.74s.69-1.94.93-2.2c.24-.27.53-.33.7-.33h.5c.16 0 .38-.06.59.45.22.53.74 1.84.8 1.97.07.13.11.29.02.47-.09.18-.13.29-.26.44l-.39.46c-.13.13-.26.27-.11.53.15.26.66 1.1 1.42 1.78.98.87 1.8 1.14 2.06 1.27.26.13.41.11.56-.07.15-.18.65-.76.82-1.02.18-.26.35-.22.59-.13.24.09 1.55.73 1.81.86.26.13.44.2.5.31.07.11.07.62-.17 1.28z" />
    </svg>
  );
}

function IconeInstagram({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="16.8" cy="7.2" r="1.1" fill="currentColor" stroke="none" />
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
  chamada,
  nota,
  hrefDeLogin,
  registro,
}: ShareBarProps) {
  const { mostrar } = useToast();
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const mensagem = texto ?? `Olha esse lance: ${titulo}`;

  /**
   * Grava o evento e SEGUE EM FRENTE — nunca espera, nunca falha visivelmente.
   *
   * Compartilhar é a ação; a métrica é efeito colateral. `keepalive` faz a
   * requisição sobreviver à navegação que o `wa.me` provoca no mesmo instante —
   * sem ele, metade dos eventos de WhatsApp seria perdida no desktop, que é
   * justamente onde o fallback de web é usado.
   */
  function registrarCanal(canal: string) {
    if (!registro) return;
    try {
      void fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...registro, canal }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Navegador sem `fetch` (ou test env sem rede): a barra continua servindo.
    }
  }

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
    registrarCanal("whatsapp");
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
    registrarCanal("instagram");
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
      registrarCanal("copy_link");
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
      <div className={css.raiz}>
        {chamada ? <h2 className={css.chamada}>{chamada}</h2> : null}
        <div className={css.barra}>
          <a className={`${css.acao} ${css.whatsapp}`} href={hrefDeLogin}>
            <IconeWhatsApp size={22} />
            WhatsApp
          </a>
          <a className={`${css.ladrilho} ${css.instagram}`} href={hrefDeLogin} aria-label="Entrar para mandar no Instagram">
            <IconeInstagram size={24} />
          </a>
          <a className={css.ladrilho} href={hrefDeLogin} aria-label="Entrar para baixar o vídeo">
            <Download size={23} strokeWidth={2.2} aria-hidden="true" />
          </a>
          <a className={css.ladrilho} href={hrefDeLogin} aria-label="Entrar para copiar o link">
            <Link2 size={23} strokeWidth={2.2} aria-hidden="true" />
          </a>
        </div>
        {nota ? <p className={css.nota}>{nota}</p> : null}
      </div>
    );
  }

  return (
    <div className={css.raiz}>
      {chamada ? <h2 className={css.chamada}>{chamada}</h2> : null}

      {/*
        O WHATSAPP É O BOTÃO, OS OUTROS SÃO LADRILHOS.
        Não é hierarquia inventada: no Brasil o vídeo da pelada vai para o grupo
        do WhatsApp, e os outros três canais somados não chegam perto. Dar a ele
        o verde da marca e a largura toda economiza um toque na ação que 9 em 10
        pessoas vão fazer — e o resto continua a um toque de distância, com alvo
        de 58px, não escondido atrás de um "mais".
      */}
      <div className={css.barra}>
        <button
          type="button"
          className={`${css.acao} ${css.whatsapp}`}
          onClick={aoWhatsApp}
          disabled={ocupado === "whatsapp"}
        >
          <IconeWhatsApp size={22} />
          WhatsApp
        </button>

        <button
          type="button"
          className={`${css.ladrilho} ${css.instagram}`}
          onClick={aoInstagram}
          disabled={ocupado === "instagram"}
          aria-label="Mandar no Instagram"
        >
          <IconeInstagram size={24} />
        </button>

        <a
          className={css.ladrilho}
          href={urlDoArquivo ?? "#"}
          download={nomeDoArquivo}
          aria-label="Baixar em alta"
          aria-disabled={podeBaixar ? undefined : true}
          onClick={(e) => {
            if (!podeBaixar) e.preventDefault();
          }}
        >
          <Download size={23} strokeWidth={2.2} aria-hidden="true" />
        </a>

        <button
          type="button"
          className={css.ladrilho}
          onClick={aoCopiar}
          aria-label={copiado ? "Link copiado" : "Copiar link"}
        >
          {copiado ? (
            <Check size={23} strokeWidth={2.6} aria-hidden="true" />
          ) : (
            <Link2 size={23} strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>
      </div>

      {nota ? <p className={css.nota}>{nota}</p> : null}
    </div>
  );
}

export default ShareBar;

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Mail } from "lucide-react";
import { Button, CodeInput, Input } from "@/components/ui";
import css from "./login.module.css";

/**
 * As duas etapas do login (e-mail → código), agora com os componentes do design
 * system. O COMPORTAMENTO é o mesmo da B3 — nenhuma chamada de API mudou.
 *
 * ─── POR QUE DUAS ETAPAS ───────────────────────────────────────────────────
 *
 * A tela do código tem estados próprios (reenvio com contagem, trocar e-mail,
 * código errado). Misturá-los com o campo de e-mail produz um formulário que não
 * sabe o que está pedindo (decisão 3 do design).
 *
 * O mesmo fluxo serve CADASTRO e LOGIN: se o e-mail não existe, a conta é criada
 * na verificação. O atleta nunca vê a distinção — é isso que faz o login "sem
 * fricção" ser o diferencial identificado em `concorrentes.md`.
 */

type Etapa = "email" | "codigo";
type Problema = { detail?: string; title?: string };

const REENVIO_S = 60;

function contagem(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function FormularioDeLogin({
  redirectTo,
  partnerSlug,
  googleDisponivel,
}: {
  redirectTo?: string;
  partnerSlug?: string;
  googleDisponivel: boolean;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [faltaParaReenvio, setFaltaParaReenvio] = useState(0);

  // A contagem do reenvio. Sem ela, o atleta que não recebeu o e-mail fica
  // apertando "reenviar" e queima o próprio balde de rate limit.
  useEffect(() => {
    if (faltaParaReenvio <= 0) return;
    const t = setTimeout(() => setFaltaParaReenvio((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [faltaParaReenvio]);

  async function mensagemDeErro(res: Response): Promise<string> {
    try {
      const p = (await res.json()) as Problema;
      // `detail` já vem escrito em pt-BR e pronto para exibir (RFC 9457,
      // `api/README.md` §6) — não é mensagem de log.
      return p.detail ?? p.title ?? "Não foi possível continuar.";
    } catch {
      return "Não foi possível continuar.";
    }
  }

  async function pedirCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo, partnerSlug }),
      });
      if (!res.ok) {
        setErro(await mensagemDeErro(res));
        return;
      }
      setEtapa("codigo");
      setFaltaParaReenvio(REENVIO_S);
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function conferirCodigo(valor?: string) {
    const codigoFinal = valor ?? codigo;
    if (codigoFinal.length !== 6) return;
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: codigoFinal }),
      });
      if (!res.ok) {
        setErro(await mensagemDeErro(res));
        return;
      }
      const dados = (await res.json()) as { redirectTo?: string };
      const destino = redirectTo ?? dados.redirectTo ?? "/app";
      // `refresh` antes do `push`: os Server Components já renderizados não
      // conhecem o cookie novo, e sem isso a primeira tela depois do login
      // apareceria deslogada.
      router.refresh();
      router.push(destino);
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const urlGoogle = (() => {
    const p = new URLSearchParams();
    if (redirectTo) p.set("redirectTo", redirectTo);
    if (partnerSlug) p.set("partnerSlug", partnerSlug);
    const q = p.toString();
    return `/api/auth/google/start${q ? `?${q}` : ""}`;
  })();

  if (etapa === "email") {
    return (
      <div className={css.formulario}>
        {googleDisponivel ? (
          <>
            <Button href={urlGoogle} variante="secundario" tamanho={52} largura="total">
              Continuar com o Google
            </Button>
            <p className={css.ou}>ou</p>
          </>
        ) : null}

        <form
          onSubmit={pedirCodigo}
          className={css.formulario}
          // `noValidate`: a validação do navegador mostra balão em inglês em
          // alguns aparelhos. O erro em pt-BR fica no próprio campo.
          noValidate
        >
          <Input
            rotulo="Seu e-mail"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="voce@email.com"
            icone={<Mail size={18} />}
            value={email}
            erro={erro ?? undefined}
            onChange={(ev) => setEmail(ev.target.value)}
          />
          <Button
            type="submit"
            tamanho={56}
            largura="total"
            carregando={ocupado}
            disabled={email.length < 5}
          >
            {ocupado ? "Enviando…" : "Receber código"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className={css.formulario}>
      <button type="button" className={css.voltar} onClick={() => setEtapa("email")}>
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar e trocar e-mail
      </button>

      <div>
        <h2 className={css.tituloEtapa}>Digite o código</h2>
        <p className={css.apoio}>
          Mandamos 6 dígitos para <strong>{email}</strong>. Chega em alguns segundos.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void conferirCodigo();
        }}
        className={css.formulario}
      >
        <CodeInput
          valor={codigo}
          onChange={(v) => {
            setCodigo(v);
            if (erro) setErro(null);
          }}
          // Seis dígitos completos já ENVIAM: colar o código e ainda ter de tocar
          // "Entrar" é um toque a mais sem nenhuma informação nova.
          onCompleto={(v) => void conferirCodigo(v)}
          erro={erro ?? undefined}
          autoFocus
          disabled={ocupado}
        />

        <Button
          type="submit"
          tamanho={56}
          largura="total"
          carregando={ocupado}
          disabled={codigo.length !== 6}
        >
          {ocupado ? "Conferindo…" : "Entrar"}
        </Button>
      </form>

      <div className={css.linhaAcoes}>
        <Button
          variante="fantasma"
          tamanho={44}
          onClick={() => void pedirCodigo()}
          disabled={ocupado || faltaParaReenvio > 0}
        >
          {faltaParaReenvio > 0 ? (
            <>
              Reenviar código em <span className="contador">{contagem(faltaParaReenvio)}</span>
            </>
          ) : (
            "Reenviar código"
          )}
        </Button>
      </div>

      {/*
        "Depois de entrar" é o combinado do canvas: dizer ANTES o que vai
        acontecer tira o medo de perder a tela em que a pessoa estava.
      */}
      <div className={css.depois}>
        <p className="rotulo">Depois de entrar</p>
        <ul className={css.lista}>
          <li>
            <Check size={16} aria-hidden="true" /> Voltamos direto pro lance que você abriu
          </li>
          <li>
            <Check size={16} aria-hidden="true" /> Seus grupos aparecem na aba Grupos
          </li>
        </ul>
        <p className={css.apoio}>
          Não chegou? Confira o spam ou{" "}
          <button type="button" className={css.linkTexto} onClick={() => setEtapa("email")}>
            use outro e-mail
          </button>
          .
        </p>
      </div>
    </div>
  );
}

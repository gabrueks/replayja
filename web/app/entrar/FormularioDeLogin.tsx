"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Search } from "lucide-react";
import { Button, CodeInput, Input, Logo } from "@/components/ui";
import css from "./login.module.css";

/**
 * As duas etapas do login (e-mail → código). O COMPORTAMENTO é o mesmo de antes
 * — nenhuma chamada de API mudou; o que muda é a pele e a voz.
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
 *
 * ─── A VOZ ─────────────────────────────────────────────────────────────────
 *
 * "Seu e-mail, e pronto." / "Chegou." — a frase é a SITUAÇÃO, não a função. E o
 * botão diz "Receber meu código", em primeira pessoa: o produto fala com quem
 * está do outro lado, e não sobre si mesmo.
 */

type Etapa = "email" | "codigo";
type Problema = { detail?: string; title?: string };

const REENVIO_S = 60;

const MENSAGENS_DE_ERRO: Record<string, string> = {
  "google-cancelado": "Você cancelou a entrada pelo Google. Pode tentar de novo ou usar o e-mail.",
  "google-expirado": "A entrada pelo Google demorou demais. Tenta de novo.",
  "google-state": "Não conseguimos confirmar essa entrada. Tenta de novo.",
  "google-invalido": "Algo deu errado na volta do Google. Tenta de novo.",
  "google-falhou": "Não conseguimos entrar pelo Google agora. Usa o seu e-mail.",
};

function contagem(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function FormularioDeLogin({
  redirectTo,
  partnerSlug,
  googleDisponivel,
  erroDeEntrada,
}: {
  redirectTo?: string;
  partnerSlug?: string;
  googleDisponivel: boolean;
  /** O `?erro=` da volta do Google. */
  erroDeEntrada?: string;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(
    erroDeEntrada ? (MENSAGENS_DE_ERRO[erroDeEntrada] ?? null) : null,
  );
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
      setErro("Sem conexão. Tenta de novo.");
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
      setErro("Sem conexão. Tenta de novo.");
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

  /*
    "DEPOIS DISSO" APARECE NAS DUAS ETAPAS.
    Dizer ANTES o que vai acontecer tira o medo de perder a tela em que a pessoa
    estava — e é justamente na etapa do e-mail, antes de digitar, que esse medo
    existe. Deixá-lo só na etapa do código era mostrar a garantia depois de a
    pessoa já ter pagado o preço.
  */
  const depois = (
    <div className={css.depois}>
      <span className={css.depoisIcone} aria-hidden="true">
        <Search size={21} strokeWidth={2.3} />
      </span>
      <span className={css.depoisTextos}>
        <span className={css.depoisTitulo}>Depois disso</span>
        <span className={css.depoisApoio}>
          Você volta direto pra tela que abriu — e seus grupos aparecem na aba Grupos.
        </span>
      </span>
    </div>
  );

  if (etapa === "email") {
    return (
      <>
        {/*
          A FAIXA PRETA COM A MARCA. O login da v1 era um formulário solto no
          alto de uma página vazia; a faixa diz de quem é esta tela num momento
          em que a pessoa acabou de sair de um link do WhatsApp e está decidindo
          se digita o e-mail dela.
        */}
        <header className={`${css.faixa} tinta`}>
          <span className={css.brilho} aria-hidden="true" />
          <div className={css.marca}>
            <Logo tamanho={34} />
          </div>
          <h1 className={css.chamada}>
            Seu e-mail,
            <br />e pronto.
          </h1>
        </header>

        <div className={css.corpo}>
          <p className={css.apoio}>
            A gente só precisa saber pra quem mostrar os lances. Sem senha, sem cadastro, sem
            pegadinha.
          </p>

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
              icone={<Mail size={20} />}
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
              {ocupado ? "Mandando…" : "Receber meu código"}
            </Button>
          </form>

          {googleDisponivel ? (
            <>
              <p className={css.ou}>
                <span>ou</span>
              </p>
              <Button href={urlGoogle} variante="secundario" tamanho={56} largura="total">
                Continuar com o Google
              </Button>
            </>
          ) : null}
        </div>

        {depois}

        <p className={css.rodape}>
          Seu e-mail serve pra achar e compartilhar lance. Só isso.
        </p>
      </>
    );
  }

  return (
    <>
      <header className={`${css.faixa} tinta`}>
        <span className={css.brilho} aria-hidden="true" />
        <div className={css.marca}>
          <button
            type="button"
            className={css.redondo}
            onClick={() => setEtapa("email")}
            aria-label="Voltar e trocar de e-mail"
          >
            <ArrowLeft size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <h1 className={css.chamada}>Chegou.</h1>
        <p className={css.chamadaApoio}>
          Mandamos 6 números pra <strong>{email}</strong>
        </p>
      </header>

      <div className={css.corpo}>
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
            // Seis dígitos completos já ENVIAM: colar o código e ainda ter de
            // tocar "Entrar" é um toque a mais sem nenhuma informação nova.
            onCompleto={(v) => void conferirCodigo(v)}
            erro={erro ?? undefined}
            autoFocus
            disabled={ocupado}
          />

          {/*
            "A gente cola pra você" — o produto em primeira pessoa, e é verdade:
            o `autocomplete="one-time-code"` da primeira caixa faz o iOS oferecer
            o código na barra do teclado. Dizer isso baixa a ansiedade de quem
            está esperando o e-mail chegar.
          */}
          <p className={css.dicaColar}>
            Se o código chegar aqui no celular, a gente cola pra você.
          </p>

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

        <div className={css.reenvio}>
          <span className={css.reenvioTexto}>
            Não chegou?{" "}
            {faltaParaReenvio > 0 ? (
              <span className={css.reenvioContagem}>
                Reenviar em <span className="tempo">{contagem(faltaParaReenvio)}</span>
              </span>
            ) : null}
          </span>
          <Button
            variante="fantasma"
            tamanho={44}
            onClick={() => void pedirCodigo()}
            disabled={ocupado || faltaParaReenvio > 0}
          >
            Reenviar código
          </Button>
          <Button variante="fantasma" tamanho={44} onClick={() => setEtapa("email")}>
            Trocar de e-mail
          </Button>
        </div>
      </div>

      {/*
        "Depois disso" é o combinado do canvas: dizer ANTES o que vai acontecer
        tira o medo de perder a tela em que a pessoa estava.
      */}
      <div className={css.depois}>
        <span className={css.depoisIcone} aria-hidden="true">
          <Search size={21} strokeWidth={2.3} />
        </span>
        <span className={css.depoisTextos}>
          <span className={css.depoisTitulo}>Depois disso</span>
          <span className={css.depoisApoio}>
            Você volta direto pra tela que abriu — e seus grupos aparecem na aba Grupos.
          </span>
        </span>
      </div>
    </>
  );
}

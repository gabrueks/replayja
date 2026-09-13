"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import css from "./Toast.module.css";

/**
 * Aviso passageiro — "Link copiado", "Lance salvo às 20:47", "Sem conexão".
 *
 * ─── POR QUE NÃO É UM ALERT ────────────────────────────────────────────────
 *
 * O toast NUNCA carrega informação que a pessoa precise reler. Ele some. Erro de
 * formulário fica no campo (`Input erro`), confirmação que importa fica na tela
 * (a confirmação "Lance salvo 20:47" do botão virtual é parte do componente, não
 * um toast). Aqui só entra o que é dispensável depois de lido.
 *
 * ─── DUAS REGIÕES, E NÃO UMA (achado P1-22) ────────────────────────────────
 *
 * O comentário aqui já prometia que "o toast de erro sobe para `assertive`". A
 * implementação tinha UMA região `polite` e punha `role="alert"` no item dentro
 * dela — e isso não funciona: a politeness de um anúncio é decidida pela região
 * viva ANCESTRAL mais próxima, não pelo papel do nó inserido. Na prática,
 * "Sem conexão" e "O e-mail não saiu" chegavam atrasados ou não chegavam.
 *
 * Agora são duas regiões irmãs, as duas sempre montadas (uma região viva criada
 * no mesmo instante em que ganha conteúdo costuma não ser anunciada — o leitor
 * de tela precisa já estar observando o nó). O `tom` do item decide em qual ele
 * entra.
 */

export type TomDoToast = "ok" | "erro" | "info";

export type ToastItem = {
  id: string;
  texto: ReactNode;
  tom?: TomDoToast;
  /** Milissegundos até sumir sozinho. 0 mantém até fechar. Padrão 4000. */
  duracao?: number;
};

type Contexto = {
  mostrar: (texto: ReactNode, tom?: TomDoToast, duracao?: number) => void;
};

const ToastContexto = createContext<Contexto | null>(null);

/**
 * Hook para disparar avisos.
 *
 * Fora do `ToastProvider` ele não quebra a tela: devolve um `mostrar` que não faz
 * nada. Um componente de UI derrubar a página por falta de provider é o tipo de
 * acoplamento que trava o desenvolvimento por um detalhe de montagem.
 */
export function useToast(): Contexto {
  const ctx = useContext(ToastContexto);
  return ctx ?? { mostrar: () => {} };
}

const ICONE: Record<TomDoToast, ReactNode> = {
  ok: <Check size={18} />,
  erro: <TriangleAlert size={18} />,
  info: <Info size={18} />,
};

/** O toast em si — exportado separado para o catálogo `/dev/ui` renderizar os estados. */
export function Toast({
  texto,
  tom = "info",
  onFechar,
}: {
  texto: ReactNode;
  tom?: TomDoToast;
  onFechar?: () => void;
}) {
  return (
    <div className={[css.toast, css[tom]].join(" ")}>
      <span className={css.marca} aria-hidden="true">
        {ICONE[tom]}
      </span>
      <span className={css.texto}>{texto}</span>
      {onFechar ? (
        <button type="button" className={css.fechar} onClick={onFechar} aria-label="Fechar aviso">
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([]);
  const contador = useRef(0);

  const fechar = useCallback((id: string) => {
    setItens((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback((texto: ReactNode, tom: TomDoToast = "info", duracao = 4000) => {
    contador.current += 1;
    const id = `toast-${contador.current}`;
    setItens((atuais) => [...atuais, { id, texto, tom, duracao }]);
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <ToastContexto.Provider value={valor}>
      {children}
      {/*
        AS DUAS REGIÕES FICAM SEMPRE MONTADAS, e vazias quando não há aviso. Uma
        região viva que nasce junto com o conteúdo costuma não ser anunciada: o
        leitor de tela precisa já estar observando o nó quando ele muda.

        `role="status"`/`role="alert"` acompanham o `aria-live` no MESMO
        elemento, que é a forma que todos os leitores implementam igual.
      */}
      <div className={css.regiao}>
        <div
          className={css.pilha}
          role="status"
          aria-live="polite"
          aria-atomic="false"
        >
          {itens
            .filter((t) => t.tom !== "erro")
            .map((t) => (
              <ToastComTempo key={t.id} item={t} onFechar={() => fechar(t.id)} />
            ))}
        </div>

        {/*
          O ERRO INTERROMPE. "Sem conexão" que espera a frase atual terminar
          chega depois de a pessoa já ter tocado de novo.
        */}
        <div
          className={css.pilha}
          role="alert"
          aria-live="assertive"
          aria-atomic="false"
        >
          {itens
            .filter((t) => t.tom === "erro")
            .map((t) => (
              <ToastComTempo key={t.id} item={t} onFechar={() => fechar(t.id)} />
            ))}
        </div>
      </div>
    </ToastContexto.Provider>
  );
}

function ToastComTempo({ item, onFechar }: { item: ToastItem; onFechar: () => void }) {
  useEffect(() => {
    const ms = item.duracao ?? 4000;
    if (ms <= 0) return;
    const t = setTimeout(onFechar, ms);
    return () => clearTimeout(t);
  }, [item.duracao, onFechar]);

  // Sem `role` aqui: quem carrega o papel e o `aria-live` é a REGIÃO. Um
  // `role="alert"` aninhado dentro de uma região `polite` é exatamente o que não
  // funcionava antes.
  return <Toast texto={item.texto} tom={item.tom} onFechar={onFechar} />;
}

export default Toast;

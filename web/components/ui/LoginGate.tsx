import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { Clipe } from "./tipos";
import { ClipGrid } from "./ClipGrid";
import css from "./LoginGate.module.css";

/**
 * A PRÉVIA PROTEGIDA — o par do `CtaFixo` no gate do atleta deslogado.
 *
 * ─── O QUE MUDOU NA v2 ─────────────────────────────────────────────────────
 *
 * Na v1 este componente era um card no meio do scroll que carregava a prévia E o
 * botão de entrar. Dois defeitos: o botão sumia assim que a pessoa descia para
 * ver os horários (sinal nº 6 do diagnóstico — a ação principal rolava junto), e
 * o contador ficava espremido dentro da própria moldura.
 *
 * Agora ele faz UMA coisa: a prova de que existe conteúdo. O contador de lances
 * sai para a página, em 34px na cor de ação, e a ação vai para o `CtaFixo` do
 * rodapé, onde ela não rola. O par é sempre esse — nenhuma tela usa um sem o
 * outro.
 *
 * ─── A GRADE BORRADA É DECORAÇÃO, NÃO CONTEÚDO ─────────────────────────────
 *
 * `ClipGrid borrada` a marca `aria-hidden` e `inert`, então quem usa leitor de
 * tela ouve o convite, não seis lances fantasma. Nenhuma miniatura NÍTIDA
 * aparece aqui — thumbnail é a única superfície com imagem de pessoa, e ela fica
 * atrás do login.
 *
 * ─── A PRÉVIA É UM EXEMPLO, E ELA DIZ ISSO (achado P1-8) ──────────────────
 *
 * A página da arena mostrava "0 lances gravados hoje" em 34px e, 40px abaixo,
 * quatro cards borrados — `20:47`, `20:51`, `21:03`, `21:12` — todos rotulados
 * "Hoje · Society" e perfeitamente legíveis. O produto se contradizia na
 * primeira tela que o visitante vê: quem passa o dedo lê "0" e vê quatro.
 *
 * Os cards vêm de `lib/fixtures.ts` e a grade já é `aria-hidden` + `inert`, o
 * que resolve o leitor de tela e não resolve o olho. A regra registrada em
 * `lib/fixtures.ts` sempre foi "toda tela que usa fixture MOSTRA na interface
 * que aquilo é exemplo" — esta não mostrava. Agora mostra, com uma tarja sobre a
 * própria prévia, que é onde o olho está.
 *
 * ─── A MARCA D'ÁGUA É A DO PARCEIRO QUE ESTÁ SENDO VISTO ───────────────────
 *
 * A amostra vinha de `lib/fixtures.ts` com a marca "ARENA CALABOUÇO" queimada
 * dentro dela — então a página da Arena Vasco deslogada exibia a marca de outra
 * arena. `marca` sobrescreve o que vier na amostra; sem ela, a marca some da
 * prévia em vez de mentir.
 */

export type LoginGateProps = {
  titulo?: string;
  descricao?: string;
  /** Amostra para a grade borrada. 4 itens bastam. */
  amostra?: Clipe[];
  /**
   * A marca d'água a desenhar sobre a prévia — o nome DESTA arena, em caixa
   * alta. Sem ela, a prévia sai sem marca nenhuma.
   */
  marca?: string | null;
  /** Conteúdo extra abaixo da prévia (os horários com lance, por exemplo). */
  children?: ReactNode;
};

export function LoginGate({
  titulo = "Seus lances estão aqui.",
  descricao = "A gente só precisa saber quem é você antes de mostrar.",
  amostra = [],
  marca,
  children,
}: LoginGateProps) {
  const previa = amostra.map((c) => ({ ...c, marca: marca ?? undefined }));

  return (
    <div className={css.raiz}>
      <div className={css.moldura}>
        <div className={css.fundo}>
          <ClipGrid clipes={previa} borrada denso />
        </div>

        <span className={css.veu} aria-hidden="true" />

        {/*
          A TARJA DE EXEMPLO. Ela é `aria-hidden` como o resto da moldura
          decorativa — quem usa leitor de tela nunca ouviu os cards falsos, então
          não precisa ouvir o aviso sobre eles; quem os VÊ, precisa.
        */}
        {previa.length > 0 ? (
          <span className={css.exemplo} aria-hidden="true">
            Exemplo
          </span>
        ) : null}

        <span className={css.cadeado} aria-hidden="true">
          <Lock size={22} strokeWidth={2} />
        </span>

        <div className={css.convite}>
          <span className={css.titulo}>{titulo}</span>
          <span className={css.texto}>{descricao}</span>
        </div>
      </div>

      {children}
    </div>
  );
}

export default LoginGate;

import Link from "next/link";
import type { ReactNode } from "react";
import { ArteQuadra } from "./ArteQuadra";
import css from "./PartnerHeader.module.css";

/**
 * O cabeçalho da página do parceiro: capa, brasão, nome, estado e abas.
 *
 * ─── A ARENA QUE PAGA DEIXOU DE SER UM QUADRADINHO ─────────────────────────
 *
 * Sinal nº 7 do diagnóstico: o parceiro aparecia como 64px de gradiente e duas
 * letras. Agora a capa tem 230px, o brasão 74 com orla branca por cima dela, e o
 * nome 30px no display. É a página que a arena divulga no Instagram dela — ela
 * precisa parecer a página DELA.
 *
 * Enquanto a arena não envia a capa (upload no painel, task C9), `ArteQuadra`
 * desenha a quadra à noite. Quando ela envia, a foto entra no mesmo lugar com o
 * mesmo véu por cima — o texto continua legível sobre QUALQUER foto, que é o
 * defeito clássico de hero com imagem do cliente.
 *
 * ─── A FOLHA BRANCA SOBREPÕE A CAPA ────────────────────────────────────────
 *
 * 26px de raio, subindo 26px sobre a foto. É o gesto que separa "o conteúdo da
 * arena" de "a identidade da arena" sem uma linha divisória, e é o que dá a
 * profundidade que um cabeçalho plano não tem.
 *
 * ─── AS ABAS SÃO LINKS, NÃO UM `role="tablist"` ────────────────────────────
 *
 * Cada aba é um endereço (`?aba=grupos`): a arena manda "olha a aba Sobre" no
 * WhatsApp, o botão voltar funciona e o Google indexa a página inteira. Um
 * tablist de verdade guardaria o estado só na memória do navegador e perderia as
 * três coisas. `aria-current="page"` é o que diz "você está aqui" para o leitor
 * de tela; a barra de 3px e o peso do display dizem para o olho.
 */

export type AbaDoParceiro = {
  id: string;
  rotulo: string;
  href: string;
  /**
   * Número ao lado do rótulo ("Grupos 4").
   *
   * `0` NÃO desenha nada — é a mesma regra do `BottomNav`, e o achado P2-28 foi
   * justamente esta aba não a seguir: a arena sem grupo nenhum mostrava um "0"
   * ao lado de "Grupos", que lê como erro de carregamento e não como ausência.
   */
  contagem?: number;
};

export type PartnerHeaderProps = {
  nome: string;
  /**
   * O nome da arena é o `<h1>` da página?
   *
   * Na página da arena, sim — e ela não tinha nenhum (achado P1-18): o nome era
   * um `<span>` e todo o conteúdo começava em `<h2>`, na página pública MAIS
   * importante do produto, a que a arena divulga. Em qualquer outra superfície
   * (o catálogo, uma futura prévia dentro de outra tela) o cabeçalho não é o
   * título do documento, e aí ele continua sendo um `<span>`.
   */
  comoTitulo?: boolean;
  /** Iniciais do brasão quando não há logo — "AV" para Arena Vasco. */
  iniciais: string;
  /** Linha de apoio ao lado do estado: "Piloto do Replay já · 2 quadras". */
  subtitulo?: string;
  logoUrl?: string | null;
  capaUrl?: string | null;
  /** Selo de estado abaixo do nome (use `StatusDot pilula`). */
  estado?: ReactNode;
  /** Ações sobre a capa — voltar à esquerda, compartilhar à direita. */
  acoes?: ReactNode;
  /** Ação no canto esquerdo da capa (o botão redondo de voltar). */
  voltar?: ReactNode;
  abas?: AbaDoParceiro[];
  abaAtiva?: string;
  /** Endereço do brasão/nome (a própria página da arena). */
  href?: string;
  /** Semente da arte de capa — normalmente o slug. */
  semente?: string;
};

export function PartnerHeader({
  nome,
  comoTitulo,
  iniciais,
  subtitulo,
  logoUrl,
  capaUrl,
  estado,
  acoes,
  voltar,
  abas,
  abaAtiva,
  href,
  semente,
}: PartnerHeaderProps) {
  const identidade = (
    <>
      <span className={css.brasao}>
        {logoUrl ? (
          // Image Optimization desligada (ADR §4.1): o logo da arena já é
          // enviado no tamanho certo pelo painel.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" />
        ) : (
          iniciais
        )}
      </span>
      <span className={css.textos}>
        {comoTitulo ? (
          <h1 className={css.nome}>{nome}</h1>
        ) : (
          <span className={css.nome}>{nome}</span>
        )}
      </span>
    </>
  );

  return (
    <header className={css.raiz}>
      <div className={css.capa}>
        {capaUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={css.foto} src={capaUrl} alt="" />
            <span className={css.veu} aria-hidden="true" />
          </>
        ) : (
          <ArteQuadra altura={230} semente={semente ?? nome} />
        )}

        {voltar ? <div className={css.voltar}>{voltar}</div> : null}
        {acoes ? <div className={css.acoesCapa}>{acoes}</div> : null}
      </div>

      <div className={css.folha}>
        <div className={css.identidade}>
          {href ? (
            <Link href={href} className={css.identidadeLink}>
              {identidade}
            </Link>
          ) : (
            identidade
          )}
        </div>

        {estado || subtitulo ? (
          <div className={css.estado}>
            {estado}
            {subtitulo ? <span className={css.sub}>{subtitulo}</span> : null}
          </div>
        ) : null}

        {abas && abas.length > 0 ? (
          <nav className={css.abas} aria-label="Seções da arena">
            {abas.map((a) => (
              <Link
                key={a.id}
                href={a.href}
                className={[css.aba, a.id === abaAtiva ? css.abaAtiva : null]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={a.id === abaAtiva ? "page" : undefined}
                scroll={false}
              >
                {a.rotulo}
                {a.contagem ? (
                  <span className={`${css.contagem} tempo`}>{a.contagem}</span>
                ) : null}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export default PartnerHeader;

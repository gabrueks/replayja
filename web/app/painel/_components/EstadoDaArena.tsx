import { Button, Card, EmptyState, Secao } from "@/components/ui";
import type { ResolucaoDaArena } from "../_lib/arena";
import css from "../painel.module.css";

/**
 * O que a tela mostra quando `resolverArena` diz "não".
 *
 * ─── CINCO MOTIVOS, CINCO SAÍDAS DIFERENTES ────────────────────────────────
 *
 * Um "não foi possível carregar" genérico serve para o programador e para mais
 * ninguém. As cinco situações pedem ações opostas: escolher uma arena, pedir
 * convite, conferir o endereço, esperar o banco voltar. Um texto só transformaria
 * todas em chamado de suporte.
 *
 * O vocabulário segue o catálogo RFC 9457 de `lib/problem.ts`: `forbidden` vira
 * "esta conta não administra", `not-found` nunca distingue "não existe" de "você
 * não pode ver" — a diferença é um oráculo de enumeração de arenas.
 */
export function EstadoDaArena({
  estado,
  titulo,
}: {
  estado: Extract<ResolucaoDaArena, { ok: false }>;
  titulo: string;
}) {
  return (
    <main className={css.pagina} id="conteudo">
      <h1 className={css.titulo}>{titulo}</h1>

      {estado.motivo === "escolher" && (estado.arenas?.length ?? 0) > 0 ? (
        <Secao titulo="Escolha a arena">
          <ul className={css.cameras}>
            {estado.arenas!.map((a) => (
              <li key={a.id}>
                <Card href={`/painel?arena=${a.slug}`} titulo={a.display_name}>
                  <p className="apoio">{a.role}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      {estado.motivo === "escolher" && (estado.arenas?.length ?? 0) === 0 ? (
        <EmptyState
          titulo="Esta conta não administra nenhuma arena"
          descricao="Se você é dono ou gerente de uma arena parceira, peça o convite a quem já administra — ele adiciona o seu e-mail em Equipe."
          acoes={
            <Button href="/app" variante="secundario" largura="total">
              Ir para a área do atleta
            </Button>
          }
        />
      ) : null}

      {estado.motivo === "sem-permissao" ? (
        <EmptyState
          titulo="Sem permissão nesta arena"
          descricao="Esta conta não administra a arena do endereço. Se você administra outra, escolha-a abaixo."
          acoes={
            <Button href="/painel" variante="secundario" largura="total">
              Ver minhas arenas
            </Button>
          }
        />
      ) : null}

      {estado.motivo === "nao-encontrada" ? (
        <EmptyState
          titulo="Arena não encontrada"
          descricao="O endereço não corresponde a nenhuma arena que esta conta administre. Confira o link."
          acoes={
            <Button href="/painel" variante="secundario" largura="total">
              Ver minhas arenas
            </Button>
          }
        />
      ) : null}

      {estado.motivo === "sem-banco" ? (
        <EmptyState
          titulo="Painel indisponível"
          descricao="O banco de dados não respondeu. As câmeras continuam gravando: o que está fora é só esta tela."
          nota="Confira /api/health antes de abrir chamado."
        />
      ) : null}

      {estado.motivo === "sem-sessao" ? (
        <EmptyState
          titulo="Entre para continuar"
          descricao="Sua sessão expirou."
          acoes={
            <Button href="/entrar?redirectTo=/painel" largura="total">
              Entrar
            </Button>
          }
        />
      ) : null}
    </main>
  );
}

export default EstadoDaArena;

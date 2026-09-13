import { Button, Card, EmptyState, Secao } from "@/components/ui";
import type { ResolucaoDaArena } from "../_lib/arena";
import { iniciaisDaArena, rotuloDoPapel } from "../_lib/rotulos";
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
        <Secao titulo="De qual arena a gente está falando?">
          <ul className={css.escolha}>
            {estado.arenas!.map((a) => (
              <li key={a.id}>
                <Card href={`/painel?arena=${a.slug}`}>
                  <span className={css.arena}>
                    <span className={css.brasao} aria-hidden="true">
                      {iniciaisDaArena(a.display_name)}
                    </span>
                    <span className={css.arenaTextos}>
                      <span className={css.arenaNome}>{a.display_name}</span>
                      <span className={css.arenaApoio}>{rotuloDoPapel(a.role)}</span>
                    </span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      {estado.motivo === "escolher" && (estado.arenas?.length ?? 0) === 0 ? (
        <EmptyState
          ilustracao="apito"
          titulo="Esta conta não administra nenhuma arena"
          descricao="Se você é dono ou gerente de uma arena parceira, peça o convite a quem já administra — é só o seu e-mail em Equipe."
          acoes={
            <Button href="/app" variante="preto">
              Ir para a área do atleta
            </Button>
          }
        />
      ) : null}

      {estado.motivo === "sem-permissao" ? (
        <EmptyState
          ilustracao="apito"
          titulo="Sem permissão nesta arena"
          /*
           * A frase cobre AS DUAS situações de propósito: a arena existe e esta
           * conta não administra, ou o endereço não é de arena nenhuma.
           * Distinguir as duas seria dizer a um estranho quais slugs existem
           * (A-12) — e o caso comum, o gerente de duas arenas que colou o link
           * errado, continua sendo atendido pela segunda oração.
           */
          descricao="Esta conta não administra a arena deste endereço — ou o endereço não é de nenhuma arena. Se você administra outra, ela está na lista."
          acoes={
            <Button href="/painel" variante="preto">
              Ver minhas arenas
            </Button>
          }
        />
      ) : null}

      {estado.motivo === "nao-encontrada" ? (
        <EmptyState
          ilustracao="apito"
          titulo="Arena não encontrada"
          descricao="O endereço não corresponde a nenhuma arena que esta conta administre. Confira o link."
          acoes={
            <Button href="/painel" variante="preto">
              Ver minhas arenas
            </Button>
          }
        />
      ) : null}

      {estado.motivo === "sem-banco" ? (
        <EmptyState
          ilustracao="camera"
          titulo="O painel está fora, as câmeras não"
          descricao="O banco de dados não respondeu. A gravação continua acontecendo na quadra: o que caiu é só esta tela."
          nota="Confira /api/health antes de abrir chamado."
        />
      ) : null}

      {estado.motivo === "sem-sessao" ? (
        <EmptyState
          ilustracao="apito"
          titulo="Entre para continuar"
          descricao="Sua sessão expirou."
          acoes={<Button href="/entrar?redirectTo=/painel">Entrar</Button>}
        />
      ) : null}
    </main>
  );
}

export default EstadoDaArena;

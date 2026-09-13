"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button, Card, Input, Secao } from "@/components/ui";
import type { MembroDaEquipeRow } from "@/db/queries/painel-equipe";
import {
  convidarParaArena,
  removerDaArena,
  trocarPapel,
  type ResultadoDaEquipe,
} from "../equipe/acoes";
import SeloDeEstado from "./SeloDeEstado";
import css from "../painel.module.css";

/**
 * A equipe da arena.
 *
 * ─── "AGUARDANDO PRIMEIRO ACESSO" É A LINHA MAIS ÚTIL DA TELA ──────────────
 *
 * Convidar cria a conta e já dá o acesso; a verificação do e-mail acontece no
 * primeiro login (não há senha — entra-se com um código que chega naquele
 * endereço). A consequência a não esquecer é que um e-mail DIGITADO ERRADO vira
 * um admin que nunca aparece, e o dono ficaria esperando.
 *
 * Marcar quem nunca entrou é o que faz o erro de digitação ser visto por quem o
 * cometeu, no mesmo dia.
 */

const PAPEIS = [
  { id: "owner", rotulo: "Dono", explicacao: "muda tudo, inclusive a equipe" },
  { id: "manager", rotulo: "Gerente", explicacao: "opera quadras, câmeras e botões" },
  { id: "viewer", rotulo: "Acompanha", explicacao: "vê os números, não muda nada" },
] as const;

export function Equipe({
  arenaSlug,
  membros,
  euSou,
  meuEmail,
}: {
  arenaSlug: string;
  membros: MembroDaEquipeRow[];
  euSou: "owner" | "manager" | "viewer";
  meuEmail: string;
}) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();
  const [convidando, setConvidando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [recado, setRecado] = useState<ResultadoDaEquipe | null>(null);

  const souDono = euSou === "owner";

  function aplicar(acao: () => Promise<ResultadoDaEquipe>) {
    comEnvio(async () => {
      const r = await acao();
      setRecado(r);
      setConfirmando(null);
      if (r.ok) {
        setConvidando(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      {recado ? (
        <p className={recado.ok ? css.sucesso : css.aviso} role="status">
          {recado.ok ? recado.mensagem : recado.erro}
        </p>
      ) : null}

      <Secao
        titulo={`${membros.length} ${membros.length === 1 ? "pessoa" : "pessoas"}`}
        acao={
          souDono ? (
            <Button
              variante="secundario"
              tamanho={44}
              icone={<UserPlus size={16} />}
              onClick={() => setConvidando((v) => !v)}
            >
              {convidando ? "Cancelar" : "Convidar"}
            </Button>
          ) : undefined
        }
      >
        {convidando ? (
          <Card variante="painel">
            <form
              className={css.form}
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                aplicar(() => convidarParaArena(arenaSlug, dados));
              }}
              noValidate
            >
              <div className={css.formLinha}>
                <Input
                  rotulo="E-mail"
                  name="email"
                  type="email"
                  placeholder="gerente@arena.com.br"
                  maxLength={160}
                  autoComplete="off"
                  required
                />
                <label className={css.campo}>
                  <span className="rotulo">Papel</span>
                  <select className={css.selecao} name="papel" defaultValue="manager">
                    {PAPEIS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.rotulo} — {p.explicacao}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="apoio-3">
                Não há senha: a pessoa entra com um código de 6 dígitos enviado para esse
                endereço. Confira a digitação — um e-mail errado vira um acesso que nunca é usado.
              </p>
              <Button type="submit" tamanho={52} disabled={enviando}>
                {enviando ? "Adicionando…" : "Adicionar à equipe"}
              </Button>
            </form>
          </Card>
        ) : null}

        <ul className={css.linhas}>
          {membros.map((m) => {
            const souEu = m.email.toLowerCase() === meuEmail.toLowerCase();
            return (
              <li key={m.id} className={css.linha}>
                <div className={css.linhaTexto}>
                  <span className={css.tituloComSelo}>
                    <span className={css.linhaTitulo}>{m.display_name ?? m.email}</span>
                    {souEu ? <SeloDeEstado tom="neutro">você</SeloDeEstado> : null}
                    {/*
                      "AGUARDANDO PRIMEIRO ACESSO" É A LINHA MAIS ÚTIL DA TELA,
                      então virou selo: um e-mail digitado errado vira um admin
                      que nunca aparece, e o dono fica esperando. Amarelo porque
                      é algo a conferir, não algo quebrado.
                    */}
                    {m.last_login_at ? null : (
                      <SeloDeEstado tom="atencao">aguardando 1º acesso</SeloDeEstado>
                    )}
                  </span>
                  {m.display_name ? <span className={css.linhaApoio}>{m.email}</span> : null}
                  <span className={css.linhaApoio}>
                    {PAPEIS.find((p) => p.id === m.role)?.rotulo ?? m.role}
                    {m.last_login_at
                      ? ` · último acesso ${new Date(m.last_login_at).toLocaleDateString("pt-BR")}`
                      : ""}
                  </span>

                  {confirmando === m.id ? (
                    <div className={css.aviso} role="alert">
                      <p>
                        Remover tira o acesso de <strong>{m.email}</strong> ao painel desta arena
                        na hora. A conta dela no Replay já continua existindo.
                      </p>
                      <div className={css.linhaAcoes}>
                        <Button
                          variante="perigo"
                          tamanho={44}
                          disabled={enviando}
                          onClick={() => aplicar(() => removerDaArena(arenaSlug, m.id))}
                        >
                          {enviando ? "Removendo…" : "Sim, remover"}
                        </Button>
                        <Button
                          variante="fantasma"
                          tamanho={44}
                          onClick={() => setConfirmando(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {souDono ? (
                  <div className={css.linhaAcoes}>
                    <select
                      className={`${css.selecao} ${css.selecaoCurta}`}
                      aria-label={`Papel de ${m.email}`}
                      defaultValue={m.role}
                      disabled={enviando}
                      onChange={(e) =>
                        aplicar(() =>
                          trocarPapel(
                            arenaSlug,
                            m.id,
                            e.target.value as "owner" | "manager" | "viewer",
                          ),
                        )
                      }
                    >
                      {PAPEIS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                    <Button
                      variante="fantasma"
                      tamanho={44}
                      onClick={() => setConfirmando((v) => (v === m.id ? null : m.id))}
                    >
                      Remover
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <p className="apoio-3">
          A arena precisa de pelo menos um dono ativo — o banco recusa a remoção do último, e a
          tela avisa antes de tentar.
        </p>
      </Secao>
    </>
  );
}

export default Equipe;

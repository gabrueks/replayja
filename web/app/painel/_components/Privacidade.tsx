"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldAlert } from "lucide-react";
import { Button, Card, EmptyState, Input, Secao } from "@/components/ui";
import { DIAS_ISO } from "@/db/queries/painel-rotulos";
import type { BloqueioDaArenaRow, ClipeRemovivelRow, PedidoDeRemocaoRow } from "@/db/queries/painel-privacidade";
import {
  alternarBloqueio,
  criarBloqueioDaArena,
  excluirBloqueio,
  removerLance,
  type ResultadoDaPrivacidade,
} from "../privacidade/acoes";
import SeloDeEstado from "./SeloDeEstado";
import css from "../painel.module.css";

/**
 * Privacidade: horários bloqueados e fila de pedidos de remoção.
 *
 * ─── AS DUAS METADES DA MESMA OBRIGAÇÃO ────────────────────────────────────
 *
 * O bloqueio é a metade PREVENTIVA (item 7 do checklist legal): criança em
 * quadra é o caso em que legítimo interesse não sustenta a gravação, e a única
 * defesa que funciona é não existir clipe para remover.
 *
 * A remoção é a metade REPARADORA, e ela é IRREVERSÍVEL: o arquivo sai do S3. A
 * tela pede confirmação e explica, na mesma frase, o que continua existindo
 * (cópias já baixadas por terceiros) — porque `fluxo-remocao.md` §8 é explícito
 * sobre não prometer o que não podemos cumprir.
 */

const PAPEIS = [
  { id: "titular", rotulo: "A própria pessoa que aparece" },
  { id: "responsavel_menor", rotulo: "Responsável por menor de idade" },
  { id: "terceiro", rotulo: "Outra pessoa" },
  { id: "arena", rotulo: "A arena" },
  { id: "autoridade", rotulo: "Autoridade" },
];

export function Privacidade({
  arenaSlug,
  bloqueios,
  pedidos,
  clipes,
  quadras,
  podeEditar,
}: {
  arenaSlug: string;
  bloqueios: BloqueioDaArenaRow[];
  pedidos: PedidoDeRemocaoRow[];
  clipes: ClipeRemovivelRow[];
  quadras: Array<{ id: string; name: string }>;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();
  const [novoBloqueio, setNovoBloqueio] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [recado, setRecado] = useState<ResultadoDaPrivacidade | null>(null);

  function aplicar(acao: () => Promise<ResultadoDaPrivacidade>) {
    comEnvio(async () => {
      const r = await acao();
      setRecado(r);
      if (r.ok) {
        setNovoBloqueio(false);
        setRemovendo(false);
        router.refresh();
      }
    });
  }

  const pendentes = pedidos.filter((p) => p.status === "recebido" || p.status === "em_analise");

  return (
    <>
      {recado ? (
        <p className={recado.ok ? css.sucesso : css.aviso} role="status">
          {recado.ok ? recado.mensagem : recado.erro}
        </p>
      ) : null}

      <Secao
        titulo="Horários bloqueados"
        acao={
          podeEditar ? (
            <Button
              variante="secundario"
              tamanho={44}
              icone={<Plus size={16} />}
              onClick={() => setNovoBloqueio((v) => !v)}
            >
              {novoBloqueio ? "Cancelar" : "Novo bloqueio"}
            </Button>
          ) : undefined
        }
      >
        <p className="apoio-3">
          Nos horários abaixo o botão <strong>não salva lances</strong>. É o que a lei pede para
          escolinha e turma infantil: criança em quadra é o caso em que não há base legal para
          guardar o vídeo, e a defesa que funciona é não haver clipe para remover depois.
        </p>

        {novoBloqueio ? (
          <Card variante="painel">
            <form
              className={css.form}
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                aplicar(() => criarBloqueioDaArena(arenaSlug, dados));
              }}
              noValidate
            >
              <div className={css.formLinha}>
                <label className={css.campo}>
                  <span className="rotulo">Quadra</span>
                  <select className={css.selecao} name="quadra" defaultValue="todas">
                    <option value="todas">Todas as quadras</option>
                    {quadras.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={css.campo}>
                  <span className="rotulo">Dia da semana</span>
                  <select className={css.selecao} name="dia" defaultValue="1">
                    {DIAS_ISO.map((d) => (
                      <option key={d.iso} value={d.iso}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={css.formLinha}>
                <Input rotulo="Começa às" name="inicio" type="time" required />
                <Input rotulo="Termina às" name="fim" type="time" required />
              </div>
              <Input
                rotulo="Identificação (opcional)"
                name="rotulo"
                placeholder="Escolinha sub-12"
                maxLength={80}
                dica="Não use nome de aluno: este campo aparece no painel e nos registros."
              />
              <p className="apoio-3">
                O bloqueio não atravessa a meia-noite. Para um período que vira o dia, crie dois.
              </p>
              <Button type="submit" tamanho={52} disabled={enviando}>
                {enviando ? "Criando…" : "Criar bloqueio"}
              </Button>
            </form>
          </Card>
        ) : null}

        {bloqueios.length === 0 ? (
          <EmptyState
            ilustracao="apito"
            titulo="Nenhum horário bloqueado"
            descricao="Se a arena tem escolinha, mapeie os horários dela aqui antes da primeira aula gravada — é mais barato não existir clipe do que apagar um."
          />
        ) : (
          <ul className={css.linhas}>
            {bloqueios.map((b) => (
              <li
                key={b.id}
                className={[css.linha, b.active ? null : css.linhaInativa]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className={css.linhaTexto}>
                  <span className={css.tituloComSelo}>
                    <span className={css.linhaTitulo}>
                      {DIAS_ISO.find((d) => d.iso === b.weekday)?.nome ?? b.weekday},{" "}
                      {b.starts_time.slice(0, 5)} às {b.ends_time.slice(0, 5)}
                    </span>
                    {b.active ? (
                      <SeloDeEstado tom="ok">bloqueando</SeloDeEstado>
                    ) : (
                      <SeloDeEstado tom="neutro">desligado</SeloDeEstado>
                    )}
                  </span>
                  <span className={css.linhaApoio}>
                    {b.court ?? "todas as quadras"}
                    {b.label ? ` · ${b.label}` : ""}
                  </span>
                </div>
                {podeEditar ? (
                  <div className={css.linhaAcoes}>
                    <Button
                      variante="secundario"
                      tamanho={44}
                      disabled={enviando}
                      onClick={() => aplicar(() => alternarBloqueio(arenaSlug, b.id, !b.active))}
                    >
                      {b.active ? "Desligar" : "Religar"}
                    </Button>
                    <Button
                      variante="fantasma"
                      tamanho={44}
                      disabled={enviando}
                      onClick={() => aplicar(() => excluirBloqueio(arenaSlug, b.id))}
                    >
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="Pedidos de remoção"
        acao={
          podeEditar ? (
            <Button
              variante={removendo ? "fantasma" : "secundario"}
              tamanho={44}
              icone={<ShieldAlert size={16} />}
              onClick={() => setRemovendo((v) => !v)}
            >
              {removendo ? "Cancelar" : "Remover um lance"}
            </Button>
          ) : undefined
        }
      >
        {removendo ? (
          <Card variante="painel">
            <div className={css.aviso}>
              <p>
                Remover é <strong>irreversível</strong>: o arquivo sai do armazenamento e o link
                para de funcionar. O que <em>não</em> conseguimos apagar são as cópias que alguém
                já baixou — diga isso a quem pediu, em vez de prometer o contrário.
              </p>
            </div>

            <form
              className={css.form}
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                aplicar(() => removerLance(arenaSlug, dados));
              }}
              noValidate
            >
              <label className={css.campo}>
                <span className="rotulo">Lance</span>
                <select className={css.selecao} name="clipe" required defaultValue="">
                  <option value="" disabled>
                    Escolha o lance
                  </option>
                  {clipes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {new Date(c.triggered_at).toLocaleString("pt-BR")} · {c.court} ·{" "}
                      {c.downloads} download(s), {c.shares} compartilhamento(s)
                    </option>
                  ))}
                </select>
              </label>

              <div className={css.formLinha}>
                <label className={css.campo}>
                  <span className="rotulo">Quem pediu</span>
                  <select className={css.selecao} name="papel" defaultValue="titular">
                    {PAPEIS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={css.campo}>
                  <span className="rotulo">Gravidade</span>
                  <select className={css.selecao} name="gravidade" defaultValue="comum">
                    <option value="comum">Comum</option>
                    <option value="menor">Envolve menor de idade</option>
                    <option value="grave">Grave (nudez, violência)</option>
                  </select>
                </label>
              </div>

              <Input
                rotulo="Contato de quem pediu (opcional)"
                name="contato"
                placeholder="email@exemplo.com ou telefone"
                maxLength={160}
                dica="Não peça documento: exigir identificação para apagar a própria imagem é barreira, não segurança."
              />
              <Input
                rotulo="Motivo, como veio (opcional)"
                name="motivo"
                maxLength={300}
              />

              <Button type="submit" variante="perigo" tamanho={52} disabled={enviando}>
                {enviando ? "Removendo…" : "Abrir protocolo e remover"}
              </Button>
            </form>
          </Card>
        ) : null}

        {pedidos.length === 0 ? (
          <EmptyState
            ilustracao="apito"
            titulo="Nenhum pedido de remoção"
            descricao="Quando alguém pedir a remoção de um lance, o protocolo aparece aqui com o que cada camada respondeu — e fica guardado por cinco anos."
          />
        ) : (
          <>
            {pendentes.length > 0 ? (
              <p className="apoio-3">
                {pendentes.length} pedido(s) aguardando. O prazo legal corre a partir do
                recebimento.
              </p>
            ) : null}
            <ul className={css.linhas}>
              {pedidos.map((p) => (
                <li key={p.id} className={css.linha}>
                  <div className={css.linhaTexto}>
                    <span className={css.tituloComSelo}>
                      <span className={`${css.linhaTitulo} tempo`}>{p.protocol}</span>
                      <SeloDeEstado tom={tomDoStatus(p.status)}>
                        {rotuloDoStatus(p.status)}
                      </SeloDeEstado>
                    </span>
                    <span className={css.linhaApoio}>
                      recebido em {new Date(p.received_at).toLocaleString("pt-BR")} ·{" "}
                      {PAPEIS.find((x) => x.id === p.requester_role)?.rotulo ?? p.requester_role}
                      {p.severity !== "comum" ? ` · ${p.severity}` : ""}
                      {p.court ? ` · ${p.court}` : ""}
                    </span>
                    <span className={css.linhaApoio}>
                      {p.target_clip_ids.length} lance(s)
                      {p.executed_at
                        ? ` · executado em ${new Date(p.executed_at).toLocaleString("pt-BR")}`
                        : ""}
                      {p.decidido_por ? ` · por ${p.decidido_por}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Secao>
    </>
  );
}

/**
 * A cor de cada estado do protocolo.
 *
 * Amarelo em tudo que ainda CORRE — o prazo legal começou a contar no
 * recebimento, e um pedido esquecido é a única forma de errar esta tela. Verde
 * só em `concluido`, que é quando todas as camadas implementadas passaram.
 */
function tomDoStatus(status: string): "ok" | "atencao" | "neutro" {
  if (status === "concluido") return "ok";
  if (status === "improcedente" || status === "restaurado") return "neutro";
  return "atencao";
}

function rotuloDoStatus(status: string): string {
  const mapa: Record<string, string> = {
    recebido: "recebido",
    em_analise: "em análise",
    executado: "executado, conferência pendente",
    concluido: "concluído",
    improcedente: "improcedente",
    restaurado: "restaurado",
  };
  return mapa[status] ?? status;
}

export default Privacidade;

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, EmptyState, Input, Secao } from "@/components/ui";
import { normalizarSlug } from "@/lib/slug";
import type { QuadraDoPainelRow } from "@/db/queries/painel-quadras";
import { ESPORTES } from "@/db/queries/painel-rotulos";
import {
  alternarQuadra,
  criarQuadraDaArena,
  editarQuadraDaArena,
  vincularBotao,
  vincularCamera,
  type Resultado,
} from "../quadras/acoes";
import SeloDeEstado from "./SeloDeEstado";
import css from "../painel.module.css";

/**
 * A tela de quadras: criar, editar, desativar e vincular câmera e botão.
 *
 * ─── O ENDEREÇO DA QUADRA SÓ É EDITÁVEL NA CRIAÇÃO ─────────────────────────
 *
 * O slug da quadra é PREFIXO do endereço de sessão que a pelada cola no WhatsApp
 * (`/arena-vasco/s/quadra-1-2026-09-12-20h-21h`, decisão 23 do `README`).
 * Trocá-lo depois quebraria links já compartilhados, e não existe alias de
 * quadra para socorrer — só o de arena. Então o campo aparece na criação e some
 * na edição, em vez de aparecer desabilitado sem explicação.
 *
 * ─── DESATIVAR NÃO É APAGAR, E A QUADRA INATIVA CONTINUA NA LISTA ──────────
 *
 * Uma quadra que some da tela ao ser desativada é uma quadra que ninguém liga de
 * volta. Ela fica esmaecida, com o botão de reativar ao lado.
 */

export type CameraDaLista = { id: string; name: string; court_id: string | null };
export type BotaoDaLista = { id: string; label: string; court_id: string };

export function Quadras({
  arenaSlug,
  quadras,
  cameras,
  botoes,
  podeEditar,
}: {
  arenaSlug: string;
  quadras: QuadraDoPainelRow[];
  cameras: CameraDaLista[];
  botoes: BotaoDaLista[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [recado, setRecado] = useState<Resultado | null>(null);

  function aplicar(acao: () => Promise<Resultado>) {
    comEnvio(async () => {
      const r = await acao();
      setRecado(r);
      if (r.ok) {
        setCriando(false);
        setEditando(null);
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
        titulo={`${quadras.length} ${quadras.length === 1 ? "quadra" : "quadras"}`}
        acao={
          podeEditar ? (
            <Button
              variante="secundario"
              tamanho={44}
              icone={<Plus size={16} />}
              onClick={() => {
                setCriando((v) => !v);
                setEditando(null);
              }}
            >
              {criando ? "Cancelar" : "Nova quadra"}
            </Button>
          ) : undefined
        }
      >
        {criando ? (
          <Card variante="painel">
            <FormularioDeQuadra
              comSlug
              enviando={enviando}
              onEnviar={(dados) => aplicar(() => criarQuadraDaArena(arenaSlug, dados))}
            />
          </Card>
        ) : null}

        {quadras.length === 0 && !criando ? (
          <EmptyState
            ilustracao="quadra"
            titulo="Nenhuma quadra ainda"
            descricao="A quadra é o que liga a câmera ao botão: sem ela o relay não grava e o acionamento é recusado. Comece por aqui."
            acoes={
              podeEditar ? (
                <Button variante="preto" onClick={() => setCriando(true)}>
                  Cadastrar a primeira
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className={css.linhas}>
            {quadras.map((q) => (
              <li
                key={q.id}
                className={[css.linha, q.active ? null : css.linhaInativa]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className={css.linhaTexto}>
                  <span className={css.tituloComSelo}>
                    <span className={css.linhaTitulo}>{q.name}</span>
                    {q.active ? null : <SeloDeEstado tom="neutro">inativa</SeloDeEstado>}
                  </span>
                  <span className={css.linhaApoio}>
                    /{q.slug} · {ESPORTES.find((e) => e.id === q.sport)?.rotulo ?? q.sport} ·{" "}
                    {q.indoor ? "coberta" : "descoberta"}
                    {q.surface ? ` · ${q.surface}` : ""}
                  </span>
                  <span className={css.linhaApoio}>
                    {q.cameras} câmera{q.cameras === 1 ? "" : "s"} · {q.botoes} botão
                    {q.botoes === 1 ? "" : "es"} · {q.lances_30d} lances em 30 dias
                    {q.opens_time && q.closes_time
                      ? ` · abre ${q.opens_time.slice(0, 5)}–${q.closes_time.slice(0, 5)}`
                      : ""}
                  </span>
                  {editando === q.id ? (
                    <FormularioDeQuadra
                      inicial={q}
                      enviando={enviando}
                      onEnviar={(dados) =>
                        aplicar(() => editarQuadraDaArena(arenaSlug, q.id, dados))
                      }
                    />
                  ) : null}
                </div>

                {podeEditar ? (
                  <div className={css.linhaAcoes}>
                    <Button
                      variante="secundario"
                      tamanho={44}
                      onClick={() => setEditando((v) => (v === q.id ? null : q.id))}
                    >
                      {editando === q.id ? "Fechar" : "Editar"}
                    </Button>
                    <Button
                      variante={q.active ? "fantasma" : "secundario"}
                      tamanho={44}
                      disabled={enviando}
                      onClick={() => aplicar(() => alternarQuadra(arenaSlug, q.id, !q.active))}
                    >
                      {q.active ? "Desativar" : "Reativar"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {podeEditar ? (
        <Secao titulo="Vínculos" nivel={2}>
          <Card variante="painel">
            <p className="apoio-3">
              Câmera sem quadra <strong>não é gravada</strong> — o relay só busca as que têm
              destino. Botão sem quadra não existe: ele sempre aponta para uma.
            </p>

            {/*
              `div` e não `label`: um `<label>` com VÁRIOS controles dentro é
              inválido — o rótulo passa a apontar para o primeiro `select` e os
              outros ficam sem nome nenhum para o leitor de tela. Cada `select`
              traz o próprio `aria-label` ("Quadra da câmera Q1"), que é o nome
              que importa aqui.
            */}
            <div className={css.formLinha}>
              <div className={css.campo}>
                <span className="rotulo">Câmeras</span>
                {cameras.length === 0 ? (
                  <span className="apoio-3">Nenhuma câmera cadastrada.</span>
                ) : (
                  cameras.map((c) => (
                    <select
                      key={c.id}
                      className={css.selecao}
                      aria-label={`Quadra da câmera ${c.name}`}
                      defaultValue={c.court_id ?? ""}
                      disabled={enviando}
                      onChange={(e) =>
                        aplicar(() => vincularCamera(arenaSlug, c.id, e.target.value || null))
                      }
                    >
                      <option value="">{c.name} — sem quadra (não grava)</option>
                      {quadras.map((q) => (
                        <option key={q.id} value={q.id}>
                          {c.name} — {q.name}
                        </option>
                      ))}
                    </select>
                  ))
                )}
              </div>

              <div className={css.campo}>
                <span className="rotulo">Botões</span>
                {botoes.length === 0 ? (
                  <span className="apoio-3">Nenhum botão cadastrado.</span>
                ) : (
                  botoes.map((b) => (
                    <select
                      key={b.id}
                      className={css.selecao}
                      aria-label={`Quadra do botão ${b.label}`}
                      defaultValue={b.court_id}
                      disabled={enviando}
                      onChange={(e) => aplicar(() => vincularBotao(arenaSlug, b.id, e.target.value))}
                    >
                      {quadras.map((q) => (
                        <option key={q.id} value={q.id}>
                          {b.label} — {q.name}
                        </option>
                      ))}
                    </select>
                  ))
                )}
              </div>
            </div>
          </Card>
        </Secao>
      ) : null}
    </>
  );
}

function FormularioDeQuadra({
  inicial,
  comSlug,
  enviando,
  onEnviar,
}: {
  inicial?: QuadraDoPainelRow;
  comSlug?: boolean;
  enviando: boolean;
  onEnviar: (dados: FormData) => void;
}) {
  const [nome, setNome] = useState(inicial?.name ?? "");
  const [slugManual, setSlugManual] = useState<string | null>(null);
  const slug = slugManual === null ? normalizarSlug(nome) : normalizarSlug(slugManual);

  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        if (comSlug) dados.set("slug", slug);
        onEnviar(dados);
      }}
      noValidate
    >
      <div className={css.formLinha}>
        <Input
          rotulo="Nome da quadra"
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Quadra 1"
          maxLength={60}
          autoComplete="off"
        />
        <label className={css.campo}>
          <span className="rotulo">Esporte</span>
          <select className={css.selecao} name="esporte" defaultValue={inicial?.sport ?? "society"}>
            {ESPORTES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {comSlug ? (
        <Input
          rotulo="Endereço da quadra"
          value={slugManual ?? slug}
          onChange={(e) => setSlugManual(e.target.value)}
          maxLength={30}
          autoComplete="off"
          dica={`Entra no link da sessão: /…/s/${slug || "quadra-1"}-2026-09-12-20h-21h. Não muda depois.`}
        />
      ) : null}

      <div className={css.formLinha}>
        <Input
          rotulo="Piso (opcional)"
          name="superficie"
          defaultValue={inicial?.surface ?? ""}
          placeholder="grama sintética"
          maxLength={60}
          autoComplete="off"
        />
        <label className={css.interruptor}>
          <input type="checkbox" name="coberta" defaultChecked={inicial?.indoor ?? false} />
          <span>Quadra coberta</span>
        </label>
      </div>

      <div className={css.formLinha}>
        <Input
          rotulo="Abre às"
          name="abre"
          type="time"
          defaultValue={inicial?.opens_time?.slice(0, 5) ?? ""}
        />
        <Input
          rotulo="Fecha às"
          name="fecha"
          type="time"
          defaultValue={inicial?.closes_time?.slice(0, 5) ?? ""}
        />
      </div>
      <p className="apoio-3">
        O horário de funcionamento é o que o relay usa para decidir quando gravar. Fora dele a
        câmera fica ociosa — é metade do custo de disco da arena.
      </p>

      <Button type="submit" tamanho={52} disabled={enviando || nome.trim().length < 2}>
        {enviando ? "Salvando…" : inicial ? "Salvar quadra" : "Criar quadra"}
      </Button>
    </form>
  );
}

export default Quadras;

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button, Chip, ChipFaixa, Input, type Quadra } from "@/components/ui";
import { normalizarSlug } from "@/lib/slug";
import { conferirSlug, criarGrupoDaArena, type EstadoDoSlug } from "./acoes";
import css from "./criar-grupo.module.css";

/**
 * O formulário de "Criar grupo" (artboard `CriarGrupo.dc.html`).
 *
 * ─── O ENDEREÇO É DERIVADO DO NOME ATÉ ALGUÉM MEXER NELE ───────────────────
 *
 * "Fut de segunda" vira `fut-de-segunda` enquanto a pessoa digita, e o preview
 * `replayja.com.br/<arena>/<grupo>` aparece embaixo. Quem toca em "Editar"
 * assume o campo e o nome para de sobrescrevê-lo — senão, cada letra nova no
 * nome apagaria o endereço que a pessoa acabou de escolher.
 *
 * ─── A DISPONIBILIDADE É CONFERIDA NO SERVIDOR, COM ATRASO ─────────────────
 *
 * Só o banco sabe se `fut-segunda` já existe NESTA arena, e a lista de
 * reservados tem regra própria. O atraso de 400 ms existe para não disparar uma
 * ação por tecla; o `pedido` guarda a última chamada e descarta resposta velha,
 * que é o bug clássico deste padrão (a resposta de "fut-seg" chega depois da de
 * "fut-segunda" e o selo passa a mentir).
 */

const DIAS = [
  { iso: 1, curto: "SEG" },
  { iso: 2, curto: "TER" },
  { iso: 3, curto: "QUA" },
  { iso: 4, curto: "QUI" },
  { iso: 5, curto: "SEX" },
  { iso: 6, curto: "SÁB" },
  { iso: 7, curto: "DOM" },
];

export type PreenchimentoDoGrupo = {
  nome?: string;
  dias?: number[];
  inicio?: string;
  fim?: string;
  quadra?: string;
};

export function FormularioDeGrupo({
  arenaSlug,
  arenaNome,
  quadras,
  inicial,
  base,
}: {
  arenaSlug: string;
  arenaNome: string;
  /** `id` é o SLUG da quadra — é ele que vai no formulário e na URL. */
  quadras: Quadra[];
  inicial: PreenchimentoDoGrupo;
  /** "replayja.com.br" — só para o preview do link. */
  base: string;
}) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();

  const [nome, setNome] = useState(inicial.nome ?? "");
  const [slugManual, setSlugManual] = useState<string | null>(null);
  const [dias, setDias] = useState<number[]>(inicial.dias ?? []);
  const [inicio, setInicio] = useState(inicial.inicio ?? "");
  const [fim, setFim] = useState(inicial.fim ?? "");
  const [quadra, setQuadra] = useState(inicial.quadra ?? "todas");
  const [estadoDoSlug, setEstadoDoSlug] = useState<EstadoDoSlug>({ estado: "vazio" });
  const [erro, setErro] = useState<{ campo: string; texto: string } | null>(null);

  const slug = useMemo(
    () => (slugManual === null ? normalizarSlug(nome) : normalizarSlug(slugManual)),
    [nome, slugManual],
  );

  const pedido = useRef(0);
  useEffect(() => {
    if (!slug) {
      setEstadoDoSlug({ estado: "vazio" });
      return;
    }
    const meu = ++pedido.current;
    const t = setTimeout(() => {
      void conferirSlug(arenaSlug, slug).then((r) => {
        if (meu === pedido.current) setEstadoDoSlug(r);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [arenaSlug, slug]);

  function alternarDia(iso: number) {
    setDias((atual) =>
      atual.includes(iso) ? atual.filter((d) => d !== iso) : [...atual, iso].sort((a, b) => a - b),
    );
  }

  const podeEnviar =
    nome.trim().length >= 3 && dias.length > 0 && Boolean(inicio) && Boolean(fim) && !enviando;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("nome", nome.trim());
    dados.set("slug", slug);
    for (const d of dias) dados.append("dias", String(d));
    dados.set("inicio", inicio);
    dados.set("fim", fim);
    dados.set("quadra", quadra);

    comEnvio(async () => {
      const r = await criarGrupoDaArena(arenaSlug, dados);
      if (r.ok) {
        setErro(null);
        router.push(r.href);
        return;
      }
      setErro({ campo: r.campo, texto: r.erro });
    });
  }

  return (
    <form className={css.form} onSubmit={enviar} noValidate>
      <Input
        rotulo="Nome do grupo"
        placeholder="Fut de segunda"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        maxLength={60}
        autoComplete="off"
        {...(erro?.campo === "nome" ? { erro: erro.texto } : {})}
      />

      <div className={css.grupo}>
        <span className="rotulo">Quadra</span>
        <ChipFaixa rotulo="Quadra">
          <Chip selecionado={quadra === "todas"} onClick={() => setQuadra("todas")}>
            Todas
          </Chip>
          {quadras.map((q) => (
            <Chip key={q.id} selecionado={quadra === q.id} onClick={() => setQuadra(q.id)}>
              {q.nome}
              {q.esporte ? ` · ${q.esporte}` : ""}
            </Chip>
          ))}
        </ChipFaixa>
        {erro?.campo === "quadra" ? <p className={css.erro}>{erro.texto}</p> : null}
        <p className="apoio-3">
          Todas as quadras é o padrão. Escolha uma só quando a pelada é sempre no mesmo lugar —
          assim o grupo não mistura o jogo de outra turma no mesmo horário.
        </p>
      </div>

      <div className={css.grupo}>
        <span className="rotulo">Dias da semana</span>
        <div className={css.dias} role="group" aria-label="Dias da semana">
          {DIAS.map((d) => (
            <button
              key={d.iso}
              type="button"
              className={`${css.dia} ${dias.includes(d.iso) ? css.diaAtivo : ""}`}
              aria-pressed={dias.includes(d.iso)}
              onClick={() => alternarDia(d.iso)}
            >
              {d.curto}
            </button>
          ))}
        </div>
        {erro?.campo === "dias" ? <p className={css.erro}>{erro.texto}</p> : null}
      </div>

      <div className={css.horario}>
        <Input
          rotulo="Começa"
          type="time"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
        <Input rotulo="Termina" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
      </div>
      {erro?.campo === "horario" ? <p className={css.erro}>{erro.texto}</p> : null}
      <p className="apoio-3 tempo">Horário da {arenaNome} ({fusoLegivel()}).</p>

      <div className={css.grupo}>
        <div className={css.linhaLink}>
          <span className="rotulo">Link do grupo</span>
          <button
            type="button"
            className={css.editar}
            onClick={() => setSlugManual((atual) => (atual === null ? slug : null))}
          >
            {slugManual === null ? "Editar" : "Usar o nome"}
          </button>
        </div>

        {slugManual === null ? (
          <p className={`${css.preview} tempo`}>
            {base}/{arenaSlug}/<strong>{slug || "…"}</strong>
          </p>
        ) : (
          <Input
            rotulo="Endereço"
            value={slugManual}
            onChange={(e) => setSlugManual(e.target.value)}
            maxLength={30}
            autoComplete="off"
            dica={`${base}/${arenaSlug}/${slug || "…"}`}
          />
        )}

        <p className={css.selo} aria-live="polite">
          {estadoDoSlug.estado === "livre" ? <span className={css.livre}>Disponível</span> : null}
          {estadoDoSlug.estado === "em-uso" ? (
            <span className={css.ocupado}>Já existe um grupo com esse endereço</span>
          ) : null}
          {estadoDoSlug.estado === "invalido" ? (
            <span className={css.ocupado}>{estadoDoSlug.erro}</span>
          ) : null}
        </p>
        {erro?.campo === "slug" ? <p className={css.erro}>{erro.texto}</p> : null}
      </div>

      {erro?.campo === "geral" ? <p className={css.erro}>{erro.texto}</p> : null}

      <Button
        type="submit"
        tamanho={56}
        largura="total"
        icone={<CalendarPlus size={20} />}
        disabled={!podeEnviar}
      >
        {enviando ? "Criando…" : "Criar grupo"}
      </Button>
      <p className="apoio-3">
        Você vira dono do grupo e pode convidar a galera depois. O link fica fixo: toda semana os
        lances daquele horário aparecem sozinhos.
      </p>
    </form>
  );
}

/** O fuso é sempre o da arena; no piloto, um só. Texto curto, sem prometer UTC. */
function fusoLegivel(): string {
  return "horário de Brasília";
}

export default FormularioDeGrupo;

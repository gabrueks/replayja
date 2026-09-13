"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button, Chip, ChipFaixa, Input, useToast, type Quadra } from "@/components/ui";
import { salvarGrupo, type ResultadoDaEdicao } from "../acoes";
import css from "./editar.module.css";

/**
 * O formulário de edição do grupo.
 *
 * ─── ELE É PARECIDO COM O DE CRIAÇÃO, E NÃO É O MESMO ──────────────────────
 *
 * A tentação é extrair um componente comum. Os dois divergem em três lugares que
 * mudam o comportamento inteiro: aqui NÃO existe campo de endereço (o link é
 * fixo — ver a nota da própria tela), aqui existe VISIBILIDADE (que na criação é
 * sempre `unlisted`), e aqui o formulário nasce cheio em vez de vazio, então não
 * há nada para derivar enquanto a pessoa digita. Um componente que atendesse os
 * dois teria três `if` de modo — e o modo "criar" quebraria no dia em que
 * alguém mexesse no modo "editar".
 *
 * ─── O ESPORTE TEM UM VALOR QUE NÃO É ESPORTE ──────────────────────────────
 *
 * "O da quadra" é o padrão e é `NULL` no banco. Ele existe porque a maioria dos
 * grupos não tem opinião: joga no que a quadra for. Forçar uma escolha faria
 * todo mundo marcar "society" por ser o primeiro da lista — e o campo passaria a
 * mentir sobre as arenas mistas.
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

const ESPORTES = [
  { valor: "quadra", rotulo: "O da quadra" },
  { valor: "society", rotulo: "Society" },
  { valor: "futevolei", rotulo: "Futevôlei" },
  { valor: "beach_tennis", rotulo: "Beach tennis" },
  { valor: "padel", rotulo: "Padel" },
  { valor: "volei", rotulo: "Vôlei" },
  { valor: "tenis", rotulo: "Tênis" },
  { valor: "basquete", rotulo: "Basquete" },
  { valor: "outro", rotulo: "Outro" },
];

/**
 * As três visibilidades, com o texto que a UI tem de usar.
 *
 * A frase é sempre sobre a PÁGINA, nunca sobre os vídeos. O grupo não é uma ACL
 * (`api/README.md` §3): qualquer pessoa logada que saiba a arena e o horário
 * acha os mesmos lances pela busca. Prometer "só os membros veem os vídeos"
 * seria construir uma expectativa que a busca desmente no primeiro teste.
 */
const VISIBILIDADES = [
  {
    valor: "unlisted",
    rotulo: "Só quem tem o link",
    apoio: "O padrão. A página não entra em busca nenhuma, mas aparece na aba Grupos da arena para quem já está no grupo.",
  },
  {
    valor: "public",
    rotulo: "Listado na arena",
    apoio: "A página aparece na aba Grupos da arena para qualquer pessoa, e entra no Google.",
  },
  {
    valor: "private",
    rotulo: "Fechado",
    apoio: "Quem não é membro não encontra a página de jeito nenhum. Os lances continuam achaveis pela busca da arena — o grupo esconde a página, não os vídeos.",
  },
] as const;

export type PreenchimentoDaEdicao = {
  nome: string;
  descricao: string;
  esporte: string;
  dias: number[];
  inicio: string;
  fim: string;
  quadra: string;
  visibilidade: string;
};

export function FormularioDeEdicao({
  arenaSlug,
  groupSlug,
  quadras,
  inicial,
}: {
  arenaSlug: string;
  groupSlug: string;
  /** `id` é o SLUG da quadra — é ele que vai no formulário. */
  quadras: Quadra[];
  inicial: PreenchimentoDaEdicao;
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [salvando, comSalvamento] = useTransition();

  const [nome, setNome] = useState(inicial.nome);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [esporte, setEsporte] = useState(inicial.esporte);
  const [dias, setDias] = useState<number[]>(inicial.dias);
  const [inicio, setInicio] = useState(inicial.inicio);
  const [fim, setFim] = useState(inicial.fim);
  const [quadra, setQuadra] = useState(inicial.quadra);
  const [visibilidade, setVisibilidade] = useState(inicial.visibilidade);
  const [erro, setErro] = useState<{ campo: string; texto: string } | null>(null);

  function alternarDia(iso: number) {
    setDias((atual) =>
      atual.includes(iso) ? atual.filter((d) => d !== iso) : [...atual, iso].sort((a, b) => a - b),
    );
  }

  const podeEnviar =
    nome.trim().length >= 3 && dias.length > 0 && Boolean(inicio) && Boolean(fim) && !salvando;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("nome", nome.trim());
    dados.set("descricao", descricao.trim());
    dados.set("esporte", esporte);
    for (const d of dias) dados.append("dias", String(d));
    dados.set("inicio", inicio);
    dados.set("fim", fim);
    dados.set("quadra", quadra);
    dados.set("visibilidade", visibilidade);

    comSalvamento(async () => {
      const r: ResultadoDaEdicao = await salvarGrupo(arenaSlug, groupSlug, dados);
      if (r.ok) {
        setErro(null);
        mostrar("Salvo. A galera vê o grupo novo no próximo acesso.", "ok");
        // `refresh` e não `push`: quem salva costuma salvar de novo (mudou o
        // horário, agora vai mudar a quadra), e mandar a pessoa de volta para a
        // página do grupo a obrigaria a reabrir a edição.
        router.refresh();
        return;
      }
      setErro({ campo: r.campo, texto: r.erro });
      mostrar(r.erro, "erro");
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

      <Input
        rotulo="Descrição (opcional)"
        placeholder="A pelada dos amigos do trabalho"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        maxLength={280}
        autoComplete="off"
      />

      <div className={css.grupo}>
        <span className="rotulo">Esporte</span>
        <ChipFaixa rotulo="Esporte">
          {ESPORTES.map((e) => (
            <Chip key={e.valor} selecionado={esporte === e.valor} onClick={() => setEsporte(e.valor)}>
              {e.rotulo}
            </Chip>
          ))}
        </ChipFaixa>
      </div>

      <div className={css.grupo}>
        <span className="rotulo">Quadra</span>
        <ChipFaixa rotulo="Quadra">
          <Chip selecionado={quadra === "todas"} onClick={() => setQuadra("todas")}>
            Todas
          </Chip>
          {quadras.map((q) => (
            <Chip key={q.id} selecionado={quadra === q.id} onClick={() => setQuadra(q.id)}>
              {q.nome}
            </Chip>
          ))}
        </ChipFaixa>
        {erro?.campo === "quadra" ? <p className={css.erro}>{erro.texto}</p> : null}
        <p className="apoio-3">
          Trocar a quadra muda as rodadas PASSADAS também: as semanas são derivadas na hora, não
          guardadas. É o mesmo motivo pelo qual o grupo se atualiza sozinho.
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
      <p className="apoio-3 tempo">Horário da arena (horário de Brasília).</p>

      <div className={css.grupo}>
        <span className="rotulo">Quem pode ver esta página</span>
        <div className={css.visibilidades} role="radiogroup" aria-label="Quem pode ver esta página">
          {VISIBILIDADES.map((v) => (
            <button
              key={v.valor}
              type="button"
              role="radio"
              aria-checked={visibilidade === v.valor}
              className={`${css.visivel} ${visibilidade === v.valor ? css.visivelAtivo : ""}`}
              onClick={() => setVisibilidade(v.valor)}
            >
              <span className={css.visivelTopo}>
                <span className={css.visivelNome}>{v.rotulo}</span>
                {visibilidade === v.valor ? <Check size={18} aria-hidden="true" /> : null}
              </span>
              <span className={css.visivelApoio}>{v.apoio}</span>
            </button>
          ))}
        </div>
        {erro?.campo === "visibilidade" ? <p className={css.erro}>{erro.texto}</p> : null}
      </div>

      {erro?.campo === "geral" ? <p className={css.erro}>{erro.texto}</p> : null}

      <Button type="submit" tamanho={56} largura="total" disabled={!podeEnviar}>
        {salvando ? "Salvando…" : "Salvar mudanças"}
      </Button>
    </form>
  );
}

export default FormularioDeEdicao;

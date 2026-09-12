"use client";

import { useMemo, useState } from "react";
import { Camera, Search } from "lucide-react";
import {
  AvisoDeExemplo,
  Button,
  Chip,
  ChipFaixa,
  ClipGrid,
  EmptyState,
  TimeRangePicker,
  calcularAtalho,
  duracaoEmMinutos,
  type AtalhoDeTempo,
  type Clipe,
  type Intervalo,
  type Quadra,
} from "@/components/ui";
import css from "./buscar.module.css";

/**
 * O formulário da busca: chips de quadra, atalhos de tempo, data/início/fim e a
 * grade de resultado.
 *
 * ─── O QUE ESTA TASK ENTREGA E O QUE FALTA ─────────────────────────────────
 *
 * Aqui está a INTERFACE completa e o estado dela. A consulta é a task C4 e já
 * existe testada em `db/queries/clipe.ts` (`clipesDaArena`) — quando ela entrar,
 * este componente troca `resultado` por um `fetch` e nada mais muda.
 *
 * O que a C4 precisa lembrar: `from`/`to` são OBRIGATÓRIOS e o intervalo máximo é
 * de 6 horas — não é limitação técnica, é controle de privacidade
 * (`api/README.md` §3). O aviso já aparece aqui, antes do envio, para o atleta
 * não descobrir o limite por um 422.
 */

export function FormularioDeBusca({
  quadras,
  clipesDeExemplo,
  agora,
}: {
  quadras: Quadra[];
  clipesDeExemplo: Clipe[];
  /** Referência de tempo — o servidor manda para cliente e servidor concordarem. */
  agora: string;
}) {
  const referencia = useMemo(() => new Date(agora), [agora]);

  const [quadra, setQuadra] = useState<string>("todas");
  const [atalho, setAtalho] = useState<AtalhoDeTempo | null>("agora");
  const [intervalo, setIntervalo] = useState<Intervalo>(() => calcularAtalho("agora", referencia));
  const [buscou, setBuscou] = useState(false);

  const minutos = duracaoEmMinutos(intervalo);
  const podeBuscar = minutos > 0 && minutos <= 6 * 60;

  const nomeDaQuadra =
    quadra === "todas" ? "todas as quadras" : (quadras.find((q) => q.id === quadra)?.nome ?? "");

  // Enquanto a consulta real não existe, o resultado é a fixture — e a tela diz
  // isso em letra grande, em vez de fingir que achou 18 lances.
  const resultado = buscou ? clipesDeExemplo : [];

  return (
    <div className={css.raiz}>
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
      </div>

      <TimeRangePicker
        valor={intervalo}
        onChange={(novo) => {
          setIntervalo(novo);
          // Mexer num campo desliga o atalho: o chip aceso passaria a mentir.
          setAtalho(null);
        }}
        atalhoAtivo={atalho}
        onAtalho={(id) => setAtalho(id)}
        agora={referencia}
      />

      <Button
        tamanho={56}
        largura="total"
        icone={<Search size={20} />}
        disabled={!podeBuscar}
        onClick={() => setBuscou(true)}
      >
        Buscar lances
      </Button>

      {buscou ? (
        <div className={css.resultado}>
          <div className={css.resultadoTopo}>
            <h2 className={css.resultadoTitulo}>
              {resultado.length} {resultado.length === 1 ? "lance" : "lances"}
            </h2>
            <span className="apoio-3 tempo">
              {nomeDaQuadra} · {intervalo.inicio}–{intervalo.fim}
            </span>
          </div>

          <AvisoDeExemplo o_que="Os lances abaixo" />

          <ClipGrid
            clipes={resultado}
            rotulo="Lances encontrados"
            vazio={
              <EmptyState
                icone={<Camera size={24} />}
                titulo="Nenhum lance nesse horário"
                descricao={`Nenhum acionamento do botão em ${nomeDaQuadra} entre ${intervalo.inicio} e ${intervalo.fim}.`}
                acoes={
                  <>
                    <Button
                      variante="secundario"
                      largura="total"
                      onClick={() => setIntervalo({ ...intervalo, inicio: "00:00", fim: "06:00" })}
                    >
                      Ampliar o horário
                    </Button>
                    <Button variante="secundario" largura="total" onClick={() => setQuadra("todas")}>
                      Buscar em todas as quadras
                    </Button>
                  </>
                }
                nota="Achou que devia ter lance aqui? Fale com a arena: o botão da quadra pode ter ficado sem bateria."
              />
            }
          />
        </div>
      ) : null}
    </div>
  );
}

export default FormularioDeBusca;

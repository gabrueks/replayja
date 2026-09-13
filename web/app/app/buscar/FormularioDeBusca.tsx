"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Button,
  Chip,
  ChipFaixa,
  TimeRangePicker,
  calcularAtalho,
  duracaoEmMinutos,
  type AtalhoDeTempo,
  type Intervalo,
  type Quadra,
} from "@/components/ui";
import css from "./buscar.module.css";

/**
 * O formulário da busca: chips de quadra, atalhos de tempo e o seletor.
 *
 * ─── ELE NAVEGA, NÃO BUSCA ─────────────────────────────────────────────────
 *
 * "Buscar" faz `router.push` com os parâmetros; quem consulta o banco é a
 * página (servidor), onde `partner.timezone` existe e a sessão já foi
 * conferida. O componente não sabe nada de `clip`, de fuso ou de autorização —
 * ele sabe montar uma URL.
 *
 * ─── POR QUE OS ATALHOS VÊM PRIMEIRO ───────────────────────────────────────
 *
 * Decisão 4 do design: o caso comum é o atleta abrindo o celular AINDA NA
 * QUADRA, dois minutos depois do gol. Ele não lembra que jogou "das 20:00 às
 * 21:00" — ele lembra que foi "agora".
 *
 * ─── A HORA DE REFERÊNCIA É A DA ARENA, NÃO A DO APARELHO ──────────────────
 *
 * `agora` chega como relógio de parede da arena (`2026-09-12T20:47:00`, sem
 * sufixo de fuso). `new Date(...)` interpreta isso como hora LOCAL, e é
 * exatamente o que queremos: `calcularAtalho` usa `getHours()`, então o atalho
 * "agora" devolve a hora da ARENA mesmo com o celular em outro fuso.
 */

const TODAS = "todas";

export function FormularioDeBusca({
  arenaSlug,
  quadras,
  quadraSelecionada = TODAS,
  intervaloInicial,
  agora,
}: {
  arenaSlug: string;
  /** O `id` aqui é o SLUG da quadra — é ele que vai para a URL. */
  quadras: Quadra[];
  quadraSelecionada?: string;
  /** Quando a URL já traz uma busca, o formulário abre com ela. */
  intervaloInicial?: Intervalo;
  agora: string;
}) {
  const router = useRouter();
  const [navegando, comNavegacao] = useTransition();
  const referencia = useMemo(() => new Date(agora), [agora]);

  const inicial = useMemo<Intervalo>(() => {
    if (intervaloInicial?.inicio && intervaloInicial.fim) return intervaloInicial;
    return calcularAtalho("agora", referencia);
  }, [intervaloInicial, referencia]);

  const [quadra, setQuadra] = useState(quadraSelecionada);
  const [atalho, setAtalho] = useState<AtalhoDeTempo | null>(
    intervaloInicial?.inicio ? null : "agora",
  );
  const [intervalo, setIntervalo] = useState<Intervalo>(inicial);

  const minutos = duracaoEmMinutos(intervalo);
  const podeBuscar = minutos > 0 && minutos <= 6 * 60;

  function buscar() {
    const p = new URLSearchParams({
      arena: arenaSlug,
      data: intervalo.data,
      de: intervalo.inicio,
      ate: intervalo.fim,
    });
    if (quadra !== TODAS) p.set("quadra", quadra);
    comNavegacao(() => router.push(`/app/buscar?${p.toString()}`));
  }

  return (
    <div className={css.raiz}>
      <div className={css.grupo}>
        <span className="rotulo">Quadra</span>
        <ChipFaixa rotulo="Quadra">
          <Chip selecionado={quadra === TODAS} onClick={() => setQuadra(TODAS)}>
            Todas
          </Chip>
          {quadras.map((q) => (
            <Chip
              key={q.id}
              selecionado={quadra === q.id}
              // O "×" no chip aceso: sem ele, a pessoa não descobre que tocar de
              // novo desmarca, fica com um filtro que não pediu e conclui que a
              // busca não achou nada.
              removivel
              onClick={() => setQuadra(quadra === q.id ? TODAS : q.id)}
            >
              {q.nome}
              {q.esporte ? ` · ${q.esporte}` : ""}
            </Chip>
          ))}
        </ChipFaixa>
      </div>

      {/*
        O BOTÃO DE BUSCAR MORA DENTRO DO SELETOR, como um quadrado de 62px ao
        lado de "Fim". Ele era uma linha inteira abaixo; juntar a ação aos dois
        campos que ela usa faz a linha ler como UMA pergunta ("destas 20:00 a
        estas 21:00, vai") e devolve uma altura de botão para os resultados, na
        tela mais rolada do produto.
      */}
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
        acao={
          <Button
            aria-label={navegando ? "Buscando" : "Bora achar seu lance"}
            carregando={navegando}
            disabled={!podeBuscar || navegando}
            onClick={buscar}
          >
            {navegando ? null : <Search size={24} strokeWidth={2.6} aria-hidden="true" />}
          </Button>
        }
      />
    </div>
  );
}

export default FormularioDeBusca;

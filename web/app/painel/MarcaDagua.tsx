"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Chip, ChipFaixa } from "@/components/ui";
import css from "./marca-dagua.module.css";

/**
 * Marca d'água: prévia sobre um clipe e escolha do canto.
 *
 * ─── POR QUE A PRÉVIA É SOBRE GRAMA E NÃO SOBRE UM QUADRADO CINZA ──────────
 *
 * A pergunta que a arena faz é "vai dar pra ler?". A resposta depende do fundo, e
 * o fundo real é verde claro com listras. Uma prévia sobre cinza neutro mente
 * justamente no caso que importa.
 *
 * ─── O UPLOAD AINDA NÃO EXISTE ─────────────────────────────────────────────
 *
 * Enviar arquivo exige URL pré-assinada, validação de tipo e tamanho, e o
 * pipeline que queima a marca no clipe (relay). É task de backend. O botão está
 * desenhado e desabilitado, com a explicação ao lado — e a escolha do canto já
 * funciona na prévia, porque é ela que a arena quer ver antes de decidir.
 */

const CANTOS = [
  { id: "sup-esq", rotulo: "Sup. esq." },
  { id: "sup-dir", rotulo: "Sup. dir." },
  { id: "inf-esq", rotulo: "Inf. esq." },
  { id: "inf-dir", rotulo: "Inf. dir." },
] as const;

type Canto = (typeof CANTOS)[number]["id"];

// O mapa existe porque o token do design é "sup-esq" e o nome de classe do CSS
// Module é `supEsq`: indexar direto com a string daria `undefined` em silêncio.
const CLASSE: Record<Canto, string | undefined> = {
  "sup-esq": css.supEsq,
  "sup-dir": css.supDir,
  "inf-esq": css.infEsq,
  "inf-dir": css.infDir,
};

export function MarcaDagua({
  arena,
  iniciais,
  ativa,
}: {
  arena: string;
  iniciais: string;
  /** `watermark_enabled` do parceiro. */
  ativa: boolean;
}) {
  const [canto, setCanto] = useState<Canto>("inf-esq");

  return (
    <div className={css.raiz}>
      <div className={`${css.previa} grama`}>
        <span className={[css.marca, CLASSE[canto]].filter(Boolean).join(" ")}>
          <span className={css.brasao}>{iniciais}</span>
          {arena.toUpperCase()}
        </span>
        <span className={css.legenda}>Prévia no clipe</span>
      </div>

      <div className={css.controles}>
        <span className="rotulo">Posição</span>
        <ChipFaixa rotulo="Posição da marca d'água">
          {CANTOS.map((c) => (
            <Chip key={c.id} selecionado={canto === c.id} onClick={() => setCanto(c.id)}>
              {c.rotulo}
            </Chip>
          ))}
        </ChipFaixa>

        <Button variante="secundario" icone={<Upload size={18} />} disabled largura="total">
          Subir arquivo da marca d&apos;água
        </Button>
        <p className={css.nota}>
          O upload entra junto com o pipeline que queima a marca no vídeo. Hoje a marca é
          {ativa ? " aplicada " : " desligada — quando ligada, ela é aplicada "}
          em três superfícies: miniatura, player e arquivo baixado.
        </p>
      </div>
    </div>
  );
}

export default MarcaDagua;

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import {
  alternarCamera,
  renomearCameraDaArena,
  rotacionarChave,
  type ResultadoDaCamera,
} from "../cameras/acoes";
import SegredoUnico from "./SegredoUnico";
import css from "../painel.module.css";

/**
 * As três ações destrutivas do detalhe da câmera.
 *
 * ─── "GERAR NOVA CHAVE" PEDE CONFIRMAÇÃO, E A CONFIRMAÇÃO DIZ O CUSTO ──────
 *
 * Rotacionar a chave faz o relay recusar o `push` da câmera antiga: a gravação
 * PARA até alguém digitar a chave nova no equipamento — o que significa ir à
 * quadra com uma escada. Um botão que dispara isso no primeiro clique é um
 * botão que alguém aperta "para ver o que faz".
 *
 * A confirmação é um segundo estado do MESMO botão e não um `window.confirm`:
 * o diálogo nativo não cabe o texto que explica o custo, e no celular ele
 * aparece colado no topo, longe do dedo.
 */
export function AcoesDaCamera({
  arenaSlug,
  cameraId,
  nome,
  ativa,
  podeEditar,
}: {
  arenaSlug: string;
  cameraId: string;
  nome: string;
  ativa: boolean;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaCamera | null>(null);
  const [nomeNovo, setNomeNovo] = useState(nome);

  if (!podeEditar) return null;

  function aplicar(acao: () => Promise<ResultadoDaCamera>) {
    comEnvio(async () => {
      const r = await acao();
      setResultado(r);
      setConfirmando(false);
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      {resultado?.ok && resultado.segredo ? (
        <SegredoUnico
          titulo={`Chave versão ${resultado.segredo.versao}.`}
          aviso={resultado.mensagem}
          linhas={[{ rotulo: "Chave de transmissão", valor: resultado.segredo.chave }]}
          qr={{ valor: resultado.segredo.chave, descricao: "QR da chave de transmissão" }}
        />
      ) : null}

      {resultado?.ok && !resultado.segredo ? (
        <p className={css.sucesso} role="status">
          {resultado.mensagem}
        </p>
      ) : null}

      {resultado && !resultado.ok ? (
        <p className={css.aviso} role="alert">
          {resultado.erro}
        </p>
      ) : null}

      <Card variante="painel">
        <div className={css.form}>
          <div className={css.formLinha}>
            <Input
              rotulo="Nome da câmera"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
            <div className={css.campo}>
              <span className="rotulo">&nbsp;</span>
              <Button
                variante="secundario"
                tamanho={52}
                disabled={enviando || nomeNovo.trim() === nome}
                onClick={() => aplicar(() => renomearCameraDaArena(arenaSlug, cameraId, nomeNovo))}
              >
                Salvar nome
              </Button>
            </div>
          </div>

          <hr className={css.divisor} />

          {confirmando ? (
            <div className={css.aviso} role="alert">
              <p>
                Gerar uma chave nova <strong>derruba esta câmera</strong>: o relay passa a recusar
                o envio antigo e a quadra fica sem gravar até que alguém digite a chave nova no
                equipamento, na quadra. Só faça isso se a chave atual vazou ou se a câmera foi
                trocada.
              </p>
              <div className={css.linhaAcoes}>
                <Button
                  variante="perigo"
                  tamanho={44}
                  disabled={enviando}
                  onClick={() => aplicar(() => rotacionarChave(arenaSlug, cameraId))}
                >
                  {enviando ? "Gerando…" : "Sim, gerar chave nova"}
                </Button>
                <Button variante="fantasma" tamanho={44} onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className={css.linhaAcoes}>
              <Button
                variante="secundario"
                tamanho={44}
                icone={<KeyRound size={16} />}
                onClick={() => setConfirmando(true)}
              >
                Gerar nova chave
              </Button>
              <Button
                variante="fantasma"
                tamanho={44}
                disabled={enviando}
                onClick={() => aplicar(() => alternarCamera(arenaSlug, cameraId, !ativa))}
              >
                {ativa ? "Desligar câmera" : "Religar câmera"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

export default AcoesDaCamera;

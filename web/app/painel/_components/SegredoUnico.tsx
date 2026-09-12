"use client";

import { Card } from "@/components/ui";
import Copiavel from "./Copiavel";
import QrCode from "./QrCode";
import css from "../painel.module.css";

/**
 * O bloco "anote agora" — chave de transmissão, URL de webhook.
 *
 * ─── ELE EXISTE PORQUE O SEGREDO NÃO PODE SER RELIDO ───────────────────────
 *
 * O token do botão só existe como SHA-256 no banco; a chave da câmera existe em
 * claro, mas a rotação já trocou a anterior. Nos dois casos, esta é a única tela
 * em que o valor aparece — e quem fechar a página sem copiar precisa gerar
 * outro, o que significa voltar à quadra.
 *
 * Por isso o bloco é ruidoso de propósito (fundo de alerta, frase explícita) e
 * traz TRÊS formas de levar o valor: texto para copiar, QR para a câmera do
 * celular e o valor visível para digitar à mão no teclado virtual de uma câmera
 * IP, que é o caso real que sobra quando nada funciona.
 */
export function SegredoUnico({
  titulo,
  aviso,
  linhas,
  qr,
}: {
  titulo: string;
  aviso: string;
  linhas: Array<{ rotulo: string; valor: string }>;
  /** O que vai dentro do QR (a URL completa, ou a chave). */
  qr?: { valor: string; descricao: string } | null;
}) {
  return (
    <Card variante="painel">
      <p className={css.sucesso} role="status">
        <strong>{titulo}</strong> {aviso}
      </p>
      <div className={css.qrLinha}>
        <div style={{ flex: 1, minWidth: 240, display: "grid", gap: "var(--e-12)" }}>
          {linhas.map((l) => (
            <div key={l.rotulo} className={css.campo}>
              <span className="rotulo">{l.rotulo}</span>
              <Copiavel valor={l.valor} rotulo={l.rotulo.toLowerCase()} />
            </div>
          ))}
        </div>
        {qr ? <QrCode valor={qr.valor} descricao={qr.descricao} /> : null}
      </div>
    </Card>
  );
}

export default SegredoUnico;

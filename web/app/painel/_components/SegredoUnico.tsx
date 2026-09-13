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
 * Por isso o bloco é ruidoso de propósito e traz TRÊS formas de levar o valor:
 * texto para copiar, QR para a câmera do celular e o valor visível para digitar
 * à mão no teclado virtual de uma câmera IP, que é o caso real que sobra quando
 * nada funciona.
 *
 * ─── NA V2 O AVISO É AMARELO, E NÃO VERDE ──────────────────────────────────
 *
 * Ele era um bloco de sucesso. Verde diz "deu certo, pode seguir" — exatamente a
 * leitura que faz alguém fechar a aba sem copiar. O amarelo (`--cor-pro`) é a
 * cor mais rara do sistema, reservada para premium e processamento, e é a única
 * do painel que significa "pare e olhe agora": o dado que está na tela não volta.
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
      <p className={css.unicaVez} role="status">
        <span>
          <strong>{titulo}</strong>
          {aviso}
        </span>
      </p>
      <div className={css.qrLinha}>
        <div className={css.qrColuna}>
          {linhas.map((l) => (
            <div key={l.rotulo} className={css.campo}>
              <span className="rotulo">{l.rotulo}</span>
              <Copiavel valor={l.valor} rotulo={l.rotulo.toLowerCase()} />
            </div>
          ))}
        </div>
        {qr ? (
          <span className={css.qrCaixa}>
            <QrCode valor={qr.valor} descricao={qr.descricao} />
            <span className={css.qrApoio}>Aponte a câmera do celular</span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export default SegredoUnico;

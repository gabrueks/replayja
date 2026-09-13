"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BatteryLow, Plus } from "lucide-react";
import { Button, Card, EmptyState, Input, Secao } from "@/components/ui";
import { formatarIdade } from "@/lib/saude-visao";
import type { BotaoDoPainelRow } from "@/db/queries/gatilho";
import {
  alternarBotao,
  criarBotaoDaArena,
  regenerarToken,
  type ResultadoDoBotao,
} from "../botoes/acoes";
import SegredoUnico from "./SegredoUnico";
import SeloDeEstado from "./SeloDeEstado";
import css from "../painel.module.css";

/**
 * A tela de botões.
 *
 * ─── "SEM SINAL" É INFORMAÇÃO, NÃO ALARME ──────────────────────────────────
 *
 * Não existe heartbeat de botão: um dispositivo de pilha que dorme não pode
 * pagar por isso (o índice `button_silent_idx` da 0006 explica). A liveness é
 * inferida de `last_signal_at`, escrito em TODA requisição — inclusive nas
 * recusadas. Um botão de quadra que só é usada às segundas fica seis dias sem
 * sinal e está perfeito. Por isso a tela mostra o tempo, e não um ponto
 * vermelho.
 *
 * ─── BATERIA SÓ APARECE QUANDO O BOTÃO REPORTA ─────────────────────────────
 *
 * O `?bat=` é opcional no contrato do webhook, e vários modelos não mandam.
 * Mostrar "0%" para quem não reporta faria a arena trocar pilha boa.
 */
export function Botoes({
  arenaSlug,
  botoes,
  quadras,
  podeEditar,
}: {
  arenaSlug: string;
  botoes: BotaoDoPainelRow[];
  quadras: Array<{ id: string; name: string }>;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();
  const [criando, setCriando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoBotao | null>(null);

  function aplicar(acao: () => Promise<ResultadoDoBotao>) {
    comEnvio(async () => {
      const r = await acao();
      setResultado(r);
      setConfirmando(null);
      if (r.ok) {
        setCriando(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      {resultado?.ok && resultado.webhook ? (
        <SegredoUnico
          titulo="Anote agora."
          aviso={resultado.mensagem}
          linhas={[{ rotulo: "URL do webhook", valor: resultado.webhook.url }]}
          qr={{ valor: resultado.webhook.url, descricao: "QR com a URL do webhook do botão" }}
        />
      ) : null}

      {resultado?.ok && !resultado.webhook ? (
        <p className={css.sucesso} role="status">
          {resultado.mensagem}
        </p>
      ) : null}

      {resultado && !resultado.ok ? (
        <p className={css.aviso} role="alert">
          {resultado.erro}
        </p>
      ) : null}

      {podeEditar ? (
        <Secao
          titulo="Cadastrar botão"
          acao={
            <Button
              variante="secundario"
              tamanho={44}
              icone={<Plus size={16} />}
              onClick={() => setCriando((v) => !v)}
            >
              {criando ? "Cancelar" : "Novo botão"}
            </Button>
          }
        >
          {criando ? (
            <Card variante="painel">
              {quadras.length === 0 ? (
                <p className="apoio">Cadastre uma quadra antes: o botão sempre aponta para uma.</p>
              ) : (
                <form
                  className={css.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const dados = new FormData(e.currentTarget);
                    aplicar(() => criarBotaoDaArena(arenaSlug, dados));
                  }}
                  noValidate
                >
                  <div className={css.formLinha}>
                    <label className={css.campo}>
                      <span className="rotulo">Quadra</span>
                      <select className={css.selecao} name="quadra" defaultValue={quadras[0]?.id}>
                        {quadras.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      rotulo="Nome do botão"
                      name="rotulo"
                      placeholder="Botão Quadra 1"
                      maxLength={60}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className={css.formLinha}>
                    <label className={css.campo}>
                      <span className="rotulo">Tipo</span>
                      <select className={css.selecao} name="tipo" defaultValue="wifi_webhook">
                        <option value="wifi_webhook">Wi-Fi (webhook HTTPS)</option>
                        <option value="zigbee_hub">Zigbee via hub</option>
                        <option value="virtual">Virtual (só no app)</option>
                      </select>
                    </label>
                    <Input
                      rotulo="Modelo (opcional)"
                      name="modelo"
                      placeholder="Sonoff SNZB-01P"
                      maxLength={80}
                      autoComplete="off"
                    />
                  </div>
                  <p className="apoio-3">
                    A URL completa do webhook aparece uma única vez, na tela seguinte. Ela
                    contém o segredo do botão: quem a tiver consegue salvar lances nesta quadra.
                  </p>
                  <Button type="submit" tamanho={52} disabled={enviando}>
                    {enviando ? "Criando…" : "Criar botão"}
                  </Button>
                </form>
              )}
            </Card>
          ) : null}
        </Secao>
      ) : null}

      <Secao titulo={`${botoes.length} ${botoes.length === 1 ? "botão" : "botões"}`}>
        {botoes.length === 0 ? (
          <EmptyState
            ilustracao="botao"
            titulo="Nenhum botão ainda"
            descricao="O botão na parede é o gatilho principal da quadra. Enquanto não houver um, o atleta salva o lance pelo botão virtual do celular — funciona, mas é um toque a mais no meio do jogo."
            nota="Criar um botão mostra a URL do webhook uma vez só, com QR."
          />
        ) : (
          <ul className={css.linhas}>
            {botoes.map((b) => {
              const bateriaBaixa = b.battery_percent !== null && b.battery_percent <= 20;
              return (
                <li
                  key={b.id}
                  className={[css.linha, b.active ? null : css.linhaInativa]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={css.linhaTexto}>
                    {/* O estado não se repete aqui: o selo à direita já diz
                        "revogado", e escrever duas vezes é o tipo de ruído que
                        faz a linha ficar mais longa e menos legível. */}
                    <span className={css.linhaTitulo}>{b.label}</span>
                    <span className={css.linhaApoio}>
                      {b.court} · final do token <strong>{b.token_last4}</strong> ·{" "}
                      {rotuloDoTipo(b.kind)}
                      {b.model ? ` · ${b.model}` : ""}
                    </span>
                    <span className={css.linhaApoio}>
                      {b.desde_sinal_segundos === null
                        ? "nunca deu sinal — a URL ainda não foi configurada no dispositivo"
                        : `último sinal ${formatarIdade(b.desde_sinal_segundos)}`}
                      {" · "}
                      {b.lances_30d} lance{b.lances_30d === 1 ? "" : "s"} em 30 dias
                      {b.recusados_30d > 0 ? ` · ${b.recusados_30d} recusado(s)` : ""}
                      {" · "}
                      {b.press_count_total} toques no total
                    </span>
                    {b.battery_percent !== null ? (
                      bateriaBaixa ? (
                        <span className={css.linhaAcoes}>
                          <SeloDeEstado tom="atencao">
                            <BatteryLow size={14} aria-hidden="true" /> bateria {b.battery_percent}%
                          </SeloDeEstado>
                          <span className={css.linhaApoio}>
                            troque a pilha antes do próximo jogo
                          </span>
                        </span>
                      ) : (
                        <span className={css.linhaApoio}>bateria {b.battery_percent}%</span>
                      )
                    ) : null}

                    {confirmando === b.id ? (
                      <div className={css.aviso} role="alert">
                        <p>
                          Gerar um token novo faz a URL que está <strong>dentro do
                          dispositivo</strong> passar a responder 404. O botão só volta a salvar
                          lances depois que alguém configurar a URL nova nele.
                        </p>
                        <div className={css.linhaAcoes}>
                          <Button
                            variante="perigo"
                            tamanho={44}
                            disabled={enviando}
                            onClick={() => aplicar(() => regenerarToken(arenaSlug, b.id))}
                          >
                            {enviando ? "Gerando…" : "Sim, gerar token novo"}
                          </Button>
                          <Button
                            variante="fantasma"
                            tamanho={44}
                            onClick={() => setConfirmando(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className={css.linhaAcoes}>
                    {/*
                      "SEM SINAL" É NEUTRO E NÃO VERMELHO. Um botão de quadra que
                      só joga às segundas passa seis dias sem dar sinal e está
                      perfeito — pintar isso de vermelho mandaria a arena trocar
                      pilha boa. Vermelho fica para o que foi REVOGADO, que é o
                      único estado em que o dispositivo realmente não funciona.
                    */}
                    <SeloDeEstado
                      tom={
                        !b.active
                          ? "offline"
                          : b.desde_sinal_segundos !== null && b.desde_sinal_segundos < 7 * 86400
                            ? "ok"
                            : "neutro"
                      }
                    >
                      {!b.active
                        ? "revogado"
                        : b.desde_sinal_segundos === null
                          ? "sem sinal"
                          : "ativo"}
                    </SeloDeEstado>
                    {podeEditar ? (
                      <>
                        <Button
                          variante="secundario"
                          tamanho={44}
                          onClick={() => setConfirmando((v) => (v === b.id ? null : b.id))}
                        >
                          Novo token
                        </Button>
                        <Button
                          variante="fantasma"
                          tamanho={44}
                          disabled={enviando}
                          onClick={() => aplicar(() => alternarBotao(arenaSlug, b.id, !b.active))}
                        >
                          {b.active ? "Revogar" : "Reativar"}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </>
  );
}

function rotuloDoTipo(kind: string): string {
  const mapa: Record<string, string> = {
    wifi_webhook: "Wi-Fi",
    zigbee_hub: "Zigbee",
    virtual: "virtual",
  };
  return mapa[kind] ?? kind;
}

export default Botoes;

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button, Card, Input, Secao } from "@/components/ui";
import {
  MARCA_ALTURA_MIN,
  MARCA_LARGURA_MIN,
  MARCA_TAMANHO_MAX_BYTES,
  MENSAGEM_MARCA,
  POSICOES,
  type PosicaoDaMarca,
} from "@/db/queries/painel-rotulos";
import {
  confirmarUpload,
  pedirUpload,
  salvarMarca,
  type ResultadoDaMarca,
} from "../pagina/acoes";
import css from "../painel.module.css";

/**
 * "Marca e página": logo, marca d'água, cores, contato, horários e o link
 * público.
 *
 * ─── A PRÉVIA É SOBRE GRAMA E NÃO SOBRE UM QUADRADO CINZA ──────────────────
 *
 * A pergunta que a arena faz é "vai dar pra ler?". A resposta depende do fundo,
 * e o fundo real é verde claro com listras. Uma prévia sobre cinza neutro mente
 * justamente no caso que importa.
 *
 * E ela usa OS MESMOS TRÊS NÚMEROS que vão para o relay — posição, opacidade e
 * largura em % do quadro. Uma prévia com margem "bonitinha" fixa mostraria uma
 * coisa e o vídeo entregaria outra, que é o pior resultado possível para uma
 * tela cujo único trabalho é ser fiel.
 *
 * ─── O UPLOAD VAI DIRETO PARA O S3 ─────────────────────────────────────────
 *
 * `pedirUpload` devolve um `PUT` assinado, o navegador manda os bytes, e só
 * então `confirmarUpload` valida o cabeçalho PNG no servidor. A validação daqui
 * é cortesia — dá erro em 20 ms em vez de depois de subir 2 MB no 4G da arena —,
 * e a que vale é a do servidor.
 */

export type DadosDaMarca = {
  arenaSlug: string;
  nomeDaArena: string;
  base: string;
  paginaPublica: boolean;
  marcaAtiva: boolean;
  posicao: PosicaoDaMarca;
  opacidade: number;
  larguraPct: number;
  corPrimaria: string | null;
  corDestaque: string | null;
  tagline: string | null;
  horarios: string | null;
  versaoDaMarca: number;
  urlDaMarca: string | null;
  urlDoLogo: string | null;
  contatos: { whatsapp: string; telefone: string; email: string; instagram: string; endereco: string };
};

export function MarcaEPagina({ dados, podeEditar }: { dados: DadosDaMarca; podeEditar: boolean }) {
  const router = useRouter();
  const [enviando, comEnvio] = useTransition();
  const [recado, setRecado] = useState<ResultadoDaMarca | null>(null);

  const [posicao, setPosicao] = useState<PosicaoDaMarca>(dados.posicao);
  const [opacidade, setOpacidade] = useState(dados.opacidade);
  const [larguraPct, setLarguraPct] = useState(dados.larguraPct);
  const [marcaAtiva, setMarcaAtiva] = useState(dados.marcaAtiva);

  // A prévia local (`blob:`) troca a imagem no instante em que a pessoa escolhe
  // o arquivo, antes de qualquer viagem à rede. Sem isso, ela clica em "enviar"
  // sem nunca ter visto o que escolheu.
  const [previaMarca, setPreviaMarca] = useState<string | null>(dados.urlDaMarca);
  const [previaLogo, setPreviaLogo] = useState<string | null>(dados.urlDoLogo);
  const marcaRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const iniciais = dados.nomeDaArena.slice(0, 2).toUpperCase();

  async function enviarImagem(papel: "marca" | "logo", arquivo: File) {
    if (arquivo.type !== "image/png") {
      setRecado({ ok: false, erro: MENSAGEM_MARCA.tipo });
      return;
    }
    if (arquivo.size > MARCA_TAMANHO_MAX_BYTES) {
      setRecado({ ok: false, erro: MENSAGEM_MARCA.tamanho });
      return;
    }

    const pedido = await pedirUpload(dados.arenaSlug, papel, arquivo.size);
    if (!pedido.ok) {
      setRecado({ ok: false, erro: pedido.erro });
      return;
    }

    const resposta = await fetch(pedido.url, {
      method: "PUT",
      headers: pedido.headers,
      body: arquivo,
    });
    if (!resposta.ok) {
      setRecado({
        ok: false,
        erro: "O envio para o armazenamento falhou. Tente de novo em instantes.",
      });
      return;
    }

    const confirmacao = await confirmarUpload(dados.arenaSlug, papel);
    setRecado(confirmacao);
    if (confirmacao.ok) router.refresh();
  }

  function aoEscolher(papel: "marca" | "logo", lista: FileList | null) {
    const arquivo = lista?.[0];
    if (!arquivo) return;
    const local = URL.createObjectURL(arquivo);
    if (papel === "marca") setPreviaMarca(local);
    else setPreviaLogo(local);
    comEnvio(async () => {
      await enviarImagem(papel, arquivo);
    });
  }

  return (
    <>
      {recado ? (
        <p className={recado.ok ? css.sucesso : css.aviso} role="status">
          {recado.ok ? recado.mensagem : recado.erro}
        </p>
      ) : null}

      <form
        className={css.form}
        onSubmit={(e) => {
          e.preventDefault();
          const dadosDoForm = new FormData(e.currentTarget);
          dadosDoForm.set("posicao", posicao);
          dadosDoForm.set("opacidade", String(opacidade));
          dadosDoForm.set("larguraPct", String(larguraPct));
          comEnvio(async () => {
            const r = await salvarMarca(dados.arenaSlug, dadosDoForm);
            setRecado(r);
            if (r.ok) router.refresh();
          });
        }}
        noValidate
      >
        <Secao titulo="Marca d'água nos lances">
          <Card variante="painel">
            <div className={css.formLinha}>
              <div className={css.campo}>
                <span className="rotulo">Prévia sobre um lance</span>
                <div className={`${css.previaMarca} grama`}>
                  {previaMarca ? (
                    // `img` cru e não `next/image`: a origem é uma URL assinada
                    // do S3 que expira em 10 min ou um `blob:` local. O
                    // otimizador do Next precisaria buscar e cachear as duas —
                    // e cachear um objeto de bucket privado é exatamente o que
                    // não pode acontecer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previaMarca}
                      alt=""
                      className={css.marcaNoFrame}
                      style={estiloDaMarca(posicao, opacidade, larguraPct)}
                    />
                  ) : (
                    <span
                      className={css.marcaCaixa}
                      style={{
                        ...estiloDaMarca(posicao, opacidade, larguraPct),
                        aspectRatio: "3 / 1",
                      }}
                    >
                      {iniciais}
                    </span>
                  )}
                  <span className={css.legendaPrevia}>
                    {marcaAtiva ? "prévia no clipe" : "marca desligada"}
                  </span>
                </div>
                <p className="apoio-3">
                  Posição, opacidade e largura aqui são <strong>os mesmos números</strong> que o
                  corte usa. O que você vê é o que sai no vídeo.
                </p>
              </div>

              <div className={css.campo}>
                <span className="rotulo">Arquivo da marca</span>
                <input
                  ref={marcaRef}
                  type="file"
                  accept="image/png"
                  hidden
                  onChange={(e) => aoEscolher("marca", e.target.files)}
                />
                <Button
                  variante="secundario"
                  tamanho={44}
                  icone={<Upload size={16} />}
                  disabled={!podeEditar || enviando}
                  onClick={() => marcaRef.current?.click()}
                >
                  {enviando ? "Enviando…" : "Subir PNG da marca d'água"}
                </Button>
                <p className="apoio-3">
                  PNG com fundo transparente, no mínimo {MARCA_LARGURA_MIN}×{MARCA_ALTURA_MIN} px,
                  até 2 MB. Versão atual: {dados.versaoDaMarca}.
                </p>

                <label className={css.interruptor}>
                  <input
                    type="checkbox"
                    name="marcaAtiva"
                    checked={marcaAtiva}
                    onChange={(e) => setMarcaAtiva(e.target.checked)}
                    disabled={!podeEditar}
                  />
                  <span>Aplicar a marca da arena nos lances</span>
                </label>

                <div className={css.campo}>
                  <span className="rotulo">Posição</span>
                  <select
                    className={css.selecao}
                    value={posicao}
                    onChange={(e) => setPosicao(e.target.value as PosicaoDaMarca)}
                    disabled={!podeEditar}
                    aria-label="Posição da marca d'água"
                  >
                    {POSICOES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={css.campo}>
                  <span className="rotulo">Opacidade</span>
                  <span className={css.faixa}>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={Math.round(opacidade * 100)}
                      onChange={(e) => setOpacidade(Number(e.target.value) / 100)}
                      disabled={!podeEditar}
                      aria-label="Opacidade da marca d'água"
                    />
                    <span className={css.faixaValor}>{Math.round(opacidade * 100)}%</span>
                  </span>
                </div>

                <div className={css.campo}>
                  <span className="rotulo">Largura</span>
                  <span className={css.faixa}>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={larguraPct}
                      onChange={(e) => setLarguraPct(Number(e.target.value))}
                      disabled={!podeEditar}
                      aria-label="Largura da marca d'água, em porcentagem do vídeo"
                    />
                    <span className={css.faixaValor}>{larguraPct}%</span>
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </Secao>

        <Secao titulo="Logo e cores" nivel={2}>
          <Card variante="painel">
            <div className={css.formLinha}>
              <div className={css.campo}>
                <span className="rotulo">Logo da arena</span>
                <div className={css.logoLinha}>
                  <span className={css.logoCaixa}>
                    {previaLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previaLogo} alt="" />
                    ) : (
                      iniciais
                    )}
                  </span>
                  <div>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/png"
                      hidden
                      onChange={(e) => aoEscolher("logo", e.target.files)}
                    />
                    <Button
                      variante="secundario"
                      tamanho={44}
                      disabled={!podeEditar || enviando}
                      onClick={() => logoRef.current?.click()}
                    >
                      Trocar imagem
                    </Button>
                    <p className="apoio-3">PNG com fundo transparente, 512 px.</p>
                  </div>
                </div>
              </div>

              <div className={css.campo}>
                <Input
                  rotulo="Cor principal"
                  name="corPrimaria"
                  defaultValue={dados.corPrimaria ?? ""}
                  placeholder="#0b0c0e"
                  maxLength={7}
                  disabled={!podeEditar}
                  dica="Formato #RRGGBB. Vazio usa o padrão do Replay já."
                />
                <Input
                  rotulo="Cor de destaque"
                  name="corDestaque"
                  defaultValue={dados.corDestaque ?? ""}
                  placeholder="#ff6a1f"
                  maxLength={7}
                  disabled={!podeEditar}
                />
              </div>
            </div>
          </Card>
        </Secao>

        <Secao titulo="Página pública" nivel={2}>
          <Card variante="painel">
            <p className="apoio-3">
              O endereço da arena é <strong className="tempo">{dados.base}/{dados.arenaSlug}</strong>{" "}
              — é ele que vai no banner da quadra e na bio do Instagram. Ele não muda.
            </p>

            <Input
              rotulo="Frase de apresentação"
              name="tagline"
              defaultValue={dados.tagline ?? ""}
              placeholder="4 quadras de society na Zona Norte"
              maxLength={120}
              disabled={!podeEditar}
            />

            <div className={css.formLinha}>
              <Input
                rotulo="WhatsApp"
                name="whatsapp"
                defaultValue={dados.contatos.whatsapp}
                placeholder="+5511988887777"
                maxLength={20}
                disabled={!podeEditar}
                dica="Com país e DDD."
              />
              <Input
                rotulo="Telefone"
                name="telefone"
                defaultValue={dados.contatos.telefone}
                placeholder="+551133334444"
                maxLength={20}
                disabled={!podeEditar}
              />
            </div>

            <div className={css.formLinha}>
              <Input
                rotulo="E-mail"
                name="email"
                type="email"
                defaultValue={dados.contatos.email}
                maxLength={120}
                disabled={!podeEditar}
              />
              <Input
                rotulo="Instagram"
                name="instagram"
                defaultValue={dados.contatos.instagram}
                placeholder="arenavasco"
                maxLength={60}
                disabled={!podeEditar}
              />
            </div>

            <Input
              rotulo="Endereço"
              name="endereco"
              defaultValue={dados.contatos.endereco}
              placeholder="Rua Tobias Barreto, 1420 — São Paulo"
              maxLength={200}
              disabled={!podeEditar}
            />

            <Input
              rotulo="Horários de funcionamento"
              name="horarios"
              defaultValue={dados.horarios ?? ""}
              placeholder="Seg a sex 6h–23h · sáb e dom 8h–20h"
              maxLength={240}
              disabled={!podeEditar}
              dica="Texto livre, como você diria ao telefone. O horário que o sistema usa para gravar é o de cada quadra."
            />

            <label className={css.interruptor}>
              <input
                type="checkbox"
                name="paginaPublica"
                defaultChecked={dados.paginaPublica}
                disabled={!podeEditar}
              />
              <span>Manter a página pública da arena no ar</span>
            </label>
            <p className="apoio-3">
              Desligar tira a página do ar para quem não está logado. Os lances continuam
              existindo e o painel continua acessível.
            </p>
          </Card>
        </Secao>

        {podeEditar ? (
          <Button type="submit" tamanho={56} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar marca e página"}
          </Button>
        ) : (
          <p className="apoio-3">
            Esta conta acompanha a arena, mas não edita a marca. Peça a quem administra.
          </p>
        )}
      </form>
    </>
  );
}

/**
 * O posicionamento da marca na prévia, nos MESMOS termos do corte.
 *
 * A margem de 3% da largura é o `watermark_margin` padrão da 0002 — não é uma
 * escolha de CSS. Mudá-la aqui faria a prévia mentir.
 */
function estiloDaMarca(
  posicao: PosicaoDaMarca,
  opacidade: number,
  larguraPct: number,
): React.CSSProperties {
  const margem = "3%";
  const vertical = posicao.startsWith("top") ? { top: margem } : { bottom: margem };
  const horizontal = posicao.endsWith("left") ? { left: margem } : { right: margem };
  return { ...vertical, ...horizontal, width: `${larguraPct}%`, opacity: opacidade };
}

export default MarcaEPagina;

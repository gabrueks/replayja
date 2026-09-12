"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, Input, Secao } from "@/components/ui";
import { cadastrarCameraDaArena, type ResultadoDaCamera } from "../cameras/acoes";
import SegredoUnico from "./SegredoUnico";
import css from "../painel.module.css";

/**
 * Cadastro de câmera nova — o que até esta task só existia no `seed-piloto.ts`.
 *
 * ─── O FORMULÁRIO PEDE DUAS COISAS E O SERVIDOR DECIDE O RESTO ─────────────
 *
 * Quadra e nome. A PORTA não é escolhida: ela sai do contador monotônico do
 * relay, dentro de uma transação, porque duas pessoas cadastrando ao mesmo
 * tempo durante uma instalação é o caso normal e não o excepcional. A CHAVE
 * também não: um humano escolhendo segredo escolhe `arena123`.
 *
 * O resultado é o bloco de "anote agora" — e ele aparece ACIMA do formulário,
 * não abaixo, porque num celular o formulário empurraria o segredo para fora da
 * tela no exato momento em que ele precisa ser lido.
 */
export function NovaCamera({
  arenaSlug,
  quadras,
}: {
  arenaSlug: string;
  quadras: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, comEnvio] = useTransition();
  const [resultado, setResultado] = useState<ResultadoDaCamera | null>(null);

  return (
    <Secao
      titulo="Cadastrar câmera"
      acao={
        <Button
          variante="secundario"
          tamanho={44}
          icone={<Plus size={16} />}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? "Cancelar" : "Nova câmera"}
        </Button>
      }
    >
      {resultado?.ok && resultado.segredo ? (
        <SegredoUnico
          titulo="Anote agora."
          aviso={resultado.mensagem}
          linhas={[
            { rotulo: "Servidor (RTMP)", valor: resultado.segredo.servidor },
            { rotulo: "Chave de transmissão", valor: resultado.segredo.chave },
          ]}
          qr={{
            // O QR traz servidor e chave juntos, no formato que quase todo app
            // de câmera aceita colar num campo só. Quem precisar dos dois
            // separados usa os botões de copiar ao lado.
            valor: `${resultado.segredo.servidor}/${resultado.segredo.chave}`,
            descricao: "QR com o endereço de transmissão da câmera",
          }}
        />
      ) : null}

      {resultado && !resultado.ok ? (
        <p className={css.aviso} role="alert">
          {resultado.erro}
        </p>
      ) : null}

      {aberto ? (
        <Card variante="painel">
          {quadras.length === 0 ? (
            <p className="apoio">
              Cadastre uma quadra antes: a câmera precisa de destino, e sem quadra o relay não a
              grava.
            </p>
          ) : (
            <form
              className={css.form}
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                comEnvio(async () => {
                  const r = await cadastrarCameraDaArena(arenaSlug, dados);
                  setResultado(r);
                  if (r.ok) {
                    setAberto(false);
                    router.refresh();
                  }
                });
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
                  rotulo="Nome da câmera"
                  name="nome"
                  placeholder="Câmera Quadra 1"
                  maxLength={60}
                  autoComplete="off"
                  required
                />
              </div>
              <p className="apoio-3">
                A porta do relay é alocada automaticamente e não se repete. A chave de
                transmissão aparece uma única vez, na tela seguinte.
              </p>
              <Button type="submit" tamanho={52} disabled={enviando}>
                {enviando ? "Cadastrando…" : "Cadastrar câmera"}
              </Button>
            </form>
          )}
        </Card>
      ) : null}
    </Secao>
  );
}

export default NovaCamera;

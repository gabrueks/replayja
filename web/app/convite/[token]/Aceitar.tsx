"use client";

import { useFormStatus } from "react-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { aceitarConvite } from "./acoes";

/**
 * O botão que aceita o convite.
 *
 * ─── FORMULÁRIO DE VERDADE, E NÃO UM `onClick` COM `fetch` ─────────────────
 *
 * `action={server action}` funciona ANTES de o JavaScript carregar — que é
 * exatamente o cenário de quem abre um link do WhatsApp no navegador embutido,
 * no sinal fraco do vestiário. Com `onClick`, o botão fica inerte até o bundle
 * chegar, e um botão que não responde é indistinguível de um botão quebrado.
 *
 * A única razão de haver uma ilha de cliente aqui é o estado `carregando`:
 * entrar num grupo é uma escrita e demora o suficiente para alguém tocar duas
 * vezes. `useFormStatus` dá esse estado sem `useState` e sem tirar o formulário
 * do caminho progressivo — ele só precisa viver DENTRO do `<form>`, e é por isso
 * que o botão é um componente separado.
 */
function BotaoDeEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      tamanho={56}
      largura="total"
      carregando={pending}
      icone={<UserPlus size={18} />}
    >
      Entrar no grupo
    </Button>
  );
}

export function Aceitar({ token }: { token: string }) {
  return (
    <form action={aceitarConvite.bind(null, token)}>
      <BotaoDeEntrar />
    </form>
  );
}

export default Aceitar;

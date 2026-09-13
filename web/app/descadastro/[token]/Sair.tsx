"use client";

import { useFormStatus } from "react-dom";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui";
import { descadastrar } from "./acoes";

/**
 * O botão que desliga o resumo.
 *
 * `<form action={server action}>` e não `onClick`: esta página é aberta a partir
 * de um e-mail, muitas vezes no navegador embutido de um aplicativo de mensagem,
 * e ela precisa funcionar ANTES de o JavaScript chegar. Um botão de descadastro
 * que não responde é a definição de "não deixaram eu sair".
 */
function BotaoDeSair() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      tamanho={56}
      largura="total"
      variante="preto"
      carregando={pending}
      icone={<BellOff size={18} />}
    >
      Não quero mais receber
    </Button>
  );
}

export function Sair({ token }: { token: string }) {
  return (
    <form action={descadastrar.bind(null, token)}>
      <BotaoDeSair />
    </form>
  );
}

export default Sair;

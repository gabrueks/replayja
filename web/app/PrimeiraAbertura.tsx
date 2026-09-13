"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Manda quem abre o produto pela PRIMEIRA vez para o onboarding.
 *
 * ─── SÓ A HOME, E SÓ DESLOGADO ─────────────────────────────────────────────
 *
 * Este componente vive apenas em `/`. Nenhuma outra rota redireciona para o
 * onboarding, e isso é decisão: o produto vive de link compartilhado — quem
 * chega em `/arena-vasco/c/<id>` veio ver UM lance, e interceptar essa chegada
 * com três telas de apresentação é a forma mais rápida de perder a pessoa que o
 * link trouxe. Quem chega na home não veio ver nada específico; aí a
 * apresentação é o melhor uso dos primeiros nove segundos.
 *
 * ─── POR QUE NO CLIENTE E NÃO NO MIDDLEWARE ────────────────────────────────
 *
 * A marca de "já vi" fica no `localStorage`, que o servidor não enxerga. Poderia
 * ser um cookie — e aí o middleware decidiria — mas um cookie novo no aparelho
 * de quem ainda NÃO ENTROU é um identificador a mais viajando em toda
 * requisição, por uma preferência de interface. `localStorage` resolve o mesmo
 * problema sem criar nada que precise ser declarado no aviso de privacidade.
 *
 * O custo é um flash: a home renderiza e some. Aceitável porque acontece uma vez
 * na vida do navegador, e `replace` (não `push`) mantém o botão voltar limpo.
 */

const MARCA_DE_VISTO = "replayja:onboarding-visto";

export function PrimeiraAbertura({ logado }: { logado: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (logado) return;
    try {
      if (window.localStorage.getItem(MARCA_DE_VISTO)) return;
    } catch {
      // Navegação privada ou storage bloqueado: não redireciona. Repetir o
      // onboarting em toda visita seria pior que não mostrá-lo nenhuma.
      return;
    }
    router.replace("/bem-vindo");
  }, [logado, router]);

  return null;
}

export default PrimeiraAbertura;

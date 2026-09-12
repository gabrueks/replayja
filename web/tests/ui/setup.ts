import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Preparação comum dos testes de componente.
 *
 * `cleanup` é MANUAL porque a suíte não usa `globals: true` — sem globais, o
 * auto-cleanup do Testing Library não se registra sozinho, e o segundo teste de
 * cada arquivo passaria a encontrar dois botões "Entrar" na tela.
 *
 * Este arquivo roda também para os testes de servidor (Node). Não tem problema:
 * `jest-dom` só estende o `expect`, e `cleanup` sem DOM montado não faz nada.
 */
afterEach(() => {
  cleanup();
});

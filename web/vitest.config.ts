import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// A suíte tem DOIS mundos, e o ambiente padrão continua sendo Node.
//
// O que precisa de cobertura no servidor é criptografia de cookie, regra de
// slug, janela de corte e SQL — nada disso toca DOM, e rodar tudo em jsdom
// custaria ~1 s por arquivo à toa.
//
// Os testes de componente (`tests/ui/*.test.tsx`) declaram o ambiente no próprio
// arquivo, com o docblock `@vitest-environment jsdom` na primeira linha. É mais
// explícito que uma lista de globs no config: quem abre o teste vê onde ele roda.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/ui/setup.ts"],
    // O teste de integração sobe migração contra um Postgres real e pode
    // demorar mais que o padrão de 5 s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});

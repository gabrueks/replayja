import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // `next-env.d.ts` é GERADO pelo Next a cada build e o próprio arquivo diz
  // "should not be edited". Desde o Next 15.3 ele traz uma terceira linha
  // (`/// <reference path="./.next/types/routes.d.ts" />`) que a regra
  // `@typescript-eslint/triple-slash-reference` reprova como ERRO — o que deixa
  // `pnpm lint` vermelho num arquivo que ninguém pode consertar sem o Next
  // desfazer o conserto no build seguinte.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

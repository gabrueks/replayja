// Gera a migração que semeia `reserved_slug` a partir de `lib/reserved-slugs.ts`.
//
// A lista vive no CÓDIGO (o middleware precisa dela sem ida ao banco) e é
// semeada no banco (a constraint de slug precisa dela em SQL). Este script é o
// que mantém as duas em sincronia; `tests/slug.test.ts` falha se divergirem.
//
// Uso: node scripts/gerar-seed-slugs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const destino = path.join(raiz, "db/migrations/2026-09-12-0009-slugs-reservados.sql");

// `pathToFileURL` e não a string do caminho: no Windows um caminho absoluto
// (`C:\...`) é interpretado como esquema de URL `c:` pelo loader ESM.
const { RESERVED_SLUGS } = await import(
  pathToFileURL(path.join(raiz, "lib/reserved-slugs.ts")).href
);

const valores = RESERVED_SLUGS.map((s) => `  ('${s}')`).join(",\n");
const lista = RESERVED_SLUGS.map((s) => `  '${s}'`).join(",\n");

const sql = `-- Semeia \`reserved_slug\` com os prefixos do sistema.
--
-- ARQUIVO GERADO. Para atualizar: edite \`lib/reserved-slugs.ts\` e rode
-- \`node scripts/gerar-seed-slugs.mjs\`.
--
-- A lista vive no CÓDIGO porque o middleware precisa dela sem ida ao banco, e
-- vive no BANCO porque a validação de slug de arena precisa dela em SQL. O teste
-- \`tests/slug.test.ts\` falha quando as duas divergem — é o que impede que uma
-- rota de sistema nova nasça sem bloquear o slug correspondente, num roteamento
-- em que o catch-all \`/[arenaSlug]\` ocupa a raiz do domínio (ADR §8).

-- +migrate up

INSERT INTO reserved_slug (slug) VALUES
${valores}
ON CONFLICT (slug) DO NOTHING;

-- +migrate down

-- Apaga só o que esta migração semeou. Um slug acrescentado à mão (bloqueio
-- manual de um nome) sobrevive — por isso é DELETE pela lista, não TRUNCATE.
DELETE FROM reserved_slug WHERE slug IN (
${lista}
);
`;

fs.writeFileSync(destino, sql);
console.log(`[seed-slugs] ${RESERVED_SLUGS.length} slugs → ${path.relative(raiz, destino)}`);

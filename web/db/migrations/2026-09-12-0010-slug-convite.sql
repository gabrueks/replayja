-- Reserva `convite` — a rota `/convite/[token]`, que aceita o convite de grupo.
--
-- ─── POR QUE UMA MIGRAÇÃO NOVA E NÃO UMA LINHA NA 0009 ─────────────────────
--
-- A 0009 já está APLICADA em produção, e o runner confere checksum: editá-la
-- faria todo deploy seguinte falhar alto (`web/README.md` §4). Daqui em diante,
-- cada slug de sistema novo entra por um arquivo DELTA como este — nunca
-- reescrevendo o seed inicial.
--
-- `scripts/gerar-seed-slugs.mjs` continua servindo para regerar a 0009 do zero
-- num banco novo, mas não deve mais ser rodado contra o repositório: a fonte da
-- verdade é `lib/reserved-slugs.ts`, e `tests/slug.test.ts` confere a soma de
-- TODAS as migrações contra ela.

-- +migrate up

INSERT INTO reserved_slug (slug) VALUES
  ('convite')
ON CONFLICT (slug) DO NOTHING;

-- +migrate down

DELETE FROM reserved_slug WHERE slug IN (
  'convite'
);

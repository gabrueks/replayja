-- Reserva `bem-vindo` — a rota `/bem-vindo`, o onboarding da primeira entrada.
--
-- ─── POR QUE ELA FALTAVA, E POR QUE ISSO NÃO DAVA ERRO NENHUM ──────────────
--
-- `/bem-vindo` existe em `app/bem-vindo/page.tsx` desde a leva do onboarding e
-- nunca entrou na lista de reservados. O teste que deveria pegar isso
-- (`tests/slug.test.ts`, "toda rota de sistema de primeiro nível está
-- reservada") era uma LISTA ESCRITA À MÃO das rotas "que existem hoje" — e
-- "hoje" era três levas atrás. Agora ele varre `app/`, e é a varredura que
-- acusou esta ausência.
--
-- O que a ausência custa não é uma rota quebrada. No Next o segmento ESTÁTICO
-- vence o dinâmico, então a rota `/bem-vindo` continuaria de pé e quem sumiria
-- é a ARENA: uma parceira chamada "Bem-Vindo" passaria pela validação de slug,
-- receberia `replayja.com.br/bem-vindo` como endereço, imprimiria isso no
-- banner da quadra — e o link abriria o onboarding do produto para sempre.
-- Sem erro em log nenhum, e sem conserto: o slug da arena é imutável depois de
-- publicado (ADR §8), e o que resta é `partner_slug_alias`.
--
-- Arquivo delta e não edição da 0009, pela mesma razão da 0010 e da 0014: as
-- anteriores já estão aplicadas em produção e o runner confere checksum. A
-- fonte da verdade continua sendo `lib/reserved-slugs.ts`, e `tests/slug.test.ts`
-- soma TODAS as migrações contra ela.

-- +migrate up

INSERT INTO reserved_slug (slug) VALUES
  ('bem-vindo')
ON CONFLICT (slug) DO NOTHING;

-- +migrate down

DELETE FROM reserved_slug WHERE slug IN (
  'bem-vindo'
);

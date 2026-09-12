-- O painel do parceiro: horários bloqueados, pedidos de remoção, marca d'água
-- com largura em porcentagem e versão da chave da câmera.
--
-- Migração ADITIVA. Nada aqui derruba coluna existente: a 0002 e a 0004 já estão
-- aplicadas em produção e o runner confere checksum — editá-las faria todo deploy
-- seguinte falhar alto (decisão 24 do `web/README.md`).

-- +migrate up

-- ─────────────────────────────────────────── 1. marca d'água em %
--
-- O contrato com o pipeline de marca d'água fala em `watermark_width_pct` (18 =
-- 18% da largura do quadro). A 0002 já guardava a MESMA grandeza como
-- `watermark_scale` (0.12), e ter duas colunas para o mesmo número é como as duas
-- discordam no dia em que alguém escreve numa só.
--
-- A saída é uma fonte de verdade com dois nomes: a coluna nova é a que o painel
-- escreve, e um gatilho mantém `watermark_scale` = pct/100 em QUALQUER escrita,
-- inclusive as feitas por script ou à mão no psql. Assim o relay continua lendo
-- `watermark_scale` sem saber que a tela mudou.
ALTER TABLE partner_branding
  ADD COLUMN IF NOT EXISTS watermark_width_pct int NOT NULL DEFAULT 18;

-- Horário de funcionamento da ARENA em texto livre ("Seg a sex 6h–23h, sáb
-- 8h–20h"). Não é `time`: arena tem exceção, feriado e "domingo só de manhã", e
-- um par de colunas obrigaria a mentir. Os horários que a MÁQUINA usa continuam
-- sendo `court.opens_time`/`closes_time`.
ALTER TABLE partner_branding
  ADD COLUMN IF NOT EXISTS opening_hours text;

UPDATE partner_branding
   SET watermark_width_pct = GREATEST(5, LEAST(30, round(watermark_scale * 100)::int));

-- ─── AS GUARDAS DO `DO $$` NÃO SÃO PARANOIA ───────────────────────────────
--
-- Em 2026-09-12 23:32 UTC o claim do relay ficou 6 minutos em 500 porque o
-- deploy da marca d'água passou a ler `watermark_width_pct` antes de esta
-- migração existir, e a coluna foi criada À MÃO no Neon de produção para
-- estancar (`docs/setup-contas.md`). O `ADD COLUMN IF NOT EXISTS` acima já
-- convive com isso; as guardas abaixo cobrem o caso de alguém ter acrescentado
-- também a constraint ou o gatilho no mesmo socorro — `ADD CONSTRAINT` e
-- `CREATE TRIGGER` não têm `IF NOT EXISTS`, e falhariam o deploy inteiro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branding_width_pct_chk') THEN
    ALTER TABLE partner_branding
      ADD CONSTRAINT branding_width_pct_chk CHECK (watermark_width_pct BETWEEN 5 AND 30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branding_opening_hours_chk') THEN
    ALTER TABLE partner_branding
      ADD CONSTRAINT branding_opening_hours_chk
      CHECK (opening_hours IS NULL OR length(opening_hours) <= 240);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sincroniza_watermark_scale() RETURNS trigger AS $$
BEGIN
  NEW.watermark_scale := round(NEW.watermark_width_pct::numeric / 100, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS partner_branding_sincroniza_escala ON partner_branding;
CREATE TRIGGER partner_branding_sincroniza_escala
  BEFORE INSERT OR UPDATE ON partner_branding
  FOR EACH ROW EXECUTE FUNCTION sincroniza_watermark_scale();

-- ──────────────────────────────────── 2. versão da chave da câmera
--
-- Rotacionar a chave RTMP INVALIDA a câmera instalada na quadra até alguém
-- digitar a nova. O contador existe para que a tela consiga dizer "esta câmera
-- está na versão 3 e parou de mandar segmento desde a rotação" em vez de deixar
-- o parceiro adivinhar por que a quadra caiu logo depois que ele clicou.
ALTER TABLE camera ADD COLUMN IF NOT EXISTS key_version    int NOT NULL DEFAULT 1;
ALTER TABLE camera ADD COLUMN IF NOT EXISTS key_rotated_at timestamptz NULL;

-- ────────────────────────────────────────── 2b. quadra coberta
--
-- Coluna própria e não um valor dentro de `surface`: `surface` é o piso (areia,
-- grama sintética, saibro) e é texto livre mostrado ao atleta. Enfiar
-- "coberta/descoberta" ali faria a página pública imprimir "Quadra 3 · coberta"
-- no lugar onde deveria estar "grama sintética" — e o dado de cobertura não
-- poderia mais ser filtrado.
--
-- Importa para a captura: quadra descoberta tem luz solar direta, que é o caso
-- em que o obturador manual da câmera precisa de outro ajuste (`spec-captura`).
ALTER TABLE court ADD COLUMN IF NOT EXISTS indoor bool NOT NULL DEFAULT false;

-- ─────────────────────────────────── 3. horários bloqueados (escolinha)
--
-- Item 7 do checklist legal de `docs/decisoes.md` §5: "horários de escolinha
-- mapeados e gravação bloqueada neles". Criança em quadra é o caso em que
-- legítimo interesse não sustenta a gravação, e a única defesa que funciona é
-- não haver clipe para remover depois.
--
-- ─── A JANELA NÃO CRUZA A MEIA-NOITE, E ISSO É PROPOSITAL ──────────────────
--
-- Escolinha é de manhã ou no fim da tarde. Aceitar `22:00–02:00` obrigaria toda
-- leitura a tratar dois intervalos, e o `CHECK` abaixo transforma o caso
-- impossível num erro de formulário em vez de um bloqueio que não bloqueia.
--
-- `court_id NULL` = a arena inteira. É o caso comum: a escolinha ocupa o
-- ginásio, não uma quadra.
CREATE TABLE IF NOT EXISTS court_blackout (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  court_id    uuid NULL REFERENCES court(id) ON DELETE CASCADE,
  -- ISO 8601: 1 = segunda, 7 = domingo. O mesmo que `play_group.weekdays`.
  weekday     smallint NOT NULL,
  starts_time time NOT NULL,
  ends_time   time NOT NULL,
  label       text NULL,
  active      bool NOT NULL DEFAULT true,
  created_by  uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT court_blackout_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT court_blackout_ordem_chk   CHECK (ends_time > starts_time),
  CONSTRAINT court_blackout_label_chk   CHECK (label IS NULL OR length(label) <= 80)
);

CREATE INDEX IF NOT EXISTS court_blackout_lookup_idx ON court_blackout (partner_id, weekday) WHERE active;
CREATE INDEX IF NOT EXISTS court_blackout_court_idx  ON court_blackout (court_id) WHERE active;
DROP TRIGGER IF EXISTS court_blackout_set_updated_at ON court_blackout;
CREATE TRIGGER court_blackout_set_updated_at BEFORE UPDATE ON court_blackout
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O gatilho recusado por bloqueio precisa de nome próprio: contá-lo como
-- `rejected_no_coverage` faria o painel acusar a câmera de estar fora do ar
-- justamente quando ela está gravando normalmente.
--
-- `IF NOT EXISTS` porque o `down` NÃO consegue remover um valor de enum
-- (o Postgres não tem `ALTER TYPE ... DROP VALUE`), e sem isso o roundtrip
-- `up → down → up` do CI falharia na segunda subida.
ALTER TYPE trigger_outcome ADD VALUE IF NOT EXISTS 'rejected_blackout';

-- ──────────────────────────────── 4. pedidos de remoção (LGPD)
--
-- Modelo mínimo de `docs/legal/fluxo-remocao.md` §9.1. Retenção do REGISTRO: 5
-- anos — é a prova de cumprimento dos arts. 37 e 50. O registro guarda
-- metadados, nunca uma cópia do vídeo removido.
CREATE TYPE takedown_status    AS ENUM ('recebido','em_analise','executado','concluido','improcedente','restaurado');
CREATE TYPE takedown_scope     AS ENUM ('clip','clips','session_window');
CREATE TYPE takedown_severity  AS ENUM ('comum','menor','grave');
CREATE TYPE takedown_requester AS ENUM ('titular','responsavel_menor','terceiro','arena','autoridade');

-- Protocolo legível pelo telefone: `RJ-2026-000123`. Sequência e não contagem —
-- dois pedidos simultâneos com `max(id)+1` receberiam o mesmo número.
CREATE SEQUENCE IF NOT EXISTS takedown_protocol_seq;

CREATE TABLE IF NOT EXISTS takedown_request (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol          text NOT NULL UNIQUE
    DEFAULT 'RJ-' || to_char(now(), 'YYYY') || '-'
            || lpad(nextval('takedown_protocol_seq')::text, 6, '0'),
  partner_id        uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  court_id          uuid NULL REFERENCES court(id) ON DELETE SET NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  channel           text NOT NULL DEFAULT 'painel',
  -- ÚNICO dado pessoal do solicitante. O formulário público não pede documento
  -- (§3.2 do fluxo): exigir identificação para apagar a própria imagem é
  -- barreira, não segurança.
  requester_contact text NULL,
  requester_role    takedown_requester NOT NULL DEFAULT 'titular',
  scope             takedown_scope NOT NULL DEFAULT 'clip',
  target_clip_ids   uuid[] NOT NULL DEFAULT '{}',
  window_from       timestamptz NULL,
  window_to         timestamptz NULL,
  severity          takedown_severity NOT NULL DEFAULT 'comum',
  reason_free_text  text NULL,
  status            takedown_status NOT NULL DEFAULT 'recebido',
  hidden_at         timestamptz NULL,
  executed_at       timestamptz NULL,
  -- JSON com o resultado de cada camada do expurgo (banco, S3, CDN). O
  -- protocolo só vira `concluido` quando todas passam: takedown pela metade é
  -- pior que nenhum, porque a pessoa foi avisada de que o vídeo saiu.
  verification      jsonb NOT NULL DEFAULT '{}'::jsonb,
  responded_at      timestamptz NULL,
  response_text     text NULL,
  decided_by        uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takedown_janela_chk CHECK (window_to IS NULL OR window_from IS NULL OR window_to >= window_from)
);

CREATE INDEX IF NOT EXISTS takedown_request_fila_idx ON takedown_request (partner_id, status, received_at DESC);
DROP TRIGGER IF EXISTS takedown_request_set_updated_at ON takedown_request;
CREATE TRIGGER takedown_request_set_updated_at BEFORE UPDATE ON takedown_request
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Por que o clipe ganha estas duas colunas: sem elas, um clipe com `deleted_at`
-- preenchido não distingue "expirou pela retenção" de "foi removido a pedido de
-- alguém que aparece nele" — e a segunda é a que precisa ser provável em cinco
-- anos.
ALTER TABLE clip ADD COLUMN IF NOT EXISTS deleted_reason      text NULL;
ALTER TABLE clip ADD COLUMN IF NOT EXISTS takedown_request_id uuid NULL
  REFERENCES takedown_request(id) ON DELETE SET NULL;

-- +migrate down

ALTER TABLE IF EXISTS clip DROP COLUMN IF EXISTS takedown_request_id;
ALTER TABLE IF EXISTS clip DROP COLUMN IF EXISTS deleted_reason;

DROP TABLE IF EXISTS takedown_request;
DROP SEQUENCE IF EXISTS takedown_protocol_seq;
DROP TYPE IF EXISTS takedown_requester;
DROP TYPE IF EXISTS takedown_severity;
DROP TYPE IF EXISTS takedown_scope;
DROP TYPE IF EXISTS takedown_status;

DROP TABLE IF EXISTS court_blackout;

-- `rejected_blackout` NÃO é removido: o Postgres não tem `ALTER TYPE ... DROP
-- VALUE`, e recriar o enum exigiria reescrever toda coluna que o usa. O `up`
-- usa `ADD VALUE IF NOT EXISTS` justamente para que o roundtrip do CI passe.

ALTER TABLE IF EXISTS court DROP COLUMN IF EXISTS indoor;

ALTER TABLE IF EXISTS camera DROP COLUMN IF EXISTS key_rotated_at;
ALTER TABLE IF EXISTS camera DROP COLUMN IF EXISTS key_version;

DROP TRIGGER IF EXISTS partner_branding_sincroniza_escala ON partner_branding;
DROP FUNCTION IF EXISTS sincroniza_watermark_scale();
ALTER TABLE IF EXISTS partner_branding DROP CONSTRAINT IF EXISTS branding_opening_hours_chk;
ALTER TABLE IF EXISTS partner_branding DROP CONSTRAINT IF EXISTS branding_width_pct_chk;
ALTER TABLE IF EXISTS partner_branding DROP COLUMN IF EXISTS opening_hours;
ALTER TABLE IF EXISTS partner_branding DROP COLUMN IF EXISTS watermark_width_pct;

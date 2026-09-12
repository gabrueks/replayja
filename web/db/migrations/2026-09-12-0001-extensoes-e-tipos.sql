-- Extensões, tipos enumerados e utilitários de schema.
--
-- Base de tudo o que vem depois. Os enums são nativos do Postgres (não `text` +
-- CHECK) porque a validação fica no banco e os tipos saem de graça para o TS,
-- conforme `docs/modelo-de-dados.md` §1 e §3.22.
--
-- NOTA SOBRE `down`: derrubar um tipo enumerado depois que uma coluna o usa é
-- impossível, então o `down` desta migração só roda quando todas as de cima já
-- desceram. É por isso que o roundtrip do CI desce na ordem inversa.

-- +migrate up

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- e-mail e slug sem case
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busca "encontrar arena" por nome
CREATE EXTENSION IF NOT EXISTS btree_gist; -- constraints de intervalo

-- ─────────────────────────────────────────────────────── parceiro
CREATE TYPE partner_status      AS ENUM ('pending','active','suspended','churned');
CREATE TYPE partner_role        AS ENUM ('owner','manager','viewer');
CREATE TYPE membership_status   AS ENUM ('invited','active','declined','removed','revoked');
CREATE TYPE court_sport         AS ENUM ('society','beach_tennis','futevolei','padel','volei','tenis','basquete','outro');
CREATE TYPE contact_kind        AS ENUM ('whatsapp','phone','email','instagram','website','address','maps');
CREATE TYPE watermark_position  AS ENUM ('top_left','top_right','bottom_left','bottom_right');

-- ────────────────────────────────────────────── relay e captura
CREATE TYPE relay_status        AS ENUM ('provisioning','active','draining','retired');
CREATE TYPE ingest_kind         AS ENUM ('rtmp_push','rtsp_pull');
CREATE TYPE camera_status       AS ENUM ('provisioned','recording','degraded','down','disabled');
CREATE TYPE gap_cause           AS ENUM ('arena_uplink','camera','relay','unknown');
CREATE TYPE storage_location    AS ENUM ('relay','object_storage','purged');

-- ───────────────────────────────────────────────── gatilho e clipe
CREATE TYPE button_kind         AS ENUM ('wifi_webhook','zigbee_hub','virtual');
CREATE TYPE trigger_source      AS ENUM ('physical_button','virtual_button','api','ai');
CREATE TYPE trigger_outcome     AS ENUM ('accepted','rejected_cooldown','rejected_no_coverage',
                                         'rejected_camera_unknown','rejected_button_revoked','rejected_relay_down');
CREATE TYPE job_status          AS ENUM ('pending','claimed','cutting','processing','uploading','done','failed');
CREATE TYPE clip_status         AS ENUM ('pending','cutting','processing','uploading','ready','partial','failed','expired');

-- ──────────────────────────────────── usuário, grupo, compartilhamento
CREATE TYPE auth_provider       AS ENUM ('email_otp','google');
CREATE TYPE group_role          AS ENUM ('owner','member');
CREATE TYPE group_visibility    AS ENUM ('public','unlisted','private');
CREATE TYPE share_target_type   AS ENUM ('clip','session','group','partner');
CREATE TYPE share_channel       AS ENUM ('whatsapp','instagram','instagram_stories','tiktok','copy_link','native_share','direct','unknown');
CREATE TYPE share_action        AS ENUM ('created','opened','played','download','signup_from_link');

-- `updated_at` automático em toda tabela de cadastro (§1 do modelo de dados).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Valida nome de fuso IANA.
--
-- Não dá para fazer isso com CHECK: `now() AT TIME ZONE tz` depende de `now()`,
-- que é STABLE, e o Postgres exige IMMUTABLE em constraint. A alternativa —
-- guardar `-03` fixo — quebraria se o Brasil reintroduzisse horário de verão,
-- que é exatamente o risco que `docs/modelo-de-dados.md` §4 manda evitar.
CREATE OR REPLACE FUNCTION valida_timezone() RETURNS trigger AS $$
DECLARE
  tz text;
BEGIN
  EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO tz USING NEW;
  IF tz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz) THEN
    RAISE EXCEPTION 'fuso horário inválido: %', tz;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- +migrate down

DROP FUNCTION IF EXISTS valida_timezone();
DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS share_action;
DROP TYPE IF EXISTS share_channel;
DROP TYPE IF EXISTS share_target_type;
DROP TYPE IF EXISTS group_visibility;
DROP TYPE IF EXISTS group_role;
DROP TYPE IF EXISTS auth_provider;
DROP TYPE IF EXISTS clip_status;
DROP TYPE IF EXISTS job_status;
DROP TYPE IF EXISTS trigger_outcome;
DROP TYPE IF EXISTS trigger_source;
DROP TYPE IF EXISTS button_kind;
DROP TYPE IF EXISTS storage_location;
DROP TYPE IF EXISTS gap_cause;
DROP TYPE IF EXISTS camera_status;
DROP TYPE IF EXISTS ingest_kind;
DROP TYPE IF EXISTS relay_status;
DROP TYPE IF EXISTS watermark_position;
DROP TYPE IF EXISTS contact_kind;
DROP TYPE IF EXISTS court_sport;
DROP TYPE IF EXISTS membership_status;
DROP TYPE IF EXISTS partner_role;
DROP TYPE IF EXISTS partner_status;

-- As extensões NÃO são derrubadas: podem ser usadas por outra coisa no mesmo
-- banco, e recriá-las é barato. Derrubar `citext` com uma coluna viva derrubaria
-- a coluna junto.

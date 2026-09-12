-- `app_user` (atleta) e `partner_admin` (quem administra a arena).
-- `docs/modelo-de-dados.md` §3.16 e §3.4.

-- +migrate up

-- NÃO há provedor de identidade externo e NÃO há tabela de sessão nem de
-- desafio de OTP: a autenticação é a portada do Sentinela (ADR §4.4) — código de
-- 6 dígitos num cookie HMAC de 10 min, sessão num cookie HMAC de 400 dias.
--
-- Esta tabela existe pelo motivo oposto ao do Sentinela: lá o e-mail no cookie
-- bastava; aqui grupos, convites e posse exigem um `id` ESTÁVEL.
--
-- A vinculação de contas é o `upsert ON CONFLICT (email)`, e é a única regra que
-- precisa estar certa: quem entrou por OTP na segunda e por Google na quarta cai
-- na mesma linha, porque os dois caminhos só chegam aqui com o e-mail
-- COMPROVADO — o OTP por construção, o Google só quando `email_verified = true`.
CREATE TABLE app_user (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  email_verified_at timestamptz NULL,
  display_name      text NULL,
  avatar_url        text NULL,
  phone             text NULL,
  primary_provider  auth_provider NOT NULL DEFAULT 'email_otp',
  locale            text NOT NULL DEFAULT 'pt-BR',
  -- Detectado no navegador; usado só para FORMATAR, nunca para filtrar. O filtro
  -- usa o fuso da ARENA: um atleta em Lisboa precisa ver "segunda, 20h" para a
  -- pelada de São Paulo.
  timezone          text NULL,
  -- LGPD: consentimento explícito e separado. Nunca marcado por padrão.
  marketing_opt_in  bool NOT NULL DEFAULT false,
  terms_accepted_at timestamptz NULL,
  -- Arena pela qual o usuário entrou — métrica de atribuição mostrada ao
  -- parceiro no painel dele.
  first_partner_id  uuid NULL REFERENCES partner(id) ON DELETE SET NULL,
  last_login_at     timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz NULL,
  CONSTRAINT app_user_phone_chk CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{7,14}$'),
  CONSTRAINT app_user_display_name_chk CHECK (display_name IS NULL OR length(display_name) <= 80)
);

CREATE INDEX app_user_first_partner_idx ON app_user (first_partner_id);
CREATE TRIGGER app_user_set_updated_at BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Papel de admin de arena é consultado AQUI na requisição de painel, nunca
-- guardado no cookie. É uma consulta indexada por requisição de painel, e evita
-- a classe inteira de bug "o cookie diz que sou admin de uma arena que já me
-- removeu".
CREATE TABLE partner_admin (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  -- Nulo enquanto o convite está pendente.
  user_id            uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  -- Sempre preenchido: é a chave do convite.
  invited_email      citext NOT NULL,
  role               partner_role NOT NULL DEFAULT 'viewer',
  status             membership_status NOT NULL DEFAULT 'invited',
  -- SHA-256 do token; o token cru só existe no e-mail.
  invite_token_hash  text NULL,
  invite_expires_at  timestamptz NULL,
  invited_by         uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  invited_at         timestamptz NOT NULL DEFAULT now(),
  accepted_at        timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_admin_email_key UNIQUE (partner_id, invited_email),
  -- Admin ATIVO sem usuário é um estado impossível: seria uma permissão sem
  -- dono, e todo verificador olharia `user_id`.
  CONSTRAINT partner_admin_ativo_chk CHECK (status <> 'active' OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX partner_admin_user_key ON partner_admin (partner_id, user_id)
  WHERE user_id IS NOT NULL;
-- O índice que sustenta `exigirAdminDaArena` (`modelo-de-dados.md` §7.2).
CREATE INDEX partner_admin_lookup_idx ON partner_admin (user_id, partner_id)
  WHERE status = 'active';
CREATE INDEX partner_admin_invite_idx ON partner_admin (invite_token_hash)
  WHERE status = 'invited';
CREATE TRIGGER partner_admin_set_updated_at BEFORE UPDATE ON partner_admin
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Toda arena precisa de pelo menos um `owner` ativo. Sem isto, remover o último
-- dono deixa a arena sem quem possa adicionar admins — e recuperar exige acesso
-- ao banco.
CREATE OR REPLACE FUNCTION exige_owner_da_arena() RETURNS trigger AS $$
DECLARE
  alvo uuid := COALESCE(OLD.partner_id, NEW.partner_id);
  donos int;
BEGIN
  SELECT count(*) INTO donos
    FROM partner_admin
   WHERE partner_id = alvo AND role = 'owner' AND status = 'active';
  IF donos = 0 AND EXISTS (SELECT 1 FROM partner WHERE id = alvo AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'arena % ficaria sem owner ativo', alvo
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER partner_admin_exige_owner
  AFTER UPDATE OR DELETE ON partner_admin
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION exige_owner_da_arena();

-- +migrate down

DROP TRIGGER IF EXISTS partner_admin_exige_owner ON partner_admin;
DROP FUNCTION IF EXISTS exige_owner_da_arena();
DROP TABLE IF EXISTS partner_admin;
DROP TABLE IF EXISTS app_user;

-- Parceiro (arena), branding, contatos, administradores e quadras.
-- `docs/modelo-de-dados.md` §3.1 a §3.5 e §3.21.

-- +migrate up

-- Prefixos do sistema que não podem virar slug de arena. O catch-all
-- `/[arenaSlug]` ocupa a raiz do domínio, então qualquer rota futura colide com
-- um slug. A lista vive em `lib/reserved-slugs.ts` e é semeada aqui; um teste de
-- CI falha se as duas divergirem.
CREATE TABLE reserved_slug (
  slug citext PRIMARY KEY
);

CREATE TABLE partner (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   citext NOT NULL UNIQUE,
  legal_name             text NOT NULL,
  display_name           text NOT NULL,
  document               text NULL,
  timezone               text NOT NULL DEFAULT 'America/Sao_Paulo',
  city                   text NULL,
  state                  char(2) NULL,
  status                 partner_status NOT NULL DEFAULT 'pending',
  -- 90 dias: decidido (P-01/G-03 em `docs/decisoes.md`). A página do grupo
  -- precisa de histórico e a Política de Privacidade já foi publicada com 90 —
  -- prometer um prazo que o sistema não cumpre viola a LGPD.
  clip_retention_days    int NOT NULL DEFAULT 90,
  -- Retenção da sessão completa no DISCO DO RELAY. 7 dias no piloto.
  session_retention_days int NOT NULL DEFAULT 7,
  watermark_enabled      bool NOT NULL DEFAULT true,
  public_page_enabled    bool NOT NULL DEFAULT true,
  contracted_at          timestamptz NULL,
  activated_at           timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz NULL,
  CONSTRAINT partner_slug_formato_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 40),
  CONSTRAINT partner_document_chk       CHECK (document IS NULL OR document ~ '^\d{14}$'),
  CONSTRAINT partner_clip_retention_chk CHECK (clip_retention_days BETWEEN 1 AND 365),
  CONSTRAINT partner_session_retention_chk CHECK (session_retention_days BETWEEN 1 AND 30)
);

CREATE INDEX partner_status_idx ON partner (status) WHERE deleted_at IS NULL;
-- Busca "encontrar arena" da home, por nome digitado errado e sem acento.
CREATE INDEX partner_display_name_trgm_idx ON partner USING gin (display_name gin_trgm_ops);

CREATE TRIGGER partner_set_updated_at BEFORE UPDATE ON partner
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER partner_valida_tz BEFORE INSERT OR UPDATE ON partner
  FOR EACH ROW EXECUTE FUNCTION valida_timezone('timezone');

-- Slug é IMUTÁVEL depois que a arena vai ao ar: renomear cria um alias aqui e a
-- rota antiga responde 308 permanente. Um link impresso num banner na quadra não
-- pode quebrar.
CREATE TABLE partner_slug_alias (
  slug       citext PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_slug_alias_partner_idx ON partner_slug_alias (partner_id);

CREATE TABLE partner_branding (
  partner_id             uuid PRIMARY KEY REFERENCES partner(id) ON DELETE CASCADE,
  logo_object_key        text NULL,
  logo_dark_object_key   text NULL,
  -- PNG 24-bit com alpha, 512×512 ou 1024×256, ≤ 512 KB. É o arquivo que o
  -- relay baixa para o passe de marca d'água.
  watermark_object_key   text NULL,
  -- Viaja em cada `clip_job`. O relay guarda o PNG em cache local por versão e
  -- só rebusca quando o número muda.
  watermark_version      int NOT NULL DEFAULT 1,
  watermark_position     watermark_position NOT NULL DEFAULT 'bottom_right',
  watermark_opacity      numeric(3,2) NOT NULL DEFAULT 0.85,
  watermark_scale        numeric(3,2) NOT NULL DEFAULT 0.12,
  watermark_margin       numeric(3,2) NOT NULL DEFAULT 0.03,
  primary_color          text NULL,
  accent_color           text NULL,
  -- Slot reservado para o SEGUNDO patrocinador (P-08 de `decisoes.md`):
  -- patrocínio no vídeo está fora do piloto, mas o modelo já guarda o lugar.
  sponsor_object_key     text NULL,
  sponsor_version        int NOT NULL DEFAULT 1,
  og_image_object_key    text NULL,
  tagline                text NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branding_opacity_chk CHECK (watermark_opacity BETWEEN 0.2 AND 1.0),
  CONSTRAINT branding_scale_chk   CHECK (watermark_scale   BETWEEN 0.05 AND 0.30),
  CONSTRAINT branding_margin_chk  CHECK (watermark_margin  BETWEEN 0 AND 0.20),
  CONSTRAINT branding_primary_chk CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9a-f]{6}$'),
  CONSTRAINT branding_accent_chk  CHECK (accent_color  IS NULL OR accent_color  ~ '^#[0-9a-f]{6}$'),
  CONSTRAINT branding_tagline_chk CHECK (tagline IS NULL OR length(tagline) <= 120)
);

CREATE TRIGGER partner_branding_set_updated_at BEFORE UPDATE ON partner_branding
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE partner_contact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  kind          contact_kind NOT NULL,
  label         text NULL,
  value         text NOT NULL,
  is_primary    bool NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_contact_e164_chk
    CHECK (kind NOT IN ('whatsapp','phone') OR value ~ '^\+[1-9]\d{7,14}$')
);
CREATE INDEX partner_contact_partner_idx ON partner_contact (partner_id, display_order);
-- No máximo um contato primário por tipo.
CREATE UNIQUE INDEX partner_contact_primary_idx ON partner_contact (partner_id, kind) WHERE is_primary;
CREATE TRIGGER partner_contact_set_updated_at BEFORE UPDATE ON partner_contact
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE court (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  slug          citext NOT NULL,
  name          text NOT NULL,
  sport         court_sport NOT NULL DEFAULT 'society',
  surface       text NULL,
  display_order int NOT NULL DEFAULT 0,
  active        bool NOT NULL DEFAULT true,
  -- Hora LOCAL de funcionamento. Decide (a) se a sessão contínua deve estar
  -- gravando e (b) o alerta "quadra offline em horário de operação". É também
  -- o que permite o polling adaptativo do relay (ADR §4.2): 2 s dentro do
  -- horário, 60 s fora dele — o que mantém o compute do Neon dormindo à noite.
  opens_time    time NULL,
  closes_time   time NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz NULL,
  CONSTRAINT court_slug_formato_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX court_partner_slug_key ON court (partner_id, slug);
CREATE INDEX court_partner_idx ON court (partner_id, display_order) WHERE deleted_at IS NULL;
CREATE TRIGGER court_set_updated_at BEFORE UPDATE ON court
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate down

DROP TABLE IF EXISTS court;
DROP TABLE IF EXISTS partner_contact;
DROP TABLE IF EXISTS partner_branding;
DROP TABLE IF EXISTS partner_slug_alias;
DROP TABLE IF EXISTS partner;
DROP TABLE IF EXISTS reserved_slug;

-- O grupo ("pelada") — um filtro recorrente salvo, com membros e convites.
-- `docs/modelo-de-dados.md` §3.17 a §3.19.
--
-- NOME DA TABELA: `group` é palavra reservada em SQL, então a tabela chama-se
-- `play_group` e a de participação, `play_group_member`. Os nomes seguem o
-- modelo de dados, não o apelido "group/group_membership" do backlog.
--
-- O GRUPO NÃO É UMA ACL (`api/README.md` §3). Um grupo privado esconde a PÁGINA,
-- as SESSÕES organizadas e a LISTA DE MEMBROS. Ele não esconde os clipes:
-- qualquer usuário logado que saiba a arena e o horário encontra os mesmos
-- vídeos por `GET /clips`. A UI diz "quem pode ver esta página", nunca "quem
-- pode ver estes vídeos".

-- +migrate up

CREATE TABLE play_group (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- O grupo vive DENTRO de uma arena: `/<arena>/<grupo>`.
  partner_id       uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  created_by       uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  slug             citext NOT NULL,
  name             text NOT NULL,
  description      text NULL,
  -- ISO-8601: 1 = segunda … 7 = domingo. Casa com o `date_trunc('week', ...)` do
  -- Postgres, que devolve segunda-feira.
  weekdays         smallint[] NOT NULL,
  start_time       time NOT NULL,
  -- Se `end_time <= start_time`, a sessão cruza a meia-noite.
  end_time         time NOT NULL,
  -- Copiado de `partner.timezone` na criação. Coluna própria para tornar a
  -- consulta de sessões AUTOCONTIDA (§6.2) e sobreviver a uma arena que mude de
  -- fuso.
  timezone         text NOT NULL DEFAULT 'America/Sao_Paulo',
  all_courts       bool NOT NULL DEFAULT true,
  visibility       group_visibility NOT NULL DEFAULT 'unlisted',
  cover_object_key text NULL,
  active_from      date NOT NULL DEFAULT current_date,
  member_count     int NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz NULL,
  CONSTRAINT play_group_slug_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 30),
  CONSTRAINT play_group_description_chk CHECK (description IS NULL OR length(description) <= 280),
  CONSTRAINT play_group_weekdays_chk
    CHECK (weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
           AND array_length(weekdays, 1) BETWEEN 1 AND 7),
  -- Evita um grupo "das 6h às 23h" que viraria um dump de toda a arena. A
  -- segunda perna do OR é a sessão que cruza a meia-noite.
  CONSTRAINT play_group_janela_chk
    CHECK (end_time <= start_time OR (end_time - start_time) <= interval '6 hours')
);

CREATE UNIQUE INDEX play_group_partner_slug_key ON play_group (partner_id, slug)
  WHERE deleted_at IS NULL;
CREATE INDEX play_group_partner_idx ON play_group (partner_id)
  WHERE visibility = 'public' AND deleted_at IS NULL;
CREATE INDEX play_group_created_by_idx ON play_group (created_by);
CREATE TRIGGER play_group_set_updated_at BEFORE UPDATE ON play_group
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER play_group_valida_tz BEFORE INSERT OR UPDATE ON play_group
  FOR EACH ROW EXECUTE FUNCTION valida_timezone('timezone');

-- Quadras do grupo, quando não são todas.
CREATE TABLE play_group_court (
  play_group_id uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
  court_id      uuid NOT NULL REFERENCES court(id) ON DELETE CASCADE,
  PRIMARY KEY (play_group_id, court_id)
);

-- A quadra tem de pertencer ao MESMO parceiro do grupo. Sem isso, um grupo da
-- arena A filtraria clipes da arena B — e o escopo por `partner_id` na consulta
-- central deixaria de ser a barreira que ele é (sem RLS, é a única).
CREATE OR REPLACE FUNCTION quadra_do_mesmo_parceiro() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM play_group g JOIN court c ON c.id = NEW.court_id
     WHERE g.id = NEW.play_group_id AND c.partner_id = g.partner_id
  ) THEN
    RAISE EXCEPTION 'quadra % não pertence ao parceiro do grupo %', NEW.court_id, NEW.play_group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER play_group_court_mesmo_parceiro
  BEFORE INSERT OR UPDATE ON play_group_court
  FOR EACH ROW EXECUTE FUNCTION quadra_do_mesmo_parceiro();

CREATE TABLE play_group_member (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  play_group_id     uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
  -- Nulo enquanto o convite não foi aceito.
  user_id           uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  -- Chave do convite. Para quem entrou pelo link, é o e-mail dele.
  --
  -- PROJEÇÃO: completo só para o `owner`; mascarado (`g***@gmail.com`) para os
  -- demais. A lista serve para saber quem está no grupo, não para extrair base
  -- de contatos (`modelo-de-dados.md` §7.3).
  invited_email     citext NOT NULL,
  invited_by        uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  role              group_role NOT NULL DEFAULT 'member',
  status            membership_status NOT NULL DEFAULT 'invited',
  invite_token_hash text NULL,
  invite_expires_at timestamptz NULL,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  accepted_at       timestamptz NULL,
  removed_at        timestamptz NULL,
  -- "Os vídeos da pelada de ontem saíram."
  notify_weekly     bool NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT play_group_member_email_key UNIQUE (play_group_id, invited_email),
  CONSTRAINT play_group_member_ativo_chk CHECK (status <> 'active' OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX play_group_member_user_key ON play_group_member (play_group_id, user_id)
  WHERE user_id IS NOT NULL;
-- O índice que sustenta `exigirMembroDoGrupo` e a lista "meus grupos".
CREATE INDEX play_group_member_user_idx ON play_group_member (user_id, play_group_id)
  WHERE status = 'active';
CREATE INDEX play_group_member_token_idx ON play_group_member (invite_token_hash)
  WHERE status = 'invited';
CREATE TRIGGER play_group_member_set_updated_at BEFORE UPDATE ON play_group_member
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Se o último dono sai, PROMOVE o membro ativo mais antigo em vez de deixar o
-- grupo órfão. Diferente da arena (que recusa a operação), aqui o grupo é do
-- atleta e travar a saída dele seria pior que escolher um sucessor.
CREATE OR REPLACE FUNCTION promove_dono_do_grupo() RETURNS trigger AS $$
DECLARE
  alvo uuid := COALESCE(OLD.play_group_id, NEW.play_group_id);
BEGIN
  IF EXISTS (SELECT 1 FROM play_group WHERE id = alvo AND deleted_at IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM play_group_member
        WHERE play_group_id = alvo AND role = 'owner' AND status = 'active'
     )
  THEN
    UPDATE play_group_member SET role = 'owner'
     WHERE id = (
       SELECT id FROM play_group_member
        WHERE play_group_id = alvo AND status = 'active'
        ORDER BY accepted_at NULLS LAST, created_at
        LIMIT 1
     );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER play_group_member_promove_dono
  AFTER UPDATE OR DELETE ON play_group_member
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION promove_dono_do_grupo();

-- +migrate down

DROP TRIGGER IF EXISTS play_group_member_promove_dono ON play_group_member;
DROP FUNCTION IF EXISTS promove_dono_do_grupo();
DROP TABLE IF EXISTS play_group_member;
DROP TRIGGER IF EXISTS play_group_court_mesmo_parceiro ON play_group_court;
DROP FUNCTION IF EXISTS quadra_do_mesmo_parceiro();
DROP TABLE IF EXISTS play_group_court;
DROP TABLE IF EXISTS play_group;

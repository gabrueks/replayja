-- Link curto e métrica de compartilhamento — `modelo-de-dados.md` §3.20.
--
-- Compartilhar É o produto: o clipe vai para o WhatsApp e para o Instagram, e é
-- isso que faz a arena aparecer. Estas duas tabelas são o que o painel do
-- parceiro mostra como alcance — o argumento de renovação dele.

-- +migrate up

CREATE TABLE share_link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 12 chars base62 (`nanoid`). URL final: `replayja.com.br/s/<token>`.
  token         text NOT NULL UNIQUE,
  target_type   share_target_type NOT NULL,
  -- `clip.id` / `play_group.id` / `partner.id`. Nulo para `session`, que é um
  -- INTERVALO, não uma linha.
  target_id     uuid NULL,
  -- Sempre preenchido — é a métrica do parceiro.
  partner_id    uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  court_id      uuid NULL REFERENCES court(id) ON DELETE SET NULL,
  range_start   timestamptz NULL,
  range_end     timestamptz NULL,
  created_by    uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  -- O canal que o usuário ESCOLHEU no momento da criação. Registra a intenção; o
  -- `Referer`/UA da abertura registra o fato. As duas divergem (o usuário copia
  -- o link do WhatsApp e cola no Instagram) e ambas são úteis.
  channel_hint  share_channel NULL,
  -- Nulo = não expira. Para `clip`, alinhado a `clip.expires_at`.
  expires_at    timestamptz NULL,
  revoked_at    timestamptz NULL,
  view_count    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_link_sessao_chk
    CHECK (target_type <> 'session' OR (range_start IS NOT NULL AND range_end IS NOT NULL)),
  CONSTRAINT share_link_token_chk CHECK (token ~ '^[A-Za-z0-9_-]{8,32}$')
);
CREATE INDEX share_link_partner_idx ON share_link (partner_id, created_at DESC);
CREATE INDEX share_link_target_idx ON share_link (target_type, target_id);
CREATE TRIGGER share_link_set_updated_at BEFORE UPDATE ON share_link
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE share_event (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo para `download` direto do app.
  share_link_id     uuid NULL REFERENCES share_link(id) ON DELETE SET NULL,
  clip_id           uuid NULL REFERENCES clip(id) ON DELETE SET NULL,
  partner_id        uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  -- Nulo para visitante anônimo. É a auditoria de acesso que compensa a decisão
  -- de "qualquer logado vê os clipes" (`api/README.md` §3): sabemos quem viu o
  -- quê, e é isso que torna a política defensável.
  actor_user_id     uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  action            share_action NOT NULL,
  channel           share_channel NOT NULL DEFAULT 'unknown',
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  referrer_host     text NULL,
  -- Só a FAMÍLIA (`WhatsApp`, `Instagram`, `Chrome Mobile`) — não o UA completo.
  user_agent_family text NULL,
  -- HMAC-SHA256 do IP com chave rotacionada diariamente: deduplica views sem
  -- guardar IP (LGPD).
  ip_hash           text NULL,
  country           text NULL,
  region            text NULL
);
CREATE INDEX share_event_partner_time_idx ON share_event (partner_id, occurred_at DESC);
CREATE INDEX share_event_link_idx ON share_event (share_link_id, occurred_at DESC);
CREATE INDEX share_event_clip_idx ON share_event (clip_id) WHERE clip_id IS NOT NULL;

-- Agregado diário: `share_event` tem retenção de 13 meses (permite comparação
-- ano a ano) e depois vira linha aqui.
CREATE TABLE share_daily_rollup (
  partner_id uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  day        date NOT NULL,
  channel    share_channel NOT NULL,
  action     share_action NOT NULL,
  count      int NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_id, day, channel, action)
);

-- +migrate down

DROP TABLE IF EXISTS share_daily_rollup;
DROP TABLE IF EXISTS share_event;
DROP TABLE IF EXISTS share_link;

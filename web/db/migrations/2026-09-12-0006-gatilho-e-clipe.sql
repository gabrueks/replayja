-- Botão, gatilho, job de corte e clipe — o caminho quente do produto.
-- `docs/modelo-de-dados.md` §3.10 a §3.13.

-- +migrate up

-- Sem computador de borda, o botão deixa de ser um rádio pareado e passa a ser
-- um cliente HTTP com webhook configurável.
CREATE TABLE button (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  -- O mapeamento botão → quadra continua sendo o dado central.
  court_id            uuid NOT NULL REFERENCES court(id) ON DELETE CASCADE,
  -- SHA-256 do token de webhook. O token cru aparece UMA VEZ, na URL mostrada no
  -- provisionamento. Ninguém lê esta coluna depois disso.
  token_hash          text NOT NULL UNIQUE,
  -- Para o operador conferir qual botão é qual sem revelar o segredo.
  token_last4         text NOT NULL,
  label               text NOT NULL,
  kind                button_kind NOT NULL DEFAULT 'wifi_webhook',
  model               text NULL,
  -- Revogação é um UPDATE, em um clique no painel.
  active              bool NOT NULL DEFAULT true,
  -- Tempo entre o dedo e a chegada do POST: o botão acorda do sono profundo,
  -- associa no Wi-Fi, resolve DNS, faz TLS. Medido na instalação por
  -- `POST /partner/{id}/buttons/{id}/test`, que abre uma janela de 30 s.
  wake_latency_ms     int NOT NULL DEFAULT 1500,
  wake_latency_measured_at timestamptz NULL,
  battery_percent     int NULL,
  battery_reported_at timestamptz NULL,
  -- Qualquer requisição, INCLUSIVE recusada.
  last_signal_at      timestamptz NULL,
  -- Gatilho aceito.
  last_pressed_at     timestamptz NULL,
  -- `?evt=` do próprio botão, usado como chave de idempotência.
  last_event_counter  bigint NULL,
  press_count_total   bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT button_wake_latency_chk CHECK (wake_latency_ms BETWEEN 0 AND 10000),
  CONSTRAINT button_battery_chk CHECK (battery_percent IS NULL OR battery_percent BETWEEN 0 AND 100)
);
CREATE INDEX button_court_idx ON button (court_id) WHERE active;
-- Botões silenciosos: NÃO há heartbeat de botão (um dispositivo de bateria que
-- dorme não pode pagar por isso — 30 s mataria a pilha em dias). A liveness é
-- inferida por dias sem acionamento, e é um sinal fraco assumido como tal.
CREATE INDEX button_silent_idx ON button (partner_id, last_pressed_at);
CREATE TRIGGER button_set_updated_at BEFORE UPDATE ON button
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria de cada acionamento.
CREATE TABLE trigger_event (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                     uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  court_id                       uuid NOT NULL REFERENCES court(id) ON DELETE CASCADE,
  camera_id                      text NULL REFERENCES camera(id) ON DELETE SET NULL,
  button_id                      uuid NULL REFERENCES button(id) ON DELETE SET NULL,
  source                         trigger_source NOT NULL,
  requested_by_user_id           uuid NULL REFERENCES app_user(id) ON DELETE SET NULL,
  -- `<button_id>:<evt>` quando o botão manda contador; `Idempotency-Key` no
  -- botão virtual. Um botão que reenvia por timeout não gera dois clipes.
  idempotency_key                text NULL,
  -- A FONTE DA VERDADE DO TEMPO: relógio do servidor, no instante em que o POST
  -- chegou. Nem o botão nem a câmera têm relógio confiável — e agora não
  -- precisam ter.
  arrival_at                     timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- `arrival_at − button.wake_latency_ms`.
  press_estimated_at             timestamptz NOT NULL,
  button_wake_latency_ms_applied int NOT NULL DEFAULT 0,
  camera_origin_lag_ms_applied   int NOT NULL DEFAULT 0,
  -- Janela pedida ao relay, já com as duas latências aplicadas.
  deliver_from                   timestamptz NOT NULL,
  deliver_to                     timestamptz NOT NULL,
  -- Janela bruta, 13 s mais larga.
  cut_from                       timestamptz NOT NULL,
  cut_to                         timestamptz NOT NULL,
  outcome                        trigger_outcome NOT NULL DEFAULT 'accepted',
  clip_id                        uuid NULL,
  clip_job_id                    uuid NULL,
  user_agent                     text NULL,
  -- HMAC do IP, não o IP. LGPD: serve para diagnosticar botão clonado, não para
  -- identificar pessoa.
  source_ip_hash                 text NULL,
  created_at                     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trigger_event_idempotency_key ON trigger_event (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX trigger_event_court_time_idx ON trigger_event (court_id, arrival_at DESC);
CREATE INDEX trigger_event_outcome_idx ON trigger_event (outcome, arrival_at DESC)
  WHERE outcome <> 'accepted';
CREATE INDEX trigger_event_user_idx ON trigger_event (requested_by_user_id, arrival_at DESC)
  WHERE requested_by_user_id IS NOT NULL;

-- O LANCE.
CREATE TABLE clip (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Desnormalizados de propósito (`modelo-de-dados.md` §1): evitam join na
  -- consulta mais quente do produto E tornam o escopo por parceiro uma cláusula
  -- WHERE indexada — que, sem RLS, é a única barreira que existe.
  partner_id             uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  court_id               uuid NOT NULL REFERENCES court(id) ON DELETE CASCADE,
  camera_id              text NOT NULL REFERENCES camera(id) ON DELETE RESTRICT,
  trigger_event_id       uuid NULL UNIQUE REFERENCES trigger_event(id) ON DELETE SET NULL,
  clip_job_id            uuid NULL,
  -- = `trigger_event.press_estimated_at`. COLUNA DE ORDENAÇÃO E FILTRO DO
  -- PRODUTO.
  triggered_at           timestamptz NOT NULL,
  -- Trecho realmente entregue, como o relay reportou em `actualFrom`/`actualTo`.
  started_at             timestamptz NOT NULL,
  ended_at               timestamptz NOT NULL,
  -- Janela bruta ainda em disco no relay — origem do "estender lance".
  cut_from               timestamptz NOT NULL,
  cut_to                 timestamptz NOT NULL,
  duration_seconds       numeric(5,2) NOT NULL,
  status                 clip_status NOT NULL DEFAULT 'pending',
  -- `1` = janela íntegra. `< 1` = buraco de uplink durante o lance.
  coverage_ratio         numeric(4,3) NULL,
  failure_reason         text NULL,
  storage_bucket         text NOT NULL DEFAULT 'replayja-clips',
  watermarked_object_key text NULL,
  source_object_key      text NULL,
  thumbnail_object_key   text NULL,
  preview_object_key     text NULL,
  og_object_key          text NULL,
  width                  int NULL,
  height                 int NULL,
  fps                    int NULL,
  codec                  text NULL,
  size_bytes             bigint NULL,
  checksum_sha256        text NULL,
  watermark_applied      bool NOT NULL DEFAULT false,
  -- Qual PNG foi usado — permite reprocessamento dirigido quando a arena troca
  -- o logo (o recorte bruto fica 48 h em disco).
  watermark_version      int NULL,
  extends_clip_id        uuid NULL REFERENCES clip(id) ON DELETE SET NULL,
  view_count             int NOT NULL DEFAULT 0,
  download_count         int NOT NULL DEFAULT 0,
  share_count            int NOT NULL DEFAULT 0,
  -- `triggered_at + partner.clip_retention_days`.
  expires_at             timestamptz NOT NULL,
  -- Compartilhado ou baixado → retenção estendida. Um link no grupo de WhatsApp
  -- não pode virar 404 em um mês.
  pinned                 bool NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz NULL,
  CONSTRAINT clip_duracao_chk CHECK (duration_seconds > 0 AND duration_seconds <= 120),
  CONSTRAINT clip_coverage_chk CHECK (coverage_ratio IS NULL OR coverage_ratio BETWEEN 0 AND 1),
  CONSTRAINT clip_ordem_chk CHECK (ended_at >= started_at)
);

-- ─── OS ÍNDICES DA CONSULTA CENTRAL (§6.1) ─────────────────────────────────
--
-- Cobrem filtro, ordenação e cursor de keyset numa varredura só. Plano esperado:
-- `Index Scan Backward` + `Limit`, < 2 ms com um ano de uma arena.
--
-- `partial` ENTRA na busca: um lance com 3 segundos faltando ainda é o lance do
-- atleta; escondê-lo seria pior que entregá-lo rotulado.
CREATE INDEX clip_partner_time_idx ON clip (partner_id, triggered_at DESC, id DESC)
  WHERE status IN ('ready','partial') AND deleted_at IS NULL;
CREATE INDEX clip_court_time_idx ON clip (court_id, triggered_at DESC, id DESC)
  WHERE status IN ('ready','partial') AND deleted_at IS NULL;
CREATE INDEX clip_expiry_idx ON clip (expires_at)
  WHERE deleted_at IS NULL AND status <> 'expired';
CREATE INDEX clip_stuck_idx ON clip (status, created_at)
  WHERE status IN ('pending','cutting','processing','uploading');
CREATE TRIGGER clip_set_updated_at BEFORE UPDATE ON clip
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O CORTE A EXECUTAR.
CREATE TABLE clip_job (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id          uuid NOT NULL UNIQUE REFERENCES clip(id) ON DELETE CASCADE,
  partner_id       uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  camera_id        text NOT NULL REFERENCES camera(id) ON DELETE CASCADE,
  relay_node_id    text NOT NULL REFERENCES relay_node(id) ON DELETE CASCADE,
  trigger_event_id uuid NULL REFERENCES trigger_event(id) ON DELETE SET NULL,
  cut_from         timestamptz NOT NULL,
  cut_to           timestamptz NOT NULL,
  deliver_from     timestamptz NOT NULL,
  deliver_to       timestamptz NOT NULL,
  status           job_status NOT NULL DEFAULT 'pending',
  priority         int NOT NULL DEFAULT 10,
  attempt          int NOT NULL DEFAULT 0,
  claimed_at       timestamptz NULL,
  -- `claimed_at + 120 s`. Vencido sem confirmação volta para `pending` — é o que
  -- cobre O RELAY MORRER NO MEIO DE UM CORTE. Reexecutar é seguro porque a
  -- janela é ABSOLUTA: o mesmo job rodado três vezes produz três arquivos
  -- idênticos na mesma chave de objeto.
  lease_expires_at timestamptz NULL,
  coverage_ratio   numeric(4,3) NULL,
  cut_ms           int NULL,
  encode_ms        int NULL,
  error_code       text NULL,
  error            text NULL,
  -- `created_at + 30 min`. Um job atrasado NÃO é perigoso neste desenho: a
  -- janela é absoluta e a sessão está gravada, então executar o corte cinco
  -- minutos depois produz exatamente o mesmo clipe. O prazo existe só para não
  -- acumular lixo.
  expires_at       timestamptz NOT NULL,
  extends_clip_id  uuid NULL REFERENCES clip(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clip_job_attempt_chk CHECK (attempt <= 5),
  CONSTRAINT clip_job_ordem_chk CHECK (cut_to > cut_from AND deliver_to > deliver_from)
);

-- O ÍNDICE DE REIVINDICAÇÃO — o único que importa nesta tabela.
CREATE INDEX clip_job_claimable_idx ON clip_job (relay_node_id, priority DESC, created_at)
  WHERE status = 'pending';
-- Leases vencidos, para o job `requeue_expired_leases` (1 min).
CREATE INDEX clip_job_lease_idx ON clip_job (lease_expires_at)
  WHERE status IN ('claimed','cutting','processing','uploading');
CREATE TRIGGER clip_job_set_updated_at BEFORE UPDATE ON clip_job
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- As FKs circulares (clip ↔ clip_job, trigger_event ↔ clip) só podem ser criadas
-- depois que as duas tabelas existem.
ALTER TABLE clip
  ADD CONSTRAINT clip_clip_job_fk FOREIGN KEY (clip_job_id)
  REFERENCES clip_job(id) ON DELETE SET NULL;
ALTER TABLE trigger_event
  ADD CONSTRAINT trigger_event_clip_fk FOREIGN KEY (clip_id)
  REFERENCES clip(id) ON DELETE SET NULL;
ALTER TABLE trigger_event
  ADD CONSTRAINT trigger_event_clip_job_fk FOREIGN KEY (clip_job_id)
  REFERENCES clip_job(id) ON DELETE SET NULL;

-- +migrate down

ALTER TABLE IF EXISTS trigger_event DROP CONSTRAINT IF EXISTS trigger_event_clip_job_fk;
ALTER TABLE IF EXISTS trigger_event DROP CONSTRAINT IF EXISTS trigger_event_clip_fk;
ALTER TABLE IF EXISTS clip DROP CONSTRAINT IF EXISTS clip_clip_job_fk;
DROP TABLE IF EXISTS clip_job;
DROP TABLE IF EXISTS clip;
DROP TABLE IF EXISTS trigger_event;
DROP TABLE IF EXISTS button;

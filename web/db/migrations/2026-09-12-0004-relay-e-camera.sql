-- Relay, câmera, saúde da captura, buracos de cobertura e resumo da sessão.
-- `docs/modelo-de-dados.md` §3.6 a §3.9, §3.14 e §3.15.

-- +migrate up

-- Não há equipamento nosso na arena. A gravação acontece num servidor nosso na
-- AWS (`sa-east-1`), e esta tabela é o inventário dele.
CREATE TABLE relay_node (
  id                text PRIMARY KEY,
  base_url          text NOT NULL,
  -- Separado do `base_url` de propósito: `stream.replayja.com.br` é o nome que
  -- fica DIGITADO DENTRO DE CADA CÂMERA INSTALADA, onde mudar custa uma visita à
  -- quadra. Ele aponta para um Elastic IP, então trocar a instância não toca em
  -- nenhuma câmera.
  rtmp_host         text NOT NULL,
  region            text NOT NULL DEFAULT 'sa-east-1',
  -- SHA-256 da `relay_key`. A chave crua nunca fica no banco.
  key_hash          text NOT NULL,
  key_version       int NOT NULL DEFAULT 1,
  port_range_start  int NOT NULL DEFAULT 19350,
  port_range_end    int NOT NULL DEFAULT 19449,
  -- Contador MONOTÔNICO, não busca por buraco: reaproveitar a porta de uma
  -- câmera removida faz uma câmera antiga, mal desconfigurada no app do cliente,
  -- empurrar vídeo para o lugar de outra — e o vídeo errado aparece na quadra
  -- errada.
  port_range_next   int NOT NULL DEFAULT 19350,
  max_cameras       int NOT NULL DEFAULT 24,
  status            relay_status NOT NULL DEFAULT 'provisioning',
  last_seen_at      timestamptz NULL,
  agent_version     text NULL,
  disk_total_bytes  bigint NULL,
  disk_free_bytes   bigint NULL,
  -- Poda por espaço encurtando a retenção — sinal de disco subdimensionado, não
  -- estado normal.
  pruning_active    bool NOT NULL DEFAULT false,
  -- SINAL VITAL em instância burstable. A Lightsail do Sentinela chegou a 53% em
  -- 04/09/2026: passou do baseline de burst e o hipervisor estrangulou.
  cpu_steal_percent numeric(5,2) NULL,
  -- WAL do SQLite do relay. Só cresce sem parar quando o checkpoint está
  -- bloqueado por um cursor aberto — nunca por volume. Alerta acima de 512 MB.
  index_wal_bytes   bigint NULL,
  jobs_in_flight    int NOT NULL DEFAULT 0,
  job_slots         int NOT NULL DEFAULT 2,
  notes             text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relay_node_id_chk CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  CONSTRAINT relay_node_port_chk CHECK (port_range_start <= port_range_end)
);
CREATE UNIQUE INDEX relay_node_key_hash_key ON relay_node (key_hash);
CREATE INDEX relay_node_status_idx ON relay_node (status, last_seen_at);
CREATE TRIGGER relay_node_set_updated_at BEFORE UPDATE ON relay_node
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A câmera IP da quadra. Um equipamento de terceiro que só sabe fazer uma coisa:
-- empurrar RTMP.
CREATE TABLE camera (
  -- NÃO é UUID: vira nome de diretório em disco (`/srv/rec/<id>/`) e segmento de
  -- URL, então é restrito de propósito.
  id                       text PRIMARY KEY,
  uuid                     uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  partner_id               uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  -- SEM QUADRA, O RELAY NÃO GRAVA. É o equivalente ao "sem destino não há
  -- gravador" do Sentinela: a câmera criada entra numa fila "Câmeras novas".
  court_id                 uuid NULL REFERENCES court(id) ON DELETE SET NULL,
  relay_node_id            text NOT NULL REFERENCES relay_node(id) ON DELETE RESTRICT,
  name                     text NOT NULL,
  ingest_kind              ingest_kind NOT NULL DEFAULT 'rtmp_push',
  rtmp_port                int NULL,
  -- SEGREDO FRACO POR NATUREZA: o RTMP é texto claro e sem autenticação. Nasce
  -- no app, mora aqui e viaja por HTTPS até o relay. Sem RLS, a proteção é a
  -- PROJEÇÃO EXPLÍCITA: esta coluna nunca entra numa consulta de `db/queries/`
  -- que atenda usuário, e `SELECT *` é proibido lá (`modelo-de-dados.md` §7.3).
  rtmp_key                 text NULL,
  -- Contém credencial. Nunca logar, nunca devolver em API pública.
  rtsp_url                 text NULL,
  width                    int NOT NULL DEFAULT 1920,
  height                   int NOT NULL DEFAULT 1080,
  fps                      int NOT NULL DEFAULT 30,
  -- O ÚNICO controle real de custo: a mesma stream vira o clipe e a sessão.
  target_bitrate_kbps      int NOT NULL DEFAULT 3000,
  gop_seconds              numeric(3,1) NOT NULL DEFAULT 1.0,
  segment_seconds          numeric(3,1) NOT NULL DEFAULT 2.0,
  -- Atraso MEDIDO entre a cena e a chegada ao relay. O relay não descobre isso
  -- sozinho: o `PROGRAM-DATE-TIME` dele é hora de chegada, não hora da cena.
  origin_lag_ms            int NOT NULL DEFAULT 3000,
  origin_lag_measured_at   timestamptz NULL,
  retention_days           int NOT NULL DEFAULT 7,
  recording_window_opens   time NULL,
  recording_window_closes  time NULL,
  prune_after_hours        int NOT NULL DEFAULT 6,
  -- Abaixo disso, recusa o clipe em vez de entregar capenga.
  min_coverage_ratio       numeric(3,2) NOT NULL DEFAULT 0.60,
  status                   camera_status NOT NULL DEFAULT 'provisioned',
  enabled                  bool NOT NULL DEFAULT true,
  -- Nulo = a câmera NUNCA conectou; alerta de instalação incompleta.
  first_connected_at       timestamptz NULL,
  -- É O HEARTBEAT. Derivado do `POST /relay/health`, não de um agente nosso
  -- afirmando que está bem.
  last_segment_at          timestamptz NULL,
  coverage_24h             numeric(4,3) NULL,
  observed_bitrate_kbps    numeric(8,1) NULL,
  -- Segmentos com `EXTINF > 10 s` — assinatura direta de buraco de uplink.
  long_segments_24h        int NOT NULL DEFAULT 0,
  -- Instante mais antigo ainda em disco. Define o alcance do "estender lance".
  recorded_until           timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz NULL,
  CONSTRAINT camera_id_chk        CHECK (id ~ '^[a-z0-9]{6,32}$'),
  CONSTRAINT camera_gop_chk       CHECK (gop_seconds BETWEEN 0.5 AND 4.0),
  CONSTRAINT camera_retention_chk CHECK (retention_days BETWEEN 1 AND 30),
  CONSTRAINT camera_origin_lag_chk CHECK (origin_lag_ms BETWEEN 0 AND 60000),
  CONSTRAINT camera_min_coverage_chk CHECK (min_coverage_ratio BETWEEN 0 AND 1),
  CONSTRAINT camera_ingest_chk
    CHECK (ingest_kind <> 'rtsp_pull' OR rtsp_url IS NOT NULL)
);

CREATE UNIQUE INDEX camera_relay_port_key ON camera (relay_node_id, rtmp_port)
  WHERE rtmp_port IS NOT NULL;
CREATE INDEX camera_partner_idx ON camera (partner_id) WHERE deleted_at IS NULL;
CREATE INDEX camera_court_idx ON camera (court_id);
CREATE INDEX camera_health_idx ON camera (status, last_segment_at);
CREATE TRIGGER camera_set_updated_at BEFORE UPDATE ON camera
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Amostras de cobertura. A diferença conceitual importa: não é um agente nosso
-- afirmando que está bem, é a MEDIÇÃO do que existe gravado em disco.
--
-- Como ler (frota do Sentinela, 19–24 câmeras, set/2026): 0,95–0,96 saudável;
-- ~0,92 mediana; abaixo de 0,90 é problema real, não ruído. Julgar SEMPRE pela
-- janela de 24 h — a de 1 h engana logo após qualquer reinício da frota.
CREATE TABLE camera_health (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id               text NOT NULL REFERENCES camera(id) ON DELETE CASCADE,
  relay_node_id           text NOT NULL REFERENCES relay_node(id) ON DELETE CASCADE,
  received_at             timestamptz NOT NULL DEFAULT now(),
  recorder_up             bool NOT NULL,
  last_segment_at         timestamptz NULL,
  coverage_1h             numeric(4,3) NULL,
  coverage_24h            numeric(4,3) NULL,
  bitrate_kbps            numeric(8,1) NULL,
  gb_per_day              numeric(6,2) NULL,
  long_segments_24h       int NOT NULL DEFAULT 0,
  longest_gap_seconds_24h int NULL,
  -- `>= 4` indica uplink em rajadas.
  sessions_last_10m       int NOT NULL DEFAULT 0,
  disk_bytes              bigint NULL
);
CREATE INDEX camera_health_time_idx ON camera_health (camera_id, received_at DESC);

CREATE TABLE relay_health (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_node_id         text NOT NULL REFERENCES relay_node(id) ON DELETE CASCADE,
  received_at           timestamptz NOT NULL DEFAULT now(),
  disk_total_bytes      bigint NULL,
  disk_free_bytes       bigint NULL,
  pruning_active        bool NOT NULL DEFAULT false,
  cpu_load_1m           numeric(5,2) NULL,
  cpu_steal_percent     numeric(5,2) NULL,
  recorder_cpu_percent  numeric(6,2) NULL,
  worker_cpu_percent    numeric(6,2) NULL,
  index_wal_bytes       bigint NULL,
  index_db_bytes        bigint NULL,
  jobs_in_flight        int NOT NULL DEFAULT 0,
  job_slots             int NOT NULL DEFAULT 2,
  jobs_failed_1h        int NOT NULL DEFAULT 0,
  p50_cut_ms            int NULL,
  p50_encode_ms         int NULL,
  agent_version         text NULL
);
CREATE INDEX relay_health_time_idx ON relay_health (relay_node_id, received_at DESC);

-- Buracos de gravação — o que o painel do parceiro mostra e o que o suporte
-- precisa para responder "por que meu lance saiu picotado".
CREATE TABLE coverage_gap (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  camera_id           text NOT NULL REFERENCES camera(id) ON DELETE CASCADE,
  started_at          timestamptz NOT NULL,
  ended_at            timestamptz NOT NULL,
  duration_seconds    int NOT NULL,
  -- Quantas câmeras da MESMA arena tiveram buraco no mesmo minuto. É o que
  -- decide `likely_cause`: buracos de uplink chegam em bando (na frota do
  -- Sentinela, cinco câmeras do mesmo local abriram buraco no mesmo segundo,
  -- repetidamente), enquanto as puxadas por RTSP de dentro da LAN não tiveram
  -- NENHUM no mesmo período.
  concurrent_cameras  int NOT NULL DEFAULT 1,
  likely_cause        gap_cause NOT NULL DEFAULT 'unknown',
  clips_affected      int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coverage_gap_ordem_chk CHECK (ended_at >= started_at)
);
CREATE INDEX coverage_gap_partner_time_idx ON coverage_gap (partner_id, started_at DESC);
CREATE INDEX coverage_gap_camera_time_idx ON coverage_gap (camera_id, started_at DESC);

-- A gravação contínua. O Postgres guarda apenas um RESUMO DIÁRIO por câmera —
-- não há `session_segment` espelhado aqui: o índice de segmentos é o SQLite do
-- relay, e duplicar ~175 mil linhas por câmera por ano num banco que nunca as
-- consultaria seria custo puro.
CREATE TABLE session_recording (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  court_id            uuid NULL REFERENCES court(id) ON DELETE SET NULL,
  camera_id           text NOT NULL REFERENCES camera(id) ON DELETE CASCADE,
  relay_node_id       text NOT NULL REFERENCES relay_node(id) ON DELETE CASCADE,
  -- Data no fuso DA ARENA.
  local_date          date NOT NULL,
  first_segment_at    timestamptz NULL,
  last_segment_at     timestamptz NULL,
  covered_seconds     int NOT NULL DEFAULT 0,
  expected_seconds    int NOT NULL DEFAULT 0,
  coverage_ratio      numeric(4,3)
    GENERATED ALWAYS AS (round(covered_seconds::numeric / NULLIF(expected_seconds, 0), 3)) STORED,
  gap_count           int NOT NULL DEFAULT 0,
  longest_gap_seconds int NOT NULL DEFAULT 0,
  total_bytes         bigint NOT NULL DEFAULT 0,
  avg_bitrate_kbps    numeric(8,1) NULL,
  -- `relay` é o padrão e continua sendo no piloto: a sessão completa é 85% dos
  -- bytes e 0% da receita, e mandá-la para objeto custaria US$ 0,25/GB de saída
  -- da AWS em São Paulo. Só o que ganhar valor (features de IA) será promovido.
  storage_location    storage_location NOT NULL DEFAULT 'relay',
  expires_at          timestamptz NOT NULL,
  archived_at         timestamptz NULL,
  retained_reason     text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX session_recording_camera_date_key ON session_recording (camera_id, local_date);
CREATE INDEX session_recording_partner_date_idx ON session_recording (partner_id, local_date DESC);
CREATE INDEX session_recording_coverage_idx ON session_recording (coverage_ratio)
  WHERE coverage_ratio < 0.9;
CREATE TRIGGER session_recording_set_updated_at BEFORE UPDATE ON session_recording
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +migrate down

DROP TABLE IF EXISTS session_recording;
DROP TABLE IF EXISTS coverage_gap;
DROP TABLE IF EXISTS relay_health;
DROP TABLE IF EXISTS camera_health;
DROP TABLE IF EXISTS camera;
DROP TABLE IF EXISTS relay_node;

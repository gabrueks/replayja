-- `clip.purged_at` — a marca de que os BYTES foram embora.
--
-- ─── O QUE FALTAVA, E POR QUE UMA COLUNA NOVA ──────────────────────────────
--
-- A retenção de 90 dias tinha `expires_at` desde a 0006 e um índice para
-- varrê-la (`clip_expiry_idx`). O que não existia era alguém que olhasse — o
-- job `purge_expired_clips` (04:00 BRT) aparecia na ADR §4, em
-- `modelo-de-dados.md` §8 e num comentário de `lib/storage.ts`, e em lugar
-- nenhum do código (achado A-5 da auditoria de 13/09). O MP4 continuava no S3
-- `sa-east-1` depois dos 90 dias; a Política de Privacidade diz que não.
--
-- `deleted_at` NÃO serve de marca de expurgo, e é a confusão que esta coluna
-- existe para impedir. Ele responde "o clipe some da API" — camada 1 das seis
-- de `docs/legal/fluxo-remocao.md` §7 —, é imediato e é REVERSÍVEL. Apagar o
-- objeto no S3 é a camada 3, é irreversível, e acontece depois. Entre as duas
-- há uma janela real: o takedown do painel marca `deleted_at` primeiro (o SLA
-- corre) e, se a chamada ao S3 falhar, o protocolo fica `executado` e os bytes
-- ficam para sempre — sem ninguém saber, porque `deleted_at` já estava
-- preenchido.
--
-- Com `purged_at`, "sumiu da API" e "saiu do disco" passam a ser duas
-- perguntas com duas respostas. O job diário varre as duas fontes:
--
--   retenção  `expires_at <= now() AND deleted_at IS NULL`   → 'expirado'
--   takedown  `deleted_at IS NOT NULL AND purged_at IS NULL` → mantém o motivo
--
-- e é a segunda que recolhe o takedown cujo `DeleteObjects` falhou. É também o
-- que torna o job IDEMPOTENTE: reexecutar não reapaga nada, porque a linha já
-- saiu da varredura.
--
-- ─── A REDE DE SEGURANÇA DO S3 NÃO SUBSTITUI ISTO ──────────────────────────
--
-- O bucket `replayja-clips` tem regra de ciclo de vida com expiração em 100
-- dias. Ela é a rede embaixo do trapézio: cobre o dia em que este job estiver
-- quebrado, e cobre o objeto órfão que nunca teve linha. O que ela NÃO faz é
-- cumprir a promessa de 90 dias — 100 > 90, ela não sabe de `pinned` (o clipe
-- baixado, cuja validade vai a 180 dias, ela apagaria antes da hora se fosse
-- apertada) e não invalida o CloudFront. Prazo é do job; rede é do lifecycle.

-- +migrate up

ALTER TABLE clip ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL;

COMMENT ON COLUMN clip.purged_at IS
  'Quando os objetos no S3 foram apagados pelo expurgo. NULL = os bytes ainda existem.';

-- A varredura do job: os que já sumiram da API e cujos bytes continuam lá.
-- Parcial e pequeno de propósito — em operação normal esta lista fica vazia, e
-- o índice só carrega as linhas em trânsito entre as duas camadas.
CREATE INDEX IF NOT EXISTS clip_purga_pendente_idx ON clip (deleted_at)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

-- +migrate down

DROP INDEX IF EXISTS clip_purga_pendente_idx;
ALTER TABLE IF EXISTS clip DROP COLUMN IF EXISTS purged_at;

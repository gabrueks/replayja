-- A PROCEDÊNCIA da marca d'água de cada clipe.
--
-- ─── POR QUE ESTA COLUNA EXISTE ────────────────────────────────────────────
--
-- `clip.watermark_applied` responde "saiu com marca?" e `clip.watermark_version`
-- responde "de qual versão?". Falta a pergunta que o pipeline novo torna
-- possível errar: **de QUEM era a marca.**
--
--   `partner`          o PNG do parceiro, baixado do bucket privado
--   `default`          só a marca do Replay já (o parceiro não enviou logo —
--                      decisão 9 do PLANO)
--   `default-fallback` o parceiro TEM logo, mas o relay não conseguiu baixá-lo
--                      e entregou o clipe com a nossa marca
--
-- O terceiro valor é o motivo de a coluna existir. O `claim` passou a entregar
-- uma URL ASSINADA do bucket privado, e URL assinada expira, é recusada por
-- política e some quando a credencial do deploy muda. Sem este rótulo, qualquer
-- um desses acidentes produz clipes silenciosamente sem a marca da arena — que
-- é exatamente o que a arena está pagando para ver, e o tipo de falha que só
-- aparece quando alguém reclama. Com ele, é uma linha de consulta:
--
--   SELECT count(*) FROM clip
--    WHERE partner_id = $1 AND watermark_kind = 'default-fallback';
--
-- `partner_branding.watermark_width_pct` NÃO está aqui de propósito: quem a cria
-- é a migração do painel (`…-0011-painel-do-parceiro.sql`), com o mesmo nome de
-- coluna combinado entre as duas levas. Duplicar a criação aqui colidiria no
-- nome da CONSTRAINT e derrubaria o deploy do outro lado.

-- +migrate up

ALTER TABLE clip
  ADD COLUMN IF NOT EXISTS watermark_kind text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clip_watermark_kind_chk'
  ) THEN
    ALTER TABLE clip
      ADD CONSTRAINT clip_watermark_kind_chk
      CHECK (watermark_kind IS NULL
             OR watermark_kind IN ('partner','default','default-fallback'));
  END IF;
END $$;

COMMENT ON COLUMN clip.watermark_kind IS
  'Procedência do PNG aplicado: partner | default | default-fallback.';

-- Clipe com marca de parceiro nunca existiu antes desta leva — não havia PNG em
-- lugar nenhum, nem o do parceiro nem o nosso. Rotular o histórico é melhor que
-- deixar NULL: a partir daqui, NULL significa "não passou pelo worker novo".
UPDATE clip SET watermark_kind = 'default'
 WHERE watermark_applied AND watermark_kind IS NULL;

-- O índice existe para UMA consulta: quantos clipes desta arena saíram sem a
-- marca dela. Parcial, porque o caso normal (`partner`) não precisa ser
-- indexado — e num índice parcial ele não ocupa espaço nenhum.
CREATE INDEX IF NOT EXISTS clip_watermark_kind_idx
  ON clip (partner_id, watermark_kind)
  WHERE watermark_kind IS DISTINCT FROM 'partner';

-- +migrate down

DROP INDEX IF EXISTS clip_watermark_kind_idx;
ALTER TABLE clip DROP CONSTRAINT IF EXISTS clip_watermark_kind_chk;
ALTER TABLE clip DROP COLUMN IF EXISTS watermark_kind;

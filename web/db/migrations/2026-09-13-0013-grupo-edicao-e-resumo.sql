-- Edição do grupo, histórico mínimo e o registro do resumo semanal.
--
-- ─── TRÊS MUDANÇAS, E O PORQUÊ DE CADA UMA ─────────────────────────────────
--
-- 1. `play_group.sport` — o grupo passa a dizer o esporte dele. A quadra já tem
--    `court.sport`, mas um grupo com `all_courts = true` não tem quadra nenhuma
--    de onde herdar, e uma arena mista (society + futevôlei) faz "todas as
--    quadras" significar dois esportes. `NULL` continua querendo dizer "o que a
--    quadra disser" — é o estado de todo grupo já criado, e ele tem de continuar
--    válido.
--
-- 2. `play_group.updated_by` — o histórico MÍNIMO de edição. `updated_at` já
--    existe (o gatilho `set_updated_at` cuida dele desde a 0005); o que faltava
--    era QUEM. Uma tabela de auditoria com diff por campo seria o certo no dia em
--    que houver disputa entre donos; hoje não há nem tela de edição, e "quem
--    mexeu por último" responde a pergunta que a pelada faz no WhatsApp ("quem
--    mudou o horário?") com uma coluna em vez de uma tabela.
--
-- 3. `play_group_digest` — o registro de envio do resumo semanal.
--
--    ─── A IDEMPOTÊNCIA DO RESUMO MORA NO BANCO, NÃO NO JOB ────────────────
--
--    O cron da Vercel NÃO garante execução única: ele reexecuta em falha, e um
--    deploy no meio da janela pode fazer duas instâncias rodarem. Sem esta
--    tabela, a pelada receberia "Rodada de sexta: 7 lances" duas vezes — e o
--    segundo e-mail é o que faz alguém apertar "isto é spam", que queima o
--    domínio inteiro (o mesmo que manda o código de login).
--
--    A chave primária é (grupo, data local da ocorrência) e o job faz
--    `INSERT ... ON CONFLICT DO NOTHING` ANTES de chamar o Resend: quem ganhou a
--    linha manda, quem perdeu desiste. É a mesma disciplina da reivindicação de
--    job do relay — quem decide é o banco, não a ordem de chegada.
--
--    `recipients` e `clip_count` ficam na linha porque a pergunta seguinte é
--    sempre "o resumo saiu para quantas pessoas?", e sem eles ela exigiria
--    reconstituir o passado a partir de dados que mudaram desde então.

-- +migrate up

ALTER TABLE play_group
  ADD COLUMN sport      court_sport NULL,
  ADD COLUMN updated_by uuid NULL REFERENCES app_user(id) ON DELETE SET NULL;

COMMENT ON COLUMN play_group.sport IS
  'Esporte do grupo. NULL = o esporte da(s) quadra(s).';
COMMENT ON COLUMN play_group.updated_by IS
  'Quem editou por último. Com updated_at, é o histórico mínimo de edição.';

CREATE TABLE play_group_digest (
  play_group_id uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
  -- A data LOCAL da arena em que a pelada aconteceu — a mesma chave que a
  -- derivação de ocorrências usa em todo o resto do produto.
  local_date    date NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  recipients    int NOT NULL DEFAULT 0,
  clip_count    int NOT NULL DEFAULT 0,
  PRIMARY KEY (play_group_id, local_date)
);

-- "O resumo rodou hoje?" é a pergunta de operação, e ela é por TEMPO.
CREATE INDEX play_group_digest_envio_idx ON play_group_digest (sent_at DESC);

-- +migrate down

DROP TABLE IF EXISTS play_group_digest;
ALTER TABLE play_group
  DROP COLUMN IF EXISTS updated_by,
  DROP COLUMN IF EXISTS sport;

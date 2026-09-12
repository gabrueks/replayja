-- Tabelas de operação: rate limit, idempotência e erros do app.
-- ADR §7 (observabilidade sem Sentry) e `api/README.md` §5 e §6.

-- +migrate up

-- Contador de rate limit com janela deslizante.
--
-- Fica no BANCO porque a Vercel roda N instâncias: um `Map` em memória só
-- limitaria a instância que atendeu. O fallback em memória de `lib/rate-limit.ts`
-- entra quando o banco cai — vale menos, mas é muito melhor que liberar tudo.
CREATE TABLE rate_limit (
  id      bigserial PRIMARY KEY,
  bucket  text NOT NULL,
  subject text NOT NULL,
  -- Gravado com o relógio do POSTGRES, não o do Node. O `Retry-After` sai
  -- calculado do banco: no Sentinela foram medidos 3 s de diferença entre a
  -- máquina do app e o Neon, e subtrair um do outro devolvia prazo torto.
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_lookup_idx ON rate_limit (bucket, subject, at DESC);

-- `Idempotency-Key` no HTTP — `api/README.md` §5, camada 2.
--
-- `principal` é `relay:<id>` ou `user:<uuid>`, e faz parte da PK: sem isso um
-- chamador poderia adivinhar a chave de outro e receber a resposta dele.
CREATE TABLE idempotency_key (
  principal     text NOT NULL,
  key           text NOT NULL,
  -- Mesma chave + hash diferente → 422 (`idempotency-key-reuse`). É bug do
  -- cliente, e falhar alto é melhor que executar algo inesperado.
  request_hash  text NOT NULL,
  -- Nulo enquanto a requisição está EM VOO: outra com a mesma chave recebe 409 +
  -- `Retry-After: 1`.
  response_body jsonb NULL,
  response_status int NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz NULL,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (principal, key)
);
CREATE INDEX idempotency_key_expiry_idx ON idempotency_key (expires_at);

-- O SENTRY POBRE (ADR §7).
--
-- Sem agregação por release, sem breadcrumbs, sem alerta automático de pico —
-- mas CONSULTÁVEL COM SQL e sem expirar, que é exatamente o que os Runtime Logs
-- da Vercel não oferecem (retenção curta: um erro de sexta à noite pode não
-- estar lá na segunda).
--
-- Um cron diário manda por e-mail as 10 `fingerprint` mais frequentes das
-- últimas 24 h e qualquer uma NOVA.
CREATE TABLE app_error (
  -- Agrupa ocorrências do MESMO defeito: rota + nome do erro + primeira linha de
  -- stack que seja código nosso. Deliberadamente NÃO inclui a mensagem inteira,
  -- que costuma carregar id e timestamp — isso faria cada ocorrência virar um
  -- grupo novo.
  fingerprint     text PRIMARY KEY,
  message         text NOT NULL,
  stack           text NULL,
  route           text NULL,
  method          text NULL,
  user_id         uuid NULL,
  -- HMAC do e-mail, nunca o e-mail. Serve para correlacionar "é sempre o mesmo
  -- usuário?" sem guardar quem.
  user_email_hash text NULL,
  extra           text NULL,
  -- O MESMO valor devolvido no corpo do erro (RFC 9457). É o fio entre a
  -- reclamação do usuário e esta linha — sem Sentry, é o único.
  trace_id        text NULL,
  count           int NOT NULL DEFAULT 1,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz NULL
);
CREATE INDEX app_error_last_seen_idx ON app_error (last_seen_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX app_error_route_idx ON app_error (route, last_seen_at DESC);
CREATE INDEX app_error_trace_idx ON app_error (trace_id);

-- +migrate down

DROP TABLE IF EXISTS app_error;
DROP TABLE IF EXISTS idempotency_key;
DROP TABLE IF EXISTS rate_limit;

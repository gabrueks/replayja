-- Reserva `descadastro` — a rota de saída em um clique do resumo semanal.
--
-- ─── POR QUE DE PRIMEIRO NÍVEL, E POR QUE NUM ARQUIVO SÓ DELE ──────────────
--
-- O link de descadastro vai no rodapé de todo e-mail e no cabeçalho
-- `List-Unsubscribe`. O Gmail e o Outlook mostram o botão "Cancelar inscrição"
-- na própria interface a partir desse cabeçalho, e o que eles pedem é uma URL
-- que funcione SEM SESSÃO — quem clica pode estar em outro navegador, no
-- celular do trabalho, meses depois. `/descadastro/<token assinado>` é isso.
--
-- Enterrá-lo em `/app/descadastro` não serviria: o middleware exige login em
-- todo `/app/*`, e mandar quem quer sair da lista fazer login primeiro é a
-- definição de fricção em cima de um direito (LGPD, art. 18 — e a mitigação
-- obrigatória do T5 de `docs/legal/analise-lgpd.md`: opt-out em 1 clique).
--
-- Arquivo delta e não edição da 0009/0010 pela mesma razão da decisão 24: as
-- duas já estão aplicadas em produção e o runner confere checksum — reescrevê-las
-- faria todo deploy seguinte falhar alto. A fonte da verdade continua sendo
-- `lib/reserved-slugs.ts`, e `tests/slug.test.ts` soma TODAS as migrações.

-- +migrate up

INSERT INTO reserved_slug (slug) VALUES
  ('descadastro')
ON CONFLICT (slug) DO NOTHING;

-- +migrate down

DELETE FROM reserved_slug WHERE slug IN (
  'descadastro'
);

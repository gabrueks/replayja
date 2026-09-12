import { query, transacao } from "@/lib/db";
import type { PosicaoDaMarca } from "./painel-regras";

// A marca da arena: logo, marca d'água, cores, contato e horários.
//
// ─── O CONTRATO COM O PIPELINE DA MARCA D'ÁGUA ─────────────────────────────
//
// O relay lê `partner_branding` para queimar a marca no vídeo. As cinco colunas
// que ele consome são `watermark_object_key`, `watermark_version`,
// `watermark_position`, `watermark_opacity` e `watermark_scale` — e a última é
// derivada: o painel escreve `watermark_width_pct` (18 = 18% da largura do
// quadro) e o gatilho da migração 0011 mantém a escala em sincronia. Duas
// colunas, um número, uma escrita só.
//
// `watermark_version` INCREMENTA a cada upload e não é decorativo: o relay
// guarda o PNG em cache local por versão e só rebusca quando o número muda. Uma
// arena que troca o logo e não vê a mudança no vídeo é este contador parado.
//
// ─── ONDE MORA CADA COISA, E POR QUÊ ───────────────────────────────────────
//
// Telefone, WhatsApp, endereço e Instagram vão para `partner_contact`, e NÃO
// para colunas novas em `partner_branding`. A tabela já existe, já tem o enum
// `contact_kind` com esses quatro valores, já valida E.164 por `CHECK` e já é o
// que a página pública da arena lê (`contatosDoParceiro`). Duplicá-los no
// branding daria duas verdades e uma tela pública que continuaria mostrando a
// antiga. O horário de funcionamento é a exceção — ele não tem `contact_kind`
// e virou `partner_branding.opening_hours` (texto livre, 0011).

export type BrandingRow = {
  partner_id: string;
  slug: string;
  display_name: string;
  timezone: string;
  public_page_enabled: boolean;
  watermark_enabled: boolean;
  logo_object_key: string | null;
  watermark_object_key: string | null;
  watermark_version: number;
  watermark_position: PosicaoDaMarca;
  /** `numeric` chega como string no `pg`. */
  watermark_opacity: string;
  watermark_width_pct: number;
  primary_color: string | null;
  accent_color: string | null;
  tagline: string | null;
  opening_hours: string | null;
};

/**
 * O branding da arena, com a linha criada na hora se ainda não existir.
 *
 * `partner_branding` é 1:1 com `partner` mas NÃO é criada junto (a 0002 não tem
 * gatilho para isso), e uma arena semeada antes desta task não tem linha. Um
 * `LEFT JOIN` com `COALESCE` resolveria a leitura e quebraria a escrita, porque
 * o `UPDATE` não acharia linha nenhuma e falharia em silêncio — que é o pior
 * jeito de descobrir que o logo não subiu.
 */
export async function brandingDoParceiro(partnerId: string): Promise<BrandingRow | null> {
  return transacao(async (q) => {
    await q(
      `INSERT INTO partner_branding (partner_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [partnerId],
    );
    const linhas = await q<BrandingRow>(
      `SELECT p.id AS partner_id, p.slug::text AS slug, p.display_name, p.timezone,
              p.public_page_enabled, p.watermark_enabled,
              b.logo_object_key, b.watermark_object_key, b.watermark_version,
              b.watermark_position::text AS watermark_position,
              b.watermark_opacity, b.watermark_width_pct,
              b.primary_color, b.accent_color, b.tagline, b.opening_hours
         FROM partner p
         JOIN partner_branding b ON b.partner_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [partnerId],
    );
    return linhas[0] ?? null;
  });
}

export type DadosDaMarca = {
  posicao: PosicaoDaMarca;
  opacidade: number;
  larguraPct: number;
  marcaAtiva: boolean;
  corPrimaria: string | null;
  corDestaque: string | null;
  tagline: string | null;
  horarios: string | null;
};

/**
 * Salva os campos editáveis da marca.
 *
 * `watermark_object_key` e `watermark_version` NÃO entram aqui: eles só mudam
 * por upload confirmado (`registrarArquivoDaMarca`). Se este formulário
 * pudesse zerá-los, salvar a cor de destaque apagaria a marca d'água do vídeo.
 */
export async function salvarBranding(partnerId: string, d: DadosDaMarca): Promise<void> {
  await transacao(async (q) => {
    await q(
      `INSERT INTO partner_branding (partner_id, watermark_position, watermark_opacity,
                                     watermark_width_pct, primary_color, accent_color,
                                     tagline, opening_hours)
       VALUES ($1, $2::watermark_position, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (partner_id) DO UPDATE SET
         watermark_position  = EXCLUDED.watermark_position,
         watermark_opacity   = EXCLUDED.watermark_opacity,
         watermark_width_pct = EXCLUDED.watermark_width_pct,
         primary_color       = EXCLUDED.primary_color,
         accent_color        = EXCLUDED.accent_color,
         tagline             = EXCLUDED.tagline,
         opening_hours       = EXCLUDED.opening_hours`,
      [
        partnerId,
        d.posicao,
        d.opacidade,
        d.larguraPct,
        d.corPrimaria,
        d.corDestaque,
        d.tagline,
        d.horarios,
      ],
    );
    await q(`UPDATE partner SET watermark_enabled = $2 WHERE id = $1`, [partnerId, d.marcaAtiva]);
  });
}

/**
 * Registra o PNG que acabou de chegar no bucket — e SÓ ele.
 *
 * A versão é `watermark_version + 1` calculado no banco, não no app: duas abas
 * subindo marca ao mesmo tempo leriam a mesma versão e gravariam a mesma, e o
 * relay continuaria servindo o PNG velho do cache para uma das duas.
 */
export async function registrarArquivoDaMarca(
  partnerId: string,
  papel: "marca" | "logo",
  objectKey: string,
): Promise<number> {
  const linhas = await query<{ watermark_version: number }>(
    papel === "marca"
      ? `INSERT INTO partner_branding (partner_id, watermark_object_key)
         VALUES ($1, $2)
         ON CONFLICT (partner_id) DO UPDATE SET
           watermark_object_key = EXCLUDED.watermark_object_key,
           watermark_version    = partner_branding.watermark_version + 1
         RETURNING watermark_version`
      : `INSERT INTO partner_branding (partner_id, logo_object_key)
         VALUES ($1, $2)
         ON CONFLICT (partner_id) DO UPDATE SET logo_object_key = EXCLUDED.logo_object_key
         RETURNING watermark_version`,
    [partnerId, objectKey],
  );
  return linhas[0]?.watermark_version ?? 1;
}

export type ContatoDoPainel = {
  kind: "whatsapp" | "phone" | "email" | "instagram" | "website" | "address" | "maps";
  value: string;
  label: string | null;
};

/** Os contatos da arena, na ordem em que a página pública os mostra. */
export async function contatosDoPainel(partnerId: string): Promise<ContatoDoPainel[]> {
  return query<ContatoDoPainel>(
    `SELECT kind::text AS kind, value, label
       FROM partner_contact
      WHERE partner_id = $1
      ORDER BY display_order, kind`,
    [partnerId],
  );
}

/**
 * Substitui o conjunto de contatos. Apagar-e-inserir, dentro de uma transação.
 *
 * ─── POR QUE NÃO UM `UPSERT` POR TIPO ──────────────────────────────────────
 *
 * O formulário mostra os cinco campos juntos, e apagar o telefone é esvaziar o
 * campo e salvar. Com upsert por tipo, o campo esvaziado simplesmente não
 * chegaria — e o telefone velho continuaria na página pública da arena para
 * sempre. Deletar o conjunto e reinserir o que veio faz o formulário significar
 * o que ele parece significar.
 *
 * O primeiro de cada tipo é `is_primary`, que é o que o índice único parcial
 * `partner_contact_primary_idx` exige (no máximo um primário por tipo).
 */
export async function salvarContatos(
  partnerId: string,
  contatos: readonly ContatoDoPainel[],
): Promise<void> {
  await transacao(async (q) => {
    await q(`DELETE FROM partner_contact WHERE partner_id = $1`, [partnerId]);
    const vistos = new Set<string>();
    let ordem = 0;
    for (const c of contatos) {
      const valor = c.value.trim();
      if (!valor) continue;
      const primeiro = !vistos.has(c.kind);
      vistos.add(c.kind);
      await q(
        `INSERT INTO partner_contact (partner_id, kind, label, value, is_primary, display_order)
         VALUES ($1, $2::contact_kind, $3, $4, $5, $6)`,
        [partnerId, c.kind, c.label, valor, primeiro, ordem++],
      );
    }
  });
}

/** Liga/desliga a página pública da arena. */
export async function definirPaginaPublica(partnerId: string, ativa: boolean): Promise<void> {
  await query(`UPDATE partner SET public_page_enabled = $2 WHERE id = $1`, [partnerId, ativa]);
}

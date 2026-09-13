import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui";
import { brandingDoParceiro, contatosDoPainel } from "@/db/queries/painel-marca";
import EstadoDaArena from "../_components/EstadoDaArena";
import MarcaEPagina from "../_components/MarcaEPagina";
import { resolverArena } from "../_lib/arena";
import { urlDePrevia } from "../_lib/upload";
import css from "../painel.module.css";

export const metadata = { title: "Marca e página", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * `/painel/pagina` — a marca da arena e a página que ela divulga.
 *
 * ─── AS PRÉVIAS SÃO URLs ASSINADAS, GERADAS AQUI ───────────────────────────
 *
 * O logo e a marca d'água vivem no bucket PRIVADO (`replayja-clips`), junto com
 * os clipes. Eles não são assets públicos por decisão: a marca d'água é o
 * arquivo que o relay queima no vídeo, e um objeto público com cache de CDN é
 * exatamente o que não se quer quando a arena troca o logo. `urlAssinadaS3` de
 * 10 minutos resolve — e a tela recarrega, não guarda.
 *
 * Sem storage configurado (um preview sem AWS), a prévia vem `null` e a tela
 * mostra as iniciais da arena em vez de quebrar. Mesmo padrão de
 * `dbConfigured()`.
 */
export default async function PaginaDaMarca({
  searchParams,
}: {
  searchParams: Promise<{ arena?: string }>;
}) {
  const { arena } = await searchParams;
  const resolucao = await resolverArena(arena);
  if (!resolucao.ok) return <EstadoDaArena estado={resolucao} titulo="Marca e página" />;

  const { parceiro, papel } = resolucao;

  const [branding, contatos] = await Promise.all([
    brandingDoParceiro(parceiro.id),
    contatosDoPainel(parceiro.id),
  ]);
  if (!branding) return <EstadoDaArena estado={{ ok: false, motivo: "nao-encontrada" }} titulo="Marca e página" />;

  const [urlDaMarca, urlDoLogo] = await Promise.all([
    branding.watermark_object_key ? urlDePrevia("marca", parceiro.id, branding.watermark_object_key) : null,
    branding.logo_object_key ? urlDePrevia("logo", parceiro.id, branding.logo_object_key) : null,
  ]);

  const valorDe = (kind: string) => contatos.find((c) => c.kind === kind)?.value ?? "";
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br").replace(
    /^https?:\/\//,
    "",
  );

  return (
    <main className={css.pagina} id="conteudo">
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.titulo}>Marca e página</h1>
          <p className={css.subtitulo}>O que o atleta vê na página da arena, e o que sai queimado no vídeo.</p>
        </div>
        <Button
          href={`/${parceiro.slug}`}
          variante="secundario"
          tamanho={44}
          iconeDepois={<ExternalLink size={16} />}
        >
          Ver página pública
        </Button>
      </header>

      <MarcaEPagina
        podeEditar={papel !== "viewer"}
        dados={{
          arenaSlug: parceiro.slug,
          nomeDaArena: parceiro.display_name,
          base,
          paginaPublica: parceiro.public_page_enabled,
          marcaAtiva: parceiro.watermark_enabled,
          posicao: branding.watermark_position,
          opacidade: Number(branding.watermark_opacity),
          larguraPct: branding.watermark_width_pct,
          corPrimaria: branding.primary_color,
          corDestaque: branding.accent_color,
          tagline: branding.tagline,
          horarios: branding.opening_hours,
          versaoDaMarca: branding.watermark_version,
          urlDaMarca,
          urlDoLogo,
          contatos: {
            whatsapp: valorDe("whatsapp"),
            telefone: valorDe("phone"),
            email: valorDe("email"),
            instagram: valorDe("instagram"),
            endereco: valorDe("address"),
          },
        }}
      />
    </main>
  );
}

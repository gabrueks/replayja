import type { MetadataRoute } from "next";

// `robots.txt`.
//
// O produto grava imagem de pessoa em espaço semipúblico, então o padrão é
// fechado e a exceção é explícita: só a página da arena e a do grupo público
// existem para ser encontradas. Tudo que leva a um vídeo específico — link curto,
// página de sessão, área logada, painel — fica fora.
//
// `robots.txt` não é controle de acesso (quem quiser ignora), e por isso as
// mesmas rotas também mandam `X-Robots-Tag: noindex` pelo middleware, que é o que
// realmente tira do índice do Google.

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app", "/painel", "/entrar", "/sair", "/s/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

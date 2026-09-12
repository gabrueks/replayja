// Cabeçalhos de segurança, no mesmo espírito do Sentinela: CSP deliberadamente
// mínima (só enquadramento e destino de URL), porque o Next injeta script inline
// de hidratação e declarar `script-src` sem nonce derrubaria o app em produção.
//
// Diferença para o Sentinela: aqui existem páginas públicas indexáveis
// (`/[arenaSlug]`), então o `Referrer-Policy` continua `strict-origin-when-cross-origin`
// mas as páginas de clipe e de link curto recebem `X-Robots-Tag: noindex` na
// própria rota (ver `docs/api/README.md` §3).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ADR §4.1: Image Optimization desligada para mídia — em `gru1` custa por
  // transformação e o thumbnail já sai pronto do relay.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

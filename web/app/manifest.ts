import type { MetadataRoute } from "next";

/**
 * `manifest.webmanifest`.
 *
 * O mínimo que faz o atalho na tela inicial ficar com a cara do produto — e nada
 * além disso. Sem `service worker`: ver a justificativa em `app/layout.tsx`
 * (vídeo com URL assinada de vida curta não se cacheia, e guardar imagem de
 * pessoa no aparelho é risco de LGPD sem ganho).
 *
 * `display: standalone` porque a tela mais usada é o player em pé; a barra de
 * endereço do navegador só rouba altura.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Replay já",
    short_name: "Replay já",
    description:
      "Aperte o botão na quadra e o lance fica salvo. Encontre pelo horário, assista e mande no grupo.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F3EF",
    theme_color: "#F6F3EF",
    categories: ["sports", "photo", "social"],
    icons: [
      { src: "/icone.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` usa o MESMO arquivo: o "R" cabe dentro da área segura de 80%,
      // então o Android pode recortar em círculo sem comer a letra.
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Archivo, Bricolage_Grotesque } from "next/font/google";
import { RegistroDeNavegacao, ToastProvider } from "@/components/ui";
import "./globals.css";

// ─── AS DUAS FAMÍLIAS ──────────────────────────────────────────────────────
//
// Bricolage Grotesque 800 em título, horário grande e rótulo de botão; Archivo
// (400/700) em corpo, rótulo e UI.
//
// A v1 rodava Archivo + Barlow, e esse era um dos doze sinais de protótipo
// gerado: são dois grotescos neutros quase idênticos em tela, então o título
// lia como "o corpo em negrito". Toda referência brasileira (Zé, iFood, Nubank,
// Rappi) roda um display EXPRESSIVO contra um texto neutro. Bricolage é o
// equivalente disponível no Google Fonts — eixos de largura e tamanho óptico,
// contra-formas fechadas, e um 800 de verdade. Archivo FICA como face de UI: só
// uma fonte nova entra, e o peso baixado no build não cresce.
//
// As duas vêm por `next/font/google`, que baixa os arquivos no BUILD e os serve
// do nosso domínio: nenhuma requisição do navegador do atleta vai ao Google (o
// que também tira a fonte da lista de terceiros do aviso de privacidade) e não
// há FOUT de rede no 4G da quadra.
//
// `display: swap` porque o texto tem de aparecer mesmo se a fonte demorar: no
// celular da quadra, texto invisível por 3 s é pior que texto na fonte errada.
// O fallback do display é `Archivo Black`, que já está no aparelho de boa parte
// dos Android e erra pouco o peso.

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--fonte-archivo",
  display: "swap",
});

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--fonte-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://replayja.com.br"),
  title: {
    default: "Replay já — os melhores lances da sua pelada",
    template: "%s · Replay já",
  },
  description:
    "Aperte o botão na quadra e o lance fica salvo. Encontre, assista e compartilhe os seus melhores momentos.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Replay já",
  },
  // Dado de imagem de pessoa não é material de busca. Só `/[arena]` e
  // `/[arena]/[grupo]` público entram no sitemap; o resto é `noindex` pela
  // própria rota (`api/README.md` §3).
  robots: { index: true, follow: true },

  // ─── PWA MÍNIMO ──────────────────────────────────────────────────────────
  //
  // Manifesto + ícones + `theme-color`, e PARA POR AÍ. Sem service worker: o
  // conteúdo do produto é vídeo servido por CDN assinada com URL de vida curta,
  // então um cache offline ou guardaria nada de útil ou guardaria imagem de
  // pessoa no aparelho — e a segunda hipótese é um problema de LGPD que não vale
  // o ganho. O que o manifesto entrega é o atalho na tela inicial com a marca
  // certa, que é o que a arena pede.
  manifest: "/manifest.webmanifest",
  applicationName: "Replay já",
  appleWebApp: { capable: true, title: "Replay já", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icone.svg", type: "image/svg+xml" },
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icone-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F3EF",
  width: "device-width",
  initialScale: 1,
  // `maximumScale` NÃO é travado: travar zoom é uma barreira de acessibilidade
  // real, e o iOS ignora de qualquer forma desde a 10.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${display.variable}`}>
      <body>
        {/*
          O "pular para o conteúdo" é a primeira parada do Tab. Sem ele, quem
          navega por teclado atravessa o cabeçalho da arena (capa, abas,
          compartilhar) em toda página antes de chegar aos lances.
        */}
        <a className="pular-para-conteudo" href="#conteudo">
          Pular para o conteúdo
        </a>
        {/*
          O provedor de avisos é client component, mas `children` continua sendo
          renderizado no servidor: passar filhos como prop é o que evita que uma
          árvore inteira vire cliente por causa de um contexto.
        */}
        {/*
          O contador de telas do `Voltar`. Ele não desenha nada: soma uma visita
          a cada mudança de rota, e é o que permite que o "×" do player e o
          "voltar" do grupo saibam se existe uma tela NOSSA atrás — o navegador
          não conta isso (`history.length` inclui a página externa que trouxe a
          pessoa, e o App Router não guarda índice em `history.state`).

          Mora aqui, e não no layout de `/app`, porque as telas sem saída do
          relato do fundador — player, grupo, criar grupo — vivem FORA de `/app`.
        */}
        <RegistroDeNavegacao />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

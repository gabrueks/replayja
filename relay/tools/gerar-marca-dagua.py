#!/usr/bin/env python3
"""Gera os dois PNGs da marca d'água do Replay já, sem bitmap de origem.

    python3 relay/tools/gerar-marca-dagua.py

Saídas (versionadas no repo, porque o worker as usa como ARQUIVO LOCAL quando o
job vem com `kind: "default"` — ver relay/README.md §Marca d'água):

    relay/watermark-replayja.png             1200×260  marca principal
    relay/watermark-replayja-assinatura.png   720×132  assinatura discreta

─── POR QUE O PNG É GERADO E NÃO DESENHADO À MÃO ──────────────────────────────

A identidade inteira cabe em quatro números (`design/README.md` §Tokens): o
acento `#FF6B1F`, o fundo `#0B0C0E`, o raio de 20% e um peso 800. Um gerador de
40 linhas mantém os dois arquivos coerentes entre si e permite refazê-los quando
a marca mudar, sem depender de ninguém ter o Figma aberto.

─── AS DUAS DECISÕES QUE NÃO SÃO ESTÉTICA ─────────────────────────────────────

1. **Contorno escuro + sombra.** A marca vai sobre GRAMA — verde claro ao sol,
   verde quase preto à noite sob refletor. Laranja puro sobre grama clara some;
   laranja com contorno `#0B0C0E` e uma sombra difusa sobrevive aos dois. É o
   mesmo motivo pelo qual o acento do produto é laranja e não verde-limão.
2. **Alpha premultiplicado NÃO.** O PNG sai RGBA direto: o `overlay` do ffmpeg
   espera alpha reto, e o `colorchannelmixer=aa=` do worker multiplica por cima.
   Premultiplicar aqui escureceria a borda do contorno no clipe final.
"""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # pragma: no cover - só o gerador precisa de Pillow
    print("Pillow é necessário: pip install Pillow", file=sys.stderr)
    raise SystemExit(2)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ACENTO = (255, 107, 31, 255)      # --cor-acento  #FF6B1F
ESCURO = (11, 12, 14, 255)        # --cor-fundo   #0B0C0E

# Ordem de preferência. Archivo 800 é a fonte da marca; Arial Black é o fallback
# documentado em `design/README.md` e é o que existe na máquina onde isto roda.
FONTES = [
    "Archivo-Black.ttf",
    "/usr/share/fonts/truetype/archivo/Archivo-Black.ttf",
    "C:/Windows/Fonts/ariblk.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def fonte(tamanho):
    for caminho in FONTES:
        try:
            return ImageFont.truetype(caminho, tamanho)
        except OSError:
            continue
    raise SystemExit("nenhuma fonte bold encontrada — instale Archivo Black ou DejaVu")


def desenha(largura, altura, texto="REPLAY JÁ", *, contorno, sombra, raio_pct=0.22):
    """Badge com o ▶ + wordmark, centralizados no canvas."""
    img = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))

    # ── a camada da sombra vive separada: ela é borrada e o resto não ──
    capa_sombra = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    ds = ImageDraw.Draw(capa_sombra)
    d = ImageDraw.Draw(img)

    lado = int(altura * 0.68)
    topo = (altura - lado) // 2
    raio = int(lado * raio_pct)

    f = fonte(int(altura * 0.44))
    caixa = d.textbbox((0, 0), texto, font=f, stroke_width=contorno)
    larg_texto = caixa[2] - caixa[0]
    alt_texto = caixa[3] - caixa[1]

    vao = int(lado * 0.30)
    total = lado + vao + larg_texto
    x0 = max(0, (largura - total) // 2)

    # ── badge ────────────────────────────────────────────────────────────────
    badge = (x0, topo, x0 + lado, topo + lado)
    for alvo, cor in ((ds, ESCURO), (d, ACENTO)):
        alvo.rounded_rectangle(badge, radius=raio, fill=cor)
    # contorno escuro do badge, para separar o laranja da grama clara
    d.rounded_rectangle(badge, radius=raio, outline=ESCURO, width=max(2, contorno))

    # ▶ centralizado no badge, com a ponta na direita
    cx, cy = x0 + lado / 2, topo + lado / 2
    r = lado * 0.30
    d.polygon(
        [(cx - r * 0.72, cy - r), (cx - r * 0.72, cy + r), (cx + r * 0.95, cy)],
        fill=ESCURO,
    )

    # ── wordmark ─────────────────────────────────────────────────────────────
    tx = x0 + lado + vao - caixa[0]
    ty = topo + (lado - alt_texto) // 2 - caixa[1]
    ds.text((tx, ty), texto, font=f, fill=ESCURO, stroke_width=contorno, stroke_fill=ESCURO)
    d.text((tx, ty), texto, font=f, fill=ACENTO, stroke_width=contorno, stroke_fill=ESCURO)

    # A sombra é deslocada para baixo: a leitura a 18% da largura do vídeo
    # depende mais do descolamento do fundo que do desenho em si.
    capa_sombra = capa_sombra.filter(ImageFilter.GaussianBlur(sombra))
    capa_sombra.putalpha(capa_sombra.getchannel("A").point(lambda a: int(a * 0.55)))
    base = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    base.alpha_composite(capa_sombra, (0, max(1, sombra // 2)))
    base.alpha_composite(img)
    return base


def salva(img, nome):
    caminho = os.path.join(RAIZ, nome)
    img.save(caminho, "PNG", optimize=True)
    tam = os.path.getsize(caminho)
    print(f"{nome}: {img.width}×{img.height} · {tam / 1024:.1f} KB")
    if tam > 60 * 1024:
        raise SystemExit(f"{nome} passou de 60 KB ({tam} bytes)")


def main():
    salva(desenha(1200, 260, contorno=7, sombra=10), "watermark-replayja.png")
    # A assinatura entra a 10% da largura do vídeo e 60% de opacidade: contorno
    # proporcionalmente MAIOR, porque ela encolhe mais e é a primeira a sumir.
    salva(desenha(720, 132, contorno=5, sombra=6), "watermark-replayja-assinatura.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())

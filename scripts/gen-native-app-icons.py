"""Genera el icono de launcher y el de la ficha de Play desde el logo maestro.

Uso:  python scripts/gen-native-app-icons.py   (requiere Pillow y numpy)

El icono de la ficha (play-assets/icon-512.png) y el del launcher salen de aqui a
proposito: si divergen, Play rechaza la app por "afirmaciones enganosas" — la ficha
no coincide con la app instalada. Si el 512 cambia, hay que volver a subirlo a la
ficha en Play Console.

Una sola imagen para los tres formatos (adaptativo, legacy y ficha 512): hexagono +
wordmark NEXARA sobre blanco. El wordmark del logo original es blanco, asi que se
recolorea al azul-noche de la marca para que se lea sobre fondo claro.

La marca ocupa el 72 % del alto del area VISIBLE en los tres casos, de modo que el
icono instalado y el de la ficha se leen como la misma imagen.
"""
from PIL import Image, ImageDraw
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent / "apps" / "mobile-native"
RES = ROOT / "android/app/src/main/res"
SRC = RES / "drawable/logo_nexara.png"

BG = (255, 255, 255)     # @color/ic_launcher_background
INK = (21, 25, 30)       # azul-noche del hexagono, para el wordmark
WORDMARK_TOP = 2600      # fila donde acaba el hexagono y empieza el texto
FILL = 0.72
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def build_mark():
    """Logo con el wordmark recoloreado a INK, recortado a su bbox real."""
    a = np.array(Image.open(SRC).convert("RGBA"))
    a[WORDMARK_TOP:, :, :3] = INK          # solo RGB: conserva el antialiasing del alfa
    im = Image.fromarray(a)
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())


MARK = build_mark()


def paste_mark(canvas, mark_h):
    h = max(1, round(mark_h))
    w = max(1, round(h * MARK.width / MARK.height))
    canvas.alpha_composite(MARK.resize((w, h), Image.LANCZOS),
                           ((canvas.width - w) // 2, (canvas.height - h) // 2))
    return canvas


def write(path, img):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  {img.width}x{img.height}")


print(f"marca: {MARK.size}, wordmark en {INK}, fondo {BG}")

print("\n== foreground adaptativo (lienzo 108dp, visible 72dp) ==")
for name, s in DENSITIES.items():
    px = round(108 * s)
    write(RES / f"drawable-{name}/ic_launcher_foreground.png",
          paste_mark(Image.new("RGBA", (px, px), (0, 0, 0, 0)), 72 * s * FILL))

print("\n== legacy cuadrado y redondo (48dp) ==")
for name, s in DENSITIES.items():
    px = round(48 * s)
    sq = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ImageDraw.Draw(sq).rounded_rectangle([0, 0, px - 1, px - 1], radius=px * 0.20, fill=BG + (255,))
    write(RES / f"mipmap-{name}/ic_launcher.png", paste_mark(sq, px * FILL))

    rnd = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ImageDraw.Draw(rnd).ellipse([0, 0, px - 1, px - 1], fill=BG + (255,))
    write(RES / f"mipmap-{name}/ic_launcher_round.png", paste_mark(rnd, px * FILL))

print("\n== icono de ficha de Play (512, opaco) ==")
store = paste_mark(Image.new("RGBA", (512, 512), BG + (255,)), 512 * FILL)
write(ROOT / "play-assets/icon-512.png", store.convert("RGB"))

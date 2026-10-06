"""Capturas de Google Play con marco: fondo teal NEXARA, titular y la pantalla en un teléfono.

Entrada: capturas crudas del emulador (1080x1920) tomadas con datos ficticios
(ver `generar-fixtures.py`). Salida: PNG 1080x1920 (9:16) listos para la ficha.

    python scripts/store-demo/enmarcar-capturas.py --entrada <carpeta con s1.png…> \
        --salida apps/mobile-native/play-assets/screenshots/phone
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ANCHO, ALTO = 1080, 1920
# Teal de la marca (rediseño v2): #0F5F4F → #1F9E84, como la barra de las apps.
AZUL_OSCURO = (15, 95, 79)
AZUL = (31, 158, 132)
TEXTO = (255, 255, 255)
SUBTEXTO = (207, 236, 228)
BISEL = (15, 23, 42)

FUENTE_TITULO = "C:/Windows/Fonts/segoeuib.ttf"
FUENTE_SUBTITULO = "C:/Windows/Fonts/segoeui.ttf"

# (archivo crudo, titular, bajada) en el orden en que salen en la tienda.
CAPTURAS = [
    ("s1.png", "Tu día en una sola pantalla", "Checa tu entrada y sigue la actividad en curso"),
    ("s3.png", "Tu equipo en tiempo real", "Quién está activo, atrasado o ya terminó"),
    ("s2.png", "Sabes por dónde empezar", "Tu cola ordenada por prioridad y fecha"),
    ("s4.png", "Asistencia con foto y GPS", "Entradas y salidas del equipo al momento"),
    ("s6.png", "Coordina el trabajo en campo", "Chat del equipo con reacciones y menciones"),
    ("s5.png", "Canales y mensajes directos", "Todo el equipo conectado en un solo lugar"),
    ("s8.png", "Avisos que importan", "Entradas, avances y revisiones al instante"),
    ("s7.png", "Toda la operación a la mano", "Cotizaciones, proyectos, almacén y más"),
]


def fondo() -> Image.Image:
    img = Image.new("RGB", (ANCHO, ALTO), AZUL)
    draw = ImageDraw.Draw(img)
    for y in range(ALTO):
        t = y / (ALTO - 1)
        color = tuple(round(AZUL_OSCURO[i] + (AZUL[i] - AZUL_OSCURO[i]) * t) for i in range(3))
        draw.line([(0, y), (ANCHO, y)], fill=color)
    # Un halo suave detrás del teléfono para darle profundidad.
    halo = Image.new("L", (ANCHO, ALTO), 0)
    ImageDraw.Draw(halo).ellipse((140, 520, 940, 1500), fill=70)
    halo = halo.filter(ImageFilter.GaussianBlur(160))
    img.paste(Image.new("RGB", (ANCHO, ALTO), (96, 165, 250)), mask=halo)
    return img


def centrado(draw: ImageDraw.ImageDraw, y: int, texto: str, fuente: ImageFont.FreeTypeFont, color) -> None:
    ancho = draw.textlength(texto, font=fuente)
    draw.text(((ANCHO - ancho) / 2, y), texto, font=fuente, fill=color)


def enmarcar(cruda: Path, titulo: str, bajada: str) -> Image.Image:
    lienzo = fondo()
    draw = ImageDraw.Draw(lienzo)
    fuente_t = ImageFont.truetype(FUENTE_TITULO, 76)
    while draw.textlength(titulo, font=fuente_t) > ANCHO - 120:
        fuente_t = ImageFont.truetype(FUENTE_TITULO, fuente_t.size - 2)
    centrado(draw, 120, titulo, fuente_t, TEXTO)
    centrado(draw, 232, bajada, ImageFont.truetype(FUENTE_SUBTITULO, 42), SUBTEXTO)

    pantalla = Image.open(cruda).convert("RGB")
    ancho_p = 820
    alto_p = round(pantalla.height * ancho_p / pantalla.width)
    pantalla = pantalla.resize((ancho_p, alto_p), Image.LANCZOS)

    bisel, radio = 18, 64
    x = (ANCHO - ancho_p) // 2
    y = 370
    caja = (x - bisel, y - bisel, x + ancho_p + bisel, y + alto_p + bisel)

    sombra = Image.new("L", (ANCHO, ALTO), 0)
    ImageDraw.Draw(sombra).rounded_rectangle((caja[0], caja[1] + 30, caja[2], caja[3] + 30), radio + bisel, fill=150)
    sombra = sombra.filter(ImageFilter.GaussianBlur(40))
    lienzo.paste(Image.new("RGB", (ANCHO, ALTO), (10, 20, 60)), mask=sombra)

    ImageDraw.Draw(lienzo).rounded_rectangle(caja, radio + bisel, fill=BISEL)
    mascara = Image.new("L", pantalla.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, ancho_p - 1, alto_p - 1), radio, fill=255)
    lienzo.paste(pantalla, (x, y), mascara)
    return lienzo


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--entrada", required=True, type=Path)
    parser.add_argument("--salida", required=True, type=Path)
    args = parser.parse_args()
    args.salida.mkdir(parents=True, exist_ok=True)
    for viejo in args.salida.glob("nexara-*.png"):
        viejo.unlink()
    for n, (archivo, titulo, bajada) in enumerate(CAPTURAS, start=1):
        destino = args.salida / f"nexara-{n:02d}.png"
        enmarcar(args.entrada / archivo, titulo, bajada).save(destino, optimize=True)
        print(destino)


if __name__ == "__main__":
    main()

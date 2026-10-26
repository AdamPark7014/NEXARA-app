"""
Variantes webp de las fotos del sitio público (public/fotos/*.jpg → public/fotos/v/<nombre>-<ancho>.webp).

Uso (desde apps/web):  py -3.12 scripts/fotos-sitio.py
Genera 480, 960 y 1440 px de ancho (nunca más que el original), calidad 78. Las que ya existen no se rehacen.
`components/sitio/fotos.ts` arma el srcSet con estos anchos.
"""
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent / "public" / "fotos"
SALIDA = RAIZ / "v"
ANCHOS = (480, 960, 1440)


def main() -> None:
    SALIDA.mkdir(exist_ok=True)
    hechas = 0
    for origen in sorted(RAIZ.glob("*.jpg")):
        if origen.stem.startswith("mapa-"):
            continue
        with Image.open(origen) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            for ancho in ANCHOS:
                destino = SALIDA / f"{origen.stem}-{ancho}.webp"
                if destino.exists():
                    continue
                w = min(ancho, im.width)
                h = round(im.height * w / im.width)
                im.resize((w, h), Image.LANCZOS).save(destino, "WEBP", quality=78, method=6)
                hechas += 1
    print(f"{hechas} variantes nuevas en {SALIDA}")


if __name__ == "__main__":
    main()

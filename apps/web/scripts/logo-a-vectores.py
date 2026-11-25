"""Calca el logotipo de NEXARA (PNG de 3544 px) en vectores y escribe los datos que usa el sitio público.

Genera `components/sitio/emblema-datos.ts` (piezas, fragmentos, degradados y letras) y
`components/sitio/emblema-silueta.ts` (contorno exterior). El resultado es determinista: con el mismo PNG salen los
mismos archivos, así que basta volver a correrlo si cambia el arte.

Uso (desde `apps/web`):

    python3 scripts/logo-a-vectores.py [logo.png] [carpeta_de_salida]

Por omisión toma el logotipo de la app de Android y escribe en `components/sitio`. Necesita `numpy`,
`opencv-python`, `Pillow` y `shapely`.
"""

import json
import math
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import split, unary_union

WEB = Path(__file__).resolve().parent.parent
ORIGEN = Path(sys.argv[1]) if len(sys.argv) > 1 else WEB.parent / "mobile-native/android/app/src/main/res/drawable/logo_nexara.png"
SALIDA = Path(sys.argv[2]) if len(sys.argv) > 2 else WEB / "components/sitio"

ESCALA = 10.0  # una unidad del vector = 10 px del original
CLASES = {1: "cian", 2: "teal", 3: "rojo", 4: "magenta", 5: "naranja", 6: "oscuro"}
ORDEN = ["oscuro", "rojo", "naranja", "teal", "cian", "magenta"]  # de atrás hacia adelante
AREA_MINIMA = 1500  # px: lo menor es ruido de antialias
AREA_MAXIMA_FRAGMENTO = 470  # unidades²: las piezas mayores se cortan


def recortar(arte: np.ndarray):
    """Separa el emblema de la palabra: son las dos franjas de filas con tinta, con un hueco entre ellas."""
    alfa = arte[..., 3]
    filas = np.where((alfa > 10).sum(axis=1) > 0)[0]
    cortes = np.where(np.diff(filas) > 5)[0]
    if len(cortes) != 1:
        raise SystemExit(f"Se esperaban dos franjas (emblema y palabra) y hay {len(cortes) + 1}.")
    corte = cortes[0]
    franjas = [(filas[0], filas[corte] + 1), (filas[corte + 1], filas[-1] + 1)]
    partes = []
    for y0, y1 in franjas:
        franja = arte[y0:y1]
        cols = np.where((franja[..., 3] > 10).sum(axis=0) > 0)[0]
        partes.append(franja[:, cols.min() : cols.max() + 1])
    return partes[0], partes[1]


def clasificar(emblema: np.ndarray) -> np.ndarray:
    """Asigna cada píxel opaco a uno de los seis colores planos del emblema."""
    rgb = emblema[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    opaco = emblema[..., 3] > 128
    cian = opaco & (b > 170) & (g > 150) & (r < 160)
    teal = opaco & (g > 120) & (r < 90) & (b > 90) & (b < 170)
    rojo = opaco & (r > 60) & (r < 130) & (g < 50) & (b < 50)
    magenta = opaco & (r > 130) & (b > 110) & (g < 120)
    naranja = opaco & (r > 190) & (g > 50) & (b < 110)
    oscuro = opaco & (np.maximum(np.maximum(r, g), b) < 75) & ~rojo
    clases = np.zeros(emblema.shape[:2], np.uint8)
    for i, mascara in enumerate([cian, teal, rojo, magenta, naranja, oscuro], 1):
        clases[mascara] = i
    return clases


def hexa(color) -> str:
    return "#%02x%02x%02x" % tuple(int(round(v)) for v in color)


def calcar(emblema: np.ndarray, clases: np.ndarray) -> list[dict]:
    """Un polígono por mancha de color, con su color medio y los extremos de su degradado."""
    formas = []
    for i in range(1, 7):
        mascara = (clases == i).astype(np.uint8) * 255
        mascara = cv2.morphologyEx(mascara, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))  # cierra huecos de antialias
        mascara = cv2.dilate(mascara, np.ones((3, 3), np.uint8))  # crece 1 px: tapa la costura entre piezas
        n, etiquetas, datos, _ = cv2.connectedComponentsWithStats(mascara, 8)
        for k in range(1, n):
            area = datos[k][4]
            if area < AREA_MINIMA:
                continue
            contornos, _ = cv2.findContours((etiquetas == k).astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            contorno = max(contornos, key=cv2.contourArea)
            puntos = [(round(x / ESCALA, 1), round(y / ESCALA, 1)) for x, y in cv2.approxPolyDP(contorno, 2.2, True)[:, 0, :]]
            ys, xs = np.where((etiquetas == k) & (clases == i))
            colores = emblema[ys, xs, :3].astype(float)
            p = np.stack([xs, ys], 1).astype(float)
            centro = p.mean(axis=0)
            eje = np.linalg.svd(p[::37] - centro, full_matrices=False)[2][0]  # eje principal: por ahí corre el degradado
            t = (p - centro) @ eje
            ini, fin = np.percentile(t, 3), np.percentile(t, 97)
            formas.append(
                dict(
                    clase=CLASES[i],
                    area=int(area),
                    pts=puntos,
                    color=hexa(colores.mean(axis=0)),
                    g0=[round((centro + eje * ini)[0] / ESCALA, 1), round((centro + eje * ini)[1] / ESCALA, 1)],
                    g1=[round((centro + eje * fin)[0] / ESCALA, 1), round((centro + eje * fin)[1] / ESCALA, 1)],
                    ca=hexa(colores[t < np.percentile(t, 8)].mean(axis=0)),
                    cm=hexa(colores[(t > np.percentile(t, 45)) & (t < np.percentile(t, 55))].mean(axis=0)),
                    cb=hexa(colores[t > np.percentile(t, 92)].mean(axis=0)),
                )
            )
    return formas


def calcar_palabra(palabra: np.ndarray) -> list[str]:
    """NEXARA, letra por letra (con sus huecos), de izquierda a derecha."""
    mascara = (palabra[..., 3] > 127).astype(np.uint8) * 255
    contornos, jerarquia = cv2.findContours(mascara, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    letras: dict[int, list] = {}
    for i, c in enumerate(contornos):
        if cv2.contourArea(c) < 400:
            continue
        padre = jerarquia[0][i][3]
        puntos = [(round(x / ESCALA, 1), round(y / ESCALA, 1)) for x, y in cv2.approxPolyDP(c, 1.1, True)[:, 0, :]]
        letras.setdefault(i if padre == -1 else padre, []).append(puntos)
    ordenadas = sorted(letras.values(), key=lambda subs: min(p[0] for s in subs for p in s))
    return ["".join(trazo(s) for s in subs) for subs in ordenadas]


def trazo(puntos) -> str:
    return "M" + "L".join(f"{x:g} {y:g}" for x, y in puntos) + "Z"


def anillo(poligono, simplificar=0.0):
    g = poligono.simplify(simplificar) if simplificar else poligono
    return [(round(x, 1), round(y, 1)) for x, y in list(g.exterior.coords)[:-1]]


def cortar(poligono):
    """Parte una pieza en fragmentos con cortes en las direcciones del hexágono, hasta que ninguno pase del máximo."""
    partes = [poligono]
    for _ in range(40):
        partes.sort(key=lambda g: -g.area)
        if partes[0].area <= AREA_MAXIMA_FRAGMENTO:
            break
        g = partes.pop(0)
        minx, miny, maxx, maxy = g.bounds
        hecho = False
        for intento in range(12):
            angulo = math.radians(random.choice([30, 90, 150, 0, 60, 120]))
            c = g.representative_point() if intento > 6 else g.centroid
            cx = c.x + random.uniform(-0.18, 0.18) * (maxx - minx)
            cy = c.y + random.uniform(-0.18, 0.18) * (maxy - miny)
            largo = 400
            linea = LineString([(cx - math.cos(angulo) * largo, cy - math.sin(angulo) * largo), (cx + math.cos(angulo) * largo, cy + math.sin(angulo) * largo)])
            try:
                res = [r for r in split(g, linea).geoms if r.area > 1]
            except Exception:
                continue
            if len(res) >= 2 and min(r.area for r in res) > 0.2 * g.area:
                partes.extend(res)
                hecho = True
                break
        if not hecho:
            partes.append(g)
    return partes


def main():
    arte = np.array(Image.open(ORIGEN).convert("RGBA"))
    emblema, palabra = recortar(arte)
    alto, ancho = emblema.shape[:2]
    w, h = ancho / ESCALA, alto / ESCALA
    formas = calcar(emblema, clasificar(emblema))
    letras = calcar_palabra(palabra)

    random.seed(7)
    piezas, degradados = [], []
    for clase in ORDEN:
        for f in formas:
            if f["clase"] != clase:
                continue
            grad = None
            if clase == "naranja" and f["ca"] != f["cb"]:
                grad = dict(id=f"nx-g{len(degradados) + 1}", x1=f["g0"][0], y1=f["g0"][1], x2=f["g1"][0], y2=f["g1"][1], c=[f["ca"], f["cm"], f["cb"]])
                degradados.append(grad)
            piezas.append(dict(clase=clase, pts=f["pts"], color=f["color"], grad=grad["id"] if grad else None, area=f["area"] / 100.0))

    poligonos = [Polygon(p["pts"]).buffer(0) for p in piezas]
    silueta = unary_union(poligonos).buffer(0.4).buffer(-0.4)
    if isinstance(silueta, MultiPolygon):
        silueta = max(silueta.geoms, key=lambda g: g.area)
    puntos_silueta = anillo(silueta, 0.35)

    fragmentos = []
    for p, poligono in zip(piezas, poligonos):
        if p["clase"] == "oscuro":
            continue
        for parte in cortar(poligono):
            for g in parte.geoms if isinstance(parte, MultiPolygon) else [parte]:
                if g.area < 12:
                    continue
                c = g.centroid
                fragmentos.append(dict(clase=p["clase"], d=trazo(anillo(g)), color=p["color"], grad=p["grad"], cx=round(c.x, 1), cy=round(c.y, 1)))

    datos = [
        "/**\n * Logotipo de NEXARA en vectores, calcado del arte original de 3544 px (el de la app: `logo_nexara.png`) con\n"
        " * `apps/web/scripts/logo-a-vectores.py`. Una unidad = 10 px del original. No editar a mano: se regenera desde el PNG.\n */\n",
        f"export const EMBLEMA_ANCHO = {w:g};\nexport const EMBLEMA_ALTO = {h:g};\n\n",
        "export type Degradado = { id: string; x1: number; y1: number; x2: number; y2: number; c: string[] };\n",
        "/** Los tres degradados naranja (la barra diagonal y los dos listones). */\n",
        "export const DEGRADADOS: Degradado[] = " + json.dumps(degradados) + ";\n\n",
        "export type Pieza = { clase: string; d: string; color: string; grad: string | null };\n",
        "/** Las 13 piezas del emblema, de atrás hacia adelante. */\n",
        "export const PIEZAS: Pieza[] = " + json.dumps([dict(clase=p["clase"], d=trazo(p["pts"]), color=p["color"], grad=p["grad"]) for p in piezas]) + ";\n\n",
        "export type Fragmento = Pieza & { cx: number; cy: number };\n",
        "/** Las piezas de color cortadas en direcciones del hexágono: lo que vuela y se arma en la entrada. */\n",
        "export const FRAGMENTOS: Fragmento[] = " + json.dumps(fragmentos) + ";\n\n",
        f"export const PALABRA_ANCHO = {palabra.shape[1] / ESCALA:g};\nexport const PALABRA_ALTO = {palabra.shape[0] / ESCALA:g};\n",
        "/** NEXARA, letra por letra. */\n",
        "export const LETRAS: string[] = " + json.dumps(letras) + ";\n",
    ]
    contorno = [
        "/**\n * Contorno exterior del emblema de NEXARA, en las mismas unidades que `emblema-datos.ts` (lo genera el mismo script).\n"
        " * Va aparte porque es lo único del logotipo que necesita el navegador: de aquí salen las pistas del hero.\n */\n",
        f"export const EMBLEMA_ANCHO = {w:g};\nexport const EMBLEMA_ALTO = {h:g};\n",
        "export const SILUETA: [number, number][] = " + json.dumps(puntos_silueta) + ";\n",
    ]
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "emblema-datos.ts").write_text("".join(datos), encoding="utf-8")
    (SALIDA / "emblema-silueta.ts").write_text("".join(contorno), encoding="utf-8")
    print(f"{len(piezas)} piezas, {len(fragmentos)} fragmentos, {len(letras)} letras, silueta de {len(puntos_silueta)} puntos → {SALIDA}")


if __name__ == "__main__":
    main()

"""
Texturas de la maqueta del diseñador de videovigilancia: pisos, muros y follaje, generados con
código para no depender de imágenes de terceros. Son mosaicos sin costuras: el ruido se arma en el
espacio de frecuencias, que es periódico por construcción.

Uso: python scripts/cctv/generar_texturas.py  (escribe en apps/web/public/cctv/texturas)
Requiere numpy y Pillow. Con la misma semilla sale lo mismo.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SALIDA = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "web", "public", "cctv", "texturas")
os.makedirs(SALIDA, exist_ok=True)


def ruido(n, beta, semilla, ax=1.0, ay=1.0):
    """Ruido periódico con espectro 1/f^beta. `ax` y `ay` lo estiran a lo largo de un eje (veta de madera)."""
    rng = np.random.default_rng(semilla)
    base = rng.normal(size=(n, n))
    fy = np.fft.fftfreq(n)[:, None] * ay
    fx = np.fft.fftfreq(n)[None, :] * ax
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    esp = np.fft.fft2(base) / f**beta
    esp[0, 0] = 0
    r = np.real(np.fft.ifft2(esp))
    return (r - r.mean()) / (r.std() + 1e-9)


def banda(n, f0, ancho, semilla):
    """Ruido de una sola escala: grano fino, sin manchas grandes."""
    rng = np.random.default_rng(semilla)
    base = rng.normal(size=(n, n))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    esp = np.fft.fft2(base) * np.exp(-(((f - f0) / ancho) ** 2))
    r = np.real(np.fft.ifft2(esp))
    return (r - r.mean()) / (r.std() + 1e-9)


def deformar(img, dx, dy):
    """Muestrea `img` corrido por los campos dx y dy, en píxeles, con vuelta en las orillas."""
    n = img.shape[0]
    y, x = np.mgrid[0:n, 0:n]
    xs = (x + dx) % n
    ys = (y + dy) % n
    x0 = np.floor(xs).astype(int) % n
    y0 = np.floor(ys).astype(int) % n
    x1 = (x0 + 1) % n
    y1 = (y0 + 1) % n
    fx = xs - np.floor(xs)
    fy = ys - np.floor(ys)
    return img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy


def normal_de(altura, fuerza):
    """Mapa de normales desde una altura, con vuelta en las orillas."""
    dx = (np.roll(altura, -1, 1) - np.roll(altura, 1, 1)) * fuerza
    dy = (np.roll(altura, -1, 0) - np.roll(altura, 1, 0)) * fuerza
    dz = np.ones_like(altura)
    l = np.sqrt(dx * dx + dy * dy + dz * dz)
    return np.stack([-dx / l, dy / l, dz / l], -1) * 0.5 + 0.5


def guardar(nombre, rgb, calidad=84):
    a = np.clip(rgb, 0, 1)
    if a.ndim == 2:
        a = np.stack([a, a, a], -1)
    im = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    # Los relieves no necesitan tanta resolución como el color, y son lo que más pesa.
    if nombre.endswith("_n") or nombre.endswith("_r"):
        im = im.resize((512, 512), Image.LANCZOS)
        calidad = 72
    im.save(os.path.join(SALIDA, f"{nombre}.webp"), quality=calidad, method=6)


def juntas(n, celdas, ancho):
    """1 en las juntas de una retícula, con la orilla suave. Da también el canal para la altura."""
    p = n / celdas
    y, x = np.mgrid[0:n, 0:n]
    dx = np.minimum(x % p, p - (x % p))
    dy = np.minimum(y % p, p - (y % p))
    d = np.minimum(dx, dy)
    return np.clip(1 - d / ancho, 0, 1)


def color(valor, tono):
    return valor[..., None] * np.array(tono)


def concreto():
    n = 1024
    manchas = ruido(n, 1.9, 1)
    remolino = deformar(ruido(n, 1.2, 2, ax=6.0), ruido(n, 2.0, 3) * 26, ruido(n, 2.0, 4) * 26)
    grano = banda(n, 0.32, 0.12, 5)
    v = 0.66 + 0.042 * manchas + 0.014 * remolino + 0.009 * grano
    rng = np.random.default_rng(6)
    # Motas de agregado y marcas de uso.
    motas = (banda(n, 0.22, 0.05, 7) > 2.5).astype(float)
    v -= motas * 0.05
    j = juntas(n, 2, 2.2)
    v *= 1 - j * 0.46
    guardar("concreto", color(v, (1.0, 0.985, 0.955)))
    guardar("concreto_n", normal_de(-j * 1.4 + grano * 0.012 + remolino * 0.02, 1.4))
    # Más pulido donde se pisa más: rugosidad con manchas.
    guardar("concreto_r", 0.42 + manchas[..., None].repeat(3, -1) * 0.07)


def madera():
    n = 1024
    tablas = 10
    alto = n / tablas
    largo = n * 0.62
    rng = np.random.default_rng(11)
    y, x = np.mgrid[0:n, 0:n]
    fila = np.floor(y / alto).astype(int)
    desf = rng.random(tablas) * largo
    columna = np.floor((x + desf[fila]) / largo).astype(int)
    cid = fila * 37 + columna * 101
    # Cada tabla toma su propia parte de la veta.
    veta = ruido(n, 1.15, 12, ax=0.05, ay=1.0)
    nudos = ruido(n, 2.3, 13)
    anillos = np.sin((y + nudos * 22 + (cid % 13) * 31) * 0.42 + veta * 1.2)
    tono_t = np.array([rng.random() for _ in range(4096)])
    t = tono_t[cid % 4096]
    v = 0.6 + (t - 0.5) * 0.07 + veta * 0.026 + anillos * 0.014
    # Tono: de miel a nogal claro según la tabla.
    r = v * (1.0 + (t - 0.5) * 0.05)
    g = v * (0.76 + (t - 0.5) * 0.04)
    b = v * (0.53 + (t - 0.5) * 0.05)
    d_y = np.minimum(y % alto, alto - (y % alto))
    dx_local = (x + desf[fila]) % largo
    d_x = np.minimum(dx_local, largo - dx_local)
    bisel = np.clip(1 - np.minimum(d_x, d_y) / 1.6, 0, 1)
    sombra = 1 - bisel * 0.4
    guardar("madera", np.stack([r * sombra, g * sombra, b * sombra], -1))
    guardar("madera_n", normal_de(-bisel * 1.1 + veta * 0.018, 1.5))
    guardar("madera_r", np.clip(0.36 + veta[..., None].repeat(3, -1) * 0.05, 0, 1))


def piedra():
    """Porcelanato de gran formato con veta suave y boquilla: dos por dos piezas."""
    n = 1024
    celdas = 2
    p = n // celdas
    v = np.zeros((n, n))
    for i in range(celdas):
        for j in range(celdas):
            s = 21 + i * 7 + j * 13
            campo = ruido(p, 1.7, s)
            guia = deformar(ruido(p, 2.1, s + 1), ruido(p, 2.0, s + 2) * 30, ruido(p, 2.0, s + 3) * 30)
            venas = np.exp(-np.abs(guia) * 9)
            v[i * p : (i + 1) * p, j * p : (j + 1) * p] = 0.86 + campo * 0.012 - venas * 0.07 + (s % 5) * 0.003
    g = juntas(n, celdas, 2.6)
    v = v * (1 - g * 0.5)
    guardar("piedra", color(v, (1.0, 0.985, 0.96)))
    guardar("piedra_n", normal_de(-g * 1.4, 1.6))


def tecnico():
    n = 1024
    celdas = 4
    v = 0.67 + banda(n, 0.4, 0.14, 31) * 0.022 + banda(n, 0.11, 0.05, 32) * 0.012
    rng = np.random.default_rng(33)
    p = n // celdas
    for i in range(celdas):
        for j in range(celdas):
            v[i * p : (i + 1) * p, j * p : (j + 1) * p] += (rng.random() - 0.5) * 0.03
    g = juntas(n, celdas, 2.4)
    v = v * (1 - g * 0.62)
    guardar("tecnico", color(v, (0.965, 0.985, 1.0)))
    guardar("tecnico_n", normal_de(-g * 1.6, 1.6))


def asfalto():
    n = 1024
    piedras = banda(n, 0.3, 0.1, 41)
    claras = np.clip((banda(n, 0.26, 0.08, 42) - 1.5) * 0.5, 0, 1)
    parches = ruido(n, 2.2, 43)
    v = 0.17 + piedras * 0.022 + claras * 0.17 + parches * 0.02
    guardar("asfalto", color(v, (1.0, 1.0, 1.02)))
    guardar("asfalto_n", normal_de(piedras * 0.14 + claras * 0.16, 1.4))


def pasto():
    n = 1024
    fino = banda(n, 0.38, 0.14, 51)
    medio = banda(n, 0.13, 0.06, 52)
    grande = ruido(n, 2.2, 53)
    claras = np.clip((banda(n, 0.33, 0.07, 54) - 1.2) * 0.55, 0, 1)
    secas = np.clip(ruido(n, 2.0, 55) * 0.5, 0, 1)
    # Pasto de verdad: verde olivo, con su parte seca, no verde de cancha.
    v = 0.42 + fino * 0.034 + medio * 0.026 + grande * 0.018 + claras * 0.05
    r = v * (0.76 + secas * 0.14)
    g = v * 0.96
    b = v * (0.5 + secas * 0.03)
    guardar("pasto", np.stack([r, g, b], -1))
    guardar("pasto_n", normal_de(fino * 0.26 + medio * 0.22, 1.5))


def banqueta():
    """Losas de concreto de banqueta, con acabado de escoba y junta fría."""
    n = 1024
    celdas = 2
    escoba = ruido(n, 0.9, 61, ax=0.08, ay=1.0)
    manchas = ruido(n, 1.9, 62)
    v = 0.71 + escoba * 0.011 + manchas * 0.032 + banda(n, 0.3, 0.1, 63) * 0.012
    rng = np.random.default_rng(64)
    p = n // celdas
    for i in range(celdas):
        for j in range(celdas):
            v[i * p : (i + 1) * p, j * p : (j + 1) * p] += (rng.random() - 0.5) * 0.04
    g = juntas(n, celdas, 3.0)
    v *= 1 - g * 0.5
    guardar("banqueta", color(v, (1.0, 0.985, 0.95)))
    guardar("banqueta_n", normal_de(-g * 1.6 + escoba * 0.03, 1.5))


def yeso():
    """Solo relieve: el color del muro lo pone el material."""
    n = 512
    h = banda(n, 0.2, 0.09, 71) * 0.05 + ruido(n, 1.7, 72) * 0.05
    guardar("yeso_n", normal_de(h, 1.2))


def follaje():
    """Un manojo de hojas sobre transparente, para las tarjetas de árboles y plantas."""
    n = 512
    rng = np.random.default_rng(81)
    capa = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    for _ in range(420):
        cx = rng.random() * n
        cy = rng.random() * n
        # Más denso en el centro, para que la tarjeta no se vea cuadrada.
        if (cx - n / 2) ** 2 + (cy - n / 2) ** 2 > (n * 0.46) ** 2:
            continue
        largo = 16 + rng.random() * 18
        ancho = largo * (0.34 + rng.random() * 0.14)
        a = rng.random() * np.pi * 2
        ca, sa = np.cos(a), np.sin(a)
        pts = []
        for t in np.linspace(0, 2 * np.pi, 14):
            x = np.cos(t) * largo
            y = np.sin(t) * ancho * (1 - 0.35 * np.cos(t))
            pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
        tono = rng.random()
        luz = 0.72 + rng.random() * 0.38
        c = (int((54 + tono * 34) * luz), int((96 + tono * 42) * luz), int((38 + tono * 16) * luz), 255)
        d.polygon(pts, fill=c)
    capa = capa.filter(ImageFilter.GaussianBlur(0.6))
    capa.save(os.path.join(SALIDA, "follaje.webp"), quality=82, method=6)


if __name__ == "__main__":
    concreto()
    madera()
    piedra()
    tecnico()
    asfalto()
    pasto()
    banqueta()
    yeso()
    follaje()
    total = 0
    for f in sorted(os.listdir(SALIDA)):
        t = os.path.getsize(os.path.join(SALIDA, f))
        total += t
        print(f"{f:20} {t // 1024:5} KB")
    print(f"total {total // 1024} KB")

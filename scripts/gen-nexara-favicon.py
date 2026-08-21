from PIL import Image
from pathlib import Path

src = Path(r"C:\dev\apps\NEXARA-app\apps\web\public\logo-nexara-platform.png")
public = Path(r"C:\dev\apps\NEXARA-app\apps\web\public")
appdir = Path(r"C:\dev\apps\NEXARA-app\apps\web\app")

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size


def is_bg(px):
    r, g, b, a = px
    return a < 8 or (r < 18 and g < 18 and b < 18)


minx, miny, maxx, maxy = w, h, 0, 0
for y in range(h):
    for x in range(w):
        if not is_bg(pixels[x, y]):
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)

cropped = img.crop((minx, miny, maxx + 1, maxy + 1))


def make_square(size, pad_ratio=0.12):
    canvas = Image.new("RGBA", (size, size), (7, 12, 22, 255))
    inner = int(size * (1 - 2 * pad_ratio))
    mark = cropped.copy()
    mark.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.paste(mark, (x, y), mark)
    return canvas


sizes = {
    public / "icon-48.png": 48,
    public / "icon-192.png": 192,
    public / "apple-touch-icon.png": 180,
    public / "icon.png": 512,
    appdir / "icon.png": 512,
    appdir / "apple-icon.png": 180,
}

for path, size in sizes.items():
    make_square(size).save(path, "PNG", optimize=True)
    print(f"{size}x{size} -> {path}")

icos = [make_square(s) for s in (16, 32, 48)]
icos[0].save(
    public / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=icos[1:],
)
print(f"ico -> {public / 'favicon.ico'} ({(public / 'favicon.ico').stat().st_size} bytes)")

preview_path = Path(r"C:\Users\adpoz\.cursor\projects\empty-window\assets\nexara-favicon-new.png")
make_square(128).save(preview_path)
print(f"preview -> {preview_path}")

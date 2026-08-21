from PIL import Image
from pathlib import Path

src = Path("apps/web/public/logo-nexara-platform.png")
public = Path("apps/web/public")
appdir = Path("apps/web/app")
brand = public / "brand"

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size


def is_bg(px):
    r, g, b, a = px
    return a < 8


minx, miny, maxx, maxy = w, h, 0, 0
for y in range(h):
    for x in range(w):
        if not is_bg(pixels[x, y]):
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)

cropped = img.crop((minx, miny, maxx + 1, maxy + 1))


def make_square(size, pad_ratio=0.08):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - 2 * pad_ratio))
    mark = cropped.copy()
    mark.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.paste(mark, (x, y), mark)
    return canvas


brand.mkdir(parents=True, exist_ok=True)

outputs = {
    public / "icon-48.png": 48,
    public / "icon-192.png": 192,
    public / "apple-touch-icon.png": 180,
    public / "icon.png": 512,
    appdir / "icon.png": 512,
    appdir / "apple-icon.png": 180,
    brand / "nexara-mark-v3-48.png": 48,
    brand / "nexara-mark-v3-180.png": 180,
    brand / "nexara-mark-v3-192.png": 192,
    brand / "nexara-mark-v3-512.png": 512,
    brand / "nexara-mark-v2-48.png": 48,
    brand / "nexara-mark-v2-180.png": 180,
    brand / "nexara-mark-v2-192.png": 192,
    brand / "nexara-mark-v2-512.png": 512,
}

for path, size in outputs.items():
    make_square(size).save(path, "PNG", optimize=True)
    print(f"{size}x{size} -> {path}")

icos = [make_square(s) for s in (16, 32, 48)]
for dest in [public / "favicon.ico", brand / "nexara-mark-v2.ico", brand / "nexara-mark-v3.ico"]:
    icos[0].save(
        dest,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=icos[1:],
    )
    print(f"ico -> {dest} ({dest.stat().st_size} bytes)")

preview = Path(r"C:\Users\adpoz\.cursor\projects\c-dev-apps-NEXARA-app\assets\favicon-from-login.png")
preview.parent.mkdir(parents=True, exist_ok=True)
make_square(128).save(preview)
print(f"preview -> {preview}")

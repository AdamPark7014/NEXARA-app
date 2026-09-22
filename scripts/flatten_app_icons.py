#!/usr/bin/env python3
import sys
from pathlib import Path

def ensure_pillow():
    try:
        from PIL import Image  # noqa: F401
        return
    except Exception:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "pillow"])

def flatten_icons(iconset_dir: Path) -> int:
    from PIL import Image
    count = 0
    for png_path in iconset_dir.glob("*.png"):
        try:
            img = Image.open(png_path).convert("RGBA")
            bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
            out = Image.alpha_composite(bg, img).convert("RGB")
            out.save(png_path, format="PNG")
            print(f"Flattened {png_path.name} -> RGB {out.size}")
            count += 1
        except Exception as e:
            print(f"WARNING: failed to process {png_path}: {e}", file=sys.stderr)
    return count

def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: flatten_app_icons.py <AppIcon.appiconset directory>", file=sys.stderr)
        return 2
    iconset = Path(sys.argv[1])
    if not iconset.is_dir():
        print(f"Not a directory: {iconset}", file=sys.stderr)
        return 2
    ensure_pillow()
    return flatten_icons(iconset)

if __name__ == "__main__":
    raise SystemExit(main())

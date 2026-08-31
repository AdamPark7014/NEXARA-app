"""Verifica la paridad entre la app nativa y el panel web.

Comprueba dos cosas, ambas contra el árbol real de `apps/web`:

  1. Que cada `webPath` de `ModuleCatalog` (app Android), pasado por las mismas
     reglas que usa `WebPanelUrl.kt`, aterrice en una ruta que exista de verdad —
     o esté declarado explícitamente como "sin equivalente web".
  2. Que las rutas declaradas sin equivalente sigan sin existir. Si la web las
     estrena, hay que quitarlas de la lista para que la app vuelva a enlazarlas.

El botón "Abrir en la web" de los módulos pendientes sale de ahí; cuando la web se
reorganiza, esto es lo que evita que la app mande a la gente a un 404.

Uso:  python scripts/check-app-web-parity.py     (sale 1 si hay divergencias)
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_PANELS = ROOT / "apps/web/app/(panels)"
CATALOG = ROOT / (
    "apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp"
    "/ui/catalog/ModuleCatalog.kt"
)
WEB_PANEL_URL = ROOT / (
    "apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp"
    "/access/WebPanelUrl.kt"
)


def web_routes() -> set[str]:
    """Rutas con page.tsx, ignorando los grupos `(xxx)` de Next."""
    routes = set()
    for dirpath, _dirs, files in os.walk(WEB_PANELS):
        if not any(f in files for f in ("page.tsx", "page.ts")):
            continue
        rel = os.path.relpath(dirpath, WEB_PANELS).replace("\\", "/")
        if rel == ".":
            continue
        parts = [p for p in rel.split("/") if not (p.startswith("(") and p.endswith(")"))]
        if parts:
            routes.add("/" + "/".join(parts))
    return routes


def kotlin_pairs(source: str, marker: str) -> dict[str, str]:
    """Extrae los `"a" to "b"` del bloque que sigue a `marker`."""
    body = source.split(marker, 1)[1]
    depth, end = 0, len(body)
    for i, ch in enumerate(body):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                end = i
                break
    return dict(re.findall(r'"([^"]+)"\s+to\s+"([^"]+)"', body[:end]))


def kotlin_set(source: str, marker: str) -> set[str]:
    body = source.split(marker, 1)[1]
    return set(re.findall(r'"([^"]+)"', body.split(")", 1)[0]))


def main() -> int:
    routes = web_routes()
    kt = WEB_PANEL_URL.read_text(encoding="utf-8")
    legacy = kotlin_pairs(kt, "LEGACY_PREFIXES = listOf")
    remap = kotlin_pairs(kt, "MODULE_REMAP = mapOf")
    slugs = kotlin_pairs(kt, "SLUG_ALIASES = mapOf")
    no_web = kotlin_set(kt, "NO_WEB_EQUIVALENT = setOf")
    slug_panels = kotlin_set(kt, "SLUG_REMAPPED_PANELS = setOf")

    def remap_slugs(path: str) -> str:
        segments = [s for s in path.split("/") if s]
        if len(segments) < 2 or segments[0] not in slug_panels:
            return path
        tail = [slugs.get(s, s) for s in segments[1:]]
        return "/" + "/".join([segments[0]] + tail)

    def normalize(path: str) -> str:
        clean = remap_slugs(path.rstrip("/") or "/")
        for lg, cn in legacy.items():
            if clean == lg:
                clean = cn
                break
            if clean.startswith(lg + "/"):
                clean = cn + clean[len(lg):]
                break
        clean = re.sub(r"^/erp/hr/hr(?=/|$)", "/erp/hr", clean)
        clean = re.sub(r"^/erp/erp(?=/|$)", "/erp", clean)
        clean = remap_slugs(clean)
        return remap.get(clean, clean)

    catalog = CATALOG.read_text(encoding="utf-8")
    portal = None
    broken: list[str] = []
    linked = skipped = 0

    for line in catalog.splitlines():
        header = re.search(r"val (\w+): List<ModuleEntry>", line)
        if header:
            portal = header.group(1)
        entry = re.search(r'ModuleEntry\("([^"]+)",\s*"[^"]+",\s*"[^"]*",\s*"([^"]+)"', line)
        if not (entry and portal):
            continue
        key, path = entry.groups()
        target = normalize(path)
        if target in no_web:
            skipped += 1
        elif target in routes:
            linked += 1
        else:
            broken.append(f"  {portal:14s} {key:22s} {path:32s} -> {target}")

    stale = sorted(p for p in no_web if p in routes)

    print(f"rutas web encontradas: {len(routes)}")
    print(f"módulos que enlazan a una ruta real: {linked}")
    print(f"módulos declarados sin equivalente web: {skipped}")

    if broken:
        print("\nMódulos cuyo 'Abrir en la web' daría 404:")
        print("\n".join(broken))
    if stale:
        print("\nDeclarados sin equivalente, pero la web ya los tiene "
              "(quitar de NO_WEB_EQUIVALENT):")
        print("\n".join(f"  {p}" for p in stale))

    if broken or stale:
        return 1
    print("\nOK — la app y la web no divergen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

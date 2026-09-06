"""Verifica paridad app nativa ↔ panel web ↔ matriz documentada.

Comprueba tres cosas:

  1. Cada `webPath` de `ModuleCatalog` (Android), normalizado como `WebPanelUrl.kt`,
     aterriza en una ruta web real — o está en `NO_WEB_EQUIVALENT`.
  2. Las rutas en `NO_WEB_EQUIVALENT` que ya existen en web se reportan como obsoletas.
  3. **Bidireccional:** `docs/native-parity-matrix.md` y `ModuleCatalog.parityStatus`
     deben coincidir (falla si la matriz declara NATIVO y el catálogo no).

Uso:  python scripts/check-app-web-parity.py     (exit 1 si hay divergencias)
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
MATRIX = ROOT / "docs/native-parity-matrix.md"

VALID_STATUSES = frozenset({"NATIVO", "SOLO_LECTURA", "CASCARON", "AUSENTE", "WEBVIEW"})


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


def build_normalizer(kt: str):
    legacy = kotlin_pairs(kt, "LEGACY_PREFIXES = listOf")
    remap = kotlin_pairs(kt, "MODULE_REMAP = mapOf")
    slugs = kotlin_pairs(kt, "SLUG_ALIASES = mapOf")
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

    return normalize


def parse_matrix_status(cell: str) -> str | None:
    """Primera palabra de estado en la celda Android/iOS."""
    upper = cell.strip().upper()
    for status in VALID_STATUSES:
        if upper.startswith(status):
            return status
    if "✅" in cell and "CASCAR" not in upper and "AUSENT" not in upper:
        return "NATIVO"
    if "❌" in cell or "AUSENT" in upper:
        return "AUSENTE"
    if "⚠" in cell or "CASCAR" in upper:
        return "CASCARON"
    return None


def parse_matrix_rows(source: str) -> dict[str, str]:
    """web route → parityStatus declarado en columna Android."""
    rows: dict[str, str] = {}
    for line in source.splitlines():
        if not line.startswith("|") or line.startswith("|---"):
            continue
        parts = [p.strip() for p in line.strip("|").split("|")]
        if len(parts) < 3:
            continue
        route = parts[1].strip("` ")
        if not route.startswith("/"):
            continue
        status = parse_matrix_status(parts[2])
        if status:
            rows[route] = status
    return rows


def parse_catalog_entries(source: str) -> dict[str, tuple[str, str, str]]:
    """webPath → (portal, key, parityStatus)."""
    portal: str | None = None
    entries: dict[str, tuple[str, str, str]] = {}
    mod_re = re.compile(
        r'mod\("([^"]+)",\s*"[^"]+",\s*"[^"]*",\s*"([^"]+)",\s*ParityStatus\.(\w+)\)'
    )
    legacy_re = re.compile(
        r'ModuleEntry\("([^"]+)",\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)"'
    )
    for line in source.splitlines():
        header = re.search(r"val (\w+): List<ModuleEntry>", line)
        if header:
            portal = header.group(1)
        m = mod_re.search(line)
        if m and portal:
            key, path, status = m.groups()
            entries[path] = (portal, key, status)
            continue
        m = legacy_re.search(line)
        if m and portal:
            key, path = m.groups()
            entries[path] = (portal, key, "AUSENTE")
    return entries


def compare_parity(
    catalog: dict[str, tuple[str, str, str]],
    matrix: dict[str, str],
    normalize,
) -> tuple[list[str], list[str], list[str]]:
    """Devuelve (matrix_overclaims, catalog_overclaims, catalog_missing_matrix)."""
    matrix_over: list[str] = []
    catalog_over: list[str] = []
    missing: list[str] = []

    norm_matrix: dict[str, str] = {}
    for route, status in matrix.items():
        norm_matrix[normalize(route)] = status
        norm_matrix[route.rstrip("/") or route] = status

    for path, (portal, key, cat_status) in catalog.items():
        norm = normalize(path)
        mat_status = matrix.get(path) or norm_matrix.get(norm) or norm_matrix.get(path.rstrip("/"))

        if mat_status is None:
            missing.append(f"  {portal:14s} {key:22s} {path:36s} catalog={cat_status}")
            continue

        if mat_status != cat_status:
            if mat_status == "NATIVO" and cat_status != "NATIVO":
                matrix_over.append(
                    f"  matriz NATIVO ≠ catálogo {cat_status:14s}  {portal}/{key}  {path}"
                )
            elif cat_status == "NATIVO" and mat_status != "NATIVO":
                catalog_over.append(
                    f"  catálogo NATIVO ≠ matriz {mat_status:14s}  {portal}/{key}  {path}"
                )
            else:
                matrix_over.append(
                    f"  matriz {mat_status:14s} ≠ catálogo {cat_status:14s}  {portal}/{key}  {path}"
                )

    return matrix_over, catalog_over, missing


def main() -> int:
    routes = web_routes()
    kt_url = WEB_PANEL_URL.read_text(encoding="utf-8")
    normalize = build_normalizer(kt_url)
    no_web = kotlin_set(kt_url, "NO_WEB_EQUIVALENT = setOf")

    catalog_src = CATALOG.read_text(encoding="utf-8")
    catalog_entries = parse_catalog_entries(catalog_src)
    matrix_rows = parse_matrix_rows(MATRIX.read_text(encoding="utf-8"))

    portal: str | None = None
    broken: list[str] = []
    linked = skipped = 0

    for line in catalog_src.splitlines():
        header = re.search(r"val (\w+): List<ModuleEntry>", line)
        if header:
            portal = header.group(1)
        entry = re.search(
            r'mod\("([^"]+)",\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)"',
            line,
        )
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
    matrix_over, catalog_over, missing_matrix = compare_parity(
        catalog_entries, matrix_rows, normalize
    )

    nativo_count = sum(1 for _, _, s in catalog_entries.values() if s == "NATIVO")
    total = len(catalog_entries)

    print(f"rutas web encontradas: {len(routes)}")
    print(f"módulos catálogo: {total} ({nativo_count} NATIVO)")
    print(f"módulos que enlazan a una ruta real: {linked}")
    print(f"módulos declarados sin equivalente web: {skipped}")
    print(f"filas matriz con ruta: {len(matrix_rows)}")

    if broken:
        print("\nMódulos cuyo 'Abrir en la web' daría 404:")
        print("\n".join(broken))
    if stale:
        print("\nDeclarados sin equivalente, pero la web ya los tiene "
              "(quitar de NO_WEB_EQUIVALENT):")
        print("\n".join(f"  {p}" for p in stale))
    if matrix_over:
        print("\nMatriz vs catálogo (estado distinto — matriz demasiado optimista o desincronizada):")
        print("\n".join(matrix_over))
    if catalog_over:
        print("\nCatálogo NATIVO sin respaldo en matriz:")
        print("\n".join(catalog_over))
    if missing_matrix:
        print("\nEntradas de catálogo sin fila en native-parity-matrix.md:")
        print("\n".join(missing_matrix))

    failed = bool(broken or stale or matrix_over or catalog_over or missing_matrix)
    if failed:
        return 1
    print("\nOK — web paths, matriz y catálogo alineados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

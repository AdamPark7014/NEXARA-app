# -*- coding: utf-8 -*-
from pathlib import Path

src = Path(r"C:\dev\apps\NEXARA-app\.ai\drafts\module-guides.ts").read_text(encoding="utf-8")
src = src.replace(
    "import type { ModuleId } from '@/lib/access-matrix';",
    "import { MODULES, getModuleUrl, type ModuleId } from '@/lib/access-matrix';",
    1,
)
idx = src.find("export function getModuleGuide")
if idx < 0:
    raise SystemExit("marker not found")
head = src[:idx]
tail = """export function getModuleGuide(id: ModuleId): ModuleGuide | null {
  return MODULE_GUIDES[id] ?? null;
}

/** Resuelve el módulo más específico cuya URL es prefijo del pathname. */
export function resolveModuleIdFromPath(pathname: string): ModuleId | null {
  const clean = (pathname || '/').split('?')[0].split('#')[0].replace(/\\/$/, '') || '/';
  let best: { id: ModuleId; len: number } | null = null;
  for (const m of Object.values(MODULES)) {
    const url = getModuleUrl(m.id);
    if (clean === url || clean.startsWith(url + '/')) {
      if (!best || url.length > best.len) best = { id: m.id, len: url.length };
    }
  }
  return best?.id ?? null;
}
"""
out = head + tail
dest = Path(r"C:\dev\apps\NEXARA-app\apps\web\lib\module-guides.ts")
dest.write_text(out, encoding="utf-8")
print("ok", dest, "bytes", dest.stat().st_size)

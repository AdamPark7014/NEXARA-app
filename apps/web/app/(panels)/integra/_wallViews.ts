"use client";

/**
 * Vistas guardadas del muro.
 *
 * Hasta ahora solo sobrevivía al recargar el TAMAÑO de la rejilla
 * (`nexara_integra_video_layout`); qué cámara ocupaba cada celda vivía en
 * `useState` y se perdía. Un operador que había compuesto su 3×3 de accesos
 * tenía que rehacerlo cada mañana.
 *
 * Aquí se guarda la disposición completa —rejilla + id de cámara por celda— con
 * nombre, en `localStorage`. Sin backend: es preferencia de puesto, no de
 * cuenta, y así funciona también sin red hacia la API.
 */

export type WallLayoutN = 1 | 4 | 9 | 16;

export type WallView = {
  id: string;
  name: string;
  layout: WallLayoutN;
  /** Una entrada por celda, en orden. `null` = celda deliberadamente vacía. */
  cells: Array<string | null>;
  savedAt: string;
};

const VIEWS_KEY = "nexara_integra_video_views";
const DEFAULT_KEY = "nexara_integra_video_view_default";
const MAX_VIEWS = 40;

function isLayoutN(n: unknown): n is WallLayoutN {
  return n === 1 || n === 4 || n === 9 || n === 16;
}

/** Nada de `any`: se valida campo a campo y lo que no cuadra se descarta. */
function parseView(raw: unknown): WallView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const name = typeof o.name === "string" ? o.name.trim() : null;
  if (!id || !name) return null;
  if (!isLayoutN(o.layout)) return null;
  if (!Array.isArray(o.cells)) return null;
  const cells = o.cells.map((c) => (typeof c === "string" && c ? c : null));
  return {
    id,
    name,
    layout: o.layout,
    cells: cells.slice(0, o.layout),
    savedAt: typeof o.savedAt === "string" ? o.savedAt : new Date(0).toISOString(),
  };
}

export function readWallViews(): WallView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(VIEWS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const out: WallView[] = [];
    for (const item of parsed) {
      const v = parseView(item);
      if (v) out.push(v);
    }
    return out;
  } catch {
    // Un JSON corrupto no puede dejar la página en blanco.
    return [];
  }
}

export function writeWallViews(views: WallView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views.slice(0, MAX_VIEWS)));
  } catch {
    // Cuota llena o modo privado: la vista se pierde, la sesión no.
  }
}

export function readDefaultViewId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEFAULT_KEY);
  } catch {
    return null;
  }
}

export function writeDefaultViewId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(DEFAULT_KEY, id);
    else window.localStorage.removeItem(DEFAULT_KEY);
  } catch {
    /* sin persistencia, pero sin romper */
  }
}

export function newViewId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** ¿La disposición en pantalla es la misma que la vista guardada? */
export function sameLayoutAsView(
  view: WallView,
  layout: WallLayoutN,
  cells: Array<string | null>,
): boolean {
  if (view.layout !== layout) return false;
  for (let i = 0; i < layout; i += 1) {
    if ((view.cells[i] ?? null) !== (cells[i] ?? null)) return false;
  }
  return true;
}

import type { PanelId } from "@/lib/access-matrix";

/**
 * Orden de presentación del menú de Core (`/erp`). Solo acomoda lo que
 * `buildUserSidebar` ya decidió mostrar: no agrega ni quita módulos.
 * Los grupos que no estén aquí conservan su orden y caen antes de «Mi cuenta».
 */
export const CORE_GROUP_ORDER: readonly string[] = [
  "Hoy",
  "Clientes y obra",
  "Recursos",
  "Finanzas",
  "Personas",
  "Gobierno",
  "Auditoría",
  "Mi cuenta",
];

/** Dentro de «Hoy»: primero el trabajo del día, luego la conversación y las decisiones. */
export const CORE_ITEM_ORDER: readonly string[] = [
  "executive",
  "dashboard",
  "mis-actividades",
  "pizarra",
  "asistencias",
  "kpis-equipo",
  "chat",
  "reuniones",
  "approvals",
  "bi",
];

/** Grupos que arrancan plegados (id = slug del título, como lo genera `buildUserSidebar`). */
export const DEFAULT_FOLDED_GROUP_IDS: readonly string[] = ["mi-cuenta"];

export const FOLDED_GROUPS_STORAGE_KEY = "nx-shell-folded-groups";

/** El chat es el mismo en todos los paneles: el mismo contador de no leídos. */
export const CHAT_MODULE_IDS: ReadonlySet<string> = new Set([
  "chat",
  "crm-chat",
  "ops-chat",
  "studio-chat",
  "lab-chat",
]);

function rank(order: readonly string[], key: string): number {
  const i = order.indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

export function presentSidebarGroups<I extends { id: string }, G extends { title: string; items: I[] }>(
  groups: G[],
  panel: PanelId,
): G[] {
  if (panel !== "erp") return groups;
  const lastIdx = CORE_GROUP_ORDER.length - 1;
  const groupRank = (g: G) => {
    const r = rank(CORE_GROUP_ORDER, g.title);
    // Desconocidos: después de lo listado, pero «Mi cuenta» siempre al final.
    return r === Number.MAX_SAFE_INTEGER ? lastIdx - 0.5 : r;
  };
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => groupRank(a.g) - groupRank(b.g) || a.i - b.i)
    .map(({ g }) => ({
      ...g,
      items: g.items
        .map((it, i) => ({ it, i }))
        .sort((a, b) => rank(CORE_ITEM_ORDER, a.it.id) - rank(CORE_ITEM_ORDER, b.it.id) || a.i - b.i)
        .map(({ it }) => it),
    }));
}

export function readFoldedGroups(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FOLDED_GROUPS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    /* sin almacenamiento: valen los de fábrica */
  }
  return new Set(DEFAULT_FOLDED_GROUP_IDS);
}

export function writeFoldedGroups(ids: Set<string>): void {
  try {
    window.localStorage.setItem(FOLDED_GROUPS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

/** Texto del contador: nada en cero, «99+» arriba de 99. */
export function formatNavCount(n: number | null | undefined): string | null {
  if (!n || n <= 0 || !Number.isFinite(n)) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}

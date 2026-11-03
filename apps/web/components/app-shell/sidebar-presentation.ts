import type { PanelId } from "@/lib/access-matrix";

/**
 * Orden de presentación del menú de Core (`/erp`), por lo que hace la empresa (Mapa de Core, Bloque B).
 * Solo acomoda lo que `buildUserSidebar` ya decidió mostrar: no da acceso a nadie.
 * Los grupos que no estén aquí conservan su orden y caen antes de «Empresa».
 */
export const CORE_GROUP_ORDER: readonly string[] = [
  "Hoy",
  "Vender",
  "Hacer",
  "Cobrar y pagar",
  "Saber",
  "Personas",
  "Gobierno",
  "Auditoría",
  "Empresa",
];

/** A qué grupo va cada módulo. El `group` de `MODULES` se queda como estaba para los demás paneles. */
const GRUPO_CORE: Readonly<Record<string, string>> = {
  "erp-clients": "Vender",
  "erp-cotizaciones": "Vender",
  "erp-videovigilancia": "Vender",
  "erp-proyectos": "Hacer",
  procurement: "Hacer",
  "erp-almacen": "Hacer",
  warehouse: "Hacer",
  "erp-herramientas": "Hacer",
  "erp-vehiculos": "Hacer",
  "erp-contabilidad": "Cobrar y pagar",
  accounting: "Cobrar y pagar",
  invoicing: "Cobrar y pagar",
  banking: "Cobrar y pagar",
  "viatics-admin": "Cobrar y pagar",
  "expenses-admin": "Cobrar y pagar",
  "employee-payments": "Cobrar y pagar",
  exports: "Cobrar y pagar",
  "erp-costos": "Saber",
  "kpis-equipo": "Saber",
  "erp-organigrama": "Empresa",
  calendar: "Empresa",
  "my-profile": "Empresa",
};

/** El grupo de un módulo en Core; el de `MODULES` si este menú no lo acomoda. */
export function grupoCore(id: string, grupoOriginal: string): string {
  return GRUPO_CORE[id] ?? grupoOriginal;
}

/** En campo trabajan con actividades, evidencia, asistencia y chat: lo demás queda plegado, no se quita. */
const ROLES_DE_CAMPO: ReadonlySet<string> = new Set(["ing_campo", "ing_soporte"]);

/** Con Mesa contable, Facturación y Bancos se abren desde ahí; quien no la tiene los sigue viendo. */
const DENTRO_DE_MESA: ReadonlySet<string> = new Set(["invoicing", "banking"]);

/** Dentro de cada grupo: primero el trabajo del día, luego la conversación y las decisiones. */
export const CORE_ITEM_ORDER: readonly string[] = [
  "executive",
  "dashboard",
  "mis-actividades",
  "pizarra",
  "asistencias",
  "chat",
  "reuniones",
  "approvals",
  "bi",
  "erp-clients",
  "erp-cotizaciones",
  "erp-videovigilancia",
  "erp-proyectos",
  "procurement",
  "erp-almacen",
  "warehouse",
  "erp-herramientas",
  "erp-vehiculos",
  "erp-contabilidad",
  "accounting",
  "invoicing",
  "banking",
  "viatics-admin",
  "expenses-admin",
  "employee-payments",
  "exports",
  "erp-costos",
  "kpis-equipo",
  "erp-organigrama",
  "calendar",
  "my-profile",
];

/** Grupos que arrancan plegados (id = slug del título, como lo genera `buildUserSidebar`). */
export const DEFAULT_FOLDED_GROUP_IDS: readonly string[] = ["empresa"];

// v2: los grupos cambiaron de nombre; lo guardado con los viejos ya no significa nada.
export const FOLDED_GROUPS_STORAGE_KEY = "nx-shell-folded-groups-v2";

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

function idDeGrupo(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function presentSidebarGroups<I extends { id: string }, G extends { title: string; items: I[] }>(
  groups: G[],
  panel: PanelId,
  rol?: string | null,
): G[] {
  if (panel !== "erp") return groups;
  const conMesa = groups.some((g) => g.items.some((it) => it.id === "erp-contabilidad"));
  const deCampo = Boolean(rol && ROLES_DE_CAMPO.has(rol));
  const porTitulo = new Map<string, I[]>();
  for (const g of groups) {
    for (const it of g.items) {
      if (conMesa && DENTRO_DE_MESA.has(it.id)) continue;
      const titulo = deCampo && it.id === "reuniones" ? "Empresa" : grupoCore(it.id, g.title);
      porTitulo.set(titulo, [...(porTitulo.get(titulo) ?? []), it]);
    }
  }
  const acomodados = [...porTitulo.entries()].map(
    ([title, items]) => ({ id: idDeGrupo(title), title, items }) as unknown as G,
  );
  const lastIdx = CORE_GROUP_ORDER.length - 1;
  const groupRank = (g: G) => {
    const r = rank(CORE_GROUP_ORDER, g.title);
    // Desconocidos: después de lo listado, pero «Empresa» siempre al final.
    return r === Number.MAX_SAFE_INTEGER ? lastIdx - 0.5 : r;
  };
  return acomodados
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

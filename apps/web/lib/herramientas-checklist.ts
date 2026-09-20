/**
 * Checklist de herramientas de la OT (web).
 *
 * Espejo de `apps/api/src/activities/tools/herramientas-checklist.helpers.ts`: los
 * mismos límites, los mismos presets y la misma regla de «qué falta», para que la
 * pantalla diga lo mismo que va a decir la API cuando el técnico intente iniciar.
 */
import { buildApiUrl } from "@/lib/api-base";

export const MAX_REQUISITOS = 40;
export const MAX_LARGO_DESCRIPCION = 300;

/** Atajos de la cuadrilla: lo que casi siempre se lleva a una instalación. */
export const PRESETS_HERRAMIENTAS: ReadonlyArray<{ descripcion: string; cantidad: number }> = [
  { descripcion: "Escalera", cantidad: 1 },
  { descripcion: "Taladro con brocas", cantidad: 1 },
  { descripcion: "Ponchadora RJ45", cantidad: 1 },
  { descripcion: "Probador de red", cantidad: 1 },
  { descripcion: "Multímetro", cantidad: 1 },
  { descripcion: "Juego de desarmadores", cantidad: 1 },
  { descripcion: "Pinzas de electricista", cantidad: 1 },
  { descripcion: "Arnés de seguridad", cantidad: 1 },
  { descripcion: "Extensión eléctrica", cantidad: 1 },
  { descripcion: "Laptop de configuración", cantidad: 1 },
];

export type ChequeoRequisito = {
  ok: boolean;
  nota: string | null;
  fotoUrl: string | null;
  at: string;
  por: { id: number; nombre: string } | null;
};

export type RequisitoHerramienta = {
  id: number;
  descripcion: string;
  cantidad: number;
  productId: number | null;
  producto: { id: number; sku: string; nombre: string } | null;
  toolId: number | null;
  herramienta: { id: number; nombre: string; serie: string } | null;
  check: ChequeoRequisito | null;
};

export type ChecklistHerramientas = {
  activityId: number;
  requisitos: RequisitoHerramienta[];
  total: number;
  listos: number;
  pendientes: string[];
  completo: boolean;
};

/** Una fila del editor: lo que se escribe antes de mandarlo a la API. */
export type RequisitoBorrador = {
  /** Llave local para React (no viaja a la API). */
  key: string;
  id?: number | null;
  descripcion: string;
  cantidad: number;
};

let secuencia = 0;
function nuevaLlave(): string {
  secuencia += 1;
  return `req-${Date.now().toString(36)}-${secuencia}`;
}

export function requisitoVacio(descripcion = "", cantidad = 1): RequisitoBorrador {
  return { key: nuevaLlave(), id: null, descripcion, cantidad };
}

/** Quita acentos y espacios de más para detectar duplicados. */
export function claveRequisito(descripcion: string): string {
  return descripcion
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function borradoresDesdeChecklist(
  requisitos: readonly RequisitoHerramienta[],
): RequisitoBorrador[] {
  return requisitos.map((r) => ({
    key: `req-${r.id}`,
    id: r.id,
    descripcion: r.descripcion,
    cantidad: r.cantidad,
  }));
}

export type ErroresRequisitos = {
  porFila: Record<string, string>;
  general: string | null;
};

export function validarRequisitos(filas: readonly RequisitoBorrador[]): ErroresRequisitos {
  const porFila: Record<string, string> = {};
  const vistos = new Set<string>();

  for (const fila of filas) {
    const descripcion = fila.descripcion.trim();
    if (!descripcion) {
      porFila[fila.key] = "Escribe qué herramienta o quita esta fila.";
      continue;
    }
    if (descripcion.length > MAX_LARGO_DESCRIPCION) {
      porFila[fila.key] = `Máximo ${MAX_LARGO_DESCRIPCION} caracteres.`;
      continue;
    }
    const clave = claveRequisito(descripcion);
    if (vistos.has(clave)) {
      porFila[fila.key] = "Esa herramienta ya está en la lista.";
      continue;
    }
    vistos.add(clave);
    if (!Number.isFinite(fila.cantidad) || fila.cantidad <= 0) {
      porFila[fila.key] = "La cantidad debe ser mayor a cero.";
    }
  }

  return {
    porFila,
    general:
      filas.length > MAX_REQUISITOS ? `Máximo ${MAX_REQUISITOS} herramientas por actividad.` : null,
  };
}

export function hayErroresRequisitos(errores: ErroresRequisitos): boolean {
  return Boolean(errores.general) || Object.keys(errores.porFila).length > 0;
}

/**
 * Avance del checklist a partir de lo que devolvió la API. Un renglón cuenta como listo
 * solo con un palomeo en `ok`: marcarlo «falta o está dañado» es lo que no deja iniciar.
 */
export function avanceChecklist(requisitos: readonly RequisitoHerramienta[]) {
  const pendientes = requisitos.filter((r) => !r.check?.ok).map((r) => r.descripcion);
  return {
    total: requisitos.length,
    listos: requisitos.length - pendientes.length,
    pendientes,
    completo: pendientes.length === 0,
  };
}

/** Un nombre que no choque con los que ya están: «Escalera», «Escalera 2»… */
export function descripcionLibre(base: string, existentes: readonly string[]): string {
  const usados = new Set(existentes.map(claveRequisito));
  if (!usados.has(claveRequisito(base))) return base;
  let n = 2;
  while (usados.has(claveRequisito(`${base} ${n}`))) n += 1;
  return `${base} ${n}`;
}

// ── API ─────────────────────────────────────────────────────────────

async function pedir<T>(path: string, token: string, init: RequestInit = {}, fallback: string) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    try {
      const json = JSON.parse(texto);
      const msg = Array.isArray(json?.message) ? json.message.join(", ") : json?.message;
      throw new Error(msg || fallback);
    } catch (err) {
      if (err instanceof Error && err.message !== fallback && texto) throw err;
      throw new Error(texto.slice(0, 240) || fallback);
    }
  }
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

export function cargarChecklist(token: string, activityId: number) {
  return pedir<ChecklistHerramientas>(
    `activities/${activityId}/herramientas`,
    token,
    {},
    "No se pudo cargar el checklist de herramientas",
  );
}

export function definirRequisitos(
  token: string,
  activityId: number,
  requisitos: Array<{ id?: number | null; descripcion: string; cantidad: number }>,
) {
  return pedir<ChecklistHerramientas>(
    `activities/${activityId}/herramientas`,
    token,
    { method: "PUT", body: JSON.stringify({ requisitos }) },
    "No se pudo guardar el checklist de herramientas",
  );
}

export function palomearRequisito(
  token: string,
  activityId: number,
  requirementId: number,
  payload: { ok: boolean; nota?: string; fotoUrl?: string },
) {
  return pedir<ChecklistHerramientas>(
    `activities/${activityId}/herramientas/${requirementId}/check`,
    token,
    { method: "POST", body: JSON.stringify(payload) },
    "No se pudo guardar el palomeo",
  );
}

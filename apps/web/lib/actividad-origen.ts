/**
 * De dónde se llegó al detalle de una actividad, para que «‹ regresar» vuelva ahí y no a la
 * lista general de Actividades. Viaja en la URL (`?origen=…`): así sobrevive a recargar y a
 * moverse entre Detalle, Evidencias e Historial de la misma actividad.
 *
 * Sin origen (pizarra, Mis actividades, enlaces viejos) se regresa a la pizarra, que abre
 * la última pestaña que se usó.
 */
export type OrigenActividad =
  /** Actividades › En espera de revisión. */
  | { tipo: "revision" }
  /** Actividades › En espera de revisión › Revisadas por ti. */
  | { tipo: "revisadas" }
  /** Ficha de una persona, pestaña Historial. */
  | { tipo: "historial"; persona: number }
  /** Ficha de una persona, pestaña Ahora. */
  | { tipo: "persona"; persona: number };

export type Regreso = { href: string; label: string };

/** Pestaña de Actividades con lo que espera revisión (`/erp/pizarra?vista=revision`). */
export const VISTA_REVISION = "revision";

const PIZARRA = "/erp/pizarra";

function idValido(v: string | null): number | null {
  if (!v || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Lee `?origen=` (y `&persona=` cuando hace falta). Cualquier otra cosa: sin origen. */
export function leerOrigen(search: string | URLSearchParams | null | undefined): OrigenActividad | null {
  if (!search) return null;
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const tipo = q.get("origen");
  if (tipo === "revision" || tipo === "revisadas") return { tipo };
  if (tipo === "historial" || tipo === "persona") {
    const persona = idValido(q.get("persona"));
    return persona ? { tipo, persona } : null;
  }
  return null;
}

/** Los parámetros que lleva un enlace para no perder el origen. */
export function parametrosDeOrigen(origen: OrigenActividad | null | undefined): Array<[string, string]> {
  if (!origen) return [];
  if (origen.tipo === "historial" || origen.tipo === "persona") {
    return [
      ["origen", origen.tipo],
      ["persona", String(origen.persona)],
    ];
  }
  return [["origen", origen.tipo]];
}

/**
 * El mismo enlace con el origen: `/erp/actividades/5/evidencias#revision` →
 * `/erp/actividades/5/evidencias?origen=revision#revision`. Respeta lo que ya traiga.
 */
export function conOrigen(href: string, origen: OrigenActividad | null | undefined): string {
  const params = parametrosDeOrigen(origen);
  if (!params.length) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const sinHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = sinHash.indexOf("?");
  const ruta = queryAt >= 0 ? sinHash.slice(0, queryAt) : sinHash;
  const q = new URLSearchParams(queryAt >= 0 ? sinHash.slice(queryAt + 1) : "");
  q.delete("persona");
  for (const [k, v] of params) q.set(k, v);
  return `${ruta}?${q.toString()}${hash}`;
}

/**
 * A dónde lleva «‹ regresar» y cómo se llama. `nombre` es el de la persona de la ficha (si
 * la actividad lo trae); sin él, la etiqueta no lo inventa.
 */
export function regresoDeOrigen(origen: OrigenActividad | null | undefined, nombre?: string | null): Regreso {
  const corto = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  switch (origen?.tipo) {
    case "revision":
      return { href: `${PIZARRA}?vista=${VISTA_REVISION}`, label: "En espera de revisión" };
    case "revisadas":
      return { href: `${PIZARRA}?vista=${VISTA_REVISION}&ver=revisadas`, label: "Revisadas" };
    case "historial":
      return {
        href: `${PIZARRA}/${origen.persona}?pestana=historial`,
        label: corto ? `Historial de ${corto}` : "Historial",
      };
    case "persona":
      return { href: `${PIZARRA}/${origen.persona}`, label: corto || "Su ficha" };
    default:
      return { href: PIZARRA, label: "Pizarra" };
  }
}

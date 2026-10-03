/**
 * Folios que se pueden leer dentro de un mensaje del chat.
 *
 *   Actividad    `AN-0031` (prefijo y relleno que fija `activities.service.ts`), o la pastilla
 *                que deja el selector: `[AN-0031 · Título](/erp/actividades/20)`, que ya trae el id.
 *   Cotización   `NEX-LJ75100126-0007` con cadena `-JA.CE` y revisión `-R2` opcionales
 *                (`apps/api/src/cotizaciones/folio-core.ts`), o los viejos `NXR-2026-763366`.
 *
 * Solo detecta: los datos los resuelve la tarjeta con los endpoints que ya existen.
 */

export type FolioTipo = "actividad" | "cotizacion";

export type FolioDetectado = {
  tipo: FolioTipo;
  /** Folio en mayúsculas, tal como lo guarda la API. */
  folio: string;
  /** Id de la actividad cuando el mensaje trae la pastilla con su ruta. */
  id?: number;
};

/** Tope de tarjetas por mensaje: un mensaje con diez folios no debe volverse un tablero. */
export const MAX_TARJETAS = 3;

const PASTILLA_ACTIVIDAD = /\[(AN-\d{3,})[^\]\n]*\]\(\/erp\/actividades\/(\d+)\)/g;
const ACTIVIDAD = /(?<![A-Za-z0-9-])AN-\d{3,}(?![\dA-Za-z])/g;
const COTIZACION =
  /(?<![A-Za-z0-9-])(?:NEX-[A-Z]{2}\d{8}-\d{4,}(?:-[A-Z]{2}(?:\.[A-Z]{2})*)?(?:-R\d+)?|NXR-\d{4}-\d{3,})(?![\dA-Za-z])/g;

/**
 * Folios del mensaje, en orden de aparición y sin repetir. Una pastilla de actividad gana sobre el
 * mismo folio escrito suelto porque trae el id y no hace falta buscarlo.
 */
export function detectarFolios(body: string, max = MAX_TARJETAS): FolioDetectado[] {
  const texto = String(body ?? "");
  const hallados: Array<FolioDetectado & { pos: number }> = [];
  const idPorFolio = new Map<string, number>();

  for (const m of texto.matchAll(PASTILLA_ACTIVIDAD)) {
    const folio = m[1]!.toUpperCase();
    const id = Number(m[2]);
    if (!idPorFolio.has(folio) && Number.isInteger(id) && id > 0) idPorFolio.set(folio, id);
  }
  for (const m of texto.matchAll(ACTIVIDAD)) {
    hallados.push({ tipo: "actividad", folio: m[0].toUpperCase(), pos: m.index ?? 0 });
  }
  for (const m of texto.matchAll(COTIZACION)) {
    hallados.push({ tipo: "cotizacion", folio: m[0].toUpperCase(), pos: m.index ?? 0 });
  }

  hallados.sort((a, b) => a.pos - b.pos);
  const vistos = new Set<string>();
  const out: FolioDetectado[] = [];
  for (const h of hallados) {
    const clave = `${h.tipo}:${h.folio}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const id = h.tipo === "actividad" ? idPorFolio.get(h.folio) : undefined;
    out.push(id ? { tipo: h.tipo, folio: h.folio, id } : { tipo: h.tipo, folio: h.folio });
    if (out.length >= max) break;
  }
  return out;
}

/** Tono del chip de estado según el texto que manda la API (`En Proceso`, `Por Validar`, `Borrador`…). */
export function tonoDeEstado(estado: string | null | undefined): "proc" | "val" | "fin" | "alta" | "neu" {
  const e = String(estado ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!e) return "neu";
  if (/(cancel|rechaz|vencid|perdid)/.test(e)) return "alta";
  if (/(finaliz|complet|cerrad|aprob|firmad|ganad|aceptad)/.test(e)) return "fin";
  if (/(valid|revis|pendiente de|espera)/.test(e)) return "val";
  if (/(proceso|curso|enviad|asignad|progreso)/.test(e)) return "proc";
  return "neu";
}

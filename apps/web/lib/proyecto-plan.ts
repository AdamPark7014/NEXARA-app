/**
 * Matemática del cronograma y del estado del proyecto, sin React ni fechas implícitas.
 *
 * Las fechas del proyecto son días de calendario que viajan como medianoche UTC
 * («2026-09-20T00:00:00.000Z»). Todo aquí trabaja con el número de día (días desde
 * 1970-01-01) leído en UTC, para que una barra no se corra un día por la zona horaria.
 * «Hoy», en cambio, es el día de calendario local de quien mira: entra por parámetro.
 */
import type { EstadoProyecto } from "@/lib/proyectos-api";

const MS_DIA = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Días de calendario
// ---------------------------------------------------------------------------

/** Día de calendario de una fecha ISO («2026-09-20» o «2026-09-20T00:00:00Z»), en UTC. */
export function diaDe(valor?: string | Date | null): number | null {
  if (!valor) return null;
  if (typeof valor === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
    if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DIA;
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_DIA;
}

/** «YYYY-MM-DD» de un día de calendario. */
export function isoDeDia(dia: number): string {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10);
}

/** Hoy, como día de calendario local («YYYY-MM-DD»), que es lo que la persona llama «hoy». */
export function hoyISO(ahora: Date = new Date()): string {
  return isoDeDia(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()) / MS_DIA);
}

/** Valor para un `<input type="date">` a partir de lo que manda la API. */
export function aInputFecha(valor?: string | null): string {
  const dia = diaDe(valor);
  return dia === null ? "" : isoDeDia(dia);
}

export function sumarDias(iso: string, dias: number): string {
  const dia = diaDe(iso);
  return dia === null ? iso : isoDeDia(dia + dias);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde?: string | null, hasta?: string | null): number | null {
  const a = diaDe(desde);
  const b = diaDe(hasta);
  return a === null || b === null ? null : b - a;
}

// ---------------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------------

export type Rango = { desde: number; hasta: number };

/**
 * El tramo de calendario que dibuja el cronograma: de la fecha más temprana a la más
 * tardía, con un margen pequeño para que las marcas de los extremos no queden cortadas.
 */
export function rangoDe(fechas: Array<string | null | undefined>): Rango | null {
  const dias = fechas.map((f) => diaDe(f)).filter((d): d is number => d !== null);
  if (!dias.length) return null;
  let desde = Math.min(...dias);
  let hasta = Math.max(...dias);
  if (desde === hasta) return { desde: desde - 7, hasta: hasta + 7 };
  const margen = Math.max(1, Math.round((hasta - desde) * 0.03));
  desde -= margen;
  hasta += margen;
  return { desde, hasta };
}

/** Posición horizontal (0–100 %) de un día dentro del rango. */
export function porcentajeEnRango(dia: number, rango: Rango): number {
  const ancho = rango.hasta - rango.desde;
  if (ancho <= 0) return 0;
  return Math.min(100, Math.max(0, ((dia - rango.desde) / ancho) * 100));
}

/** Barra de `desde` a `hasta` como `left`/`width` en %, con un ancho mínimo visible. */
export function barraEnRango(desde: number, hasta: number, rango: Rango): { left: number; width: number } {
  const a = porcentajeEnRango(Math.min(desde, hasta), rango);
  const b = porcentajeEnRango(Math.max(desde, hasta), rango);
  const width = Math.max(0.8, b - a);
  return { left: Math.min(a, 100 - width), width };
}

export type TramoDeEtapa = { id: number; desde: number | null; hasta: number | null };

/**
 * Cada etapa ocupa desde que termina la anterior (o desde el inicio del proyecto) hasta
 * su propia fecha planeada. Así el cronograma se lee como una secuencia, que es como se
 * trabaja: primero levantamiento, luego compras, luego instalación. Una etapa sin fecha no
 * tiene barra; una fuera de orden se dibuja como un punto en su fecha.
 */
export function tramosDeEtapas(
  hitos: Array<{ id: number; plannedDate?: string | null }>,
  inicioProyecto?: string | null,
): TramoDeEtapa[] {
  let cursor = diaDe(inicioProyecto);
  return hitos.map((h) => {
    const hasta = diaDe(h.plannedDate);
    if (hasta === null) return { id: h.id, desde: null, hasta: null };
    const desde = cursor !== null && cursor <= hasta ? cursor : hasta;
    cursor = hasta;
    return { id: h.id, desde, hasta };
  });
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Marcas del primer día de cada mes dentro del rango (como mucho `maximo`). */
export function marcasDeMes(
  rango: Rango,
  maximo = 8,
): Array<{ dia: number; etiqueta: string; porcentaje: number }> {
  const inicio = new Date(rango.desde * MS_DIA);
  let anio = inicio.getUTCFullYear();
  let mes = inicio.getUTCMonth();
  // El primer día de mes estrictamente dentro del rango.
  if (Date.UTC(anio, mes, 1) / MS_DIA <= rango.desde) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
  }
  const todas: Array<{ dia: number; anio: number; mes: number }> = [];
  for (let guard = 0; guard < 600; guard++) {
    const dia = Date.UTC(anio, mes, 1) / MS_DIA;
    if (dia >= rango.hasta) break;
    todas.push({ dia, anio, mes });
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
  }
  const paso = Math.max(1, Math.ceil(todas.length / Math.max(1, maximo)));
  return todas
    .filter((_, i) => i % paso === 0)
    .map((m, i) => ({
      dia: m.dia,
      etiqueta: i === 0 || m.mes === 0 ? `${MESES[m.mes]} ${m.anio}` : MESES[m.mes],
      porcentaje: porcentajeEnRango(m.dia, rango),
    }));
}

/**
 * Fechas para `n` etapas repartidas entre el inicio y el fin planeados; la última cae en
 * el fin. Sin fin planeado, una por semana a partir del inicio.
 */
export function repartirFechas(inicio: string, fin: string | null | undefined, n: number): string[] {
  const a = diaDe(inicio);
  if (a === null || n <= 0) return [];
  const b = diaDe(fin);
  if (b !== null && b > a) {
    return Array.from({ length: n }, (_, i) => isoDeDia(a + Math.round(((b - a) * (i + 1)) / n)));
  }
  return Array.from({ length: n }, (_, i) => isoDeDia(a + 7 * (i + 1)));
}

/** ¿La etapa ya debió cumplirse y no se ha marcado? */
export function hitoVencido(
  hito: { plannedDate?: string | null; actualDate?: string | null; status?: string | null },
  hoy: string,
): boolean {
  if (hito.status === "CUMPLIDO" || hito.status === "CANCELADO" || hito.actualDate) return false;
  const d = diasEntre(hito.plannedDate, hoy);
  return d !== null && d > 0;
}

/** «Vence hoy», «Faltan 3 días», «Venció hace 2 días». */
export function textoPlazo(fecha: string | null | undefined, hoy: string): string {
  const d = diasEntre(hoy, fecha);
  if (d === null) return "Sin fecha";
  if (d === 0) return "Vence hoy";
  if (d > 0) return d === 1 ? "Falta 1 día" : `Faltan ${d} días`;
  return d === -1 ? "Venció ayer" : `Venció hace ${-d} días`;
}

// ---------------------------------------------------------------------------
// Estado del proyecto
// ---------------------------------------------------------------------------

/** Copia de `TRANSICIONES` en `apps/api/src/projects/proyecto-estado.ts`: la API vuelve a validar. */
const TRANSICIONES: Record<EstadoProyecto, EstadoProyecto[]> = {
  PLANNED: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "PLANNED", "COMPLETED", "CANCELLED"],
  COMPLETED: ["ACTIVE"],
  CANCELLED: ["PLANNED", "ACTIVE"],
};

export function puedeTransicionar(desde: EstadoProyecto, hacia: EstadoProyecto): boolean {
  if (desde === hacia) return true;
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

export type AccionDeEstado = {
  hacia: EstadoProyecto;
  etiqueta: string;
  /** Lo que hay que preguntar antes de mandar el cambio. */
  pide?: "motivo" | "fechaDeEntrega";
  peligro?: boolean;
};

function etiquetaDeAccion(desde: EstadoProyecto, hacia: EstadoProyecto): string {
  switch (hacia) {
    case "ACTIVE":
      if (desde === "PLANNED") return "Arrancar proyecto";
      if (desde === "ON_HOLD") return "Reanudar";
      if (desde === "COMPLETED") return "Reabrir";
      return "Reactivar en curso";
    case "PLANNED":
      return desde === "CANCELLED" ? "Reactivar como planeado" : "Regresar a planeado";
    case "ON_HOLD":
      return "Poner en pausa";
    case "COMPLETED":
      return "Dar por terminado";
    case "CANCELLED":
      return "Cancelar proyecto";
  }
}

/** Botones de cambio de estado que tiene sentido ofrecer desde el estado actual. */
export function accionesDeEstado(desde: EstadoProyecto): AccionDeEstado[] {
  return (TRANSICIONES[desde] ?? []).map((hacia) => ({
    hacia,
    etiqueta: etiquetaDeAccion(desde, hacia),
    ...(hacia === "CANCELLED" ? { pide: "motivo" as const, peligro: true } : {}),
    ...(hacia === "COMPLETED" ? { pide: "fechaDeEntrega" as const } : {}),
  }));
}

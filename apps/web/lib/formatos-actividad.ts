/**
 * Formatos de actividades (Adam, 01-11-2026): el paquete de una crepería sirve para la siguiente.
 * Se eligen, se ajusta cantidad, cliente y persona, y salen las actividades con sus fotos, tiempos y
 * herramientas. Las reglas y los permisos viven en la API (`formatos-actividad/receta-formato.ts`).
 */
import { erpFetch } from "@/lib/erp-api";

export type TipoRenglon = "tarea" | "servicio" | "comercial";
export type PuntoFormato = { nombre: string; momentos: string[] };
export type HerramientaFormato = { descripcion: string; cantidad: number };

export type RenglonFormato = {
  titulo: string;
  coreKind: TipoRenglon;
  tipo: string | null;
  minutosBase: number;
  minutosPorUnidad: number;
  fotos: number;
  indicaciones: string | null;
  puntos: PuntoFormato[];
  herramientas: HerramientaFormato[];
};

export type RecetaFormato = { unidad: string | null; cantidadPorOmision: number; renglones: RenglonFormato[] };

export type FormatoActividad = {
  id: number;
  nombre: string;
  descripcion: string | null;
  receta: RecetaFormato;
  version: number;
  usos: number;
  ultimoUsoAt: string | null;
};

export type BorradorFormato = { nombre: string; descripcion?: string | null; receta: RecetaFormato };

/** Un renglón en pantalla: lo que se edita al asignar no cambia el formato. */
export type RenglonAplicar = RenglonFormato & { clave: string; minutos: number; minutosEditado: boolean };

export type AplicarFormato = {
  clave: string;
  responsableId: number;
  equipoIds: number[];
  fecha: string;
  hora?: string | null;
  clientId?: number | null;
  projectId?: number | null;
  sucursal?: string | null;
  renglones: Array<RenglonFormato & { minutos: number }>;
};

export type ResultadoAplicar = {
  actividades: Array<{ id: number; anNumber: string | null; titulo: string }>;
  fallidas: Array<{ titulo: string; motivo: string }>;
};

/**
 * Se publica hasta tener 3 días laborales del cronómetro de asignar (3, 4 y 5 de noviembre), para poder
 * comparar: viernes 06-11 a las 6:00 de México. La ruta directa funciona desde antes.
 */
export const FORMATOS_VISIBLES_DESDE = Date.parse("2026-11-06T12:00:00Z");
export const formatosVisibles = (ahora: number = Date.now()) => ahora >= FORMATOS_VISIBLES_DESDE;

const ROLES_CON_FORMATOS = new Set([
  "ceo",
  "dir_admin",
  "dir_operaciones",
  "arquitecto",
  "coord_operaciones",
  "coord_admin",
  "enc_soporte",
]);

/** Solo decide si se enseña el acceso; quien manda es la API (`puedeGestionarActividades`). */
export function puedeVerFormatos(
  roleKey: string | null | undefined,
  usuario?: { isSuperAdmin?: boolean | null; permissions?: string[] | null } | null,
): boolean {
  if (usuario?.isSuperAdmin || usuario?.permissions?.includes("activities.manage")) return true;
  return ROLES_CON_FORMATOS.has(roleKey ?? "");
}

export const listarFormatos = (token: string) => erpFetch<FormatoActividad[]>("formatos-actividad", token);

export const crearFormato = (token: string, datos: BorradorFormato) =>
  erpFetch<FormatoActividad>("formatos-actividad", token, { method: "POST", body: JSON.stringify(datos) });

export const editarFormato = (token: string, id: number, datos: BorradorFormato) =>
  erpFetch<FormatoActividad>(`formatos-actividad/${id}`, token, { method: "PUT", body: JSON.stringify(datos) });

export const archivarFormato = (token: string, id: number) =>
  erpFetch<{ archivado: boolean }>(`formatos-actividad/${id}/archivar`, token, { method: "POST" });

export const borradorDesdeActividad = (token: string, activityId: number) =>
  erpFetch<BorradorFormato>(`formatos-actividad/borrador-desde/${activityId}`, token);

export const aplicarFormato = (token: string, id: number, datos: AplicarFormato) =>
  erpFetch<ResultadoAplicar>(`formatos-actividad/${id}/aplicar`, token, { method: "POST", body: JSON.stringify(datos) });

export function minutosDeRenglon(r: Pick<RenglonFormato, "minutosBase" | "minutosPorUnidad">, cantidad: number): number {
  return Math.max(5, r.minutosBase + r.minutosPorUnidad * Math.max(0, cantidad));
}

let consecutivo = 0;
const claveNueva = () => `r${(consecutivo += 1)}`;

export function renglonesParaAplicar(receta: RecetaFormato, cantidad: number): RenglonAplicar[] {
  return receta.renglones.map((r) => ({
    ...r,
    clave: claveNueva(),
    minutos: minutosDeRenglon(r, cantidad),
    minutosEditado: false,
  }));
}

/** Cambiar la cantidad recalcula el tiempo, salvo el que la persona ya escribió a mano. */
export function ajustarCantidad(renglones: RenglonAplicar[], cantidad: number): RenglonAplicar[] {
  return renglones.map((r) => (r.minutosEditado ? r : { ...r, minutos: minutosDeRenglon(r, cantidad) }));
}

export function renglonVacio(): RenglonFormato {
  return {
    titulo: "",
    coreKind: "tarea",
    tipo: null,
    minutosBase: 60,
    minutosPorUnidad: 0,
    fotos: 4,
    indicaciones: null,
    puntos: [],
    herramientas: [],
  };
}

export function renglonParaAplicar(cantidad: number): RenglonAplicar {
  const r = renglonVacio();
  return { ...r, clave: claveNueva(), minutos: minutosDeRenglon(r, cantidad), minutosEditado: false };
}

/** Qué se fotografía, en una línea: «Rack, Canalización» o «4 fotos». */
export function resumenEvidencia(r: Pick<RenglonFormato, "puntos" | "fotos">): string {
  const nombres = r.puntos.map((p) => p.nombre).filter(Boolean);
  return nombres.length ? nombres.join(", ") : `${r.fotos} fotos`;
}

/** Una jornada de 10 a 18 con una hora de comida. */
export const MINUTOS_POR_JORNADA = 420;

export function jornadasDe(totalMin: number): number {
  return Math.max(1, Math.ceil(totalMin / MINUTOS_POR_JORNADA));
}

const ZONA = "America/Mexico_City";
const diaIso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ZONA });

export const hoyMx = (ahora: Date = new Date()) => diaIso(ahora);

/** Mañana, o el lunes si mañana cae en fin de semana. */
export function siguienteDiaLaboral(ahora: Date = new Date()): string {
  const d = new Date(`${diaIso(ahora)}T12:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

/** Lo que falta para poder asignar, en palabras. Sin faltantes, `null`. */
export function faltanteParaAsignar(datos: {
  responsableId: string;
  fecha: string;
  clienteId: number | null;
  proyectoId: number | null;
  renglones: Array<Pick<RenglonFormato, "titulo" | "coreKind">>;
}): string | null {
  if (!datos.renglones.length) return "Deja al menos una actividad";
  if (datos.renglones.some((r) => !r.titulo.trim())) return "A una actividad le falta el título";
  if (datos.renglones.some((r) => r.coreKind === "servicio") && !datos.clienteId && !datos.proyectoId) {
    return "Elige el cliente: lleva actividades de servicio";
  }
  if (!datos.responsableId) return "Elige quién la lleva";
  if (!datos.fecha) return "Elige el día";
  return null;
}

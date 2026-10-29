/**
 * «En espera de revisión» (Actividades): la evidencia enviada que quien mira puede aprobar o
 * devolver, y lo que ya revisó en los últimos 30 días. La regla de quién revisa a quién es la
 * misma de la vista de evidencias (`GET me/activities/:id/evidencias`), en la API.
 */
import { erpFetch } from "@/lib/erp-api";
import type { Tone } from "@/components/base";

export type PersonaRevision = { id: number; nombre: string; avatarUrl: string | null; puesto: string | null };

export type RevisionPendiente = {
  activityId: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
  ticketTypeCustom: string | null;
  assignmentCharge: string | null;
  prioridad: string | null;
  /** Dueño de la evidencia. */
  persona: PersonaRevision;
  /** Desde cuándo espera: la corrección reenviada o, si no la hubo, el envío. */
  enviadaAt: string | null;
  /** Es una corrección de algo que se le devolvió. */
  correccion: boolean;
};

export type RevisionHecha = {
  id: number;
  activityId: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
  ticketTypeCustom: string | null;
  persona: PersonaRevision;
  /** APROBADA | DEVUELTA_PASOS | DEVUELTA_TODO */
  decision: string;
  calificacion: number | null;
  observaciones: string;
  at: string;
};

export type RevisionesResponse = {
  pendientes: RevisionPendiente[];
  revisadas: RevisionHecha[];
};

/** La API trae a lo más las 100 revisiones más recientes de 30 días (`take: 100`). */
export const TOPE_REVISADAS = 100;

/** Pie de «Revisadas por ti»: con el tope lleno no se sabe el total, y no se inventa. */
export function pieRevisadas(total: number): string {
  if (total >= TOPE_REVISADAS) return `Las ${TOPE_REVISADAS} más recientes de los últimos 30 días`;
  return `${total} revisi${total === 1 ? "ón" : "ones"} en los últimos 30 días`;
}

export function fetchRevisiones(token: string): Promise<RevisionesResponse> {
  return erpFetch<RevisionesResponse>("me/revisiones", token);
}

/** Cuánto lleva esperando, en minutos (null sin fecha o con fecha inválida). */
export function minutosEsperando(iso: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / 60_000));
}

/** «hace 25 min», «hace 3 h», «hace 2 días»: lo justo para saber qué atender primero. */
export function textoEspera(minutos: number | null): string {
  if (minutos == null) return "Sin fecha de envío";
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** Más de un día esperando es tarde; más de 4 h, ya hay que verla. */
export function tonoEspera(minutos: number | null): Tone {
  if (minutos == null) return "neutral";
  if (minutos >= 24 * 60) return "danger";
  if (minutos >= 4 * 60) return "warning";
  return "success";
}

export const DECISION_UI: Record<string, { label: string; tone: Tone }> = {
  APROBADA: { label: "Aprobada", tone: "success" },
  DEVUELTA_PASOS: { label: "Devuelta (pasos)", tone: "warning" },
  DEVUELTA_TODO: { label: "Devuelta completa", tone: "warning" },
};

export function decisionUi(decision: string): { label: string; tone: Tone } {
  return DECISION_UI[decision] ?? { label: decision, tone: "neutral" };
}

/** «José Ramírez» encuentra «jose», «ramirez» o «AN-0012» sin pelear con acentos. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function coincideBusqueda(
  item: { anNumber: string; titulo: string; persona: { nombre: string } },
  busqueda: string,
): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  return normalizar(`${item.anNumber} ${item.titulo} ${item.persona.nombre}`).includes(q);
}

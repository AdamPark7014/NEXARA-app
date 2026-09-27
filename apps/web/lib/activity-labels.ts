/**
 * Etiquetas y formatos de Actividades en español de campo: prioridad, estatus,
 * tipo, encargo, fechas, duraciones y nombres. Una sola fuente para Mis
 * actividades, la pizarra, la ficha de la persona y asignar.
 */
import { ACTIVITY_KINDS, type ActivityIconKey, type ActivityKind } from "@/lib/activity-kinds";
import { normalizarPrioridad } from "@/lib/actividad-tiempos";

export type LabelUi = { label: string; color?: string };

export const PRIORITY_UI: Record<string, { color: string; label: string }> = {
  ALTA: { color: "#dc2626", label: "Urgente" },
  MEDIA: { color: "#d97706", label: "Esta semana" },
  BAJA: { color: "#16a34a", label: "Puede esperar" },
};

export function priorityUi(p?: string | null) {
  return PRIORITY_UI[normalizarPrioridad(p)] ?? PRIORITY_UI.MEDIA;
}

/** Estatus del backend → etiqueta clara para campo. */
export const ESTATUS_UI: Array<[RegExp, LabelUi]> = [
  [/proceso/i, { label: "En curso", color: "#2563eb" }],
  [/validar/i, { label: "En revisión", color: "#7c3aed" }],
  [/rechazada/i, { label: "Te la regresaron", color: "#dc2626" }],
  [/finalizada|completada|aprobada/i, { label: "Terminada", color: "#16a34a" }],
  [/cancelada/i, { label: "Cancelada" }],
];

export function estatusUi(estatus?: string | null): LabelUi {
  const e = estatus ?? "";
  for (const [re, ui] of ESTATUS_UI) if (re.test(e)) return ui;
  return { label: "Por empezar" };
}

type ConTipo = { coreKind?: string | null; ticketTypeCustom?: string | null };

/** «Tarea · Levantamiento», «Servicio»… (sin tipo: «Actividad»). */
export function kindLabel(item: ConTipo): string {
  const meta = item.coreKind ? ACTIVITY_KINDS[item.coreKind as ActivityKind] : null;
  const base = meta ? meta.title : "Actividad";
  return item.coreKind === "tarea" && item.ticketTypeCustom ? `${base} · ${item.ticketTypeCustom}` : base;
}

/** Clave de icono del tipo (sin tipo → icono genérico en ActivityKindIcon). */
export function kindIcon(item: ConTipo): ActivityIconKey | null {
  const meta = item.coreKind ? ACTIVITY_KINDS[item.coreKind as ActivityKind] : null;
  return meta ? meta.icon : null;
}

/** Encargo en palabras de campo. */
export const CHARGE_LABEL: Record<"ejecucion" | "despacho", string> = {
  ejecucion: "La hace él/ella",
  despacho: "La reparte a su equipo",
};

/** `ejecucion`/`despacho` → frase; cualquier otro texto ya legible pasa tal cual. */
export function chargeLabel(charge?: string | null): string | null {
  if (!charge) return null;
  const key = charge.trim().toLowerCase();
  if (key === "ejecucion" || key === "despacho") return CHARGE_LABEL[key];
  return charge;
}

export function formatWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** «hh:mm» de una fecha (para «Actualizado 10:42»). */
export function formatHourMinute(value?: string | number | Date | null): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function formatMinutes(min?: number | null): string | null {
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function shortName(name?: string | null): string {
  return (name || "").split(/\s+/).slice(0, 2).join(" ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

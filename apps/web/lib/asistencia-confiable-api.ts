import { erpFetch } from "./erp-api";

/**
 * Asistencia confiable y nómina: lo que la web le pide al API.
 *
 * Tres cosas que no existían: los intentos de checada que el servidor rechazó, el
 * horario propio de cada persona y la aprobación de horas extra. Todo pasa por
 * `erpFetch`, que ya lleva el token y la cookie de sesión.
 */

// ───────────────────────────────────────────────── intentos rechazados

/** Por qué el servidor no aceptó una checada. Las claves las fija el API. */
export const MOTIVO_RECHAZO_ETIQUETA: Record<string, string> = {
  MOCK_LOCATION: "Ubicación simulada",
  ORIGEN_WEB: "Desde el navegador",
  VIAJE_IMPOSIBLE: "Viaje imposible",
  UBICACION_VIEJA: "Ubicación guardada",
};

export type ChecadaRechazada = {
  id: number;
  /** entrada | salida */
  type: string;
  motivo: string;
  motivoEtiqueta: string;
  detalle: string | null;
  origen: string | null;
  deviceInfo: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  clientCapturedAt: string | null;
  at: string;
  persona: { id: number; nombre: string; email: string; avatarUrl: string | null; puesto: string | null } | null;
};

export async function fetchChecadasRechazadas(
  token: string,
  filtros: { from?: string; to?: string; userId?: number; motivo?: string } = {},
): Promise<ChecadaRechazada[]> {
  const q = new URLSearchParams();
  if (filtros.from) q.set("from", filtros.from);
  if (filtros.to) q.set("to", filtros.to);
  if (filtros.userId) q.set("userId", String(filtros.userId));
  if (filtros.motivo) q.set("motivo", filtros.motivo);
  const r = await erpFetch<{ items?: ChecadaRechazada[] }>(`attendance/rechazos?${q}`, token);
  return r?.items ?? [];
}

/**
 * Un jefe registra la checada de alguien de su equipo.
 *
 * Es la salida de emergencia de «solo se checa desde la app»: teléfono roto, sin
 * batería, olvidado en casa. El motivo es obligatorio y queda registrado con su nombre.
 */
export function registrarChecadaAsistida(
  token: string,
  body: { userId: number; type: "entrada" | "salida"; timestamp?: string; motivo: string },
) {
  return erpFetch<{ message: string }>("attendance/registro-asistido", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Mínimo del motivo, igual que en el servidor. */
export const MOTIVO_REGISTRO_MINIMO = 10;

// ───────────────────────────────────────────────── horario de cada persona

export type HorarioPropio = {
  userId: number;
  horaEntrada: string | null;
  horaSalida: string | null;
  dias: number[];
  graciaMin: number | null;
  jornadaOrdinariaMin: number | null;
  actualizadoPor: { id: number; nombre: string } | null;
  updatedAt: string;
};

export const DIAS_SEMANA = [
  { valor: 1, corto: "L", largo: "Lunes" },
  { valor: 2, corto: "M", largo: "Martes" },
  { valor: 3, corto: "X", largo: "Miércoles" },
  { valor: 4, corto: "J", largo: "Jueves" },
  { valor: 5, corto: "V", largo: "Viernes" },
  { valor: 6, corto: "S", largo: "Sábado" },
  { valor: 0, corto: "D", largo: "Domingo" },
] as const;

export function fetchHorarios(token: string): Promise<HorarioPropio[]> {
  return erpFetch<HorarioPropio[]>("me/kpis/horarios", token).then((r) => r ?? []);
}

/**
 * Guarda el horario de una persona. Mandar todo vacío borra su fila y la persona
 * vuelve a la plantilla de siempre (oficina 09:00, campo 08:00, 15 min, L–V, 8 h).
 */
export function guardarHorario(
  token: string,
  body: {
    userId: number;
    horaEntrada?: string | null;
    horaSalida?: string | null;
    dias?: number[];
    graciaMin?: number | null;
    jornadaOrdinariaMin?: number | null;
  },
) {
  return erpFetch<{ message: string; horario: HorarioPropio | null }>("me/kpis/horarios", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ───────────────────────────────────────────────── horas extra

export type EstadoExtra = "PENDIENTE" | "APROBADO" | "RECHAZADO";

export const ESTADO_EXTRA_ETIQUETA: Record<EstadoExtra, string> = {
  PENDIENTE: "Por aprobar",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};

export type DecisionExtra = {
  userId: number;
  fecha: string;
  minutos: number;
  estado: EstadoExtra;
  nota: string | null;
  aprobadoPor: { id: number; nombre: string } | null;
  at: string;
};

export function fetchDecisionesExtra(
  token: string,
  rango: { desde: string; hasta: string },
  userId?: number,
): Promise<DecisionExtra[]> {
  const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
  if (userId) q.set("userId", String(userId));
  return erpFetch<DecisionExtra[]>(`me/kpis/horas-extra?${q}`, token).then((r) => r ?? []);
}

/** Aprueba, rechaza o devuelve a pendiente el tiempo extra de un día. */
export function decidirHorasExtra(
  token: string,
  body: { userId: number; fecha: string; minutos: number; estado: EstadoExtra; nota?: string },
) {
  return erpFetch<DecisionExtra>("me/kpis/horas-extra", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ───────────────────────────────────────────────── pre-nómina

export type FilaPreNomina = {
  userId: number;
  nombre: string;
  puesto: string | null;
  numeroEmpleado: string | null;
  horario: string;
  diasConJornada: number;
  diasSinChecada: number;
  retardos: number;
  minutosTarde: number;
  minutosLaborados: number;
  minutosProductivos: number;
  minutosInactivos: number;
  productividadPct: number | null;
  minutosExtraCalculados: number | null;
  minutosExtraAprobados: number;
  minutosExtraPendientes: number;
  diasExtraPendientes: number;
  montoCapturado: number;
  avisos: string[];
};

export type PreNomina = {
  desde: string;
  hasta: string;
  filas: FilaPreNomina[];
  resumen: {
    personas: number;
    minutosLaborados: number;
    minutosExtraAprobados: number;
    minutosExtraPendientes: number;
    conAvisos: number;
    montoCapturado: number;
  };
};

export function fetchPreNomina(token: string, rango: { desde: string; hasta: string }) {
  const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
  return erpFetch<PreNomina>(`employee-payments/pre-nomina?${q}`, token);
}

/**
 * Descarga la pre-nómina en Excel.
 *
 * Es una descarga autenticada, así que no basta con un enlace: se pide con el token y el
 * blob se entrega al navegador.
 */
export async function descargarPreNominaExcel(token: string, rango: { desde: string; hasta: string }) {
  const { buildApiUrl } = await import("./api-base");
  const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
  const res = await fetch(buildApiUrl(`employee-payments/pre-nomina/export.xlsx?${q}`), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  const blob = await res.blob();
  const { triggerBlobDownload } = await import("./file-download");
  await triggerBlobDownload(blob, `pre-nomina-${rango.desde}-${rango.hasta}.xlsx`, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

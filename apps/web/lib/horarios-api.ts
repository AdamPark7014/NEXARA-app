/**
 * Cliente de attendance/horarios (Partes A–C).
 * Contrato: erpFetch(path, token, init?) como control-nomina-api / asistencia-confiable-api.
 */
import { erpFetch } from "@/lib/erp-api";

export const HORARIOS_BASE = "attendance/horarios";

export type FuenteHorario = "horario_dia" | "work_schedule" | "default" | "plantilla_turno";

export type HorarioCitado = {
  fuente?: FuenteHorario;
  fecha?: string;
  horaEntrada: string;
  horaSalida: string;
  graciaMin?: number;
  jornadaCitadaMin?: number;
  plantillaTurnoId?: number | null;
  motivo?: string | null;
  tipo?: string;
  cruzaMedianoche?: boolean;
};

export type PlantillaTurno = {
  id: number;
  nombre?: string;
  horaEntrada: string;
  horaSalida: string;
  tipo?: string;
  color?: string | null;
  graciaMin?: number | null;
  clave?: string;
};

export type ParametrosProductividad = {
  vigenteDesde: string;
  rangoNormalInicio: string;
  rangoNormalFin: string;
  graciaMin: number;
  pesoPuntualidad: number;
  pesoAprovechamiento: number;
  pesoEficiencia: number;
  topeBonoPct: number;
  factorExtra: number;
  topeExtraSemanaMin: number;
  franjaNocturnaInicio: string;
  franjaNocturnaFin: string;
  nota?: string | null;
};

export type ResumenJornada = {
  retardoMin: number;
  minutosLaborados: number;
  minutosOrdinarios: number;
  minutosExtra: number;
  minutosNocturnos?: number;
  salidaAnticipadaMin?: number;
  faltaParcial?: boolean;
};

export type ProductividadDia = {
  indice: number;
  puntualidad: number;
  aprovechamiento: number;
  eficiencia: number;
  desglose?: unknown;
  texto?: string;
};

export type ResultadoProgramar = {
  ok: boolean;
  creados?: number;
  requiereConfirmacion?: boolean;
  avisos?: {
    solapes?: unknown[];
    descansoCorto?: unknown[];
    diasSeguidos?: unknown[];
    extraSemana?: unknown[];
  };
};

export type ItemHorarioLista = {
  userId: number;
  fecha: string;
  horario: HorarioCitado;
  fila?: unknown;
};

export type RespuestaParametros = {
  vigente: ParametrosProductividad;
  historial: ParametrosProductividad[];
  notaLft?: string;
  default?: ParametrosProductividad;
};

export type RespuestaResumen = {
  horario: HorarioCitado;
  resumen: ResumenJornada;
  productividad: ProductividadDia;
  parametros: ParametrosProductividad;
};

const json = (body: unknown) => JSON.stringify(body);

/** `10:00–18:00` */
export function formatearRangoHorario(entrada: string, salida: string): string {
  const a = (entrada ?? "").trim();
  const b = (salida ?? "").trim();
  if (!a || !b) return "";
  return `${a.slice(0, 5)}–${b.slice(0, 5)}`;
}

/** `7 h 40` · `3 h` · `20 min` · `0 min` */
export function minutosAHorasTexto(minutos: number): string {
  const n = Math.max(0, Math.round(Number(minutos) || 0));
  if (n === 0) return "0 min";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

export function etiqFuenteHorario(fuente?: string | null): string {
  switch (fuente) {
    case "horario_dia":
      return "Del día";
    case "work_schedule":
      return "Plantilla fija";
    case "plantilla_turno":
      return "Turno";
    case "default":
      return "10:00–18:00";
    default:
      return (fuente && String(fuente).trim()) || "—";
  }
}

export async function listarHorarios(
  token: string,
  q: { from: string; to: string; userIds?: number[] },
): Promise<{ items: ItemHorarioLista[]; from: string; to: string }> {
  const params = new URLSearchParams({ from: q.from.slice(0, 10), to: q.to.slice(0, 10) });
  if (q.userIds?.length) params.set("userIds", q.userIds.join(","));
  const raw = await erpFetch<{ items?: ItemHorarioLista[]; from?: string; to?: string }>(
    `${HORARIOS_BASE}?${params}`,
    token,
  );
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    from: raw?.from ?? q.from.slice(0, 10),
    to: raw?.to ?? q.to.slice(0, 10),
  };
}

export async function horarioDe(
  token: string,
  q: { userId: number; fecha: string },
): Promise<{ userId: number; fecha: string; horario: HorarioCitado }> {
  const params = new URLSearchParams({
    userId: String(q.userId),
    fecha: q.fecha.slice(0, 10),
  });
  return erpFetch(`${HORARIOS_BASE}/de?${params}`, token);
}

export function programarHorarios(
  token: string,
  body: {
    userIds: number[];
    fechas: string[];
    horaEntrada?: string;
    horaSalida?: string;
    plantillaTurnoId?: number | null;
    motivo?: string | null;
    forzarSolapes?: boolean;
  },
): Promise<ResultadoProgramar> {
  return erpFetch(`${HORARIOS_BASE}/programar`, token, { method: "POST", body: json(body) });
}

export function extenderHorario(
  token: string,
  body: { userId: number; fecha: string; hasta: string; motivo?: string | null },
) {
  return erpFetch(`${HORARIOS_BASE}/extender`, token, { method: "POST", body: json(body) });
}

export function recortarHorario(
  token: string,
  body: { userId: number; fecha: string; hasta: string; motivo?: string | null },
) {
  return erpFetch(`${HORARIOS_BASE}/recortar`, token, { method: "POST", body: json(body) });
}

export async function listarPlantillas(
  token: string,
): Promise<{ items: PlantillaTurno[]; omision: PlantillaTurno[] }> {
  const raw = await erpFetch<{ items?: PlantillaTurno[]; omision?: PlantillaTurno[] }>(
    `${HORARIOS_BASE}/plantillas`,
    token,
  );
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    omision: Array.isArray(raw?.omision) ? raw.omision : [],
  };
}

export function obtenerParametros(token: string, fecha?: string): Promise<RespuestaParametros> {
  const q = fecha ? `?${new URLSearchParams({ fecha: fecha.slice(0, 10) })}` : "";
  return erpFetch(`${HORARIOS_BASE}/parametros${q}`, token);
}

export function guardarParametros(
  token: string,
  body: Partial<ParametrosProductividad> & { vigenteDesde: string },
) {
  return erpFetch(`${HORARIOS_BASE}/parametros`, token, { method: "POST", body: json(body) });
}

export function resumenHorarioDia(
  token: string,
  body: {
    userId: number;
    fecha: string;
    entradaReal?: string | null;
    salidaReal?: string | null;
    minutosProductivos?: number;
    actividades?: Array<{ realMin: number; estimadoMin: number; titulo?: string }>;
    esFestivo?: boolean;
    esDiaDescanso?: boolean;
  },
): Promise<RespuestaResumen> {
  return erpFetch(`${HORARIOS_BASE}/resumen`, token, { method: "POST", body: json(body) });
}

/** Cuenta avisos de programación para la UI de confirmación. */
export function contarAvisosProgramacion(avisos?: ResultadoProgramar["avisos"]): number {
  if (!avisos) return 0;
  return (
    (avisos.solapes?.length ?? 0) +
    (avisos.descansoCorto?.length ?? 0) +
    (avisos.diasSeguidos?.length ?? 0) +
    (avisos.extraSemana?.length ?? 0)
  );
}

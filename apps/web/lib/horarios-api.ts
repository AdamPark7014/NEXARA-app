/** Horarios por día: cliente de `attendance/horarios` y sus formatos. */
import { erpFetch } from "@/lib/erp-api";

export const HORARIOS_BASE = "attendance/horarios";

export type HorarioCitado = {
  fuente?: string;
  horaEntrada: string;
  horaSalida: string;
  cruzaMedianoche?: boolean;
  motivo?: string | null;
};

export type DiaHorario = {
  fecha: string;
  horario: HorarioCitado;
  /** Hay un horario puesto para ese día. */
  programado: boolean;
  trabaja: boolean;
  esDescansoHabitual: boolean;
  extraMin: number;
};

export type PersonaSemana = {
  id: number;
  nombre: string;
  puesto: string | null;
  puedeProgramar: boolean;
  entradaHoyAt: string | null;
  jornadaAbierta: boolean;
  extraMin: number;
  dias: DiaHorario[];
};

export type SemanaHorarios = { from: string; to: string; hoy: string; topeExtraSemanaMin: number; personas: PersonaSemana[] };

export type DiaMio = DiaHorario & { loPuso: string | null; ajuste: "programar" | "extender" | "recortar" | null };
export type MiHorario = { hoy: string; entradaHoyAt: string | null; jornadaAbierta: boolean; dias: DiaMio[] };

export type PlantillaTurno = { id: number; nombre: string; horaEntrada: string; horaSalida: string };

type Aviso = { userId: number; nombre?: string };
export type AvisosProgramacion = {
  solapes: Array<Aviso & { fechaA: string; fechaB: string }>;
  descansoCorto: Array<Aviso & { fechaA: string; fechaB: string; horasDescanso: number }>;
  masDe6Seguidos: Array<Aviso & { desde: string; hasta: string; dias: number }>;
  extraSobreTope: Array<Aviso & { semana: string; minutosExtraEst: number; tope: number }>;
};

export type ResultadoProgramar = { ok: boolean; creados: number; requiereConfirmacion?: boolean; avisos: AvisosProgramacion };

export type Programacion = {
  userIds: number[];
  fechas: string[];
  horaEntrada: string;
  horaSalida: string;
  plantillaTurnoId?: number | null;
  motivo?: string | null;
};

/** `10:00–18:00` */
export function formatearRangoHorario(entrada: string, salida: string): string {
  const a = (entrada ?? "").trim();
  const b = (salida ?? "").trim();
  return a && b ? `${a.slice(0, 5)}–${b.slice(0, 5)}` : "";
}

/** `7 h 40` · `3 h` · `20 min` · `0 min` */
export function minutosAHorasTexto(minutos: number): string {
  const n = Math.max(0, Math.round(Number(minutos) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

const enUtc = (f: string) => new Date(`${f}T12:00:00Z`);
const DIA_CORTO = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const DIA_LARGO = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" });
const MES = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" });

/** «Mié 25» */
export function diaCorto(f: string): string {
  const t = DIA_CORTO.format(enUtc(f)).replace(".", "");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} ${Number(f.slice(8, 10))}`;
}

/** «miércoles 25» */
export function diaLargo(f: string): string {
  return `${DIA_LARGO.format(enUtc(f))} ${Number(f.slice(8, 10))}`;
}

/** «23 al 29 de noviembre» */
export function tituloSemana(desde: string, hasta: string): string {
  const a = Number(desde.slice(8, 10));
  const b = Number(hasta.slice(8, 10));
  const ma = MES.format(enUtc(desde));
  const mb = MES.format(enUtc(hasta));
  return ma === mb ? `${a} al ${b} de ${mb}` : `${a} de ${ma} al ${b} de ${mb}`;
}

export function sumarDias(f: string, n: number): string {
  const d = enUtc(f);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function lunesDe(f: string): string {
  return sumarDias(f, -((enUtc(f).getUTCDay() + 6) % 7));
}

/** Hoy en México, `AAAA-MM-DD`. */
export function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

/** Los avisos en palabras. */
export function avisosEnPalabras(a?: AvisosProgramacion | null): Array<{ clave: string; titulo: string; detalle: string }> {
  if (!a) return [];
  const quien = (x: Aviso) => x.nombre || "Esta persona";
  return [
    ...a.solapes.map((x) => ({
      clave: `s${x.userId}${x.fechaA}${x.fechaB}`,
      titulo: `A ${quien(x)} se le enciman dos turnos`,
      detalle: `El del ${diaLargo(x.fechaA)} y el del ${diaLargo(x.fechaB)}.`,
    })),
    ...a.descansoCorto.map((x) => ({
      clave: `d${x.userId}${x.fechaA}`,
      titulo: `${quien(x)} descansa solo ${minutosAHorasTexto(x.horasDescanso * 60)}`,
      detalle: `Entre el turno del ${diaLargo(x.fechaA)} y el del ${diaLargo(x.fechaB)}.`,
    })),
    ...a.masDe6Seguidos.map((x) => ({
      clave: `m${x.userId}${x.desde}`,
      titulo: `${quien(x)} trabaja ${x.dias} días seguidos`,
      detalle: `Del ${diaLargo(x.desde)} al ${diaLargo(x.hasta)}.`,
    })),
    ...a.extraSobreTope.map((x) => ({
      clave: `e${x.userId}${x.semana}`,
      titulo: `${quien(x)} pasa el tope de ${minutosAHorasTexto(x.tope)} extra`,
      detalle: `Llevaría ${minutosAHorasTexto(x.minutosExtraEst)} en la semana. Se pagan solo si se autorizan.`,
    })),
  ];
}

const enviar = <T,>(token: string, ruta: string, body: unknown) =>
  erpFetch<T>(`${HORARIOS_BASE}/${ruta}`, token, { method: "POST", body: JSON.stringify(body) });

export function semanaHorarios(token: string, from: string, to: string): Promise<SemanaHorarios> {
  return erpFetch(`${HORARIOS_BASE}?${new URLSearchParams({ from, to })}`, token);
}

export function miHorario(token: string, from: string, to: string): Promise<MiHorario> {
  return erpFetch(`${HORARIOS_BASE}/mio?${new URLSearchParams({ from, to })}`, token);
}

export async function plantillasTurno(token: string): Promise<PlantillaTurno[]> {
  const r = await erpFetch<{ items?: PlantillaTurno[] }>(`${HORARIOS_BASE}/plantillas`, token);
  return Array.isArray(r?.items) ? r.items : [];
}

export const revisarProgramacion = (token: string, p: Programacion) =>
  enviar<ResultadoProgramar>(token, "programar", { ...p, soloRevisar: true });

export const programarHorarios = (token: string, p: Programacion, avisosVistos: boolean) =>
  enviar<ResultadoProgramar>(token, "programar", { ...p, forzarSolapes: avisosVistos });

export const quitarHorario = (token: string, b: { userId: number; fecha: string }) =>
  enviar<{ ok: boolean; quitados: number }>(token, "quitar", b);

/**
 * Trayecto de una actividad (Adam, 29-10-2026): «Iniciar trayecto» → llega e «Iniciar actividad» →
 * «Concluir» en el sitio → regreso a la oficina. Cada tramo se mide aparte del reloj de la
 * actividad, contra lo que daba la ruta al salir. Reglas puras; el servicio lee y escribe.
 */

export const TIPOS_TRAYECTO = ['IDA', 'REGRESO'] as const;
export type TipoTrayecto = (typeof TIPOS_TRAYECTO)[number];
export type ModoTrayecto = 'AUTO' | 'TRANSPORTE';
/** Cómo terminó un tramo: lo marcó, inició la actividad, checó su salida o empezó otro tramo. */
export type FinTrayecto = 'LLEGADA' | 'INICIO' | 'SALIDA' | 'NUEVO';

/** Si tardó más que la ruta + 25 %, la pizarra lo marca (canvas «Traslado», «Al terminar»). */
export const TOLERANCIA_TRAYECTO = 1.25;
/** Un tramo abierto más de esto ya no es un traslado: se dejó corriendo. */
export const TOPE_TRAYECTO_MIN = 6 * 60;

export function esTipoTrayecto(v: unknown): v is TipoTrayecto {
  return typeof v === 'string' && (TIPOS_TRAYECTO as readonly string[]).includes(v);
}

export function modoDe(v: unknown, porOmision: ModoTrayecto = 'AUTO'): ModoTrayecto {
  return v === 'TRANSPORTE' ? 'TRANSPORTE' : v === 'AUTO' ? 'AUTO' : porOmision;
}

/** Un punto válido o null (no se guarda basura del GPS). */
export function puntoDe(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat);
  const o = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(o)) return null;
  if (a < -90 || a > 90 || o < -180 || o > 180 || (a === 0 && o === 0)) return null;
  return { lat: a, lng: o };
}

/** Minutos del tramo (abierto: hasta ahora), con tope para el que se dejó corriendo. */
export function minutosDeTramo(inicio: Date, fin: Date | null, ahora: Date): number {
  const hasta = fin ?? ahora;
  const min = Math.max(0, Math.round((hasta.getTime() - inicio.getTime()) / 60_000));
  return Math.min(TOPE_TRAYECTO_MIN, min);
}

/** En tiempo o excedido contra la ruta (+ 25 %). null si no hay estimado o sigue en camino. */
export function estadoDeTramo(real: number | null, estimado: number | null, terminado: boolean): 'en_tiempo' | 'excedido' | null {
  if (!terminado || real == null || estimado == null || estimado <= 0) return null;
  return real <= Math.round(estimado * TOLERANCIA_TRAYECTO) ? 'en_tiempo' : 'excedido';
}

/** El tramo que se pide empezar: no se repite una ida abierta ni un regreso sin haber ido. */
export function validarInicio(
  tipo: TipoTrayecto,
  previos: Array<{ tipo: string; endedAt: Date | null }>,
): string | null {
  const abiertoMismo = previos.find((p) => p.tipo === tipo && p.endedAt == null);
  if (abiertoMismo) return tipo === 'IDA' ? 'Ya vas en camino: marca tu llegada o inicia la actividad.' : 'Ya vas de regreso.';
  return null;
}

export type TrayectoDto = {
  id: number;
  activityId: number;
  userId: number;
  tipo: TipoTrayecto;
  modo: ModoTrayecto;
  startedAt: string;
  endedAt: string | null;
  finMotivo: FinTrayecto | null;
  minutos: number;
  estimadoMin: number | null;
  estimadoFuente: string | null;
  estado: 'en_tiempo' | 'excedido' | null;
};

export function trayectoDto(
  t: {
    id: number;
    activityId: number;
    userId: number;
    tipo: string;
    modo: string;
    startedAt: Date;
    endedAt: Date | null;
    finMotivo: string | null;
    estimadoMin: number | null;
    estimadoFuente: string | null;
  },
  ahora: Date,
): TrayectoDto {
  const minutos = minutosDeTramo(t.startedAt, t.endedAt, ahora);
  return {
    id: t.id,
    activityId: t.activityId,
    userId: t.userId,
    tipo: esTipoTrayecto(t.tipo) ? t.tipo : 'IDA',
    modo: modoDe(t.modo),
    startedAt: t.startedAt.toISOString(),
    endedAt: t.endedAt ? t.endedAt.toISOString() : null,
    finMotivo: (t.finMotivo as FinTrayecto | null) ?? null,
    minutos,
    estimadoMin: t.estimadoMin,
    estimadoFuente: t.estimadoFuente,
    estado: estadoDeTramo(minutos, t.estimadoMin, t.endedAt != null),
  };
}

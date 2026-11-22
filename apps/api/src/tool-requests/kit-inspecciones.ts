/**
 * Revisión periódica del kit asignado.
 *
 * Un kit se entrega una vez y se olvida: la única forma de saber que el multímetro
 * sigue sirviendo es que alguien lo mire cada tantos días. `inspeccionCadaDias` fija el
 * ritmo por asignación (no todos los kits se revisan igual) y `proximaInspeccion` es la
 * fecha que se recorre al registrar una.
 *
 * Aritmética de fechas pura: sin Prisma ni reloj del sistema.
 */

import { workDateColumn, workDateKeyOf } from '../common/time/workday.js';

export const ESTADOS_INSPECCION = ['OK', 'OBSERVADO', 'DANADO'] as const;
export type EstadoInspeccion = (typeof ESTADOS_INSPECCION)[number];

export const ESTADO_INSPECCION_LABEL: Record<EstadoInspeccion, string> = {
  OK: 'En orden',
  OBSERVADO: 'Con observaciones',
  DANADO: 'Dañado',
};

/** Ritmos que se ofrecen en la pantalla. 0 = sin revisión periódica. */
export const CADENCIAS_SUGERIDAS = [30, 60, 90, 180] as const;

/** Un kit con algo observado se vuelve a mirar antes: no se espera al ciclo completo. */
export const DIAS_REVISION_OBSERVADO = 15;
/** Uno dañado se revisa en cuanto se resuelva; mientras, en una semana. */
export const DIAS_REVISION_DANADO = 7;

export function normalizarEstadoInspeccion(valor: unknown): EstadoInspeccion | null {
  const texto = String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
  return (ESTADOS_INSPECCION as readonly string[]).includes(texto)
    ? (texto as EstadoInspeccion)
    : null;
}

/** Cadencia válida en días, o `null` para «sin revisión periódica». */
export function normalizarCadencia(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Más de dos años es lo mismo que no revisar; menos de un día no es una cadencia.
  return Math.min(730, Math.max(1, Math.trunc(n)));
}

/**
 * Suma días de calendario al día de la empresa. La revisión es de un día, no de un minuto: se guarda
 * como ese día a medianoche UTC, que es como la web y las apps leen la fecha. Con el reloj del
 * servidor, la revisión hecha a las 7 de la tarde programaba la siguiente un día después.
 */
function sumarDias(desde: Date, dias: number): Date {
  return new Date(workDateColumn(desde).getTime() + dias * 86_400_000);
}

/**
 * Cuándo toca la siguiente. Un kit que quedó observado o dañado se adelanta: esperar el
 * ciclo completo para volver a mirar algo que ya se sabe mal no revisa nada.
 */
export function proximaInspeccion(
  desde: Date,
  cadaDias: number | null | undefined,
  estado: EstadoInspeccion = 'OK',
): Date | null {
  const cadencia = normalizarCadencia(cadaDias);
  if (cadencia == null) return null;
  if (estado === 'DANADO') return sumarDias(desde, Math.min(cadencia, DIAS_REVISION_DANADO));
  if (estado === 'OBSERVADO') return sumarDias(desde, Math.min(cadencia, DIAS_REVISION_OBSERVADO));
  return sumarDias(desde, cadencia);
}

export type EstadoProgramacion = {
  /** true cuando ya pasó la fecha. */
  vencida: boolean;
  /** Días de atraso (0 si no está vencida). */
  diasDeAtraso: number;
  /** Días que faltan (0 si ya venció). `null` sin programación. */
  diasParaLaProxima: number | null;
  /** true cuando falta una semana o menos. */
  porVencer: boolean;
};

const UNA_SEMANA = 7;

/** Cómo va la programación de un kit respecto de hoy. */
export function estadoProgramacion(
  proxima: Date | null | undefined,
  ahora: Date,
): EstadoProgramacion {
  if (!proxima) {
    return { vencida: false, diasDeAtraso: 0, diasParaLaProxima: null, porVencer: false };
  }
  // Por días de calendario de la empresa: la revisión de mañana no está vencida esta tarde.
  const diaProxima = new Date(`${workDateKeyOf(proxima, ahora)}T00:00:00.000Z`).getTime();
  const dias = Math.round((diaProxima - workDateColumn(ahora).getTime()) / 86_400_000);
  if (dias <= 0) {
    return {
      vencida: true,
      diasDeAtraso: Math.abs(dias),
      diasParaLaProxima: 0,
      porVencer: false,
    };
  }
  return {
    vencida: false,
    diasDeAtraso: 0,
    diasParaLaProxima: dias,
    porVencer: dias <= UNA_SEMANA,
  };
}

/** Una foto de inspección tal como se guarda en el Json `fotos`. */
export type FotoInspeccion = {
  url: string;
  capturedAt?: string;
  lat?: number;
  lng?: number;
};

export const MAX_FOTOS_INSPECCION = 8;

/**
 * Limpia las fotos que manda la app. Una imagen en base64 no es una foto subida: si
 * llega así, se descarta en vez de guardar medio megabyte de texto en la base.
 */
export function normalizarFotosInspeccion(entrada: unknown): FotoInspeccion[] {
  const lista = Array.isArray(entrada) ? entrada : [];
  const salida: FotoInspeccion[] = [];
  for (const item of lista) {
    const url = String(
      (typeof item === 'string' ? item : (item as { url?: unknown })?.url) ?? '',
    ).trim();
    if (!url || url.startsWith('data:') || url.includes(';base64,') || url.length > 500) continue;

    const origen = (typeof item === 'object' && item ? item : {}) as Record<string, unknown>;
    const foto: FotoInspeccion = { url };
    const capturedAt = String(origen.capturedAt ?? '').trim();
    if (capturedAt && !Number.isNaN(new Date(capturedAt).getTime())) foto.capturedAt = capturedAt;
    const lat = Number(origen.lat);
    const lng = Number(origen.lng);
    if (Number.isFinite(lat) && Math.abs(lat) <= 90) foto.lat = lat;
    if (Number.isFinite(lng) && Math.abs(lng) <= 180) foto.lng = lng;

    salida.push(foto);
    if (salida.length >= MAX_FOTOS_INSPECCION) break;
  }
  return salida;
}

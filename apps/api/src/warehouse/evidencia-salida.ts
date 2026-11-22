import { BadRequestException } from '@nestjs/common';
import { contarEs } from '../common/contar-es.js';

/**
 * Evidencia de un movimiento de almacén (Adam, 21-11-2026): foto de lo que sale, número de serie
 * de cada pieza y quién se lo lleva. Reglas puras: sin Prisma ni reloj.
 */

/** Fotos por movimiento: lo que se lleva, más la etiqueta de serie de cada pieza. */
export const MAX_FOTOS_MOVIMIENTO = 12;
/** Fotos por subida (una llamada). */
export const MAX_FOTOS_POR_SUBIDA = 8;
/** Series por movimiento: una salida de más piezas con serie se parte en varias. */
export const MAX_SERIES_MOVIMIENTO = 200;
const LARGO_MAXIMO_SERIE = 80;

export type FotoMovimiento = { url: string; capturedAt?: string };

/** Sin base64 ni URLs kilométricas: lo mismo que las fotos de herramienta. */
export function normalizarFotosMovimiento(entrada: unknown): FotoMovimiento[] {
  const lista = Array.isArray(entrada) ? entrada : [];
  const salida: FotoMovimiento[] = [];
  const vistas = new Set<string>();
  for (const item of lista) {
    const url = String((typeof item === 'string' ? item : (item as { url?: unknown })?.url) ?? '').trim();
    if (!url || url.startsWith('data:') || url.includes(';base64,') || url.length > 500 || vistas.has(url)) continue;
    vistas.add(url);
    const foto: FotoMovimiento = { url };
    const capturedAt = String((item as { capturedAt?: unknown })?.capturedAt ?? '').trim();
    if (capturedAt && !Number.isNaN(new Date(capturedAt).getTime())) foto.capturedAt = capturedAt;
    salida.push(foto);
    if (salida.length >= MAX_FOTOS_MOVIMIENTO) break;
  }
  return salida;
}

/**
 * Números de serie tal como se teclean o se leen con el lector: una lista, o un texto con una
 * serie por renglón (también coma o punto y coma). En mayúsculas y sin repetir.
 */
export function normalizarSeries(entrada: unknown): string[] {
  const crudas: unknown[] = Array.isArray(entrada)
    ? entrada
    : typeof entrada === 'string'
      ? entrada.split(/[\n\r,;]+/)
      : [];
  const salida: string[] = [];
  const vistas = new Set<string>();
  for (const cruda of crudas) {
    const serie = String(cruda ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    if (!serie || serie.length > LARGO_MAXIMO_SERIE || vistas.has(serie)) continue;
    vistas.add(serie);
    salida.push(serie);
    if (salida.length >= MAX_SERIES_MOVIMIENTO) break;
  }
  return salida;
}

/** Una serie es una pieza: no puede haber más series que piezas en el movimiento. */
export function validarSeriesContraCantidad(series: string[], piezas: number): void {
  if (!series.length) return;
  if (!Number.isFinite(piezas) || series.length > Math.ceil(piezas)) {
    throw new BadRequestException(
      `Hay ${contarEs(series.length, 'número de serie', 'números de serie')} y el movimiento es de ${contarEs(Number.isFinite(piezas) ? piezas : 0, 'pieza')}`,
    );
  }
}

/** Movimientos que sacan la pieza del almacén (salida, baja, consumo de producción). */
export const TIPOS_QUE_SACAN_LA_PIEZA: ReadonlySet<string> = new Set(['DISPATCH', 'SCRAP', 'PRODUCTION_OUT']);

export type MovimientoConSeries = {
  type?: string | null;
  series?: unknown;
  movementNumber?: string | null;
  createdAt?: Date | string | null;
};

/**
 * De las series que se quieren sacar, las que ya salieron y no han regresado: su movimiento más
 * reciente es una salida. Una serie es una pieza; no puede estar en dos obras. `historial` son
 * los movimientos del mismo producto que nombran alguna de esas series, en cualquier orden.
 */
export function seriesQueSiguenFuera(
  series: string[],
  historial: MovimientoConSeries[],
): Array<{ serie: string; movementNumber: string }> {
  const pedidas = normalizarSeries(series);
  const delMasReciente = [...historial].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const fuera: Array<{ serie: string; movementNumber: string }> = [];
  for (const serie of pedidas) {
    const ultimo = delMasReciente.find((m) => normalizarSeries(m.series).includes(serie));
    if (ultimo && TIPOS_QUE_SACAN_LA_PIEZA.has(String(ultimo.type ?? '').toUpperCase())) {
      fuera.push({ serie, movementNumber: String(ultimo.movementNumber ?? '').trim() });
    }
  }
  return fuera;
}

const enLista = (partes: string[]) =>
  partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;

/** El aviso a quien registra la salida: cuál serie, en qué movimiento salió y qué hacer. */
export function avisoSeriesFuera(fuera: Array<{ serie: string; movementNumber: string }>): string {
  const folios = Array.from(new Set(fuera.map((f) => f.movementNumber).filter(Boolean)));
  if (fuera.length === 1) {
    const donde = folios.length ? ` en el movimiento ${folios[0]}` : '';
    return `La serie ${fuera[0].serie} ya salió${donde} y no ha regresado. Revisa la etiqueta o registra primero su devolución.`;
  }
  const donde = folios.length ? ` (${folios.length === 1 ? 'movimiento' : 'movimientos'} ${enLista(folios)})` : '';
  return `Las series ${enLista(fuera.map((f) => f.serie))} ya salieron${donde} y no han regresado. Revisa las etiquetas o registra primero su devolución.`;
}

/** Junta la evidencia que ya tenía el movimiento con la que llega, sin repetir y con tope. */
export function sumarEvidencia(
  actual: { fotos?: unknown; series?: unknown },
  nueva: { fotos?: unknown; series?: unknown },
): { fotos: FotoMovimiento[]; series: string[] } {
  return {
    fotos: normalizarFotosMovimiento([
      ...normalizarFotosMovimiento(actual.fotos),
      ...normalizarFotosMovimiento(nueva.fotos),
    ]),
    series: normalizarSeries([...normalizarSeries(actual.series), ...normalizarSeries(nueva.series)]),
  };
}

/** Lo que una salida enseña de su evidencia en la lista, sin abrirla. */
export function resumenEvidenciaSalida(movimiento: {
  type?: string | null;
  fotos?: unknown;
  series?: unknown;
  recibidoPorId?: number | null;
  activityId?: number | null;
  projectId?: number | null;
}): { esSalida: boolean; fotos: number; series: number; sinFoto: boolean; sinResponsable: boolean; sinLigar: boolean } {
  const esSalida = String(movimiento.type ?? '').toUpperCase() === 'DISPATCH';
  const fotos = normalizarFotosMovimiento(movimiento.fotos).length;
  const series = normalizarSeries(movimiento.series).length;
  return {
    esSalida,
    fotos,
    series,
    sinFoto: esSalida && fotos === 0,
    sinResponsable: esSalida && !movimiento.recibidoPorId,
    sinLigar: esSalida && !movimiento.activityId && !movimiento.projectId,
  };
}

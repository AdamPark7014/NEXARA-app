import { BadRequestException } from '@nestjs/common';
import { normalizarFotosInspeccion, type FotoInspeccion } from './kit-inspecciones.js';

/**
 * Evidencia de un préstamo de herramienta (Adam, 21-11-2026): cómo salió («antes»), en qué
 * estado volvió («después»), quién la entregó y quién la recibió.
 *
 * Reglas puras: sin Prisma ni reloj. El servicio guarda lo que esto resuelve.
 */

/** Tope por momento (entrega o devolución). */
export const MAX_FOTOS_EVIDENCIA = 6;

export const CONDICIONES_DEVOLUCION = ['BIEN', 'DESGASTE', 'DANADA', 'INCOMPLETA', 'EXTRAVIADA'] as const;
export type CondicionDevolucion = (typeof CONDICIONES_DEVOLUCION)[number];

export const CONDICION_DEVOLUCION_LABEL: Record<CondicionDevolucion, string> = {
  BIEN: 'En buen estado',
  DESGASTE: 'Con desgaste normal',
  DANADA: 'Dañada',
  INCOMPLETA: 'Incompleta',
  EXTRAVIADA: 'Extraviada',
};

export type FotoEvidencia = FotoInspeccion;

/** Mismas reglas que las fotos de revisión de kit (sin base64, URL corta), con su propio tope. */
export function normalizarFotosEvidencia(entrada: unknown): FotoEvidencia[] {
  return normalizarFotosInspeccion(entrada).slice(0, MAX_FOTOS_EVIDENCIA);
}

export function normalizarCondicion(valor: unknown): CondicionDevolucion | null {
  const texto = String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
  return (CONDICIONES_DEVOLUCION as readonly string[]).includes(texto) ? (texto as CondicionDevolucion) : null;
}

export type DevolucionResuelta = {
  condicion: CondicionDevolucion;
  descripcion: string | null;
  /** Estado en que queda el préstamo. */
  estatusPrestamo: 'RETURNED' | 'DAMAGED';
  /** Estado en que queda la pieza del inventario. */
  estatusPieza: 'AVAILABLE' | 'IN_REPAIR' | 'RETIRED';
  /** Motivo de baja cuando la pieza se da por extraviada. */
  motivoBaja: string | null;
};

/**
 * Decide cómo queda una devolución.
 *
 * - Las apps anteriores al 21-11 no mandan `condicion`: con descripción de daño es DANADA y sin
 *   ella BIEN, igual que antes, y no se les exige foto (no saben tomarla).
 * - Quien sí manda `condicion` es una pantalla nueva: toda devolución lleva al menos una foto de
 *   cómo volvió, salvo la extraviada (no hay qué fotografiar), y lo que no vuelve bien se explica.
 */
export function resolverDevolucion(entrada: {
  condicion?: unknown;
  descripcion?: unknown;
  fotos: FotoEvidencia[];
}): DevolucionResuelta {
  const descripcion = String(entrada.descripcion ?? '').trim() || null;
  const condicionPedida = String(entrada.condicion ?? '').trim();
  const explicita = normalizarCondicion(condicionPedida);
  if (condicionPedida && !explicita) {
    throw new BadRequestException('Elige en qué estado vuelve la herramienta');
  }
  const condicion: CondicionDevolucion = explicita ?? (descripcion ? 'DANADA' : 'BIEN');

  if (explicita) {
    if (condicion !== 'BIEN' && condicion !== 'DESGASTE' && !descripcion) {
      throw new BadRequestException('Describe qué le pasó a la herramienta');
    }
    if (condicion !== 'EXTRAVIADA' && entrada.fotos.length === 0) {
      throw new BadRequestException('Toma al menos una foto de cómo vuelve la herramienta');
    }
  }

  if (condicion === 'BIEN' || condicion === 'DESGASTE') {
    return { condicion, descripcion, estatusPrestamo: 'RETURNED', estatusPieza: 'AVAILABLE', motivoBaja: null };
  }
  if (condicion === 'EXTRAVIADA') {
    return {
      condicion,
      descripcion,
      estatusPrestamo: 'DAMAGED',
      estatusPieza: 'RETIRED',
      motivoBaja: `Extraviada en préstamo${descripcion ? `: ${descripcion}` : ''}`,
    };
  }
  return { condicion, descripcion, estatusPrestamo: 'DAMAGED', estatusPieza: 'IN_REPAIR', motivoBaja: null };
}

/** Texto de multipart o lista de JSON: en multipart el campo `fotos` del body llega como texto y se ignora. */
export function fotosDelCuerpo(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

/** Lo que un préstamo enseña de su evidencia sin abrir las fotos. */
export function resumenEvidencia(prestamo: {
  status?: string | null;
  deliveryPhotos?: unknown;
  returnPhotos?: unknown;
}): { fotosEntrega: number; fotosDevolucion: number; faltaFotoEntrega: boolean; faltaFotoDevolucion: boolean } {
  const fotosEntrega = normalizarFotosEvidencia(prestamo.deliveryPhotos).length;
  const fotosDevolucion = normalizarFotosEvidencia(prestamo.returnPhotos).length;
  const status = String(prestamo.status ?? '').toUpperCase();
  const entregado = status === 'IN_USE' || status === 'RETURNED' || status === 'DAMAGED';
  const devuelto = status === 'RETURNED' || status === 'DAMAGED';
  return {
    fotosEntrega,
    fotosDevolucion,
    faltaFotoEntrega: entregado && fotosEntrega === 0,
    faltaFotoDevolucion: devuelto && fotosDevolucion === 0,
  };
}

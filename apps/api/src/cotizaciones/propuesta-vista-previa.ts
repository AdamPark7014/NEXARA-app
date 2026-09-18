/**
 * Vista previa en vivo: el borrador que está en pantalla, encima de la cotización guardada, sin
 * guardar nada.
 *
 * El editor manda lo mismo que autoguarda (`UpdateCotizacionDto`). Aquí se decide qué pisa a qué
 * con las mismas reglas que `CotizacionesService.update`, para que la vista previa sea exactamente
 * el PDF que saldría si ese borrador se guardara:
 *
 *   - un campo ausente (`undefined`) conserva lo guardado; uno vacío (`""`) lo vacía;
 *   - las partidas, si vienen, reemplazan a las guardadas y los totales se recalculan igual;
 *   - el folio emitido por el servidor no se reescribe; el estado nunca cambia desde aquí;
 *   - los planos solo se reordenan/renombran (subir y quitar tienen su propio endpoint).
 *
 * Módulo puro (sin Nest ni Prisma) salvo las excepciones HTTP: se prueba sin base de datos.
 */
import { BadRequestException } from '@nestjs/common';
import { normalizarBloques } from './alcance-bloques.js';
import { calculateLine, calculateTotals, normalizeItems, type RawCotizacionItem } from './cotizacion-totals.js';
import { ordenarPlanos } from './planos-cotizacion.js';
import { normalizarSegmento } from './terminos-segmento.js';
import type { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';

/** Topes del borrador: el PDF tarda ~25 ms, pero no se arma uno de mil partidas por tecla. */
export const LIMITES_VISTA_PREVIA = {
  /** Cuerpo JSON. Una cotización real (40 partidas, 12 subsecciones) pesa ~30 KB. */
  bytes: 512 * 1024,
  partidas: 400,
  bloques: 120,
  planos: 60,
  /** Vistas previas simultáneas por persona (el editor cancela la anterior, así que sobra con 2). */
  enCursoPorPersona: 3,
} as const;

const redondeo = (n: number) => Math.round(n * 100) / 100;

function fecha(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** `update()` recorta los textos; `undefined` conserva lo guardado. */
function texto<T>(nuevo: string | undefined, guardado: T): string | T {
  return nuevo === undefined ? guardado : nuevo.trim();
}

/** Rechaza un borrador desproporcionado antes de armar nada. */
export function validarTamanoBorrador(dto: UpdateCotizacionDto, bytes = 0): void {
  if (bytes > LIMITES_VISTA_PREVIA.bytes) {
    throw new BadRequestException('El borrador es demasiado grande para la vista previa.');
  }
  if ((dto.items?.length ?? 0) > LIMITES_VISTA_PREVIA.partidas) {
    throw new BadRequestException(`La vista previa admite hasta ${LIMITES_VISTA_PREVIA.partidas} partidas.`);
  }
  if ((dto.alcanceBloques?.length ?? 0) > LIMITES_VISTA_PREVIA.bloques) {
    throw new BadRequestException(`La vista previa admite hasta ${LIMITES_VISTA_PREVIA.bloques} subsecciones.`);
  }
  if ((dto.planos?.length ?? 0) > LIMITES_VISTA_PREVIA.planos) {
    throw new BadRequestException(`La vista previa admite hasta ${LIMITES_VISTA_PREVIA.planos} planos.`);
  }
}

/**
 * Cotización guardada + borrador del editor → la cotización que se imprimiría. Devuelve un objeto
 * nuevo; no toca `guardada` (que puede ser la fila que devolvió Prisma).
 */
export function borradorSobreGuardada<Q extends Record<string, any>>(guardada: Q, dto: UpdateCotizacionDto): Q {
  validarTamanoBorrador(dto);

  const mezcla: Record<string, any> = {
    ...guardada,
    quoteNumber: guardada['folioNomenclatura'] ? guardada['quoteNumber'] : texto(dto.quoteNumber, guardada['quoteNumber']) || guardada['quoteNumber'],
    segmento: dto.segmento ? normalizarSegmento(dto.segmento) : guardada['segmento'],
    objetivo: texto(dto.objetivo, guardada['objetivo']),
    alcanceBloques: dto.alcanceBloques ? normalizarBloques(dto.alcanceBloques) : guardada['alcanceBloques'],
    planos: dto.planos ? ordenarPlanos(guardada['planos'], dto.planos) : guardada['planos'],
    issueDate: fecha(dto.issueDate) ?? guardada['issueDate'],
    validUntil: fecha(dto.validUntil) ?? guardada['validUntil'],
    clientName: texto(dto.clientName, guardada['clientName']),
    clientCompany: texto(dto.clientCompany, guardada['clientCompany']),
    clientEmail: texto(dto.clientEmail, guardada['clientEmail']),
    clientPhone: texto(dto.clientPhone, guardada['clientPhone']),
    clientAddress: texto(dto.clientAddress, guardada['clientAddress']),
    projectName: texto(dto.projectName, guardada['projectName']),
    scope: texto(dto.scope, guardada['scope']),
    currency: texto(dto.currency, guardada['currency']) || guardada['currency'],
    depositPercent: dto.depositPercent ?? guardada['depositPercent'],
    note: texto(dto.note, guardada['note']),
  };

  if (dto.items) {
    // Mismo cálculo que el guardado: sin partidas el borrador queda en ceros, no es un error.
    const items = dto.items.length ? normalizeItems(dto.items as RawCotizacionItem[]) : [];
    const totales = calculateTotals(items);
    mezcla['items'] = items.map((item) => ({ ...item, lineTotal: redondeo(calculateLine(item).total) }));
    mezcla['subtotal'] = redondeo(totales.subtotal);
    mezcla['discountTotal'] = redondeo(totales.discountTotal);
    mezcla['taxTotal'] = redondeo(totales.taxTotal);
    mezcla['iepsTotal'] = redondeo(totales.iepsTotal);
    mezcla['retentionTotal'] = redondeo(totales.retentionTotal);
    mezcla['total'] = redondeo(totales.total);
  }

  return mezcla as Q;
}

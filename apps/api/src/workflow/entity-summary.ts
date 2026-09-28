/**
 * Resumen legible de lo que se está aprobando.
 *
 * La bandeja de Aprobaciones solo sabía «Compra con folio 99»: para decidir hace falta el importe y
 * de qué se trata. Aquí se arma ese resumen para cada tipo de entidad que tiene flujo de aprobación.
 *
 * `armarResumen` es puro (sin Prisma) para poder probarlo; `resumirEntidades` trae las filas en un
 * solo viaje por tipo (no una consulta por aprobación) y siempre acotadas a la empresa.
 */
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { tipoBase } from './approval-thresholds.js';

export type ResumenEntidad = {
  titulo: string;
  /** Segunda línea: cliente, proveedor, categoría… */
  detalle: string | null;
  /** Importe en la moneda de la entidad; `null` si el tipo no tiene importe (p. ej. cierre de actividad). */
  monto: number | null;
  moneda: string;
};

export type EntidadRef = { entityType: string; entityId: number };

type Fila = Record<string, any>;

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const numero = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const unir = (...partes: Array<string | null | undefined>): string | null => {
  const limpio = partes.map((p) => (p ?? '').trim()).filter(Boolean);
  return limpio.length ? limpio.join(' · ') : null;
};

/** Clave estable para indexar el resumen de una entidad. */
export const claveEntidad = (entityType: string, entityId: number): string =>
  `${String(entityType).toUpperCase()}:${entityId}`;

/** Fila de la base → resumen. Devuelve `null` si el tipo no se conoce. */
export function armarResumen(entityType: string, fila: Fila): ResumenEntidad | null {
  switch (String(entityType).toUpperCase()) {
    case 'COTIZACION':
    case 'QUOTE':
      return {
        titulo: `Cotización ${texto(fila['quoteNumber']) || `#${fila['id']}`}`,
        detalle: unir(texto(fila['clientCompany']) || texto(fila['clientName']), texto(fila['projectName'])),
        monto: numero(fila['total']),
        moneda: texto(fila['currency']) || 'MXN',
      };
    case 'PURCHASE_ORDER':
      return {
        titulo: `Orden de compra ${texto(fila['poNumber']) || `#${fila['id']}`}`,
        detalle: unir(texto(fila['supplier']?.name)),
        monto: numero(fila['totalAmount']),
        moneda: texto(fila['currency']) || 'MXN',
      };
    case 'EXPENSE':
      return {
        titulo: texto(fila['concepto']) || `Gasto #${fila['id']}`,
        detalle: unir(texto(fila['categoria'])),
        monto: numero(fila['montoSolicitado']),
        moneda: 'MXN',
      };
    case 'VIATIC':
    case 'VIATICS':
      return {
        titulo: texto(fila['motivo']) || `Viático #${fila['id']}`,
        detalle: unir(texto(fila['categoria'])),
        monto: numero(fila['montoSolicitado']),
        moneda: 'MXN',
      };
    case 'SALES_PROJECT':
      return {
        titulo: texto(fila['name']) || `Proyecto #${fila['id']}`,
        detalle: 'Proyecto comercial',
        monto: numero(fila['budget']),
        moneda: 'MXN',
      };
    case 'ACTIVITY_CLOSURE':
      return {
        titulo: unir(texto(fila['anNumber']), texto(fila['titulo'])) ?? `Actividad #${fila['id']}`,
        detalle: 'Cierre de actividad',
        monto: null,
        moneda: 'MXN',
      };
    default:
      return null;
  }
}

/** Consultas por tipo: modelo de Prisma y columnas que hacen falta. */
const CONSULTAS: Record<string, { modelo: string; select: Fila }> = {
  COTIZACION: {
    modelo: 'cotizacion',
    select: { id: true, quoteNumber: true, clientCompany: true, clientName: true, projectName: true, total: true, currency: true },
  },
  PURCHASE_ORDER: {
    modelo: 'purchaseOrder',
    select: { id: true, poNumber: true, totalAmount: true, currency: true, supplier: { select: { name: true } } },
  },
  EXPENSE: { modelo: 'expense', select: { id: true, concepto: true, categoria: true, montoSolicitado: true } },
  VIATIC: { modelo: 'viatico', select: { id: true, motivo: true, categoria: true, montoSolicitado: true } },
  SALES_PROJECT: { modelo: 'salesProject', select: { id: true, name: true, budget: true } },
  ACTIVITY_CLOSURE: { modelo: 'activity', select: { id: true, anNumber: true, titulo: true } },
};

const ALIAS: Record<string, string> = { QUOTE: 'COTIZACION', VIATICS: 'VIATIC' };
// `COTIZACION_MONTO` (autorización por monto) se resume como la cotización que es.
const canonico = (tipo: string) => ALIAS[tipoBase(tipo)] ?? tipoBase(tipo);

/**
 * Resúmenes de todas las entidades de una bandeja, una consulta por tipo. Lo que no se encuentre
 * (borrada, de otra empresa, tipo desconocido) simplemente no aparece: la bandeja sigue mostrando
 * lo de siempre para ese renglón.
 */
export async function resumirEntidades(
  prisma: any,
  refs: EntidadRef[],
  companyId: number,
): Promise<Map<string, ResumenEntidad>> {
  const porTipo = new Map<string, Set<number>>();
  for (const ref of refs) {
    const tipo = canonico(ref.entityType);
    if (!CONSULTAS[tipo] || !Number.isFinite(ref.entityId)) continue;
    if (!porTipo.has(tipo)) porTipo.set(tipo, new Set());
    porTipo.get(tipo)!.add(ref.entityId);
  }

  const salida = new Map<string, ResumenEntidad>();
  await Promise.all(
    [...porTipo.entries()].map(async ([tipo, ids]) => {
      const { modelo, select } = CONSULTAS[tipo];
      try {
        const filas: Fila[] = await prisma[modelo].findMany({
          where: { id: { in: [...ids] }, ...companyWhere(companyId) },
          select,
        });
        for (const fila of filas) {
          const resumen = armarResumen(tipo, fila);
          if (resumen) salida.set(claveEntidad(tipo, Number(fila['id'])), resumen);
        }
      } catch {
        // Un resumen que no se pudo armar no debe tumbar la bandeja.
      }
    }),
  );
  return salida;
}

/** Busca el resumen de una entidad aunque el tipo venga con alias (`QUOTE`, `VIATICS`). */
export function resumenDe(
  resumenes: Map<string, ResumenEntidad>,
  entityType: string,
  entityId: number,
): ResumenEntidad | null {
  return resumenes.get(claveEntidad(canonico(entityType), entityId)) ?? null;
}

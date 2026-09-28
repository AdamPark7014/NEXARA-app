/**
 * Topes de aprobación por monto (política de empresa).
 *
 * Hoy cualquiera con permiso puede enviar una cotización o aprobar una compra, de cualquier monto.
 * Para que el CEO solo revise lo que de verdad le toca, cada empresa puede fijar desde qué monto se
 * necesita la autorización de dirección. Se guarda como `SystemSetting` con `companyId`
 * (`approvals.thresholds`, JSON `{"COTIZACION":{"desde":250000},"PURCHASE_ORDER":{"desde":25000}}`).
 * **Sin configurar no cambia nada.**
 *
 * Módulo puro (sin Nest ni Prisma): interpreta la política y decide si un monto necesita firma.
 */
export const APPROVAL_THRESHOLDS_SETTING_KEY = 'approvals.thresholds';

/** Lo que tiene tope. `COTIZACION_MONTO` es el flujo propio de la autorización por monto de cotizaciones. */
export type TipoConTope = 'COTIZACION' | 'PURCHASE_ORDER';

export const TIPOS_CON_TOPE: readonly TipoConTope[] = ['COTIZACION', 'PURCHASE_ORDER'];

export type UmbralesAprobacion = Partial<Record<TipoConTope, { desde: number }>>;

/** Tipo de entidad del flujo de autorización por monto. Las OC ya tienen su flujo («toda OC»). */
export const ENTITY_TYPE_DE_TOPE: Record<TipoConTope, string> = {
  COTIZACION: 'COTIZACION_MONTO',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
};

/** Etiqueta para los avisos. */
export const ETIQUETA_TOPE: Record<TipoConTope, string> = {
  COTIZACION: 'La cotización',
  PURCHASE_ORDER: 'La orden de compra',
};

/** Valor guardado → umbrales sanos. Tolera JSON roto, tipos desconocidos, negativos y textos. */
export function parsearUmbrales(raw: string | null | undefined): UmbralesAprobacion {
  if (raw == null || String(raw).trim() === '') return {};
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: UmbralesAprobacion = {};
  for (const tipo of TIPOS_CON_TOPE) {
    const entrada = (data as Record<string, unknown>)[tipo];
    const crudo = entrada && typeof entrada === 'object' ? (entrada as Record<string, unknown>)['desde'] : entrada;
    const desde = Number(crudo);
    if (Number.isFinite(desde) && desde > 0) out[tipo] = { desde };
  }
  return out;
}

/** ¿Este monto necesita la autorización de dirección? Sin tope configurado, nunca. */
export function requiereAutorizacion(umbrales: UmbralesAprobacion, tipo: TipoConTope, monto: unknown): boolean {
  const tope = umbrales[tipo]?.desde;
  if (tope == null) return false;
  const m = Number(monto);
  return Number.isFinite(m) && m >= tope;
}

/** Tipo de entidad sin el sufijo del flujo por monto (`COTIZACION_MONTO` → `COTIZACION`). */
export const tipoBase = (entityType: string): string => String(entityType).toUpperCase().replace(/_MONTO$/, '');

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

export function mensajeDeAutorizacion(tipo: TipoConTope, monto: number, yaSolicitada: boolean): string {
  return (
    `${ETIQUETA_TOPE[tipo]} es de ${MXN.format(monto)} y, por su monto, necesita la autorización de dirección. ` +
    (yaSolicitada
      ? 'Ya se pidió y sigue esperando su respuesta: te avisamos cuando la resuelva.'
      : 'Se la pedimos ahora: te avisamos cuando la resuelva.')
  );
}

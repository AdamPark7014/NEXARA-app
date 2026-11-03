/**
 * Abrir una sola cotización a quien no tiene el módulo, mientras dure su actividad (Velocidad Core, Ola 5).
 * Adam: «que se le habilite el módulo para que trabaje una sola cotización»; costo y margen no los ve.
 *
 * No pasa por las rutas de `cotizaciones`, que exponen costo, margen y `publicToken`, y permiten enviar y
 * ganar. Aquí solo se leen y se escriben concepto, unidad, cantidad y precio. Lo demás de cada partida
 * se conserva del servidor, porque guardar reemplaza todas las partidas y lo que no llegue se borra.
 *
 * Puro, con pruebas.
 */
import { isClosedStatus, normalizeActivityStatus, ACTIVITY_STATUS } from '../activities/activity-status.js';

export const MAX_PARTIDAS = 300;
const MAX_CANTIDAD = 100_000;
const MAX_PRECIO = 1_000_000_000;

export type EstadoAcceso = 'abierto' | 'revocado' | 'terminada';

/** Se calcula en cada petición: una actividad se cierra por muchos caminos, y también se reabre. */
export function estadoDelAcceso(a: { revocadoAt?: Date | string | null; actividad: { estatus?: string | null; deletedAt?: Date | string | null } }): EstadoAcceso {
  if (a.revocadoAt) return 'revocado';
  const { estatus, deletedAt } = a.actividad;
  if (deletedAt || isClosedStatus(estatus) || normalizeActivityStatus(estatus) === ACTIVITY_STATUS.POR_VALIDAR) return 'terminada';
  return 'abierto';
}

export type PartidaVisible = { id: number; name: string; unit: string | null; qty: number; unitPrice: number };
export type PartidaEnviada = { id?: number | null; name?: unknown; unit?: unknown; qty?: unknown; unitPrice?: unknown };

/** Lista blanca: ni costo, ni margen, ni proveedor salen de aquí. */
export function partidaVisible(p: { id: number; name: string; unit?: string | null; qty: number; unitPrice: unknown }): PartidaVisible {
  return { id: p.id, name: p.name, unit: p.unit ?? null, qty: p.qty, unitPrice: Number(p.unitPrice) };
}

export class PartidaInvalida extends Error {}
/** La partida ya no existe: otra persona guardó mientras tanto, y cada guardado rehace las partidas. */
export class CotizacionCambio extends Error {}

function limpia(p: PartidaEnviada) {
  const name = String(p.name ?? '').trim();
  if (!name) throw new PartidaInvalida('Cada partida necesita un concepto');
  if (name.length > 500) throw new PartidaInvalida('El concepto es demasiado largo');
  const qty = Number(p.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_CANTIDAD) throw new PartidaInvalida(`Revisa la cantidad de «${name.slice(0, 40)}»`);
  const unitPrice = Number(p.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_PRECIO) throw new PartidaInvalida(`Revisa el precio de «${name.slice(0, 40)}»`);
  return { name, qty, unitPrice, unit: String(p.unit ?? '').trim().slice(0, 40) || null };
}

/**
 * Las partidas a guardar: cada una conserva todo lo que trae del servidor (costo, proveedor, IEPS, grupo…)
 * y solo cambia lo que esta persona puede tocar.
 *
 * Con costo y margen, el servidor recalcula el precio y pisaría el que se escribió. Si cambió el precio
 * de una partida con margen, ese margen se quita: el precio escrito manda, el costo se queda, y quien pidió
 * el apoyo revisa el margen al enviar. Si no cambió, el margen sigue igual.
 */
export function mezclarPartidas<T extends { id: number; unitPrice: unknown; marginPercent?: unknown }>(existentes: T[], enviadas: PartidaEnviada[]) {
  if (enviadas.length > MAX_PARTIDAS) throw new PartidaInvalida('Son demasiadas partidas');
  const porId = new Map(existentes.map((p) => [p.id, p]));
  return enviadas.map((e) => {
    const c = limpia(e);
    if (e.id == null) return { ...c, category: 'Otros' };
    const base = porId.get(Number(e.id));
    if (!base) throw new CotizacionCambio('La cotización cambió');
    const cambioPrecio = Math.abs(Number(base.unitPrice) - c.unitPrice) >= 0.005;
    return { ...base, ...c, marginPercent: cambioPrecio ? null : base.marginPercent };
  });
}

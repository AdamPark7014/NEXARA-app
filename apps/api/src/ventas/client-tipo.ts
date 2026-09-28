/**
 * Clasificación de un cliente que ya existía, según dónde se usó.
 * La migración `20260928220000_sales_client_tipo` aplica la misma regla en SQL.
 *
 * - Cotización (salesClientId) → COMERCIAL, con la fecha de la cotización más reciente.
 * - Proyecto operativo ligado por el cliente de operación → PROYECTO.
 * - Actividad de servicio (coreKind servicio, o actividad con cliente y sin proyecto
 *   si todavía no traía tipo) → CORPORATIVO.
 * - Si hay más de un uso con la misma fecha, o no hay ninguno → COMERCIAL.
 */
import type { ClientSectorCode } from './client-sectors.js';

export type UsoCliente = {
  comercialAt?: Date | null;
  proyectoAt?: Date | null;
  corporativoAt?: Date | null;
};

export function tipoPorUso(uso: UsoCliente): ClientSectorCode {
  const marcas: Array<{ tipo: ClientSectorCode; en: number }> = [];
  if (uso.comercialAt) marcas.push({ tipo: 'COMERCIAL', en: uso.comercialAt.getTime() });
  if (uso.proyectoAt) marcas.push({ tipo: 'PROYECTO', en: uso.proyectoAt.getTime() });
  if (uso.corporativoAt) marcas.push({ tipo: 'CORPORATIVO', en: uso.corporativoAt.getTime() });
  if (!marcas.length) return 'COMERCIAL';
  const mejor = Math.max(...marcas.map((m) => m.en));
  const ganadores = marcas.filter((m) => m.en === mejor);
  if (ganadores.length !== 1) return 'COMERCIAL';
  return ganadores[0].tipo;
}

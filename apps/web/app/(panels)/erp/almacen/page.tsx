/**
 * Almacén de Core (`/erp/almacen`): el mismo inventario de `/erp/warehouse` (stock, movimientos,
 * lotes, valuación, conteos), ahora dentro de Core. En Core `/erp/warehouse` redirige aquí.
 * El flujo de almacén (reabastecimiento, empaques, kits) lo va llenando su frente de trabajo.
 */
export { default } from "../warehouse/page";

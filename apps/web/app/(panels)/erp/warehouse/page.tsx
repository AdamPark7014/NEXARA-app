"use client";

import { VistaAlmacen } from "./VistaAlmacen";

/**
 * Ruta antigua del almacén. La vista vive aparte porque una página de Next no puede
 * recibir props propias ni exportar otra cosa: `/erp/almacen` monta `VistaAlmacen`
 * en sus pestañas.
 */
export default function WarehousePage() {
  return <VistaAlmacen />;
}

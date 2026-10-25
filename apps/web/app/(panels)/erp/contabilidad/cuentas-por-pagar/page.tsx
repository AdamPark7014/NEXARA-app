"use client";

import CarteraView from "@/components/erp/CarteraView";
import { AccionPrimerPaso, DESTINOS } from "../_arranque";

/**
 * Cuentas por pagar — además de la cartera, el calendario de lo que sale
 * de caja los próximos 30 o 60 días.
 */
export default function CuentasPorPagarPage() {
  return (
    <CarteraView
      kind="cxp"
      title="Por pagar"
      subtitle=""
      emptyTitle="No hay nada por pagar."
      emptyDescription=""
      emptyAction={<AccionPrimerPaso destino={DESTINOS.proveedor} variante="secondary" />}
    />
  );
}

"use client";

import CarteraView from "@/components/erp/CarteraView";

/**
 * Cuentas por pagar — además de la cartera, el calendario de lo que sale
 * de caja los próximos 30 o 60 días.
 */
export default function CuentasPorPagarPage() {
  return (
    <CarteraView
      kind="cxp"
      title="Por pagar"
      subtitle="Qué debes, a quién y en qué fecha sale de caja."
      emptyTitle="No debes nada"
      emptyDescription="Cuando registres una factura de proveedor con saldo pendiente aparecerá aquí, con su fecha de pago."
    />
  );
}

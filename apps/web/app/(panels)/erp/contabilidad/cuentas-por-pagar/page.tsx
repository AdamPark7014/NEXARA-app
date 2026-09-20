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
      /* Igual que en Por cobrar: esto no se configura, se alimenta. El texto
         nombra el paso que hace aparecer el primer renglón. */
      emptyDescription="Esta pantalla se llena sola: registra en Facturación una factura de proveedor con saldo pendiente y aparecerá aquí, con su fecha de pago y el calendario de lo que sale de caja."
    />
  );
}

"use client";

import CarteraView from "@/components/erp/CarteraView";

/**
 * Cuentas por cobrar — la pregunta es quién debe, cuánto y desde cuándo.
 */
export default function CuentasPorCobrarPage() {
  return (
    <CarteraView
      kind="cxc"
      title="Por cobrar"
      subtitle="Quién te debe, cuánto y desde cuándo."
      emptyTitle="Nadie te debe nada"
      emptyDescription="Cuando emitas una factura con saldo pendiente aparecerá aquí, con sus días de vencimiento."
    />
  );
}

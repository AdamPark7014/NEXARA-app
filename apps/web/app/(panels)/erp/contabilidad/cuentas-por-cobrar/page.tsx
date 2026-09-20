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
      /* Vacío de «sin movimiento», no de «sin configurar»: la cartera no se
         captura aquí, se llena sola. Por eso el texto dice de dónde viene el
         primer renglón —Facturación— en vez de mandar a configurar algo. */
      emptyDescription="La cartera se llena sola: en cuanto emitas una factura con saldo pendiente desde Facturación, aparece aquí con sus días de vencimiento y su tramo de antigüedad."
    />
  );
}

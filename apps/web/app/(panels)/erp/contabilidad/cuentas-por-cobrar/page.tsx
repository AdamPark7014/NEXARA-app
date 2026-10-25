"use client";

import CarteraView from "@/components/erp/CarteraView";
import { AccionPrimerPaso, DESTINOS } from "../_arranque";

/**
 * Cuentas por cobrar — la pregunta es quién debe, cuánto y desde cuándo.
 */
export default function CuentasPorCobrarPage() {
  return (
    <CarteraView
      kind="cxc"
      title="Por cobrar"
      subtitle=""
      emptyTitle="Nadie te debe nada."
      emptyDescription=""
      emptyAction={<AccionPrimerPaso destino={DESTINOS.factura} variante="secondary" />}
    />
  );
}

"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";
import { ArmarFacturaIA } from "@/components/contabilidad/ArmarFacturaIA";

export default function ContabilidadFacturasPage() {
  return (
    <>
      <div style={{ padding: "12px 16px 0" }}>
        <ArmarFacturaIA />
      </div>
      <ContabilidadInvoicesView
        mode="all"
        title="Facturas"
        subtitle="Lo que emitiste y lo que te facturaron, con su saldo y su vencimiento."
      />
    </>
  );
}
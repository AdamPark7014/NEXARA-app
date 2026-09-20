"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function ContabilidadFacturasPage() {
  return (
    <ContabilidadInvoicesView
      mode="all"
      title="Facturas"
      subtitle="Lo que emitiste y lo que te facturaron, con su saldo y su vencimiento."
    />
  );
}

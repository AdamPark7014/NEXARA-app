"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function ContabilidadFacturasPage() {
  return (
    <ContabilidadInvoicesView
      mode="all"
      title="Facturas"
      subtitle="Bandeja emitidas/recibidas. Alerta Sin XML si falta CFDI; sin motor PAC nuevo."
    />
  );
}

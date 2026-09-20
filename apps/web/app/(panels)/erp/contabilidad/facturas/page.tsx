"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function ContabilidadFacturasPage() {
  return (
    <ContabilidadInvoicesView
      mode="all"
      title="Facturas"
      subtitle="Documentos emitidos y recibidos. El detalle se abre al elegir una fila."
    />
  );
}

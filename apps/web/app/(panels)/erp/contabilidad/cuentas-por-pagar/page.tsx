"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function CuentasPorPagarPage() {
  return (
    <ContabilidadInvoicesView
      mode="cxp"
      title="Por pagar"
      subtitle="Qué debes pagar y cuándo."
    />
  );
}

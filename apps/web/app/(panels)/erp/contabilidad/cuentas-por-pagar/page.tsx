"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function CuentasPorPagarPage() {
  return (
    <ContabilidadInvoicesView
      mode="cxp"
      title="Cuentas por pagar"
      subtitle="Aging de proveedores y calendario HOY / 7d / 30d."
    />
  );
}

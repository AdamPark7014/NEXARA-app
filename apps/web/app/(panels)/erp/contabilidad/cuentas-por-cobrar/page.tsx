"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function CuentasPorCobrarPage() {
  return (
    <ContabilidadInvoicesView
      mode="cxc"
      title="Cuentas por cobrar"
      subtitle="Aging de clientes sobre facturas de ingreso abiertas."
    />
  );
}

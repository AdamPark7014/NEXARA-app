"use client";

import ContabilidadInvoicesView from "@/components/erp/ContabilidadInvoicesView";

export default function CuentasPorCobrarPage() {
  return (
    <ContabilidadInvoicesView
      mode="cxc"
      title="Por cobrar"
      subtitle="Quién te debe y qué urge cobrar."
    />
  );
}

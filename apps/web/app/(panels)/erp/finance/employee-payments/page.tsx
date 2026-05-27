"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Finanzas"
      title="Pagos a personal"
      description="Nómina quincenal, finiquitos, bonos por proyecto, comisiones de venta y honorarios."
      icon="💼"
      capabilities={[
        { icon: "📅", title: "Nómina quincenal", description: "Cálculo IMSS/INFONAVIT/ISR, recibo CFDI 4.0, dispersión bancaria." },
        { icon: "🎯", title: "Comisiones", description: "Por ejecutivo y por proyecto cobrado, con regla configurable." },
        { icon: "🎁", title: "Bonos discrecionales", description: "Aprobación por Dirección con bitácora en audit log." },
        { icon: "📤", title: "Finiquitos", description: "Cálculo automático cuando RH marca baja." },
      ]}
      relatedLinks={[
        { href: "/erp/hr", label: "RRHH", icon: "👥" },
        { href: "/erp/banking", label: "Banca", icon: "🏦" },
      ]}
    />
  );
}

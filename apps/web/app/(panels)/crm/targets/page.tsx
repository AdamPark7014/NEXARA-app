"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Equipo y métricas"
      title="Cuotas y metas"
      description="Forecast trimestral, cuotas por ejecutivo, cumplimiento real y proyección. Base para comisiones."
      icon="🎯"
      capabilities={[
        { icon: "📅", title: "Cuota por periodo", description: "Mes, trimestre, año. Mix servicios vs productos." },
        { icon: "📈", title: "Cumplimiento en vivo", description: "% logrado vs objetivo, proyección al cierre." },
        { icon: "💰", title: "Comisiones calculadas", description: "Auto-cálculo según regla por ejecutivo y por tipo de venta." },
      ]}
      relatedLinks={[
        { href: "/crm/team", label: "Equipo de ventas", icon: "🧑‍💼" },
        { href: "/erp/finance/employee-payments", label: "Pagos a personal", icon: "💼" },
      ]}
    />
  );
}

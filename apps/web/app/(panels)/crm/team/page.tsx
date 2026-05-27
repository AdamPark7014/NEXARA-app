"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Equipo y métricas"
      title="Equipo de ventas"
      description="Gestión del equipo comercial: leads asignados, oportunidades en mano, cuotas y rendimiento individual."
      icon="🧑‍💼"
      capabilities={[
        { icon: "📊", title: "Tablero individual", description: "Pipeline, conversión y cierre por ejecutivo." },
        { icon: "🎯", title: "Asignación de leads", description: "Por territorio, vertical o round-robin." },
        { icon: "🏆", title: "Ranking", description: "Mes, trimestre y año. Sano sentido de competencia." },
      ]}
      relatedLinks={[
        { href: "/crm/targets", label: "Cuotas y metas", icon: "🎯" },
        { href: "/crm/reports", label: "Reportes", icon: "📊" },
      ]}
    />
  );
}

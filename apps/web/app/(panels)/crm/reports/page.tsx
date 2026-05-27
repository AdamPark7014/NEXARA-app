"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Equipo y métricas"
      title="Reportes comerciales"
      description="Análisis profundo de pipeline, conversión y cierre. Para Dirección Comercial y CEO."
      icon="📊"
      primaryAction={{ href: "/erp/executive", label: "Vista ejecutiva", icon: "📊" }}
      capabilities={[
        { icon: "🔬", title: "Análisis por etapa", description: "Tiempo medio en cada etapa del pipeline." },
        { icon: "🗺️", title: "Por vertical", description: "Servicios vs Productos vs Gobierno." },
        { icon: "📉", title: "Por qué perdimos", description: "Motivo de oportunidades caídas (precio, plazo, scope, competencia)." },
      ]}
      relatedLinks={[
        { href: "/crm/pipeline", label: "Pipeline", icon: "📊" },
        { href: "/erp/analytics/bi", label: "BI ERP", icon: "📈" },
      ]}
    />
  );
}

"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Tablero"
      title="Business Intelligence"
      description="Dashboards analíticos cross-módulo: rentabilidad por cliente, margen por línea de negocio, eficiencia operativa, conversión comercial."
      icon="📈"
      primaryAction={{ href: "/erp/executive", label: "Vista ejecutiva", icon: "📊" }}
      capabilities={[
        { icon: "💰", title: "Rentabilidad por cliente", description: "Top clientes por margen real (ingreso – costo OT – horas)." },
        { icon: "⚖️", title: "Servicios vs Productos", description: "Comparativa de las dos verticales: ingresos, margen, ciclo." },
        { icon: "🚀", title: "Eficiencia operativa", description: "OT por ingeniero, tiempo medio en sitio, evidencias rechazadas %." },
        { icon: "🎯", title: "Conversión comercial", description: "Lead → Calificado → Cotización → Cierre, por fuente y por ejecutivo." },
      ]}
      relatedLinks={[
        { href: "/erp/executive", label: "Vista ejecutiva", icon: "📊" },
        { href: "/crm/reports", label: "Reportes comerciales", icon: "📊" },
      ]}
    />
  );
}

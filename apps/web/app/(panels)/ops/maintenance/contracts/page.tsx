"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function MaintenanceContractsPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Servicio continuo"
      title="Contratos de servicio (detalle)"
      description="Vista detallada de cada contrato: cláusulas, SLA por equipo, anexos firmados, cronograma de visitas y facturación recurrente."
      icon="📑"
      primaryAction={{ href: "/ops/maintenance", label: "Ver cartera", icon: "🔧" }}
      capabilities={[
        { icon: "📜", title: "Cláusulas y anexos", description: "PDF firmado, vigencia, prórrogas, equipos incluidos línea por línea." },
        { icon: "⏱️", title: "SLA por equipo", description: "Tiempo de respuesta y solución acordado para POS, cámaras, redes, etc." },
        { icon: "📅", title: "Cronograma anual", description: "Visitas preventivas planificadas + ventana de bajo demanda." },
        { icon: "💰", title: "Facturación recurrente", description: "Disparador automático mensual hacia ERP · Facturación CFDI." },
      ]}
      relatedLinks={[
        { href: "/ops/maintenance", label: "Cartera de contratos", icon: "🔧" },
        { href: "/erp/invoicing", label: "Facturación CFDI", icon: "🧾" },
      ]}
    />
  );
}

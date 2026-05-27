"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function SupportSlaPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Soporte"
      title="Cumplimiento de SLA"
      description="Reporte por cliente, por prioridad y por agente. Detecta dónde estamos perdiendo tiempo de respuesta antes de que se note."
      icon="⏱️"
      capabilities={[
        { icon: "📊", title: "SLA por cliente", description: "% cumplimiento de cada cuenta en tiempo de respuesta y de solución." },
        { icon: "🚨", title: "Tickets vencidos", description: "Lista en vivo de los SLA que estamos a punto de romper o ya rompimos." },
        { icon: "👥", title: "Performance por agente", description: "MTTR, MTTF, tickets resueltos, satisfacción." },
        { icon: "💰", title: "Penalizaciones", description: "Cálculo automático de penalidades contractuales por incumplimiento." },
      ]}
      relatedLinks={[
        { href: "/ops/support", label: "Bandeja de soporte", icon: "🆘" },
        { href: "/ops/maintenance", label: "Contratos de mantenimiento", icon: "🔧" },
      ]}
    />
  );
}

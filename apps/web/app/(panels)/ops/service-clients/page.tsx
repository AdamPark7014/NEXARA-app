"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function ServiceClientsPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Servicio continuo"
      title="Clientes con contrato"
      description="Cuentas con servicio activo: Soriana, TOKS, UDLA y demás. Vista operativa enfocada en cumplir el SLA."
      icon="🏬"
      primaryAction={{ href: "/ops/maintenance", label: "Ver contratos", icon: "🔧" }}
      capabilities={[
        { icon: "🗂️", title: "Ficha del cliente", description: "Contratos vigentes, equipos instalados, contactos clave, historial de visitas." },
        { icon: "📅", title: "Calendario de visitas", description: "Visitas preventivas programadas y correctivas por demanda." },
        { icon: "📊", title: "Score de cumplimiento", description: "SLA por cliente, tiempo medio de respuesta, NPS interno." },
        { icon: "🚨", title: "Alertas activas", description: "Sitios caídos, OT vencidas, contratos por renovar." },
      ]}
      relatedLinks={[
        { href: "/ops/maintenance", label: "Mantenimiento", icon: "🔧" },
        { href: "/ops/noc", label: "NOC", icon: "📡" },
        { href: "/ops/support", label: "Soporte", icon: "🆘" },
      ]}
    />
  );
}

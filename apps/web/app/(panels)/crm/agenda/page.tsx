"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Pipeline"
      title="Agenda comercial"
      description="Llamadas, visitas, demos y seguimientos del equipo de ventas. Sincronizada con calendario personal."
      icon="📅"
      primaryAction={{ href: "/crm/leads", label: "Ver leads", icon: "✨" }}
      capabilities={[
        { icon: "📞", title: "Llamadas programadas", description: "Auto-discador integrado, registro de duración y resultado." },
        { icon: "🚗", title: "Visitas a cliente", description: "Ruta optimizada del día con Google Maps." },
        { icon: "🎯", title: "Demos remotas", description: "Google Meet / Zoom con templates listos." },
      ]}
      relatedLinks={[
        { href: "/crm/leads", label: "Leads", icon: "✨" },
        { href: "/crm/opportunities", label: "Oportunidades", icon: "🎯" },
      ]}
    />
  );
}

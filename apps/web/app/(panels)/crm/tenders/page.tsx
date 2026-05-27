"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Proyectos"
      title="Licitaciones públicas y privadas"
      description="Compranet, gobierno, contratos marco, RFP de privados. Calendario de cierres y propuestas en preparación."
      icon="📜"
      capabilities={[
        { icon: "🗓️", title: "Calendario de cierres", description: "Fechas límite de propuesta y junta de aclaraciones." },
        { icon: "📦", title: "Bases técnicas", description: "Repositorio de bases descargadas, anexos, fianzas requeridas." },
        { icon: "📊", title: "Histórico", description: "Ganadas, perdidas y motivo. Margen real vs estimado." },
      ]}
      relatedLinks={[
        { href: "/crm/opportunities", label: "Oportunidades", icon: "🎯" },
        { href: "/crm/templates", label: "Plantillas técnicas", icon: "📋" },
      ]}
    />
  );
}

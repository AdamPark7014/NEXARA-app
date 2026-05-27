"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Personas"
      title="KPIs de personas"
      description="Productividad, rotación, satisfacción, capacitación. La salud humana del equipo, no solo la financiera."
      icon="📊"
      capabilities={[
        { icon: "📈", title: "Productividad operativa", description: "OT cerradas / hora, evidencias rechazadas, tiempo medio en sitio." },
        { icon: "📉", title: "Rotación 12m", description: "Bajas voluntarias e involuntarias, motivo principal." },
        { icon: "❤️", title: "eNPS", description: "Encuestas trimestrales anónimas, evolución del clima." },
        { icon: "🎓", title: "Capacitación", description: "Horas certificadas por persona, cobertura del equipo." },
      ]}
      relatedLinks={[{ href: "/erp/hr", label: "RRHH", icon: "👥" }]}
    />
  );
}

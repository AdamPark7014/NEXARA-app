"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Personas"
      title="Asistencia"
      description="Check-in y check-out diario del equipo. Para ingenieros de campo, geolocalizado al sitio de la OT."
      icon="⏰"
      capabilities={[
        { icon: "📍", title: "Check-in geolocalizado", description: "Ubicación validada contra OT del día." },
        { icon: "⏱️", title: "Jornada y horas extra", description: "Cálculo automático para nómina." },
        { icon: "📊", title: "Reporte por persona", description: "Puntualidad, ausencias justificadas, horas reales." },
      ]}
      relatedLinks={[
        { href: "/erp/hr", label: "RRHH", icon: "👥" },
        { href: "/erp/hr/lunch-breaks", label: "Comidas y descansos", icon: "🥪" },
      ]}
    />
  );
}

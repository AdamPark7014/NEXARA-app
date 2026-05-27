"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Personas"
      title="Comidas y descansos"
      description="Registro del horario y duración de comida del personal, especialmente útil para ingenieros en campo (control de almuerzos prolongados)."
      icon="🥪"
      capabilities={[
        { icon: "🍽️", title: "Marca inicio/fin", description: "Botón rápido en la app móvil del ingeniero." },
        { icon: "📊", title: "Tiempo promedio", description: "Por ingeniero y por equipo para detectar abusos." },
        { icon: "⚠️", title: "Alertas", description: 'Almuerzos > 60 min llegan al coordinador con notificación.' },
      ]}
      relatedLinks={[
        { href: "/erp/hr/attendance", label: "Asistencia", icon: "⏰" },
        { href: "/ops/gps", label: "GPS en vivo", icon: "📍" },
      ]}
    />
  );
}

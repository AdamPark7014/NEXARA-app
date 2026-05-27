"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Mi cuenta"
      title="Mi calendario"
      description="Agenda personal con cruce automático de OT, citas comerciales, vacaciones y reuniones."
      icon="📅"
      capabilities={[
        { icon: "🔄", title: "Sincronización", description: "Google Calendar / Outlook sin perder eventos." },
        { icon: "🎯", title: "Fuentes automáticas", description: "Mis OT (OPS), mis citas (CRM), mis vacaciones (RH)." },
        { icon: "🤝", title: "Reuniones", description: "Crear meeting con compañeros internos viendo su disponibilidad." },
      ]}
      relatedLinks={[
        { href: "/ops/my-activities", label: "Mis actividades", icon: "🧰" },
        { href: "/crm/agenda", label: "Agenda comercial", icon: "📅" },
      ]}
    />
  );
}

"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function MyVehiclesPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Campo"
      title="Mis vehículos"
      description="Recibe la unidad firmando el estado, captura gasolina y reporta incidentes desde tu teléfono."
      icon="🚗"
      capabilities={[
        { icon: "📸", title: "Inspección inicial", description: "Fotos 360°, llanta, herramienta, daños previos antes de salir." },
        { icon: "⛽", title: "Carga de combustible", description: "Captura del ticket y kilometraje, validación automática." },
        { icon: "⚠️", title: "Reportar incidente", description: "Daño nuevo, accidente, falla mecánica — directo a Admin." },
        { icon: "🔚", title: "Entrega de unidad", description: "Firma de entrega al final del día, con kilómetros y nivel de gasolina." },
      ]}
      relatedLinks={[
        { href: "/ops/my-activities", label: "Mis actividades", icon: "🧰" },
        { href: "/ops/my-viatics", label: "Mis viáticos", icon: "💵" },
      ]}
    />
  );
}

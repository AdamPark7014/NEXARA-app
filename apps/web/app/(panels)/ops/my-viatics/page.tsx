"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function MyViaticsPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Campo"
      title="Mis viáticos"
      description="Solicita anticipos, captura tickets y comprueba gastos directo desde el campo."
      icon="💵"
      primaryAction={{ href: "/ops/my-activities", label: "Ir a mis OT", icon: "📋" }}
      capabilities={[
        { icon: "📝", title: "Solicitud rápida", description: "Solicita un anticipo en segundos asociado a la OT del día." },
        { icon: "🧾", title: "Captura de tickets", description: "Foto del ticket, OCR automático y categorización (gasolina, casetas, comida)." },
        { icon: "✅", title: "Comprobación flujo", description: "Tu coordinador y luego administración aprueban. Verás el estado en vivo." },
        { icon: "💳", title: "Reembolso transparente", description: "Sabrás exactamente cuánto debes/te deben al cierre de cada quincena." },
      ]}
      relatedLinks={[
        { href: "/ops/my-activities", label: "Mis actividades", icon: "🧰" },
        { href: "/ops/my-evidences", label: "Mis evidencias", icon: "📷" },
      ]}
    />
  );
}

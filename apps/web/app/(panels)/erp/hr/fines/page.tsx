"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Personas"
      title="Multas e incidencias"
      description="Sanciones administrativas con bitácora: faltas injustificadas, daño a vehículo, herramienta perdida, comportamiento."
      icon="⚠️"
      capabilities={[
        { icon: "📝", title: "Captura con evidencia", description: "PDF, fotos, testigo y descripción del hecho." },
        { icon: "💰", title: "Descuento a nómina", description: "Cuando aplique, se integra al cálculo del siguiente recibo." },
        { icon: "📋", title: "Historial por empleado", description: "Trazabilidad para evaluaciones y posibles despidos." },
      ]}
      relatedLinks={[
        { href: "/erp/hr", label: "RRHH", icon: "👥" },
        { href: "/erp/audit", label: "Audit log", icon: "🔍" },
      ]}
    />
  );
}

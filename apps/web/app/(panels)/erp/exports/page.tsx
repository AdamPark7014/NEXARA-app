"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Auditoría"
      title="Exportaciones"
      description="Centro único para reportes Excel/PDF globales del ERP, listos para Hacienda, auditoría externa o licitación."
      icon="📥"
      capabilities={[
        { icon: "📊", title: "Reportes maestros", description: "Estado de resultados, balance, ventas por cliente, OT por proyecto." },
        { icon: "🗓️", title: "Rango personalizado", description: "Por periodo, por empresa, por área operativa." },
        { icon: "🤖", title: "Programados", description: "Llegan al correo del CEO/Director cada lunes a las 7am." },
      ]}
      relatedLinks={[
        { href: "/erp/accounting", label: "Contabilidad", icon: "📒" },
        { href: "/erp/bi", label: "Business Intelligence", icon: "📈" },
      ]}
    />
  );
}

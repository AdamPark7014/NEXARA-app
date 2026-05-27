"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Proyectos"
      title="Proyectos de venta"
      description="Negocios ganados (cotización firmada) pendientes de handoff a OPS. Aquí cierras administrativamente la venta."
      icon="🏗️"
      primaryAction={{ href: "/ops/projects", label: "Ver proyectos OPS", icon: "🏗️" }}
      capabilities={[
        { icon: "✍️", title: "Cotización firmada", description: "PDF con e-firma archivada, fecha y monto." },
        { icon: "💰", title: "Anticipo cobrado", description: "Cuando hace falta antes de operar (proyectos > $300k)." },
        { icon: "🔁", title: "Handoff a OPS", description: "Crea proyecto operativo y notifica a Director Ops." },
      ]}
      relatedLinks={[
        { href: "/crm/quotes", label: "Cotizaciones", icon: "📝" },
        { href: "/ops/projects", label: "Proyectos operativos", icon: "🏗️" },
      ]}
    />
  );
}

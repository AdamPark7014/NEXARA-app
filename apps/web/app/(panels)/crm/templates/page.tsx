"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="CRM · Catálogo"
      title="Plantillas"
      description="Documentos y mensajes reutilizables: emails de seguimiento, PDFs de cotización, propuestas técnicas."
      icon="📋"
      capabilities={[
        { icon: "📨", title: "Templates de email", description: "Variables dinámicas (nombre cliente, monto, fecha)." },
        { icon: "📄", title: "Plantillas de cotización", description: "Diseñadas por Studio, con tu logo y datos fiscales." },
        { icon: "🎨", title: "Propuestas técnicas", description: "Para licitaciones, con secciones reutilizables." },
      ]}
      relatedLinks={[
        { href: "/crm/quotes", label: "Cotizaciones", icon: "📝" },
      ]}
    />
  );
}

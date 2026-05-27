"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Gobierno"
      title="Knowledge Base"
      description="Procedimientos, manuales técnicos, checklists, plantillas y políticas internas."
      icon="📚"
      capabilities={[
        { icon: "📖", title: "Wiki interna", description: "Markdown + búsqueda full-text. Categorías por área." },
        { icon: "🎓", title: "Onboarding", description: "Curso paso a paso para nuevos ingenieros y vendedores." },
        { icon: "📋", title: "Checklists operativos", description: 'P.ej. "Instalación CCTV residencial" con pasos firmados.' },
        { icon: "🔐", title: "Permisos finos", description: "Algunos artículos solo los puede ver Dirección o Contabilidad." },
      ]}
      relatedLinks={[
        { href: "/erp/hr", label: "RRHH", icon: "👥" },
        { href: "/erp/documents", label: "Documental", icon: "📂" },
      ]}
    />
  );
}

"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Logística"
      title="Gestión documental"
      description="Repositorio único de contratos, manuales, certificados, cartas, actas constitutivas, RPP, IMSS, etc."
      icon="📂"
      capabilities={[
        { icon: "🗂️", title: "Carpetas por entidad", description: "Cliente / Empleado / Proveedor / Empresa, con permisos finos." },
        { icon: "🔍", title: "Búsqueda full-text", description: "OCR de PDFs escaneados para encontrar cláusulas." },
        { icon: "🔔", title: "Vencimientos", description: "Pólizas, INE, licencias técnicas, certificaciones — alerta antes." },
        { icon: "🔐", title: "Firma electrónica", description: "Integración con e.firma SAT para acuses legales." },
      ]}
      relatedLinks={[
        { href: "/erp/companies", label: "Multi-empresa", icon: "🏛️" },
        { href: "/erp/kb", label: "Knowledge Base", icon: "📚" },
      ]}
    />
  );
}

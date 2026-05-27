"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Gobierno"
      title="Datos de la empresa"
      description="Configuración general: branding, logos, datos de facturación, certificados SAT, integraciones."
      icon="🏢"
      capabilities={[
        { icon: "🎨", title: "Branding", description: "Logos, colores corporativos, plantillas PDF de cotización/factura." },
        { icon: "🔑", title: "Certificados SAT", description: "Subida de .cer/.key con validación de vigencia." },
        { icon: "🔌", title: "Integraciones", description: "PAC, banco, Google Workspace, WhatsApp Business." },
      ]}
      relatedLinks={[{ href: "/erp/companies", label: "Multi-empresa", icon: "🏛️" }]}
    />
  );
}

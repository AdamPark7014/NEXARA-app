"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Gobierno"
      title="Multi-empresa"
      description="Si NEXARA opera con varias razones sociales (servicios, productos, contratación pública), aquí defines cada una y su jerarquía."
      icon="🏛️"
      capabilities={[
        { icon: "🏢", title: "Razones sociales", description: "RFC, régimen, domicilio fiscal, certificados de sello." },
        { icon: "📍", title: "Sucursales", description: "CEDIS Puebla, oficinas CDMX, almacenes secundarios." },
        { icon: "🔗", title: "Reglas inter-empresa", description: "Cobros entre empresas, traspasos de almacén, prorrateos." },
      ]}
      relatedLinks={[
        { href: "/erp/settings", label: "Datos de empresa", icon: "🏢" },
        { href: "/erp/accounting", label: "Contabilidad", icon: "📒" },
      ]}
    />
  );
}

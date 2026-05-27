"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="ERP · Finanzas"
      title="Gastos · Administración"
      description="Captura y autorización de gastos no operativos: renta, servicios, suscripciones, recurrentes."
      icon="💳"
      capabilities={[
        { icon: "📝", title: "Captura ágil", description: "Sube ticket o XML, OCR/CFDI parser asigna cuenta contable sugerida." },
        { icon: "🔄", title: "Recurrentes", description: "Renta, internet, electricidad, SaaS: se generan solos cada mes." },
        { icon: "✅", title: "Aprobación jerárquica", description: "Monto > $50k requiere Dirección Admin; > $500k requiere CEO." },
      ]}
      relatedLinks={[{ href: "/erp/accounting", label: "Contabilidad", icon: "📒" }]}
    />
  );
}

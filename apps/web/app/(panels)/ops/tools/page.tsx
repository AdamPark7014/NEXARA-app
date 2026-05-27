"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function ToolsPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Campo"
      title="Herramientas y kits"
      description="Préstamo y devolución de equipo de trabajo: probadores, taladros, escaleras, equipo de altura."
      icon="🛠️"
      capabilities={[
        { icon: "📋", title: "Catálogo de herramientas", description: "Inventario con número de serie, ubicación y estado." },
        { icon: "🎒", title: "Kits predefinidos", description: 'Kit "Instalación CCTV", "Cableado", "Mantenimiento POS" con un click.' },
        { icon: "↩️", title: "Préstamo y devolución", description: "Firma electrónica al sacar, foto del estado al regresar." },
        { icon: "🔍", title: "Auditoría", description: "Quién tiene qué, cuánto tiempo lo lleva fuera, cuánto se ha perdido." },
      ]}
      relatedLinks={[
        { href: "/erp/warehouse", label: "Almacén ERP", icon: "📦" },
      ]}
    />
  );
}

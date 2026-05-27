"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function AssetsPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Servicio continuo"
      title="Activos en campo"
      description="Inventario por cliente: cuántas cámaras, POS, switches, NVRs, impresoras tenemos desplegados y su estado."
      icon="📡"
      capabilities={[
        { icon: "🔢", title: "Inventario por sitio", description: "Equipo instalado por cliente y sucursal, con número de serie y fecha de instalación." },
        { icon: "🛡️", title: "Garantías", description: "Cobertura del fabricante y nuestra extendida, fecha de vencimiento." },
        { icon: "🩺", title: "Estado de salud", description: "Última lectura del NOC, fallas históricas, MTBF por modelo." },
        { icon: "🔁", title: "Reemplazo", description: "Tracker de RMAs y refacciones en tránsito." },
      ]}
      relatedLinks={[
        { href: "/ops/noc", label: "NOC monitoreo", icon: "📡" },
        { href: "/ops/maintenance", label: "Mantenimiento", icon: "🔧" },
      ]}
    />
  );
}

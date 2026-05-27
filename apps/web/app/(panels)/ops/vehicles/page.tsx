"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function VehiclesPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Campo"
      title="Flotilla de vehículos"
      description="Gestión de las camionetas asignadas a cuadrillas: bitácora, gasolina, mantenimiento y kilómetros."
      icon="🚐"
      primaryAction={{ href: "/ops/gps", label: "Ver GPS en vivo", icon: "📍" }}
      capabilities={[
        { icon: "📋", title: "Inventario de unidades", description: "Marca, modelo, placas, póliza, verificación vigente, kit asignado." },
        { icon: "🔑", title: "Asignación diaria", description: "Quién maneja qué unidad hoy, con firma electrónica de entrega/recepción." },
        { icon: "⛽", title: "Bitácora de gasolina", description: "Carga por unidad y por chofer, costo por km, alertas de consumo anómalo." },
        { icon: "🔧", title: "Servicios", description: "Próximo cambio de aceite, verificación, balanceo, alineación, etc." },
      ]}
      relatedLinks={[
        { href: "/ops/gps", label: "GPS en vivo", icon: "📍" },
        { href: "/ops/my-vehicles", label: "Mis vehículos", icon: "🚗" },
      ]}
    />
  );
}

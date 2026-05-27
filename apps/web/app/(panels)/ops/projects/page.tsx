"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function OpsProjectsPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Proyectos"
      title="Proyectos operativos"
      description="Venta ganada se convierte aquí en proyecto: alcance, cuadrilla, calendario, presupuesto y entregables."
      icon="🏗️"
      primaryAction={{ href: "/ops/activities", label: "Ver actividades", icon: "📋" }}
      capabilities={[
        { icon: "📐", title: "Alcance y entregables", description: "Lista de equipos, instalaciones y documentación a entregar." },
        { icon: "👥", title: "Cuadrilla asignada", description: "Líder técnico, ingenieros, soporte logístico y subcontratistas." },
        { icon: "📅", title: "Cronograma", description: "Gantt simple con dependencias entre OT del proyecto." },
        { icon: "💰", title: "Presupuesto vs real", description: "Margen vivo, alertas si nos pasamos del costo estimado." },
      ]}
      relatedLinks={[
        { href: "/ops/activities", label: "Actividades", icon: "📋" },
        { href: "/crm/projects", label: "Proyectos comerciales (CRM)", icon: "🏗️" },
      ]}
    />
  );
}

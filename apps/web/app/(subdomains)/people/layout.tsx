"use client";

import React from "react";
import MinimalPanelLayout from "@/components/MinimalPanelLayout";

const MENU = [
  { icon: "🏠", label: "Mi panel", href: "/", section: "Mi espacio" },
  { icon: "🏖️", label: "Vacaciones", href: "/my-vacation", section: "Mi espacio" },
  { icon: "⏱️", label: "Mi asistencia", href: "/my-attendance", section: "Mi espacio" },
  { icon: "👥", label: "Equipo", href: "/team", section: "Recursos Humanos" },
  { icon: "🗂️", label: "Organigrama", href: "/orgchart", section: "Recursos Humanos" },
  { icon: "📊", label: "KPIs RH", href: "/kpis", section: "Análisis" },
];

export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return (
    <MinimalPanelLayout
      panelName="People"
      panelTagline="people.nexara.com.mx · RRHH"
      panelIcon="👥"
      accentColor="#16a34a"
      baseHref="/people"
      menu={MENU}
    >
      {children}
    </MinimalPanelLayout>
  );
}

"use client";

import React from "react";
import MinimalPanelLayout from "@/components/MinimalPanelLayout";

const MENU = [
  { icon: "🏠", label: "Inicio", href: "/", section: "Helpdesk" },
  { icon: "🎟️", label: "Mis tickets", href: "/my-tickets", section: "Helpdesk" },
  { icon: "📝", label: "Nuevo ticket", href: "/new-ticket", section: "Helpdesk" },
  { icon: "📥", label: "Bandeja agente", href: "/inbox", section: "Para agentes" },
  { icon: "📚", label: "KB Interna", href: "/kb", section: "Conocimiento" },
  { icon: "📊", label: "Métricas SLA", href: "/sla", section: "Análisis" },
];

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <MinimalPanelLayout
      panelName="Helpdesk Interno"
      panelTagline="support.nexara.com.mx"
      panelIcon="🆘"
      accentColor="#dc2626"
      baseHref="/support"
      menu={MENU}
    >
      {children}
    </MinimalPanelLayout>
  );
}

"use client";

import React from "react";
import MinimalPanelLayout from "@/components/MinimalPanelLayout";

const MENU = [
  { icon: "📡", label: "Monitoreo en vivo", href: "/", section: "Operaciones NOC" },
  { icon: "🖥️", label: "Dispositivos", href: "/devices", section: "Operaciones NOC" },
  { icon: "🚨", label: "Alertas", href: "/alerts", section: "Operaciones NOC" },
  { icon: "📈", label: "Uptime histórico", href: "/uptime", section: "Análisis" },
];

export default function NocLayout({ children }: { children: React.ReactNode }) {
  return (
    <MinimalPanelLayout
      panelName="NOC"
      panelTagline="noc.nexara.com.mx · Monitoreo 24/7"
      panelIcon="📡"
      accentColor="#0891b2"
      baseHref="/noc"
      menu={MENU}
    >
      {children}
    </MinimalPanelLayout>
  );
}

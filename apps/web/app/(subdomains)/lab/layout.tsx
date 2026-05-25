"use client";

import React from "react";
import MinimalPanelLayout from "@/components/MinimalPanelLayout";

const MENU = [
  { icon: "🚀", label: "Inicio", href: "/", section: "Lab" },
  { icon: "🧪", label: "API Playground", href: "/api-playground", section: "Lab" },
  { icon: "🤖", label: "AI Sandbox", href: "/ai", section: "Experimentos" },
  { icon: "🚩", label: "Feature flags", href: "/flags", section: "Experimentos" },
  { icon: "📊", label: "System health", href: "/health", section: "Diagnóstico" },
];

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <MinimalPanelLayout
      panelName="Nexara Lab"
      panelTagline="lab.nexara.com.mx · Playground interno"
      panelIcon="🧪"
      accentColor="#8b5cf6"
      baseHref="/lab"
      menu={MENU}
    >
      {children}
    </MinimalPanelLayout>
  );
}

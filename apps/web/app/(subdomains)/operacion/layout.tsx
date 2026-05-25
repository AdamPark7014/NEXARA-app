"use client";

import styles from "../console/console.module.css";
import OperacionSidebar from "./OperacionSidebar";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "@/components/NotificationCenter";
import ConsoleWebPushRegister from "@/components/ConsoleWebPushRegister";
import GpsBackgroundTracker from "@/components/GpsBackgroundTracker";
import { setActivePanel } from "@/lib/panel-routing";

const formatOperacionTitle = (pathname: string) => {
  const normalized = pathname.replace(/^\/+/, "").split("?")[0];
  if (!normalized || normalized === "operacion") return "Resumen operativo";
  const segments = normalized.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "dashboard";
  const dictionary: Record<string, string> = {
    dashboard: "Resumen operativo",
    activities: "Actividades",
    evidences: "Evidencias de servicio",
    vehicles: "Control vehicular",
    viatics: "Viáticos operativos",
    gps: "Monitoreo GPS",
    tools: "Herramientas",
    "client-tickets": "Helpdesk / Tickets",
    "service-sheets": "Hojas de servicio",
    "service-clients": "Clientes con servicio",
    projects: "Proyectos de instalación",
    assets: "Activos instalados",
    maintenance: "Mantenimiento / SLA",
    "work-projects": "Rentabilidad por proyecto",
    "my-activities": "Mis actividades",
    "my-evidences": "Mis evidencias",
    "my-vehicles": "Mis vehículos",
    "my-viatics": "Mis viáticos",
  };
  return dictionary[last] || last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function OperacionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [viewSubtitle, setViewSubtitle] = useState("Operación NEXARA");
  const viewTitle = useMemo(() => formatOperacionTitle(pathname || "operacion"), [pathname]);

  useEffect(() => {
    const now = new Date();
    setViewSubtitle(
      `Operación NEXARA · ${now.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`,
    );
    setActivePanel("operacion");
  }, []);

  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }

  return (
    <div className={styles.consoleLayout}>
      <ConsoleWebPushRegister />
      <GpsBackgroundTracker />
      <OperacionSidebar />
      <main className={styles.consoleMain}>
        <section className={styles.consoleTopbar}>
          <p className={styles.consoleEyebrow}>Servicio en campo</p>
          <div className={styles.consoleTopbarRow}>
            <div className={styles.consoleTitleGroup}>
              <h1 className={styles.consoleViewTitle}>{viewTitle}</h1>
              <span className={styles.consoleViewMeta}>{viewSubtitle}</span>
            </div>
            <div className={styles.consoleTopbarActions}>
              <NotificationCenter
                inlineTrigger
                position="top-right"
                maxNotifications={5}
                autoCloseTime={6000}
                mirrorToSystemNotifications
              />
            </div>
          </div>
        </section>
        <div className={styles.consoleContent}>{children}</div>
      </main>
    </div>
  );
}

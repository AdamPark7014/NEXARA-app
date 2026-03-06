"use client";
import styles from "./console.module.css";
import Sidebar from "./Sidebar";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "@/components/NotificationCenter";

const formatConsoleTitle = (pathname: string) => {
  const normalized = pathname.replace(/^\/+/, "").split("?")[0];
  if (!normalized || normalized === "console") return "Resumen ejecutivo";
  const segments = normalized.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "dashboard";
  const dictionary: Record<string, string> = {
    dashboard: "Resumen ejecutivo",
    activities: "Operación de actividades",
    attendance: "Asistencia y jornadas",
    evidences: "Evidencias de servicio",
    vehicles: "Control vehicular",
    viatics: "Gestión de viáticos",
    fines: "Multas y sanciones",
    users: "Gestión de usuarios",
    clients: "Clientes corporativos",
    cotizaciones: "Cotizaciones",
    cvs: "Gestión de CVs",
    gps: "Monitoreo GPS",
    tools: "Herramientas internas",
    profile: "Perfil",
    "my-profile": "Mi perfil",
  };
  return dictionary[last] || last.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};


export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [viewSubtitle, setViewSubtitle] = useState("Consola NEXARA");
  const viewTitle = useMemo(() => formatConsoleTitle(pathname || "console"), [pathname]);

  useEffect(() => {
    const now = new Date();
    setViewSubtitle(`Consola NEXARA · ${now.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`);
  }, []);
  // Si estamos en /dashboard/login o /login, no renderizar el layout del dashboard
  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }
  return (
    <div className={styles.consoleLayout}>
      <Sidebar />
      <main className={styles.consoleMain}>
        <section className={styles.consoleTopbar}>
          <p className={styles.consoleEyebrow}>Panel corporativo</p>
          <div className={styles.consoleTopbarRow}>
            <div className={styles.consoleTitleGroup}>
              <h1 className={styles.consoleViewTitle}>{viewTitle}</h1>
              <span className={styles.consoleViewMeta}>{viewSubtitle}</span>
            </div>
            <div className={styles.consoleTopbarActions}>
              <NotificationCenter inlineTrigger position="top-right" maxNotifications={5} autoCloseTime={6000} />
            </div>
          </div>
        </section>
        <div className={styles.consoleContent}>{children}</div>
      </main>
    </div>
  );
}

"use client";
import styles from "./console.module.css";
import Sidebar from "./Sidebar";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "@/components/NotificationCenter";
import ConsoleWebPushRegister from "@/components/ConsoleWebPushRegister";
import GpsBackgroundTracker from "@/components/GpsBackgroundTracker";
import { setActivePanel } from "@/lib/panel-routing";

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
    "my-activities": "Mis actividades",
    "my-evidences": "Mis evidencias",
    "my-vehicles": "Mis vehículos",
    "my-viatics": "Mis viáticos",
    "lunch-breaks": "Breaks y comidas",
    "client-tickets": "Tickets de clientes",
    "gestion-vendedores": "Gestión comercial",
    warehouse: "Almacenes",
    stock: "Inventario / Stock",
    procurement: "Compras y requisiciones",
    assets: "Activos instalados",
    maintenance: "Contratos de mantenimiento",
    accounting: "Contabilidad general",
    invoicing: "Facturación CFDI",
    banking: "Banca y conciliaciones",
    documents: "Gestión documental",
    audit: "Auditoría",
    analytics: "BI y Analytics",
    "employee-payments": "Nómina y pagos",
    expenses: "Gastos operativos",
    "work-projects": "Proyectos de obra",
    news: "Noticias y comunicados",
    "contact-messages": "Mensajes de contacto",
    "service-clients": "Clientes de servicio",
    projects: "Proyectos operacionales",
    newsletter: "Newsletter",
    "my-lunch-breaks": "Mis breaks y comidas",
    settings: "Configuración del sistema",
  };
  return dictionary[last] || last.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};


export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [viewSubtitle, setViewSubtitle] = useState("Administración NEXARA");
  const viewTitle = useMemo(() => formatConsoleTitle(pathname || "console"), [pathname]);

  useEffect(() => {
    const now = new Date();
    setViewSubtitle(`Administración NEXARA · ${now.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`);
    setActivePanel("console");
  }, []);
  // Si estamos en rutas de autenticacion, no renderizar shell de consola
  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }
  return (
    <div className={styles.consoleLayout}>
      <ConsoleWebPushRegister />
      <GpsBackgroundTracker />
      <Sidebar />
      <main className={styles.consoleMain}>
        <section className={styles.consoleTopbar}>
          <p className={styles.consoleEyebrow}>Backoffice corporativo</p>
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

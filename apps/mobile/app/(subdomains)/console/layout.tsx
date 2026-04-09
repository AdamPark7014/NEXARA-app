"use client";
import styles from "./console.module.css";
import Sidebar from "./Sidebar";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "@/components/NotificationCenter";
import { isCapacitorNative } from "@/lib/capacitor-env";
import BottomNav from "@/components/BottomNav";
import type { BottomNavItem } from "@/components/BottomNav";
import PageTransition from "@/components/PageTransition";
import GpsBackgroundTracker from "@/components/GpsBackgroundTracker";
import { setActivePanel } from "@/lib/panel-routing";
import { useUser } from "@/components/UserContext";
import { isPlatformAdmin } from "@/lib/panel-user";
import { useCompactBottomNav } from "@/lib/use-compact-bottom-nav";

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
    manufacturing: "Manufactura / BOM",
    production: "Órdenes de producción",
    quality: "Control de calidad",
    assets: "Activos y equipos",
    maintenance: "Órdenes de mantenimiento",
    accounting: "Contabilidad general",
    invoicing: "Facturación CFDI",
    banking: "Banca y conciliaciones",
    safety: "Seguridad industrial",
    documents: "Gestión documental",
    workflow: "Flujos de aprobación",
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
  const { user } = useUser();
  const [viewSubtitle, setViewSubtitle] = useState("Consola NEXARA");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const showCompactBottomNav = useCompactBottomNav();
  const [nativeShell, setNativeShell] = useState<boolean | null>(null);
  const viewTitle = useMemo(() => formatConsoleTitle(pathname || "console"), [pathname]);
  const inPrefixedConsolePath = Boolean(pathname && pathname.startsWith("/console"));
  const role = String(user?.role || "").toLowerCase();
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isAdmin = Boolean(user) && !isSuperAdmin && isPlatformAdmin(user);
  const isIngeniero = Boolean(user) && !isSuperAdmin && !isAdmin && role.includes("ingenier");
  const resolveConsoleRoute = (shortHref: string) => {
    if (!shortHref.startsWith("/")) return shortHref;
    if (shortHref === "/paneles" || shortHref === "/login") return shortHref;
    return inPrefixedConsolePath ? `/console${shortHref}` : shortHref;
  };

  const bottomNavItems = useMemo(() => {
    const items: BottomNavItem[] = [
      { icon: "📊", label: "Inicio", href: resolveConsoleRoute("/dashboard"), hapticIntent: "selection" },
    ];

    if (isIngeniero) {
      items.push({ icon: "📋", label: "Actividades", href: resolveConsoleRoute("/my-activities"), hapticIntent: "selection" });
      items.push({ icon: "👤", label: "Perfil", href: resolveConsoleRoute("/my-profile"), hapticIntent: "selection" });
    } else if (!isSuperAdmin && !isAdmin) {
      items.push({ icon: "🧾", label: "Cotizaciones", href: resolveConsoleRoute("/cotizaciones"), hapticIntent: "selection" });
      items.push({ icon: "📄", label: "CVs", href: resolveConsoleRoute("/cvs"), hapticIntent: "selection" });
    } else {
      items.push({ icon: "🗂️", label: "Operación", href: resolveConsoleRoute("/activities"), hapticIntent: "selection" });
      items.push({ icon: "🧑‍💼", label: "Usuarios", href: resolveConsoleRoute("/users"), hapticIntent: "selection" });
    }

    items.push({ icon: "🕒", label: "Asistencia", href: resolveConsoleRoute("/attendance"), hapticIntent: "selection" });
    items.push({
      icon: drawerOpen ? "✕" : "☰",
      label: drawerOpen ? "Cerrar" : "Menú",
      onPress: () => setDrawerOpen((prev) => !prev),
      hapticIntent: "medium",
      active: drawerOpen,
    });

    return items;
  }, [isIngeniero, isSuperAdmin, isAdmin, inPrefixedConsolePath, drawerOpen]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const now = new Date();
    setViewSubtitle(`Consola NEXARA · ${now.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`);
    setActivePanel("console");
  }, []);

  useEffect(() => {
    setNativeShell(isCapacitorNative());
  }, []);
  // Si estamos en rutas de autenticacion, no renderizar shell de consola
  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }
  return (
    <div className={styles.consoleLayout}>
      <GpsBackgroundTracker />
      <Sidebar mobileOpen={drawerOpen} onMobileClose={() => setDrawerOpen(false)} />
      <main className={styles.consoleMain}>
        <section className={styles.consoleTopbar}>
          <p className={styles.consoleEyebrow}>Panel corporativo</p>
          <div className={styles.consoleTopbarRow}>
            <div className={styles.consoleTitleGroup}>
              <h1 className={styles.consoleViewTitle}>{viewTitle}</h1>
              <span className={styles.consoleViewMeta}>{viewSubtitle}</span>
            </div>
            <div className={styles.consoleTopbarActions}>
              {nativeShell === null ? null : (
                <NotificationCenter
                  inlineTrigger
                  position="top-right"
                  maxNotifications={5}
                  autoCloseTime={6000}
                  mirrorToSystemNotifications={!nativeShell}
                />
              )}
            </div>
          </div>
        </section>
        <div className={styles.consoleContent}><PageTransition>{children}</PageTransition></div>
        {isMobile && showCompactBottomNav && (
          <>
            <div style={{ height: 96, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
          </>
        )}
      </main>
      {isMobile && showCompactBottomNav && <BottomNav items={bottomNavItems} />}
    </div>
  );
}

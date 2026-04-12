"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import VentasSidebar from "./VentasSidebar";
import BottomNav from "@/components/BottomNav";
import PageTransition from "@/components/PageTransition";
import styles from "./layout.module.css";
import { useUser } from "@/components/UserContext";
import { setActivePanel } from "@/lib/panel-routing";
import { getRoleLabel, isSalesManagerUser } from "@/lib/panel-user";
import { getSalesVendorStats, type SalesVendorStats } from "@/lib/sales-api";
import { hapticTap } from "@/lib/haptics";
import { useCompactBottomNav } from "@/lib/use-compact-bottom-nav";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import consoleStyles from "../console/console.module.css";

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const canManageSellers = isSalesManagerUser(user);
  const roleLabel = getRoleLabel(user);
  const [workspaceDateLabel, setWorkspaceDateLabel] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeVentasDrawer = useCallback(() => setDrawerOpen(false), []);
  const [isNarrowShell, setIsNarrowShell] = useState(false);
  const showCompactBottomNav = useCompactBottomNav();
  const [vendorStats, setVendorStats] = useState<SalesVendorStats[]>([]);
  const normalizedUserId = user?.id ? Number(user.id) : undefined;
  const filteredVendorStats =
    canManageSellers && user?.isSuperAdmin && normalizedUserId
      ? vendorStats.filter((v) => v.userId !== normalizedUserId)
      : vendorStats;
  const selectedOwnerId =
    typeof window === "undefined"
      ? undefined
      : Number(new URLSearchParams(window.location.search).get("ownerId") || 0) || undefined;
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const inPrefixedVentasPath = Boolean(pathname && pathname.startsWith("/ventas"));

  const resolveVentasHref = (href: string) => {
    if (!href.startsWith("/")) return href;
    if (href === "/paneles" || href === "/login") return href;
    if (href === "/ventas" || href.startsWith("/ventas/")) return href;
    return inPrefixedVentasPath ? `/ventas${href}` : href;
  };

  const selectedVendorName = canManageSellers && selectedOwnerId
    ? filteredVendorStats.find((v) => v.userId === selectedOwnerId)?.userName
    : undefined;

  const withOwnerFilter = (href: string, ownerId?: number) => {
    const value = ownerId ?? selectedOwnerId;
    if (!canManageSellers || !value) return href;
    return `${href}?ownerId=${value}`;
  };

  const quickLinks = useMemo(
    () => [
      ...(canManageSellers ? [{ label: "Gestión Vendedores", href: resolveVentasHref("/gestion-vendedores") }] : []),
      ...(canManageSellers ? [{ label: "Resumen equipo", href: resolveVentasHref("/my-profile") }] : []),
      ...(!canManageSellers ? [{ label: "Mi perfil", href: resolveVentasHref("/my-profile") }] : []),
      { label: "Dashboard", href: resolveVentasHref("/dashboard") },
      { label: "Leads", href: resolveVentasHref("/leads") },
      { label: "Oportunidades", href: resolveVentasHref("/oportunidades") },
      { label: "Clientes", href: resolveVentasHref("/clientes") },
      { label: "Proyectos", href: resolveVentasHref("/proyectos") },
      { label: "Cotizaciones", href: resolveVentasHref("/cotizaciones") },
      ...(canManageSellers ? [{ label: "Reportes", href: resolveVentasHref("/reportes") }] : []),
    ],
    [canManageSellers, inPrefixedVentasPath],
  );

  const ventasShortcutStrip = useMemo(() => {
    const dash = resolveVentasHref("/dashboard");
    const op = resolveVentasHref("/oportunidades");
    const cli = resolveVentasHref("/clientes");
    const cot = resolveVentasHref("/cotizaciones");
    return [
      { icon: "📊", label: "Dashboard", href: withOwnerFilter(dash) },
      { icon: "💼", label: "Oportunidades", href: withOwnerFilter(op) },
      { icon: "👥", label: "Clientes", href: withOwnerFilter(cli) },
      { icon: "📄", label: "Cotizaciones", href: withOwnerFilter(cot) },
    ];
  }, [inPrefixedVentasPath, canManageSellers, selectedOwnerId]);

  const activeLabel = quickLinks.find((item) => {
    const itemPath = item.href.replace(/\/+$/, "");
    return currentPath === itemPath || currentPath.endsWith(itemPath);
  })?.label || "Panel comercial";

  useEffect(() => {
    setWorkspaceDateLabel(new Date().toLocaleDateString("es-MX"));
    setActivePanel("ventas");
  }, []);

  useEffect(() => {
    const update = () => setIsNarrowShell(isPanelDrawerViewport(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!canManageSellers || !user?.token) {
      setVendorStats([]);
      return;
    }

    const loadVendorStats = async () => {
      try {
        const data = await getSalesVendorStats(user.token, "month");
        setVendorStats(data);
      } catch {
        setVendorStats([]);
      }
    };

    loadVendorStats();
  }, [canManageSellers, user?.token]);

  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <>{children}</>;
  }

  return (
    <div className={`${consoleStyles.consoleLayout} ${styles.salesRoot}`}>
      <VentasSidebar
        mobileOpen={drawerOpen}
        onMobileClose={closeVentasDrawer}
        shortcutStrip={isNarrowShell && !showCompactBottomNav ? ventasShortcutStrip : undefined}
      />
      <main
        className={styles.salesMain}
      >
        <section className={styles.salesWorkspace}>
          <div className={styles.salesWorkspaceHeader}>
            <div>
              <p className={styles.salesWorkspaceKicker}>Panel ventas</p>
              <h1 className={styles.salesWorkspaceTitle}>{activeLabel}</h1>
              <p className={styles.salesWorkspaceSubtitle}>
                {canManageSellers
                  ? "Vista de gestión por vendedor: supervisa avances, carga operativa y resultados por usuario en cada módulo."
                  : "Pipeline comercial con seguimiento operativo para cerrar más oportunidades con mayor velocidad."}
              </p>
            </div>
            <div className={styles.salesWorkspaceMeta}>
              <span className={styles.salesWorkspacePill}>{user?.nombre || "Equipo comercial"}</span>
              <span className={styles.salesWorkspacePill}>{roleLabel}</span>
              {canManageSellers && (
                <span className={styles.salesWorkspacePill}>
                  Viendo: {selectedVendorName || "Todos"}
                </span>
              )}
              <span className={styles.salesWorkspacePill}>{workspaceDateLabel}</span>
            </div>
          </div>

          <div className={styles.salesQuickLinks}>
            {quickLinks.map((item) => {
              const itemPath = item.href.replace(/\/+$/, "");
              const isActive = currentPath === itemPath || currentPath.endsWith(itemPath);
              return (
                <Link
                  key={`quick-${item.href}`}
                  href={withOwnerFilter(item.href)}
                  className={`${styles.salesQuickLink} ${isActive ? styles.salesQuickLinkActive : ""}`}
                  onClick={() => {
                    void hapticTap("selection");
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {canManageSellers && (
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Division por vendedor (mes actual)</div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                <Link href={withOwnerFilter(pathname || resolveVentasHref("/dashboard"))} style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      border: selectedOwnerId ? "1px solid rgba(120,120,120,0.25)" : "2px solid rgba(20,120,220,0.7)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Todos los vendedores</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Vista global del equipo</div>
                  </div>
                </Link>
                {filteredVendorStats.map((vendor) => (
                  <Link key={vendor.userId} href={withOwnerFilter(pathname || resolveVentasHref("/dashboard"), vendor.userId)} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        border: selectedOwnerId === vendor.userId ? "2px solid rgba(20,120,220,0.7)" : "1px solid rgba(120,120,120,0.25)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{vendor.userName}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Vendedor</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Oportunidades: {vendor.opportunities}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Proyectos: {vendor.projects}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Performance: {vendor.performance}%</div>
                    </div>
                  </Link>
                ))}
                {filteredVendorStats.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>No hay métricas por vendedor disponibles.</div>
                )}
              </div>
            </div>
          )}

          <div className={styles.salesWorkspaceContent}><PageTransition>{children}</PageTransition></div>
        </section>
      </main>
      {isNarrowShell && showCompactBottomNav && (
        <BottomNav
          items={[
            { icon: "📊", label: "Dashboard", href: withOwnerFilter(resolveVentasHref("/dashboard")), hapticIntent: "selection" },
            { icon: "💼", label: "Oportunidades", href: withOwnerFilter(resolveVentasHref("/oportunidades")), hapticIntent: "selection" },
            { icon: "👥", label: "Clientes", href: withOwnerFilter(resolveVentasHref("/clientes")), hapticIntent: "selection" },
            { icon: "📄", label: "Cotizaciones", href: withOwnerFilter(resolveVentasHref("/cotizaciones")), hapticIntent: "selection" },
            { icon: "☰", label: "Menú", onPress: () => setDrawerOpen(true), hapticIntent: "medium" },
          ]}
        />
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import VentasSidebar from "./VentasSidebar";
import styles from "./layout.module.css";
import { useUser } from "@/components/UserContext";
import { getRoleLabel, isSalesManagerUser } from "@/lib/panel-user";
import { getSalesVendorStats, type SalesVendorStats } from "@/lib/sales-api";

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const canManageSellers = isSalesManagerUser(user);
  const roleLabel = getRoleLabel(user);
  const [workspaceDateLabel, setWorkspaceDateLabel] = useState("");
  const [vendorStats, setVendorStats] = useState<SalesVendorStats[]>([]);
  const selectedOwnerId =
    typeof window === "undefined"
      ? undefined
      : Number(new URLSearchParams(window.location.search).get("ownerId") || 0) || undefined;
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const normalizedUserId = user?.id ? Number(user.id) : undefined;
  const filteredVendorStats = canManageSellers && user?.isSuperAdmin && normalizedUserId
    ? vendorStats.filter((v) => v.userId !== normalizedUserId)
    : vendorStats;

  const selectedVendorName = canManageSellers && selectedOwnerId
    ? filteredVendorStats.find((v) => v.userId === selectedOwnerId)?.userName
    : undefined;

  const withOwnerFilter = (href: string, ownerId?: number) => {
    const value = ownerId ?? selectedOwnerId;
    if (!canManageSellers || !value) return href;
    return `${href}?ownerId=${value}`;
  };

  const quickLinks = [
    ...(canManageSellers ? [{ label: "Gestión Vendedores", href: "/gestion-vendedores" }] : []),
    ...(!canManageSellers ? [{ label: "Mi perfil", href: "/my-profile" }] : []),
    { label: "Dashboard", href: "/dashboard" },
    { label: "Leads", href: "/leads" },
    { label: "Oportunidades", href: "/oportunidades" },
    { label: "Clientes", href: "/clientes" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Cotizaciones", href: "/cotizaciones" },
    ...(canManageSellers ? [{ label: "Reportes", href: "/reportes" }] : []),
  ];

  const activeLabel = quickLinks.find((item) => {
    const itemPath = item.href.replace(/\/+$/, "");
    return currentPath === itemPath || currentPath.endsWith(itemPath);
  })?.label || "Panel comercial";

  useEffect(() => {
    setWorkspaceDateLabel(new Date().toLocaleDateString("es-MX"));
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
    <div className={styles.salesRoot}>
      <VentasSidebar />
      <main className={styles.salesMain}>
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
                <Link key={`quick-${item.href}`} href={withOwnerFilter(item.href)} className={`${styles.salesQuickLink} ${isActive ? styles.salesQuickLinkActive : ""}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>

          {canManageSellers && (
            <div className={styles.vendorSection}>
              <div className={styles.vendorSectionLabel}>Division por vendedor (mes actual)</div>
              <div className={styles.vendorGrid}>
                <Link href={pathname || "/dashboard"} className={`${styles.vendorCard} ${!selectedOwnerId ? styles.vendorCardActive : ""}`}>
                  <div className={styles.vendorCardName}>Todos los vendedores</div>
                  <div className={styles.vendorCardMeta}>Vista global del equipo</div>
                </Link>
                {filteredVendorStats.map((vendor) => (
                  <Link key={vendor.userId} href={withOwnerFilter(pathname || "/dashboard", vendor.userId)} className={`${styles.vendorCard} ${selectedOwnerId === vendor.userId ? styles.vendorCardActive : ""}`}>
                    <div className={styles.vendorCardName}>{vendor.userName}</div>
                    <div className={styles.vendorCardMeta}>Oportunidades: {vendor.opportunities}</div>
                    <div className={styles.vendorCardMeta}>Proyectos: {vendor.projects}</div>
                    <div className={styles.vendorCardMeta}>Performance: {vendor.performance}%</div>
                  </Link>
                ))}
                {filteredVendorStats.length === 0 && (
                  <div className={styles.vendorCardEmpty}>No hay métricas por vendedor disponibles.</div>
                )}
              </div>
            </div>
          )}

          <div className={styles.salesWorkspaceContent}>{children}</div>
        </section>
      </main>
    </div>
  );
}

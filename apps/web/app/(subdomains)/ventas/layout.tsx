"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import VentasSidebar from "./VentasSidebar";
import styles from "./layout.module.css";
import { useUser } from "@/components/UserContext";
import { isSalesManagerUser } from "@/lib/panel-user";
import { getSalesVendorStats, type SalesVendorStats } from "@/lib/sales-api";

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const canManageSellers = isSalesManagerUser(user);
  const [workspaceDateLabel, setWorkspaceDateLabel] = useState("");
  const [vendorStats, setVendorStats] = useState<SalesVendorStats[]>([]);
  const selectedOwnerId =
    typeof window === "undefined"
      ? undefined
      : Number(new URLSearchParams(window.location.search).get("ownerId") || 0) || undefined;
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const withOwnerFilter = (href: string, ownerId?: number) => {
    const value = ownerId ?? selectedOwnerId;
    if (!canManageSellers || !value) return href;
    return `${href}?ownerId=${value}`;
  };

  const quickLinks = [
    ...(canManageSellers ? [{ label: "Gestión Vendedores", href: "/gestion-vendedores" }] : []),
    { label: "Dashboard", href: "/dashboard" },
    { label: "Leads", href: "/leads" },
    { label: "Oportunidades", href: "/oportunidades" },
    { label: "Clientes", href: "/clientes" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Cotizaciones", href: "/cotizaciones" },
    { label: "Reportes", href: "/reportes" },
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
              {canManageSellers && <span className={styles.salesWorkspacePill}>Modo gestor</span>}
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
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Division por vendedor (mes actual)</div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                <Link href={pathname || "/dashboard"} style={{ textDecoration: "none" }}>
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
                {vendorStats.map((vendor) => (
                  <Link key={vendor.userId} href={withOwnerFilter(pathname || "/dashboard", vendor.userId)} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        border: selectedOwnerId === vendor.userId ? "2px solid rgba(20,120,220,0.7)" : "1px solid rgba(120,120,120,0.25)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{vendor.userName}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Oportunidades: {vendor.opportunities}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Proyectos: {vendor.projects}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Performance: {vendor.performance}%</div>
                    </div>
                  </Link>
                ))}
                {vendorStats.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>No hay métricas por vendedor disponibles.</div>
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

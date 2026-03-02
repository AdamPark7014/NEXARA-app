"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import VentasSidebar from "./VentasSidebar";
import styles from "./layout.module.css";
import { useUser } from "@/components/UserContext";

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";

  const quickLinks = [
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
  
  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <main className={styles.salesMain}>{children}</main>;
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
                Pipeline comercial con seguimiento operativo para cerrar más oportunidades con mayor velocidad.
              </p>
            </div>
            <div className={styles.salesWorkspaceMeta}>
              <span className={styles.salesWorkspacePill}>{user?.nombre || "Equipo comercial"}</span>
              <span className={styles.salesWorkspacePill}>{new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <div className={styles.salesQuickLinks}>
            {quickLinks.map((item) => {
              const itemPath = item.href.replace(/\/+$/, "");
              const isActive = currentPath === itemPath || currentPath.endsWith(itemPath);
              return (
                <Link key={`quick-${item.href}`} href={item.href} className={`${styles.salesQuickLink} ${isActive ? styles.salesQuickLinkActive : ""}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className={styles.salesWorkspaceContent}>{children}</div>
        </section>
      </main>
    </div>
  );
}

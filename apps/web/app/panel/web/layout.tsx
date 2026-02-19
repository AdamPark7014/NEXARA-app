"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import styles from "./layout.module.css";

export default function WebPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [hydrated, setHydrated] = useState(false);
  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const isWebPanelRoute = Boolean(pathname && pathname.startsWith("/panel/web"));
  const isLoginRoute = Boolean(pathname && pathname.startsWith("/panel/web/login"));

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !isWebPanelRoute) return;
    if (!user && !isLoginRoute) {
      router.replace("/panel/web/login");
      return;
    }
    if (user && isLoginRoute) {
      router.replace("/panel/web/dashboard");
    }
  }, [hydrated, isWebPanelRoute, isLoginRoute, user, router]);
  const navItems = [
    { label: "Dashboard", href: "/panel/web/dashboard" },
    { label: "Clientes", href: "/panel/web/clientes" },
    { label: "Proyectos", href: "/panel/web/proyectos" },
    { label: "Contactos", href: "/panel/web/contactos" },
    { label: "Noticias", href: "/panel/web/noticias" },
  ];
  // Solo mostrar el sidebar en rutas /panel/web/*
  if (!pathname || !pathname.startsWith("/panel/web")) {
    return <main className={styles.webPanelMain}>{children}</main>;
  }
  if (isLoginRoute) {
    return <main className={styles.webPanelMain}>{children}</main>;
  }
  return (
    <div className={styles.webPanelRoot}>
      <aside className={styles.webPanelSidebar}>
        <div className={styles.webPanelBrand}>
          <div className={styles.brandMark}>NEXARA</div>
          <div className={styles.brandSub}>Panel Web</div>
        </div>
        <div className={styles.webPanelDivider} />
        <div className={styles.webPanelMenuTitle}>Menu principal</div>
        <div className={styles.webPanelNavShell}>
          <nav className={styles.webPanelNav}>
            {navItems.map((item, index) => {
              const itemPath = item.href.replace(/\/+$/, "");
              const isActive =
                itemPath === currentPath ||
                (itemPath === "/panel/web/dashboard" && currentPath === "/panel/web");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${isActive ? styles.active : ""}`}
                  style={{ animationDelay: `${0.08 + index * 0.05}s` }}
                >
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navPulse} />
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={styles.webPanelFooter}>
          <span>Estado</span>
          <strong>Online</strong>
        </div>
      </aside>
      <main className={styles.webPanelMain}>{children}</main>
    </div>
  );
}

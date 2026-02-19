"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import styles from "./layout.module.css";

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [hydrated, setHydrated] = useState(false);

  const currentPath = pathname ? pathname.replace(/\/+$/, "") : "";
  const isPanelRoute = Boolean(pathname && pathname.startsWith("/panel/contabilidad"));
  const isLoginRoute = Boolean(pathname && pathname.startsWith("/panel/contabilidad/login"));
  const canAccess = Boolean(user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.CONTABILIDAD_VIEW)));

  const navItems = [
    { label: "Dashboard", href: "/panel/contabilidad/dashboard" },
    { label: "Viaticos", href: "/panel/contabilidad/viaticos" },
    { label: "Multas", href: "/panel/contabilidad/multas" },
    { label: "Horas", href: "/panel/contabilidad/horas" },
    { label: "Pagos", href: "/panel/contabilidad/pagos" },
    { label: "Proyectos", href: "/panel/contabilidad/proyectos" },
    { label: "Capital", href: "/panel/contabilidad/capital" },
  ];

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !isPanelRoute) return;
    if (!user && !isLoginRoute) {
      router.replace("/panel/contabilidad/login");
      return;
    }
    if (user && isLoginRoute) {
      router.replace("/panel/contabilidad/dashboard");
    }
  }, [hydrated, isPanelRoute, isLoginRoute, user, router]);

  if (!pathname || !pathname.startsWith("/panel/contabilidad")) {
    return <main className={styles.contaMain}>{children}</main>;
  }

  if (isLoginRoute) {
    return <main className={styles.contaMain}>{children}</main>;
  }

  if (user && !canAccess) {
    return (
      <main className={styles.contaMain}>
        <section className={styles.lockedCard}>
          <p className={styles.lockedKicker}>Acceso restringido</p>
          <h1 className={styles.lockedTitle}>Panel de Contabilidad</h1>
          <p className={styles.lockedText}>
            Tu perfil no tiene habilitado el acceso a contabilidad. Solicita a un super admin que
            active el permiso.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.contaRoot}>
      <aside className={styles.contaSidebar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandName}>NEXARA</span>
          <span className={styles.brandSub}>Contabilidad</span>
        </div>
        <div className={styles.sidebarDivider} />
        <p className={styles.menuTitle}>Panel financiero</p>
        <nav className={styles.nav}>
          {navItems.map((item, index) => {
            const itemPath = item.href.replace(/\/+$/, "");
            const isActive = itemPath === currentPath;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                style={{ animationDelay: `${0.08 + index * 0.05}s` }}
              >
                <span>{item.label}</span>
                <span className={styles.navIndicator} />
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <span>Estado</span>
          <strong>Conectado</strong>
        </div>
      </aside>
      <main className={styles.contaMain}>{children}</main>
    </div>
  );
}

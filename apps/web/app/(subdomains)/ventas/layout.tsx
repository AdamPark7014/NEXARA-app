"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import VentasSidebar from "./VentasSidebar";
import styles from "./layout.module.css";

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [hydrated, setHydrated] = useState(false);

  // Detectar si estamos en el subdominio de ventas o en /panel/ventas
  const isPanelRoute = Boolean(pathname && (pathname.startsWith("/panel/ventas") || pathname.startsWith("/ventas")));
  const isLoginRoute = Boolean(pathname && pathname.includes("/login"));
  const canAccess = Boolean(user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.PANEL_VENTAS)));

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !isPanelRoute) return;
    if (!user && !isLoginRoute) {
      router.replace("/login");
      return;
    }
    if (user && isLoginRoute) {
      router.replace("/dashboard");
    }
  }, [hydrated, isPanelRoute, isLoginRoute, user, router]);

  if (!pathname || !(pathname.startsWith("/panel/ventas") || pathname.startsWith("/ventas"))) {
    return <main className={styles.salesMain}>{children}</main>;
  }

  if (isLoginRoute) {
    return <main className={styles.salesMain}>{children}</main>;
  }

  if (user && !canAccess) {
    return (
      <main className={styles.salesMain}>
        <section className={styles.lockedCard}>
          <p className={styles.lockedKicker}>Acceso restringido</p>
          <h1 className={styles.lockedTitle}>Panel de Ventas</h1>
          <p className={styles.lockedText}>
            Tu perfil no tiene habilitado el acceso a ventas. Solicita a un super admin que active el permiso.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.salesRoot}>
      <VentasSidebar />
      <main className={styles.salesMain}>{children}</main>
    </div>
  );
}

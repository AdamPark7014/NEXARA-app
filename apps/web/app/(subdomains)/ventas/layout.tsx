"use client";

import React from "react";
import { usePathname } from "next/navigation";
import VentasSidebar from "./VentasSidebar";
import styles from "./layout.module.css";

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Si estamos en login, no renderizar el sidebar
  if (pathname && pathname.includes("/login")) {
    return <main className={styles.salesMain}>{children}</main>;
  }

  return (
    <div className={styles.salesRoot}>
      <VentasSidebar />
      <main className={styles.salesMain}>{children}</main>
    </div>
  );
}

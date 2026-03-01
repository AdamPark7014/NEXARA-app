"use client";
import { useParams, usePathname } from "next/navigation";
import styles from "../console/console.module.css";
import Sidebar from "./Sidebar";

export default function DynamicPanelLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const slug = params?.slug as string;

  // Si estamos en una ruta de login, no renderizar el layout
  if (pathname && (
    pathname.includes("/login") || 
    pathname.includes("/auth")
  )) {
    return <>{children}</>;
  }

  return (
    <div className={styles.consoleLayout}>
      <Sidebar />
      <main className={styles.consoleMain}>
        {children}
      </main>
    </div>
  );
}

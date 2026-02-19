"use client";
import styles from "./console.module.css";
import Sidebar from "./Sidebar";
import { usePathname } from "next/navigation";


export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Si estamos en /panel/console/dashboard/login, no renderizar el layout del dashboard
  if (pathname && pathname.startsWith("/panel/console/dashboard/login")) {
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

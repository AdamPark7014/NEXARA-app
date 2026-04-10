"use client";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "../console/console.module.css";
import Sidebar from "../console/Sidebar";
import NotificationCenter from "@/components/NotificationCenter";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { useUser } from "@/components/UserContext";
import { setActivePanel, type PanelKey } from "@/lib/panel-routing";

export default function DynamicPanelLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const slug = params?.slug as string;

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }

    const allowedPanels: PanelKey[] = ["console", "ventas", "contabilidad", "tickets", "web"];
    if (slug && allowedPanels.includes(slug as PanelKey)) {
      setActivePanel(slug as PanelKey);
    }
  }, [router, slug, user]);

  // Si estamos en una ruta de login, no renderizar el layout
  if (pathname && (
    pathname.includes("/login") || 
    pathname.includes("/auth")
  )) {
    return <>{children}</>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className={styles.consoleLayout}>
      <Sidebar />
      <main className={styles.consoleMain}>
        {!isCapacitorNative() && (
          <NotificationCenter position="top-right" maxNotifications={5} autoCloseTime={6000} />
        )}
        {children}
      </main>
    </div>
  );
}

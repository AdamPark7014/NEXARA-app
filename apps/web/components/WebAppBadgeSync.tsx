"use client";

import { useEffect, useRef } from "react";
import { useUser } from "./UserContext";
import { buildApiUrl } from "@/lib/api-base";

/**
 * Badge en icono de PWA / pestaña (Badging API) cuando el navegador lo permite.
 *
 * Safari / iOS: `setAppBadge` suele existir solo en contextos recientes y a menudo con PWA instalada;
 * si no está definido, este componente no hace nada (no es un error).
 */
export default function WebAppBadgeSync() {
  const { user } = useUser();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.token) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if ("clearAppBadge" in navigator && typeof (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge === "function") {
        void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
      }
      return;
    }

    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (typeof nav.setAppBadge !== "function") return;

    const sync = async () => {
      try {
        const res = await fetch(buildApiUrl("notifications/count/unread"), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unreadCount?: number };
        const n = Math.min(99, Math.max(0, Number(data.unreadCount) || 0));
        if (n > 0) await nav.setAppBadge!(n);
        else if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
      } catch {
        /* ignore */
      }
    };

    void sync();
    intervalRef.current = setInterval(sync, 90_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      if (typeof nav.clearAppBadge === "function") void nav.clearAppBadge();
    };
  }, [user?.token]);

  return null;
}

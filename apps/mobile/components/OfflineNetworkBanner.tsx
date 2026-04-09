"use client";

import { useEffect, useState } from "react";
import { useUser } from "./UserContext";
import { OFFLINE_QUEUE_STORAGE_KEY } from "@/lib/offline-queue";

const countQueued = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

function hasPortalSession(): boolean {
  try {
    return Boolean(
      typeof window !== "undefined" &&
        (window.sessionStorage.getItem("clientSession") || window.sessionStorage.getItem("branchSession")),
    );
  } catch {
    return false;
  }
}

export default function OfflineNetworkBanner() {
  const { user } = useUser();
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [portal, setPortal] = useState(false);

  useEffect(() => {
    const sync = () => {
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
      setQueued(countQueued());
      setPortal(hasPortalSession());
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const id = window.setInterval(sync, 8000);
    const onQueue = () => setQueued(countQueued());
    window.addEventListener("nexara-offline-queue", onQueue);
    window.addEventListener("nexara-portal-session-changed", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("nexara-offline-queue", onQueue);
      window.removeEventListener("nexara-portal-session-changed", sync);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onStorage = () => {
      setQueued(countQueued());
      setPortal(hasPortalSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!user && !portal) return null;

  const offlineDegraded = user != null ? Boolean(user.offlineDegraded) : false;
  const showOffline = !online || offlineDegraded;

  if (!showOffline && queued === 0) return null;

  const warningMix = "color-mix(in srgb, var(--warning) 22%, var(--surface))";
  const primaryMix = "color-mix(in srgb, var(--primary) 18%, var(--surface))";
  const fgVar = "var(--foreground)";
  const borderVar = "var(--border)";

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200000,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        background: showOffline ? warningMix : primaryMix,
        color: fgVar,
        borderBottom: `1px solid ${borderVar}`,
      }}
    >
      {!online && "Sin conexión · "}
      {offlineDegraded && online && "Sesión sin validar · reconecta para sincronizar · "}
      {queued > 0 && `${queued} operación${queued === 1 ? "" : "es"} pendiente(s) de envío`}
      {queued === 0 && showOffline && !offlineDegraded && "Modo sin conexión"}
    </div>
  );
}

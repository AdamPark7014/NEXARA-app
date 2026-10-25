"use client";

import { useEffect, useState } from "react";
import { useUser } from "./UserContext";
import { flushOfflineQueue, OFFLINE_QUEUE_STORAGE_KEY } from "@/lib/offline-queue";

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

function authHeader(userToken?: string | null): string | undefined {
  if (userToken) return `Bearer ${userToken}`;
  try {
    const raw =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("clientSession") || window.sessionStorage.getItem("branchSession")
        : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed?.token ? `Bearer ${parsed.token}` : undefined;
  } catch {
    return undefined;
  }
}

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

  const showContext = Boolean(user) || portal;
  if (!showContext) return null;

  const offlineDegraded = user != null ? Boolean(user.offlineDegraded) : false;
  const showOffline = !online || offlineDegraded;

  if (!showOffline && queued === 0) return null;

  const warningMix = "color-mix(in srgb, var(--warning) 22%, var(--surface))";
  const primaryMix = "color-mix(in srgb, var(--primary) 18%, var(--surface))";
  const fgVar = "var(--foreground)";
  const borderVar = "var(--border)";

  const lineas: string[] = [];
  if (!online) lineas.push("Sin conexión");
  if (offlineDegraded && online) {
    lineas.push("Sesión sin validar");
    lineas.push("reconecta para sincronizar");
  }
  if (queued > 0) {
    lineas.push(`${queued} ${queued === 1 ? "operación" : "operaciones"} pendiente(s) de envío`);
  }
  if (queued === 0 && showOffline && !offlineDegraded) lineas.push("Modo sin conexión");

  const reintentar = () => {
    void flushOfflineQueue(() => authHeader(user?.token));
  };

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        background: showOffline ? warningMix : primaryMix,
        color: fgVar,
        borderBottom: `1px solid ${borderVar}`,
      }}
    >
      {lineas.map((linea) => (
        <span key={linea} style={{ display: "block", maxWidth: "100%" }}>
          {linea}
        </span>
      ))}
      {queued > 0 && (
        <button
          type="button"
          onClick={reintentar}
          style={{
            margin: 0,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "inherit",
            font: "inherit",
            fontWeight: 700,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useUser } from "./UserContext";
import { flushOfflineQueue, OFFLINE_QUEUE_STORAGE_KEY, portalSessionBearer } from "@/lib/offline-queue";
import { isCapacitorNative } from "@/lib/capacitor-env";
import s from "./OfflineNetworkBanner.module.css";

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
  const [enviando, setEnviando] = useState(false);

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
    lineas.push(
      queued === 1
        ? `${queued} operación pendiente de envío`
        : `${queued} operaciones pendientes de envío`,
    );
  }
  if (queued === 0 && showOffline && !offlineDegraded) lineas.push("Modo sin conexión");

  // Mismo filtro que OfflineQueueFlusher: la cola solo se reenvía en la app nativa. En el navegador
  // se purga, porque lo encolado lleva el cuerpo de quien lo escribió y saldría con el token de
  // quien esté dentro ahora. Sin señal tampoco: el envío no sale.
  const puedeReintentar = queued > 0 && online && isCapacitorNative();

  const reintentar = () => {
    if (enviando) return;
    setEnviando(true);
    void flushOfflineQueue(() => (user?.token ? `Bearer ${user.token}` : portalSessionBearer())).finally(() => {
      setEnviando(false);
      setQueued(countQueued());
    });
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
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        background: showOffline ? warningMix : primaryMix,
        color: fgVar,
        borderBottom: `1px solid ${borderVar}`,
      }}
    >
      <span className={s.lineas}>
        {lineas.map((linea, i) => (
          <span key={linea}>
            {i > 0 ? (
              <span className={s.sep} aria-hidden="true">
                {" · "}
              </span>
            ) : null}
            {linea}
          </span>
        ))}
      </span>
      {puedeReintentar ? (
        <button type="button" className={s.reintentar} onClick={reintentar} disabled={enviando}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

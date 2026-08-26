"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { OFFLINE_QUEUE_STORAGE_KEY } from "@/lib/offline-queue";

function countQueued(): number {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Indicador compacto de conexión / sincronización en el shell universal.
 */
export default function ShellConnectionStatus() {
  const { user } = useUser();
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const sync = () => {
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
      setQueued(countQueued());
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("nexara-offline-queue", sync);
    const id = window.setInterval(sync, 8000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("nexara-offline-queue", sync);
      window.clearInterval(id);
    };
  }, []);

  if (!user) return null;

  const offlineDegraded = Boolean(user.offlineDegraded);
  const syncing = queued > 0;
  const offline = !online || offlineDegraded;

  let tone: "ok" | "warn" | "sync" = "ok";
  let label = "En línea";
  if (offline) {
    tone = "warn";
    label = offlineDegraded && online ? "Sin validar" : "Sin conexión";
  } else if (syncing) {
    tone = "sync";
    label = `Sync ${queued}`;
  }

  const bg =
    tone === "warn"
      ? "color-mix(in srgb, var(--warning) 22%, var(--surface))"
      : tone === "sync"
        ? "color-mix(in srgb, var(--primary) 18%, var(--surface))"
        : "color-mix(in srgb, var(--success) 18%, var(--surface))";

  const dot =
    tone === "warn" ? "var(--warning)" : tone === "sync" ? "var(--primary)" : "var(--success)";

  return (
    <span
      role="status"
      title={
        offline
          ? "Modo offline o sesión degradada — los cambios se encolarán"
          : syncing
            ? `${queued} operación(es) pendiente(s) de sincronizar`
            : "Conectado a NEXARA"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-secondary)",
        background: bg,
        border: "1px solid var(--nx-panel-hairline-soft)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dot,
          boxShadow: tone === "sync" ? `0 0 0 3px color-mix(in srgb, ${dot} 25%, transparent)` : undefined,
        }}
      />
      {label}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useUser } from "./UserContext";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { registerNativePushNotifications } from "@/lib/push-notifications-native";
import { getApiBase } from "@/lib/api-base";
import { fetchWithOfflineQueue, isQueuedResponse } from "@/lib/fetch-offline";
import { openNexaraAppSettings } from "@/lib/open-app-settings-native";

/**
 * En shell nativo (todas las rutas): registra FCM/APNs y envía el token a POST /api/devices/push-token.
 * Sin red, el POST queda en la cola offline y se reintenta al volver online.
 */
export default function ConsolePushSetup() {
  const { user } = useUser();
  const [notifDenied, setNotifDenied] = useState(false);

  useEffect(() => {
    if (!isCapacitorNative() || !user?.token) return;

    void (async () => {
      const permStatus = await registerNativePushNotifications(async (token) => {
        const base = getApiBase().replace(/\/+$/, "");
        try {
          const { Capacitor } = await import("@capacitor/core");
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
          const res = await fetchWithOfflineQueue(
            `${base}/devices/push-token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, platform }),
            },
            () => user.token,
          );
          if (isQueuedResponse(res)) {
            console.info("[push] token guardado en cola offline; se enviará al reconectar");
          }
        } catch (e) {
          console.warn("[push] no se pudo registrar token en API", e);
        }
      });
      if (permStatus === "denied") {
        setNotifDenied(true);
      }
    })();
  }, [user?.token]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!notifDenied) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "env(safe-area-inset-bottom, 0px)",
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#f59e0b",
        color: "#1c1917",
        padding: "12px 16px",
        fontSize: "13px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: "1 1 200px", lineHeight: 1.45 }}>
        Notificaciones bloqueadas en el sistema.{" "}
        <strong>Ajustes → Apps → Nexara → Notificaciones</strong> (actívalas). Sin permiso no se muestran alertas ni push.
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => void openNexaraAppSettings()}
          style={{
            background: "#1c1917",
            color: "#fffbeb",
            border: "none",
            borderRadius: "10px",
            padding: "10px 14px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Abrir ajustes
        </button>
        <button
          type="button"
          onClick={() => setNotifDenied(false)}
          style={{
            background: "rgba(28, 25, 23, 0.12)",
            border: "1px solid rgba(28, 25, 23, 0.35)",
            borderRadius: "10px",
            cursor: "pointer",
            fontSize: "16px",
            padding: "8px 12px",
            color: "#1c1917",
          }}
          aria-label="Cerrar aviso"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

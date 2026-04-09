"use client";

import { useEffect } from "react";
import { useUser } from "./UserContext";
import { isCapacitorNative } from "@/lib/capacitor-env";
import { registerNativePushNotifications } from "@/lib/push-notifications-native";
import { getApiBase } from "@/lib/api-base";
import { fetchWithOfflineQueue, isQueuedResponse } from "@/lib/fetch-offline";

/**
 * En shell nativo (todas las rutas): registra FCM/APNs y envía el token a POST /api/devices/push-token.
 * Sin red, el POST queda en la cola offline y se reintenta al volver online.
 */
export default function ConsolePushSetup() {
  const { user } = useUser();

  useEffect(() => {
    if (!isCapacitorNative() || !user?.token) return;

    void registerNativePushNotifications(async (token) => {
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
  }, [user?.token]);

  return null;
}

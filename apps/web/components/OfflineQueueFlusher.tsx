"use client";

import { useEffect } from "react";
import { useUser } from "./UserContext";
import { flushOfflineQueue, getOfflineQueueLength, purgarColaOffline } from "@/lib/offline-queue";
import { authCacheTag, revalidateHotApiCache } from "@/lib/offline-api-cache";
import { getNativeFetch } from "@/lib/native-fetch";
import { isCapacitorNative } from "@/lib/capacitor-env";

function portalSessionBearer(): string | undefined {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("clientSession") || window.sessionStorage.getItem("branchSession")
        : null;
    if (!raw) return undefined;
    const p = JSON.parse(raw) as { token?: string };
    return p?.token ? `Bearer ${p.token}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Al volver la conexión, reenvía las escrituras encoladas (ver `enqueueOfflineFetch`).
 *
 * Solo en la app del teléfono. En el navegador no se encola nada
 * (`installOfflineFetchGlobal` se apaga si no es nativo), y reenviar lo que quedó de versiones
 * anteriores lo mandaría con el token de la sesión abierta ahora, no con el de quien lo escribió:
 * en un equipo compartido eso es escribir a nombre de otra persona. Ahí se borra la cola.
 */
export default function OfflineQueueFlusher() {
  const { user } = useUser();

  useEffect(() => {
    if (!isCapacitorNative()) {
      void purgarColaOffline().catch(() => undefined);
      return;
    }

    const resolveAuth = () => {
      if (user?.token) return `Bearer ${user.token}`;
      return portalSessionBearer();
    };

    const run = () => {
      void flushOfflineQueue(resolveAuth).then(() => {
        if (!resolveAuth()) return;
        // La etiqueta de ESTA sesión: sin ella se refrescarían entradas de otra cuenta.
        void revalidateHotApiCache(getNativeFetch(), resolveAuth, 72, authCacheTag(user?.token, user?.id));
      });
    };

    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        run();
      }
    };

    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);

    run();

    const intervalId = window.setInterval(() => {
      if (getOfflineQueueLength() > 0) run();
    }, 5000);

    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, [user?.token, user?.id]);

  return null;
}

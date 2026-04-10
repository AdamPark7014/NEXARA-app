"use client";

import { useEffect } from "react";
import { useUser } from "./UserContext";

/**
 * Registra el SW aunque no exista Web Push VAPID, para que las notificaciones
 * en vivo (socket + mirror) y futuras suscripciones usen la misma superficie que el push.
 */
export default function ServiceWorkerHeadsUpPrep() {
  const { user } = useUser();

  useEffect(() => {
    if (!user?.token || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, [user?.token]);

  return null;
}

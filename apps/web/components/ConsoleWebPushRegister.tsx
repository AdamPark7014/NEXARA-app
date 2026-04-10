"use client";

import { useEffect, useRef } from "react";
import { useUser } from "./UserContext";
import { buildApiUrl } from "@/lib/api-base";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

/**
 * Registra SW + suscripción Web Push y la envía a POST /devices/web-push.
 * Requiere WEB_PUSH_VAPID_* en API y NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY aquí (misma pare VAPID).
 */
export default function ConsoleWebPushRegister() {
  const { user } = useUser();
  const tried = useRef(false);

  useEffect(() => {
    tried.current = false;
    const vapidPublic = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim();
    if (!user?.token || !vapidPublic) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const consentMode = process.env.NEXT_PUBLIC_WEB_PUSH_CONSENT_MODE?.trim().toLowerCase();

    const run = async () => {
      if (tried.current) return;
      try {
        if (typeof Notification !== "undefined") {
          if (Notification.permission === "denied") return;
          if (Notification.permission === "default") {
            if (consentMode === "banner") return;
            const perm = await Notification.requestPermission();
            if (perm !== "granted") return;
          }
        }

        tried.current = true;

        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ||
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublic),
          }));

        await fetch(buildApiUrl("devices/web-push"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            subscription: sub.toJSON(),
          }),
        });
      } catch {
        tried.current = false;
      }
    };

    if (consentMode === "banner") {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        void run();
      }
      const onConsent = () => void run();
      window.addEventListener("nexara-web-push-consent", onConsent);
      return () => window.removeEventListener("nexara-web-push-consent", onConsent);
    }

    void run();
  }, [user?.token]);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import { useUser } from "./UserContext";

const STORAGE_GRANTED = "nexara_web_push_consent_v1";
const STORAGE_SNOOZE = "nexara_web_push_snooze_v1";

/**
 * Con NEXT_PUBLIC_WEB_PUSH_CONSENT_MODE=banner: un solo contexto antes del diálogo del navegador.
 * El botón principal llama a Notification.requestPermission() aquí; luego se dispara la suscripción push.
 */
export default function WebPushConsentBanner() {
  let user = null;
  try {
    const { user: contextUser } = useUser();
    user = contextUser;
  } catch {
    // Hook no disponible en este contexto (ej: durante SSR o contexto incompleto)
    return null;
  }
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const mode = process.env.NEXT_PUBLIC_WEB_PUSH_CONSENT_MODE?.trim().toLowerCase();
  const vapid = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim();

  useEffect(() => {
    if (mode !== "banner" || !user?.token || !vapid) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (sessionStorage.getItem(STORAGE_GRANTED) === "1" && Notification.permission === "granted") {
      window.dispatchEvent(new Event("nexara-web-push-consent"));
      return;
    }

    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem(STORAGE_SNOOZE) === "1") return;

    setVisible(true);
  }, [mode, user?.token, vapid]);

  if (!visible || mode !== "banner") return null;

  return (
    <div
      role="dialog"
      aria-labelledby="nexara-web-push-banner-title"
      aria-describedby="nexara-push-banner-desc"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 480,
        margin: "0 auto",
        zIndex: 99998,
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e2e8f0)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        fontSize: 14,
      }}
    >
      <strong id="nexara-web-push-banner-title" style={{ display: "block", marginBottom: 8 }}>
        NEXARA quiere enviarte notificaciones
      </strong>
      <p
        id="nexara-web-push-banner-desc"
        style={{ margin: "0 0 12px", color: "var(--text-secondary, #64748b)", lineHeight: 1.5 }}
      >
        Recibe avisos de operación aunque no tengas la pestaña abierta (como Gmail o Slack en el navegador).
        El siguiente paso es el permiso oficial de tu navegador: solo se pide una vez.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}
          onClick={async () => {
            if (!("Notification" in window)) return;
            setBusy(true);
            try {
              const perm = await window.Notification.requestPermission();
              sessionStorage.removeItem(STORAGE_SNOOZE);
              if (perm === "granted") {
                sessionStorage.setItem(STORAGE_GRANTED, "1");
                setVisible(false);
                window.dispatchEvent(new Event("nexara-web-push-consent"));
              } else {
                setVisible(false);
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Abriendo permiso…" : "Permitir notificaciones"}
        </button>
        <button
          type="button"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer",
            background: "transparent",
            border: "1px solid var(--border, #cbd5e1)",
          }}
          onClick={() => {
            sessionStorage.setItem(STORAGE_SNOOZE, "1");
            window.dispatchEvent(new Event("nexara-web-push-snooze"));
            setVisible(false);
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}

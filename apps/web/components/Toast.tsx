"use client";

/**
 * Toast — sistema ligero de notificaciones in-app (snackbar).
 *
 * Modo de uso (sin provider, sin context — usa CustomEvent en `window`):
 *
 *   import { toast } from "@/components/Toast";
 *
 *   toast.success("Cotización guardada");
 *   toast.error("No se pudo enviar el correo");
 *   toast.info("Se solicitó la aprobación al Gerente de Ventas");
 *
 * El componente <ToastViewport /> debe montarse 1 vez (típicamente en el
 * layout raíz o en cada PanelShell). Sin él, las llamadas a `toast.*` son
 * no-ops silenciosos.
 *
 * Características:
 *  - 4 tonos: success / error / warning / info.
 *  - Auto-dismiss configurable (default 4.5s).
 *  - Hasta 5 toasts apilados; el resto se descarta (no spamea).
 *  - Animación fluida entrada / salida.
 *  - SSR-safe: no toca `window` durante el render del servidor.
 */

import { useEffect, useState } from "react";

const EVENT_NAME = "nx:toast";
const MAX_TOASTS = 5;

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastPayload = {
  id: number;
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs: number;
};

type ToastInput = {
  title?: string;
  message: string;
  durationMs?: number;
};

const dispatch = (tone: ToastTone, input: ToastInput | string) => {
  if (typeof window === "undefined") return;
  const payload: ToastPayload = {
    id: Date.now() + Math.random(),
    tone,
    title: typeof input === "string" ? undefined : input.title,
    message: typeof input === "string" ? input : input.message,
    durationMs: typeof input === "string" ? 4500 : input.durationMs ?? 4500,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: payload }));
};

export const toast = {
  success: (input: ToastInput | string) => dispatch("success", input),
  error: (input: ToastInput | string) => dispatch("error", input),
  warning: (input: ToastInput | string) => dispatch("warning", input),
  info: (input: ToastInput | string) => dispatch("info", input),
};

const TONE_STYLES: Record<ToastTone, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: "#dcfce7", border: "#86efac", color: "#166534", icon: "✅" },
  error: { bg: "#fee2e2", border: "#fca5a5", color: "#991b1b", icon: "❌" },
  warning: { bg: "#fef3c7", border: "#fcd34d", color: "#92400e", icon: "⚠️" },
  info: { bg: "#dbeafe", border: "#93c5fd", color: "#1e40af", icon: "ℹ️" },
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail) return;
      setItems((prev) => {
        const next = [...prev, detail];
        return next.slice(-MAX_TOASTS);
      });
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== detail.id));
      }, detail.durationMs);
    };
    window.addEventListener(EVENT_NAME, onToast);
    return () => window.removeEventListener(EVENT_NAME, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 10000,
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {items.map((t) => {
        const palette = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: "auto",
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              color: palette.color,
              borderRadius: 10,
              padding: "10px 14px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              display: "flex",
              gap: 10,
              animation: "nx-toast-in 0.22s ease-out",
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1.2 }}>{palette.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{t.title}</div>}
              <div>{t.message}</div>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              style={{
                marginLeft: 4,
                background: "transparent",
                border: "none",
                color: palette.color,
                opacity: 0.7,
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes nx-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

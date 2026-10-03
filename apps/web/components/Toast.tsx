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
 *   toast.success({ title: "Actividad AN-0036 creada", message: "Se avisó a José.",
 *                   action: { label: "Ver actividad", onClick: abrir }, onUndo: deshacer });
 *
 * El componente <ToastViewport /> debe montarse 1 vez (típicamente en el
 * layout raíz o en cada PanelShell). Sin él, las llamadas a `toast.*` son
 * no-ops silenciosos.
 *
 * Características:
 *  - 4 tonos: success / error / warning / info, cada uno con su icono.
 *  - Acción opcional y «Deshacer» opcional bajo el mensaje.
 *  - Auto-dismiss configurable (default 4.5s).
 *  - Hasta 5 toasts apilados; el resto se descarta (no spamea).
 *  - Animación fluida entrada / salida.
 *  - SSR-safe: no toca `window` durante el render del servidor.
 */

import { useEffect, useState, type ReactNode } from "react";

const EVENT_NAME = "nx:toast";
const MAX_TOASTS = 5;

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastAction = { label: string; onClick: () => void };

export type ToastPayload = {
  id: number;
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs: number;
  action?: ToastAction;
  onUndo?: () => void;
};

type ToastInput = {
  title?: string;
  message: string;
  durationMs?: number;
  /** Botón de texto bajo el mensaje («Ver actividad», «Corregir correo»). */
  action?: ToastAction;
  /** Si se da, aparece «Deshacer»; al tocarlo se llama y se cierra el aviso. */
  onUndo?: () => void;
};

const dispatch = (tone: ToastTone, input: ToastInput | string) => {
  if (typeof window === "undefined") return;
  const payload: ToastPayload = {
    id: Date.now() + Math.random(),
    tone,
    title: typeof input === "string" ? undefined : input.title,
    message: typeof input === "string" ? input : input.message,
    durationMs: typeof input === "string" ? 4500 : input.durationMs ?? 4500,
    action: typeof input === "string" ? undefined : input.action,
    onUndo: typeof input === "string" ? undefined : input.onUndo,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: payload }));
};

export const toast = {
  success: (input: ToastInput | string) => dispatch("success", input),
  error: (input: ToastInput | string) => dispatch("error", input),
  warning: (input: ToastInput | string) => dispatch("warning", input),
  info: (input: ToastInput | string) => dispatch("info", input),
};

const TONE_STYLES: Record<ToastTone, { bg: string; color: string; icon: ReactNode }> = {
  success: {
    bg: "var(--ui-success-bg, #ecfaf1)",
    color: "var(--ui-success-text, #12733a)",
    icon: (
      <>
        <circle cx="8" cy="8" r="6.4" />
        <path d="M5.2 8.2l2 2 3.6-4.1" />
      </>
    ),
  },
  error: {
    bg: "var(--ui-danger-bg, #fdeeee)",
    color: "var(--ui-danger-text, #b42020)",
    icon: (
      <>
        <circle cx="8" cy="8" r="6.4" />
        <path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" />
      </>
    ),
  },
  warning: {
    bg: "var(--ui-warning-bg, #fff6e6)",
    color: "var(--ui-warning-text, #9a5b06)",
    icon: (
      <>
        <path d="M8 2.4L14.4 13.4H1.6z" />
        <path d="M8 6.5v3.1M8 11.4h.01" />
      </>
    ),
  },
  info: {
    bg: "var(--ui-info-bg, #ebf4fc)",
    color: "var(--ui-info-text, #1d6aa6)",
    icon: (
      <>
        <circle cx="8" cy="8" r="6.4" />
        <path d="M8 7.3v3.6M8 5.1h.01" />
      </>
    ),
  },
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

  const cerrar = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="nx-toast-viewport"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 10000,
        width: "min(380px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      {items.map((t) => {
        const palette = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className="nx-toast"
            style={{
              pointerEvents: "auto",
              background: "var(--ui-surface, #fff)",
              border: "1px solid var(--ui-border, #e3e8ee)",
              color: "var(--ui-fg, #0f1728)",
              borderRadius: "var(--ui-radius-lg, 12px)",
              padding: "14px 12px 14px 16px",
              boxShadow: "var(--ui-elev-3, 0 2px 4px rgba(16,24,40,.06), 0 16px 40px rgba(16,24,40,.14))",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              animation: "nx-toast-in 0.22s ease-out",
              fontFamily: "var(--ui-font, inherit)",
              fontSize: 13.5,
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
                background: palette.bg,
                color: palette.color,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
              >
                {palette.icon}
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: t.title ? 0 : 4 }}>
              {t.title && <div style={{ fontWeight: 600, marginBottom: 2, color: "var(--ui-fg, #0f1728)" }}>{t.title}</div>}
              <div style={{ color: t.title ? "var(--ui-fg-2, #4a5768)" : "var(--ui-fg, #0f1728)", fontSize: t.title ? 13 : 13.5 }}>
                {t.message}
              </div>
              {t.action || t.onUndo ? (
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  {t.action ? (
                    <button
                      type="button"
                      className="nx-toast__accion"
                      onClick={() => {
                        t.action?.onClick();
                        cerrar(t.id);
                      }}
                    >
                      {t.action.label}
                    </button>
                  ) : null}
                  {t.onUndo ? (
                    <button
                      type="button"
                      className="nx-toast__accion"
                      onClick={() => {
                        t.onUndo?.();
                        cerrar(t.id);
                      }}
                    >
                      Deshacer
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              className="nx-toast__x"
              onClick={() => cerrar(t.id)}
              style={{
                flex: "0 0 auto",
                display: "grid",
                placeItems: "center",
                width: 26,
                height: 26,
                marginTop: -2,
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--ui-fg-3, #6b7889)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes nx-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .nx-toast__accion {
          padding: 0;
          border: none;
          background: none;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          color: var(--ui-brand-text, #12715e);
          cursor: pointer;
        }
        .nx-toast__accion:hover:not(:disabled) {
          text-decoration: underline;
          text-underline-offset: 2px;
          transform: none;
          box-shadow: none;
        }
        .nx-toast__x:hover:not(:disabled) {
          background: var(--ui-hover, #f1f4f7);
          color: var(--ui-fg, #0f1728);
          transform: none;
          box-shadow: none;
        }
        .nx-toast__accion:focus-visible,
        .nx-toast__x:focus-visible {
          outline: 2px solid var(--ui-brand, #1f9e84);
          outline-offset: 2px;
          border-radius: 4px;
        }
        @media (max-width: 560px) {
          .nx-toast-viewport { right: 16px !important; bottom: 16px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-toast { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

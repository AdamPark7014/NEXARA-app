"use client";

import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button";

export interface ConfirmState {
  message: string;
  title?: string;
  confirmLabel?: string;
  /** When true, confirm uses danger (red) styling. Default true. */
  danger?: boolean;
  fn: () => void | Promise<void>;
}

interface Props {
  state: ConfirmState | null;
  onClose: () => void;
  /** Fallback danger when state.danger is undefined. Default: true */
  danger?: boolean;
}

/**
 * Confirmation dialog with in-flight lock, Esc, and basic focus trap.
 * Usage:
 *   setConfirmState({ message: "¿…?", confirmLabel: "Confirmar", danger: false, fn: async () => { … } });
 *   <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
 */
export default function ConfirmDialog({ state, onClose, danger = true }: Props) {
  const titleId = useId();
  const msgId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  const isDanger = state?.danger ?? danger;

  useEffect(() => {
    if (!state) {
      setBusy(false);
      return;
    }
    const prev = document.activeElement as HTMLElement | null;
    confirmBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [state, busy, onClose]);

  if (!state) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.resolve(state.fn());
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <>
      <div
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={state.title ? titleId : msgId}
        aria-describedby={msgId}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "24px 28px",
          width: "min(420px, 90vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {state.title ? (
          <h2
            id={titleId}
            style={{
              margin: "0 0 10px",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {state.title}
          </h2>
        ) : null}
        <p
          id={msgId}
          style={{
            margin: "0 0 22px",
            fontSize: 14.5,
            lineHeight: 1.55,
            color: "var(--text-primary)",
            fontWeight: 500,
          }}
        >
          {state.message}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            ref={confirmBtnRef}
            variant={isDanger ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Procesando…" : state.confirmLabel ?? (isDanger ? "Eliminar" : "Confirmar")}
          </Button>
        </div>
      </div>
    </>
  );
}

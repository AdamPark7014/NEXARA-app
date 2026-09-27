"use client";

import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button";
import styles from "./overlay.module.scss";
import { useScrollLock } from "./useScrollLock";

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
 *
 * Si la acción es destructiva, el foco inicial cae en «Cancelar»: un Enter
 * por inercia no borra nada.
 */
export default function ConfirmDialog({ state, onClose, danger = true }: Props) {
  const titleId = useId();
  const msgId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  /**
   * Cerrojo síncrono: `busy` deshabilita el botón, pero un doble clic rápido
   * entra dos veces antes del repintado (p. ej. Marcar pagado).
   */
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const isDanger = state?.danger ?? danger;

  useScrollLock(Boolean(state));

  useEffect(() => {
    if (!state) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const prev = document.activeElement as HTMLElement | null;
    (isDanger ? cancelBtnRef.current : confirmBtnRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        e.stopPropagation();
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
  }, [state, onClose, isDanger]);

  if (!state) return null;

  const handleConfirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await Promise.resolve(state.fn());
    } finally {
      busyRef.current = false;
      setBusy(false);
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busyRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={state.title ? titleId : msgId}
        aria-describedby={msgId}
        aria-busy={busy || undefined}
        className={`${styles.panel} ${styles.confirm}`}
      >
        {state.title ? (
          <h2 id={titleId} className={styles.confirmTitle}>
            {state.title}
          </h2>
        ) : null}
        <p id={msgId} className={styles.confirmMessage}>
          {state.message}
        </p>

        <div className={styles.confirmActions}>
          <Button ref={cancelBtnRef} variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            ref={confirmBtnRef}
            variant={isDanger ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            disabled={busy}
            loading={busy}
          >
            {busy ? "Procesando…" : state.confirmLabel ?? (isDanger ? "Eliminar" : "Confirmar")}
          </Button>
        </div>
      </div>
    </div>
  );
}

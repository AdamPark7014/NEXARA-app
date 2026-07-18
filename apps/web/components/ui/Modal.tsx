"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { erpModalBox, erpModalOverlay } from "@/lib/erp-api";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Block Esc / backdrop close when form is dirty. */
  dirty?: boolean;
  maxWidth?: number | string;
  /** Called when user tries to close while dirty; return true to allow. */
  onDirtyClose?: () => boolean;
};

/**
 * Shared ERP modal: Esc, focus trap, optional dirty-guard.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dirty = false,
  maxWidth = 520,
  onDirtyClose,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const requestClose = () => {
    if (dirty) {
      const ok = onDirtyClose ? onDirtyClose() : window.confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?");
      if (!ok) return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestClose closes over dirty
  }, [open, dirty]);

  if (!open) return null;

  const boxStyle: CSSProperties = {
    ...erpModalBox,
    maxWidth,
  };

  return (
    <div
      role="presentation"
      style={erpModalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        style={boxStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: "var(--text-primary)" }}
            >
              {title}
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={requestClose}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                color: "var(--text-tertiary)",
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        ) : null}
        <div style={{ padding: "16px 18px", overflow: "auto", flex: 1 }}>{children}</div>
        {footer ? (
          <div
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

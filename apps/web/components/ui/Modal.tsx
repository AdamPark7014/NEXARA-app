"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./overlay.module.scss";
import { useScrollLock } from "./useScrollLock";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_WIDTH: Record<Size, number> = { sm: 400, md: 520, lg: 720, xl: 960 };

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Block Esc / backdrop close when form is dirty. */
  dirty?: boolean;
  /** Ancho máximo explícito. Si se omite se usa `size` (md = 520 px). */
  maxWidth?: number | string;
  /** Called when user tries to close while dirty; return true to allow. */
  onDirtyClose?: () => boolean;
  /** Línea de apoyo bajo el título. */
  description?: ReactNode;
  /** Ancho predefinido: sm 400 · md 520 · lg 720 · xl 960. */
  size?: Size;
  className?: string;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal compartido del ERP: Esc, foco atrapado, scroll de fondo bloqueado,
 * guardia de cambios sin guardar. En teléfono se abre como hoja desde abajo.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dirty = false,
  maxWidth,
  onDirtyClose,
  description,
  size = "md",
  className,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useScrollLock(open);

  const requestClose = () => {
    if (dirty) {
      const ok = onDirtyClose ? onDirtyClose() : window.confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?");
      if (!ok) return;
    }
    onClose();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Primero el contenido (el primer campo del formulario), no la ✕ del encabezado.
    const firstInBody = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (firstInBody ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        requestCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
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
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={[styles.panel, className].filter(Boolean).join(" ")}
        style={{ maxWidth: maxWidth ?? SIZE_WIDTH[size] }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className={styles.header}>
            <div className={styles.titles}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description ? (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              ) : null}
            </div>
            <button type="button" aria-label="Cerrar" title="Cerrar" onClick={requestClose} className={styles.close}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

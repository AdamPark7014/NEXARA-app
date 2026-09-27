"use client";

import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./FormField.module.css";

/**
 * Campo de formulario compartido — mismo contrato que Finanzas
 * (`.ai/DISENO-FINANZAS.md` regla 5): hint bajo el control, opcional en la
 * etiqueta, error que reemplaza al hint.
 *
 * Si el hijo es un solo control, se le conectan `aria-describedby` (pista o
 * error) y `aria-invalid` para que el lector de pantalla lea el porqué.
 */

export function FormGrid({ children, columns }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <div className={styles.grid} data-columns={columns && columns !== 2 ? columns : undefined}>
      {children}
    </div>
  );
}

type ControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
};

export function FormField({
  label,
  children,
  fullWidth,
  hint,
  optional,
  error,
  describedById,
  required,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  hint?: ReactNode;
  optional?: boolean;
  error?: string | null;
  describedById?: string;
  /** Marca visual «obligatorio» (asterisco) y `aria-required` en el control. */
  required?: boolean;
}) {
  const autoId = useId();
  const errorId = describedById ?? `campo-error-${autoId}`;
  const hintId = `campo-pista-${autoId}`;
  const messageId = error ? errorId : hint ? hintId : undefined;

  let control: ReactNode = children;
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  if (isValidElement(only) && only.type !== Fragment && (messageId || required)) {
    const el = only as ReactElement<ControlProps>;
    const own = el.props;
    const describedBy = [own["aria-describedby"], messageId].filter(Boolean).join(" ") || undefined;
    control = cloneElement(el, {
      "aria-describedby": describedBy,
      ...(error && own["aria-invalid"] == null ? { "aria-invalid": true } : null),
      ...(required && own["aria-required"] == null ? { "aria-required": true } : null),
    });
  }

  return (
    <label
      className={`${styles.field}${fullWidth ? ` ${styles.fieldFull}` : ""}`}
      data-invalid={error ? "true" : undefined}
    >
      <span className={styles.fieldLabel}>
        {label}
        {required ? (
          <span className={styles.fieldRequired} aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
        {optional ? <span className={styles.fieldOptional}> · opcional</span> : null}
      </span>
      {control}
      {error ? (
        <span id={errorId} role="alert" className={styles.fieldError}>
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.fieldHint}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

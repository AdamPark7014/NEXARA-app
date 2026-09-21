import type { ReactNode } from "react";
import styles from "./FormField.module.css";

/**
 * Campo de formulario compartido — mismo contrato que Finanzas
 * (`.ai/DISENO-FINANZAS.md` regla 5): hint bajo el control, opcional en la
 * etiqueta, error que reemplaza al hint.
 */
let campoSeq = 0;

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function FormField({
  label,
  children,
  fullWidth,
  hint,
  optional,
  error,
  describedById,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  hint?: ReactNode;
  optional?: boolean;
  error?: string | null;
  describedById?: string;
}) {
  const errorId = describedById ?? `campo-error-${(campoSeq += 1)}`;
  return (
    <label className={`${styles.field}${fullWidth ? ` ${styles.fieldFull}` : ""}`}>
      <span className={styles.fieldLabel}>
        {label}
        {optional ? <span className={styles.fieldOptional}> · opcional</span> : null}
      </span>
      {children}
      {error ? (
        <span id={errorId} role="alert" className={styles.fieldError}>
          {error}
        </span>
      ) : hint ? (
        <span className={styles.fieldHint}>{hint}</span>
      ) : null}
    </label>
  );
}

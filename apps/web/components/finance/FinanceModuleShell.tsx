"use client";

import type { CSSProperties, ReactNode } from "react";
import styles from "./FinanceModuleShell.module.css";

export type FinanceTab = {
  id: string;
  label: string;
};

type FinanceModuleShellProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  kpis?: ReactNode;
  tabs?: FinanceTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
};

export const financeInputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--foreground, var(--text-primary))",
  fontSize: 13,
  boxSizing: "border-box",
};

export function FinanceModuleShell({
  eyebrow,
  title,
  subtitle,
  actions,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  children,
}: FinanceModuleShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {kpis ? <div className={styles.kpiRow}>{kpis}</div> : null}

      {tabs && tabs.length > 0 ? (
        <div className={styles.tabs} role="tablist">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.tab}${active ? ` ${styles.tabActive}` : ""}`}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function FinanceFormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.formGrid}>{children}</div>;
}

/**
 * Campo de formulario financiero.
 *
 * `hint` va DEBAJO del control, no en un asterisco ni en un tooltip: la duda
 * («¿el monto lleva IVA?») aparece donde se captura, no después del error.
 * `optional` se marca en la etiqueta porque lo contrario —marcar lo obligatorio
 * con un asterisco rojo— llena el formulario de alarmas para decir lo normal.
 * `error` se pinta bajo el campo y reemplaza al hint mientras esté presente.
 */
let campoSeq = 0;

export function FinanceField({
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
  /**
   * Id del mensaje de error, para que el control lo referencie con
   * `aria-describedby`. Si no se pasa, se genera uno: sin esto, un lector de
   * pantalla anuncia el campo pero no por qué está mal.
   */
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

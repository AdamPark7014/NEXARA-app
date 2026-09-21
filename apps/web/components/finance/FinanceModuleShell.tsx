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
  /**
   * `panel` (por defecto) conserva la píldora de pestañas y la tarjeta de
   * contenido con las que ya viven el resto de módulos: nada cambia para ellos.
   *
   * `flat` aplica la regla 9 de `.ai/DISENO-FINANZAS.md` —ni una caja dentro de
   * otra—: las pestañas se subrayan en vez de meterse en una píldora, y el
   * contenido se apoya en la página en lugar de envolver la tabla (que ya trae
   * su propio borde) en un segundo rectángulo.
   */
  variant?: "panel" | "flat";
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
  variant = "panel",
}: FinanceModuleShellProps) {
  const flat = variant === "flat";
  return (
    <div className={`${styles.shell}${flat ? ` ${styles.shellFlat}` : ""}`}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {kpis ? <div className={flat ? styles.kpiRowFlat : styles.kpiRow}>{kpis}</div> : null}

      {tabs && tabs.length > 0 ? (
        <div className={flat ? styles.tabsFlat : styles.tabs} role="tablist">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            const className = flat
              ? `${styles.tabFlat}${active ? ` ${styles.tabFlatActive}` : ""}`
              : `${styles.tab}${active ? ` ${styles.tabActive}` : ""}`;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={className}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={flat ? styles.contentFlat : styles.content}>{children}</div>
    </div>
  );
}

// Campo y rejilla: mismo contrato que el resto del sistema (`FormField`).
// Se reexportan con el nombre histórico de Finanzas para no romper imports.
export { FormField as FinanceField, FormGrid as FinanceFormGrid } from "@/components/ui/FormField";

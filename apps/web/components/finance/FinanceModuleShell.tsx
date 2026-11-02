"use client";

import type { CSSProperties, ReactNode } from "react";
import { PageHead, Tabs } from "@/components/base";
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
  /** Riel de módulos de finanzas (`FinanceModuleRail`), bajo el encabezado. */
  rail?: ReactNode;
  kpis?: ReactNode;
  tabs?: FinanceTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
  /** `panel` envuelve el contenido en una tarjeta; `flat` lo deja sobre la página (la tabla trae su marco). */
  variant?: "panel" | "flat";
};

export const financeInputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--foreground, var(--text-primary))",
  // 16px: por debajo, iOS hace zoom al enfocar (mismo contrato que utilities.scss).
  fontSize: 16,
  boxSizing: "border-box",
};

export function FinanceModuleShell({
  eyebrow,
  title,
  subtitle,
  actions,
  rail,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  children,
  variant = "panel",
}: FinanceModuleShellProps) {
  const flat = variant === "flat";
  return (
    <div className={styles.shell}>
      <PageHead
        className={styles.cabeza}
        eyebrow={eyebrow}
        title={title}
        description={subtitle}
        actions={actions}
        tabs={
          tabs && tabs.length > 0 ? (
            <Tabs
              items={tabs}
              value={activeTab ?? null}
              onChange={(id) => onTabChange?.(id)}
              ariaLabel="Vistas"
            />
          ) : undefined
        }
      />
      {rail ? <div className={styles.rail}>{rail}</div> : null}
      {kpis ? <div className={styles.kpis}>{kpis}</div> : null}
      <div className={flat ? styles.contentFlat : styles.content}>{children}</div>
    </div>
  );
}

// Campo y rejilla: mismo contrato que el resto del sistema (`FormField`).
// Se reexportan con el nombre histórico de Finanzas para no romper imports.
export { FormField as FinanceField, FormGrid as FinanceFormGrid } from "@/components/ui/FormField";

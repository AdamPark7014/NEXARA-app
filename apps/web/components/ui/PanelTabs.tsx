"use client";

import { ReactNode } from "react";

/**
 * NEXARA · PanelTabs
 * Pestañas densas, profesionales, con tokens `--nx-panel-*`.
 * Uso en módulos ERP/OPS/CRM (estado local) — no confundir con TabBar de rutas.
 */

export type PanelTabItem<T extends string = string> = {
  key: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export default function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel = "Secciones",
}: {
  tabs: PanelTabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
}) {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        marginBottom: 18,
        borderBottom: "1px solid var(--nx-panel-hairline)",
        paddingBottom: 0,
      }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            onClick={() => onChange(t.key)}
            style={{
              appearance: "none",
              fontFamily: "inherit",
              padding: "9px 14px",
              marginBottom: -1,
              fontSize: 12.5,
              fontWeight: active ? 700 : 550,
              letterSpacing: active ? "-0.01em" : "0",
              cursor: t.disabled ? "not-allowed" : "pointer",
              opacity: t.disabled ? 0.45 : 1,
              border: "none",
              borderBottom: active
                ? "2px solid var(--panel-accent, var(--primary))"
                : "2px solid transparent",
              background: "transparent",
              color: active
                ? "var(--text-primary)"
                : "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              whiteSpace: "nowrap",
              transition: "color 140ms ease, border-color 140ms ease",
            }}
          >
            {t.label}
            {t.badge != null && t.badge !== "" && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: active
                    ? "color-mix(in srgb, var(--panel-accent, var(--primary)) 16%, transparent)"
                    : "var(--surface-2)",
                  color: active
                    ? "var(--panel-accent, var(--primary))"
                    : "var(--text-tertiary)",
                  border: "1px solid var(--nx-panel-hairline-soft)",
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

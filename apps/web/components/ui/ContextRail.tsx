"use client";

import { ReactNode } from "react";
import CrossPanelLink from "@/components/CrossPanelLink";

/**
 * NEXARA · ContextRail
 * Fila densa de píldoras de contexto (submódulos / cruce de catálogos).
 * Español profesional: tipografía compacta, sin pastillas de marketing.
 */

export type ContextRailItem = {
  id: string;
  label: ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

export default function ContextRail({
  items,
  ariaLabel = "Contexto",
}: {
  items: ContextRailItem[];
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 16,
        alignItems: "center",
      }}
    >
      {items.map((item) => {
        const style: React.CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 12px",
          borderRadius: 8,
          fontSize: 11.5,
          fontWeight: item.active ? 700 : 600,
          letterSpacing: "0.01em",
          textDecoration: "none",
          border: item.active
            ? "1px solid color-mix(in srgb, var(--panel-accent, var(--primary)) 38%, var(--border))"
            : "1px solid var(--nx-panel-hairline)",
          background: item.active
            ? "color-mix(in srgb, var(--panel-accent, var(--primary)) 10%, var(--surface))"
            : "var(--nx-panel-surface-overlay)",
          color: item.active
            ? "var(--text-primary)"
            : "var(--text-secondary)",
          boxShadow: item.active ? "var(--nx-panel-elev-1)" : "none",
          cursor: item.onClick || item.href ? "pointer" : "default",
          fontFamily: "inherit",
        };

        if (item.href) {
          return (
            <CrossPanelLink
              key={item.id}
              href={item.href}
              style={style}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </CrossPanelLink>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            style={{ ...style, appearance: "none" }}
            aria-pressed={item.active}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

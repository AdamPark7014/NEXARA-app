"use client";

import { ReactNode } from "react";

/**
 * NEXARA · EmptyState (premium)
 * Estado vacío profesional con icono en pill, jerarquía clara y
 * orientación al siguiente paso. Variantes "default" y "compact".
 */

type Variant = "default" | "compact";

function DefaultIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  variant?: Variant;
}) {
  const isCompact = variant === "compact";
  const resolvedIcon = icon ?? <DefaultIcon />;

  return (
    <div
      role="status"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: isCompact ? "22px 16px" : "36px 24px",
        gap: isCompact ? 8 : 12,
        background:
          "color-mix(in srgb, var(--surface-2) 55%, transparent)",
        border: "1px dashed var(--nx-panel-hairline)",
        borderRadius: "var(--nx-panel-radius-sm, 12px)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: isCompact ? 44 : 56,
          height: isCompact ? 44 : 56,
          borderRadius: 12,
          background:
            "color-mix(in srgb, var(--primary) 10%, var(--surface))",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isCompact ? 20 : 26,
          border: "1px solid color-mix(in srgb, var(--primary) 20%, var(--border))",
          boxShadow: "none",
        }}
      >
        {resolvedIcon}
      </div>
      <div>
        <h3
          style={{
            fontFamily: "var(--nx-font-display)",
            fontWeight: 700,
            fontSize: isCompact ? 15 : 17,
            margin: 0,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              fontSize: isCompact ? 12.5 : 13.5,
              color: "var(--text-secondary)",
              marginTop: 6,
              marginBottom: 0,
              maxWidth: 460,
              lineHeight: 1.55,
              marginInline: "auto",
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

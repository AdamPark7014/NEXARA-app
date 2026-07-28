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
        padding: isCompact ? "28px 18px" : "48px 28px",
        gap: isCompact ? 10 : 14,
        background:
          "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--primary) 5%, transparent) 0%, transparent 60%), color-mix(in srgb, var(--surface-2) 40%, transparent)",
        border: "1px dashed var(--nx-panel-hairline)",
        borderRadius: "var(--nx-panel-radius)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: isCompact ? 52 : 72,
          height: isCompact ? 52 : 72,
          borderRadius: 18,
          background:
            "linear-gradient(160deg, color-mix(in srgb, var(--primary) 16%, var(--surface)) 0%, color-mix(in srgb, var(--primary) 8%, var(--surface)) 100%)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isCompact ? 24 : 32,
          border: "1px solid color-mix(in srgb, var(--primary) 24%, var(--border))",
          boxShadow: "0 8px 18px color-mix(in srgb, var(--primary) 18%, transparent)",
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

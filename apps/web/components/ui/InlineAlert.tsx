"use client";

type Variant = "danger" | "warning" | "info" | "success";

const STYLES: Record<Variant, { bg: string; border: string; color: string }> = {
  danger: { bg: "var(--state-danger-bg, #fef2f2)", border: "var(--danger)", color: "var(--danger)" },
  warning: { bg: "var(--state-warning-bg, #fffbeb)", border: "var(--state-warning-border, #f59e0b)", color: "var(--state-warning-text, #b45309)" },
  info: { bg: "var(--surface-2)", border: "var(--border)", color: "var(--text-secondary)" },
  success: { bg: "#f0fdf4", border: "#22c55e", color: "#15803d" },
};

export default function InlineAlert({
  message,
  variant = "danger",
  onDismiss,
  style,
}: {
  message: string;
  variant?: Variant;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}) {
  const s = STYLES[variant];
  return (
    <div
      role="alert"
      style={{
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: 8,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}
        >
          ×
        </button>
      )}
    </div>
  );
}

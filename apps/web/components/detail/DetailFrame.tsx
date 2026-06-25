"use client";

import type { ReactNode } from "react";

export function DetailLoading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-secondary, #64748b)", fontSize: 14 }}>
      {label}
    </div>
  );
}

export function DetailError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        border: "1px solid color-mix(in srgb, #ef4444 35%, var(--border))",
        background: "color-mix(in srgb, #ef4444 8%, transparent)",
        color: "var(--text-primary)",
        fontSize: 14,
      }}
    >
      <p style={{ margin: "0 0 12px" }}>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="button-secondary" style={{ fontSize: 13 }}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function DetailSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      {title && (
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>{title}</h2>
      )}
      {children}
    </section>
  );
}

export function DetailFieldGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary, #94a3b8)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{value ?? "—"}</div>
    </div>
  );
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

export function formatMoney(value?: number | string | null) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

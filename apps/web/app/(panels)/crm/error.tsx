"use client";

import { useEffect } from "react";
import Link from "next/link";

function PanelError({
  panel,
  homeHref,
  error,
  reset,
}: {
  panel: string;
  homeHref: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[${panel}] Error boundary:`, error);
  }, [error, panel]);

  return (
    <div
      style={{
        padding: "40px 32px",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "var(--nx-font-ui, system-ui)",
      }}
    >
      <div
        style={{
          padding: 24,
          borderRadius: 14,
          background: "color-mix(in srgb, #ef4444 8%, #fff)",
          border: "1px solid color-mix(in srgb, #ef4444 25%, #e5e7eb)",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#b91c1c" }}>
          Error en {panel}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>
          No se pudo cargar esta sección. Puedes reintentar o volver al inicio del panel.
        </p>
        <pre
          style={{
            margin: "0 0 16px",
            padding: "12px 14px",
            borderRadius: 8,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "#111",
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              background: "#0f6ad6",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Reintentar
          </button>
          <Link
            href={homeHref}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              background: "#fff",
              color: "#0f6ad6",
              border: "1px solid #0f6ad6",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PanelError panel="CRM" homeHref="/crm" error={error} reset={reset} />;
}

"use client";

import { useEffect } from "react";

/**
 * Error boundary del panel ERP.
 * Captura cualquier excepción en el layout ERP o sus páginas hijas.
 * Muestra el mensaje y stack trace en pantalla para facilitar el diagnóstico.
 */
export default function ErpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ERP] Error capturado por error boundary:", error);
    console.error("[ERP] Stack:", error.stack);
  }, [error]);

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
          padding: "24px",
          borderRadius: 14,
          background: "color-mix(in srgb, #ef4444 8%, #fff)",
          border: "1px solid color-mix(in srgb, #ef4444 25%, #e5e7eb)",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 700,
            color: "#ef4444",
          }}
        >
          ⚠️ Error en el panel ERP
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>
          Ocurrió una excepción al cargar esta sección. El error aparece abajo — compártelo con el equipo técnico.
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
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          <strong>Mensaje:</strong> {error.message}
          {"\n\n"}
          <strong>Stack:</strong>{"\n"}
          {error.stack}
          {error.digest && `\n\nDigest: ${error.digest}`}
        </pre>
        <button
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
      </div>
    </div>
  );
}

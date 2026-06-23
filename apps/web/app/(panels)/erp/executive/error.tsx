"use client";

import { useEffect } from "react";

export default function ExecutiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Loguear en consola para facilitar diagnóstico
    console.error("[Executive] Error capturado por error boundary:", error);
    console.error("[Executive] Stack:", error.stack);
  }, [error]);

  return (
    <div
      style={{
        padding: "40px 32px",
        maxWidth: 700,
        margin: "0 auto",
        fontFamily: "var(--nx-font-ui, system-ui)",
      }}
    >
      <div
        style={{
          padding: "24px",
          borderRadius: 14,
          background: "color-mix(in srgb, var(--danger, #ef4444) 8%, var(--surface, #fff))",
          border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 25%, var(--border, #e5e7eb))",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--danger, #ef4444)",
          }}
        >
          ⚠️ Error en Vista Ejecutiva
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-secondary, #6b7280)" }}>
          Ocurrió un error al renderizar este módulo. El mensaje de error aparece abajo.
        </p>

        {/* Muestra el mensaje del error en pantalla para diagnóstico */}
        <pre
          style={{
            margin: "0 0 16px",
            padding: "12px 14px",
            borderRadius: 8,
            background: "var(--surface-2, #f9fafb)",
            border: "1px solid var(--border, #e5e7eb)",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "var(--text-primary, #111)",
            maxHeight: 300,
            overflow: "auto",
          }}
        >
          <strong>Mensaje:</strong> {error.message}
          {"\n\n"}
          <strong>Stack:</strong>{"\n"}
          {error.stack}
        </pre>

        <button
          onClick={reset}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            background: "var(--primary, #0f6ad6)",
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

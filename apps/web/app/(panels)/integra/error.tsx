"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function IntegraError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Integra] Error boundary:", error);
  }, [error]);

  return (
    <div style={{ padding: "40px 32px", maxWidth: 720, margin: "0 auto", fontFamily: "var(--nx-font-ui, system-ui)" }}>
      <div style={{ padding: 24, borderRadius: 14, background: "color-mix(in srgb, #ef4444 8%, #fff)", border: "1px solid color-mix(in srgb, #ef4444 25%, #e5e7eb)" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#b91c1c" }}>Error en Integra</h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>
          No se pudo cargar esta sección de seguridad. Puedes reintentar o volver a la consola Ops.
        </p>
        <pre style={{ margin: "0 0 16px", padding: "12px 14px", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 240, overflow: "auto" }}>
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={reset} style={{ padding: "8px 18px", borderRadius: 8, background: "#0f6ad6", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Reintentar
          </button>
          <Link href="/integra" style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #0f6ad6", color: "#0f6ad6", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Ir a Ops
          </Link>
        </div>
      </div>
    </div>
  );
}

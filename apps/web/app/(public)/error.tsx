"use client";

import { useEffect } from "react";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public route client error:", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#eef2f5",
        color: "#10243a",
      }}
    >
      <div
        style={{
          width: "min(640px, 100%)",
          background: "#ffffff",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 10px 35px rgba(16, 36, 58, 0.12)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: "1.6rem" }}>Ocurrio un error al cargar la pagina</h1>
        <p style={{ margin: "0 0 18px", opacity: 0.8 }}>
          Intenta recargar. Si el problema continua, limpia cache del navegador y vuelve a entrar.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "none",
            borderRadius: "10px",
            padding: "10px 16px",
            cursor: "pointer",
            background: "#0b5fff",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}

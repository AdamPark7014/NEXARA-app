"use client";

import { useEffect } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

export default function ExecutiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Executive] Error capturado por error boundary:", error);
  }, [error]);

  return (
    <EmptyState
      variant="page"
      icon="⚠️"
      title="No pudimos mostrar la vista ejecutiva"
      description={
        <>
          Algo falló al preparar esta pantalla. Intenta de nuevo; si persiste, avisa a soporte
          {error.digest ? ` con el código ${error.digest}` : ""}.
        </>
      }
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button variant="primary" onClick={reset}>Reintentar</Button>
          <Link href="/erp/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Ir al resumen general</Button>
          </Link>
        </div>
      }
    />
  );
}

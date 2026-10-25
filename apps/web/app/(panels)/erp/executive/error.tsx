"use client";

import { useEffect } from "react";
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
      title={
        error.digest
          ? `No pudimos mostrar la vista ejecutiva (${error.digest}).`
          : "No pudimos mostrar la vista ejecutiva."
      }
      action={<Button variant="primary" onClick={reset}>Reintentar</Button>}
    />
  );
}

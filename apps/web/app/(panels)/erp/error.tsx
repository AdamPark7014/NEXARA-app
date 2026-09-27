"use client";

import PanelError from "@/components/ui/PanelError";

export default function ErpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PanelError error={error} reset={reset} homeHref="/erp" scope="erp" />;
}

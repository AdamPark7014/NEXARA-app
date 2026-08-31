"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";

/** Legacy route — redirige al builder canónico (sin folio aleatorio). */
export default function NewQuoteRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/crm/quotes/builder${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return (
    <PageHeader
      eyebrow="CRM · Cotizaciones"
      title="Redirigiendo al constructor…"
      subtitle="Las cotizaciones nuevas se crean en el builder unificado."
    />
  );
}

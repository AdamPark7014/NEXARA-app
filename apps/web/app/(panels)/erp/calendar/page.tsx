"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CalendarRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/erp/reuniones?tab=agenda");
  }, [router]);
  return <p style={{ padding: 24 }}>Redirigiendo a Reuniones…</p>;
}
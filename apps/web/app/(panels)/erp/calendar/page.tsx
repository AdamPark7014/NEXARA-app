"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";

const TARGET = "/erp/reuniones?tab=agenda";

export default function CalendarRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(TARGET);
  }, [router]);
  return (
    <div role="status" aria-live="polite">
      <EmptyState
        variant="page"
        icon="📅"
        title="Abriendo tu agenda…"
        description={<>Si no avanza, <Link href={TARGET}>ábrela en Reuniones</Link>.</>}
      />
    </div>
  );
}

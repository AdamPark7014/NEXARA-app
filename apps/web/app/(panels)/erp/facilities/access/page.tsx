"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";

const DESTINO = "/integra/access";

export default function OfficesAccessRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(DESTINO);
  }, [router]);
  return (
    <div role="status" aria-live="polite">
      <EmptyState
        variant="page"
        icon="🔑"
        title="Accesos de oficinas"
        description={<>Si no avanza, <Link href={DESTINO}>ábralos en Integra</Link>.</>}
      />
    </div>
  );
}

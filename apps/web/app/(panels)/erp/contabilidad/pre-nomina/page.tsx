"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";

/** Hub prenómina: reutiliza la UI finance existente (paridad HR/Finance). */
export default function ContabilidadPrenominaPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/erp/finance/prenomina");
  }, [router]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Pre-nómina"
        subtitle="Redirigiendo al módulo de prenómina…"
        density="ops"
        actions={
          <Link href="/erp/finance/prenomina" style={{ fontSize: 12, fontWeight: 600 }}>
            Abrir prenómina
          </Link>
        }
      />
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
        Si no redirige, usa el enlace. La lógica vive en finance/HR; aquí solo el hub.
      </p>
    </>
  );
}

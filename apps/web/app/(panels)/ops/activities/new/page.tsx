"use client";

import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import OpsActivityForm from "@/components/ops/OpsActivityForm";

export default function NewActivityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = Number(searchParams.get("requestId") || 0);

  return (
    <>
      <PageHeader
        eyebrow="OPS · OT"
        title="Nueva orden de trabajo"
        subtitle="Asigna proyecto, responsable y tiempos."
        actions={
          <button
            type="button"
            onClick={() => router.push("/ops/activities")}
            style={{ fontSize: 13, color: "var(--primary)", background: "none", border: "none", cursor: "pointer" }}
          >
            ← Bandeja OT
          </button>
        }
      />
      <OpsActivityForm
        requestId={requestId > 0 ? requestId : undefined}
        onCancel={() => router.push("/ops/activities")}
        onSuccess={(id) => router.push(`/ops/activities/${id}`)}
      />
    </>
  );
}

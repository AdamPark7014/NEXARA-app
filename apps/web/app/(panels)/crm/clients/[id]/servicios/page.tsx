"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailField, DetailFieldGrid, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";

export default function ClientServicesPage() {
  const { client, error, reload } = useClientDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  if (!client.serviceClientId) {
    return (
      <EmptyState
        icon="🛠️"
        title="Servicios no provisionados"
        description="Este cliente aún no tiene handoff a operaciones. Provisiónalo desde Datos."
      />
    );
  }

  return (
    <DetailSection title="Servicios y operación">
      <DetailFieldGrid>
        <DetailField label="ID servicio" value={client.serviceClientId} />
        <DetailField label="Cuenta OPS" value={client.serviceClient?.name} />
      </DetailFieldGrid>
      <p style={{ marginTop: 16, fontSize: 13 }}>
        <Link href="/ops/service-clients" style={{ color: "var(--primary)", fontWeight: 600 }}>
          Abrir módulo de clientes de servicio →
        </Link>
      </p>
    </DetailSection>
  );
}

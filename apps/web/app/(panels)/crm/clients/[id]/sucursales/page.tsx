"use client";

import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailField, DetailFieldGrid, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";

export default function ClientBranchesPage() {
  const { client, error, reload } = useClientDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  const sc = client.serviceClient;

  if (!sc) {
    return (
      <EmptyState
        icon="🏢"
        title="Sin cuenta operativa"
        description="Activa el cliente en operación desde la pestaña Datos para gestionar sucursales y sitios."
      />
    );
  }

  return (
    <DetailSection title="Sucursal / cuenta operativa">
      <DetailFieldGrid>
        <DetailField label="Nombre en OPS" value={sc.name} />
        <DetailField label="Código de cuenta" value={sc.accountCode} />
        <DetailField label="Estado" value={sc.isActive ? "Activa" : "Inactiva"} />
      </DetailFieldGrid>
    </DetailSection>
  );
}

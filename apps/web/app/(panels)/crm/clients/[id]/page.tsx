"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { provisionSalesServiceClient } from "@/lib/sales-api";
import { DetailError, DetailField, DetailFieldGrid, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";

export default function ClientDetailPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { client, error, reload } = useClientDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  const provision = async () => {
    if (!token) return;
    try {
      await provisionSalesServiceClient(token, client.id);
      reload();
    } catch {
      /* ignore */
    }
  };

  return (
    <DetailSection title="Datos generales">
      <div style={{ marginBottom: 12 }}>
        <Tag variant={client.status === "Activo" ? "positive" : "neutral"}>{client.status || "Prospecto"}</Tag>
      </div>
      <DetailFieldGrid>
        <DetailField label="Nombre comercial" value={client.name} />
        <DetailField label="Razón social" value={client.legalName} />
        <DetailField label="RFC" value={client.taxId} />
        <DetailField label="Industria" value={client.industry} />
        <DetailField label="Email facturación" value={client.billingEmail} />
        <DetailField label="Teléfono" value={client.billingPhone} />
        <DetailField label="Sitio web" value={client.website} />
        <DetailField label="Dirección fiscal" value={client.fiscalAddress} />
      </DetailFieldGrid>
      {client.notes && (
        <div style={{ marginTop: 14 }}>
          <DetailField label="Notas" value={client.notes} />
        </div>
      )}
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!client.serviceClientId && (
          <Button variant="secondary" onClick={() => void provision()}>
            Activar en operación
          </Button>
        )}
        {client.serviceClientId && (
          <Link href={`/ops/service-clients`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", alignSelf: "center" }}>
            Ver en clientes de servicio →
          </Link>
        )}
      </div>
      {(client.opportunities?.length ?? 0) > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Oportunidades activas</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {client.opportunities!.map((o) => (
              <li key={o.id}>
                <Link href={`/crm/opportunities/${o.id}`} style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
                  {o.title}
                </Link>
                <span style={{ color: "var(--text-tertiary)", fontSize: 12, marginLeft: 8 }}>{o.stage}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailSection>
  );
}

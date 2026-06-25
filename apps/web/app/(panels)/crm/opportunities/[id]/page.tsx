"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDate, formatMoney } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";

const STAGE_LABELS: Record<string, string> = {
  DISCOVERY: "Discovery",
  QUALIFICATION: "Calificado",
  PROPOSAL: "Cotización",
  NEGOTIATION: "Negociación",
  CLOSING: "Cierre",
  WON: "Ganada",
  LOST: "Perdida",
};

export default function OpportunityDetailPage() {
  const { opportunity, error, reload } = useOpportunityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const clientName = opportunity.client?.name ?? opportunity.clientName ?? "—";

  return (
    <DetailSection title="Resumen del negocio">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Tag variant="accent">{STAGE_LABELS[opportunity.stage] ?? opportunity.stage}</Tag>
        <Tag variant="neutral">{opportunity.probability}% probabilidad</Tag>
      </div>
      <DetailFieldGrid>
        <DetailField label="Cliente" value={clientName} />
        <DetailField label="Monto" value={formatMoney(opportunity.value)} />
        <DetailField label="Cierre esperado" value={formatDate(opportunity.expectedCloseDate)} />
        <DetailField label="Ejecutivo" value={opportunity.owner?.nombre ?? "—"} />
      </DetailFieldGrid>
      {opportunity.description && (
        <div style={{ marginTop: 12 }}>
          <DetailField label="Descripción / plan de acción" value={opportunity.description} />
        </div>
      )}
      {opportunity.clientId && (
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <Link href={`/crm/clients/${opportunity.clientId}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
            Ver ficha del cliente →
          </Link>
        </p>
      )}
    </DetailSection>
  );
}

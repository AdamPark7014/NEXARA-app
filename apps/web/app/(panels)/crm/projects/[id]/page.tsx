"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import {
  DetailError,
  DetailField,
  DetailFieldGrid,
  DetailSection,
  formatDate,
  formatMoney,
} from "@/components/detail/DetailFrame";
import { useProjectDetail } from "@/components/crm/ProjectDetailShell";
import { formatSalesProjectStatus, provisionSalesProjectOperacion } from "@/lib/sales-api";

export default function CrmProjectDetailPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, summary, error, reload } = useProjectDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const p = summary.project;
  const opp = summary.opportunity;
  const ops = summary.operational;

  const provision = async () => {
    if (!token) return;
    try {
      await provisionSalesProjectOperacion(token, id);
      reload();
    } catch {
      /* ignore */
    }
  };

  return (
    <DetailSection title="Resumen del proyecto">
      <div style={{ marginBottom: 12 }}>
        <Tag variant={p.status === "CLOSED" ? "neutral" : p.status === "IN_PROGRESS" ? "accent" : "warning"}>
          {formatSalesProjectStatus(p.status)}
        </Tag>
      </div>
      <DetailFieldGrid>
        <DetailField label="Presupuesto" value={formatMoney(p.budget)} />
        <DetailField label="Margen" value={formatMoney(p.margin)} />
        <DetailField label="Inicio" value={formatDate(p.startDate)} />
        <DetailField label="Fin" value={formatDate(p.endDate)} />
        <DetailField label="Sitios" value={p.siteCount ?? "—"} />
        <DetailField label="Tipo" value={p.projectType ?? "—"} />
      </DetailFieldGrid>
      {p.scopeSummary && (
        <div style={{ marginTop: 12 }}>
          <DetailField label="Alcance" value={p.scopeSummary} />
        </div>
      )}
      {opp && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Oportunidad origen</h3>
          <Link href={`/crm/opportunities/${opp.id}`} style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
            {opp.title}
          </Link>
          {opp.client && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
              Cliente:{" "}
              <Link href={`/crm/clients/${opp.client.id}`} style={{ color: "var(--primary)" }}>
                {opp.client.legalName ?? opp.client.name}
              </Link>
            </p>
          )}
        </div>
      )}
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!ops && (
          <Button variant="secondary" onClick={() => void provision()}>
            Activar en operación
          </Button>
        )}
        {ops && (
          <Link href={`/ops/projects/${ops.id}`} style={{ textDecoration: "none" }}>
            <Button variant="secondary">Ver en OPS →</Button>
          </Link>
        )}
      </div>
    </DetailSection>
  );
}

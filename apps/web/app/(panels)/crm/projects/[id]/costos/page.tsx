"use client";

import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatMoney } from "@/components/detail/DetailFrame";
import { useProjectDetail } from "@/components/crm/ProjectDetailShell";

export default function ProjectCostsPage() {
  const { summary, error, reload } = useProjectDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const c = summary.costs;
  const actual = c.actual;

  return (
    <DetailSection title="Costos y margen">
      <DetailFieldGrid>
        <DetailField label="Presupuesto" value={formatMoney(c.budget)} />
        <DetailField label="Productos" value={formatMoney(c.costProducts)} />
        <DetailField label="Viáticos planeados" value={formatMoney(c.costViaticos)} />
        <DetailField label="Operativo planeado" value={formatMoney(c.costOperativo)} />
        <DetailField label="Costo total planeado" value={formatMoney(c.totalCost)} />
        <DetailField label="Margen planeado" value={`${formatMoney(c.margin)} (${c.marginPercent.toFixed(1)}%)`} />
      </DetailFieldGrid>
      {c.isOverBudget && (
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>⚠️ El costo planeado supera el presupuesto.</p>
      )}
      {actual?.hasOperationalLink && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Costos reales en campo</h3>
          <DetailFieldGrid>
            <DetailField label="Viáticos reales" value={formatMoney(actual.actualViaticos)} />
            <DetailField label="Operativo real" value={formatMoney(actual.actualOperativo)} />
            <DetailField label="Total real" value={formatMoney(actual.actualTotalWithProducts)} />
            <DetailField label="Margen real" value={`${formatMoney(actual.marginActual)} (${actual.marginActualPercent.toFixed(1)}%)`} />
            <DetailField label="OT completadas" value={`${actual.completedActivities} / ${actual.activityCount}`} />
          </DetailFieldGrid>
          {actual.isOverBudgetActual && (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>⚠️ Costos reales por encima del presupuesto.</p>
          )}
        </div>
      )}
    </DetailSection>
  );
}

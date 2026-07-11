"use client";

import KpiCard from "@/components/ui/KpiCard";
import { Money } from "@/components/ui/DataTable";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatMoney } from "@/components/detail/DetailFrame";
import { useProjectDetail } from "@/components/crm/ProjectDetailShell";

export default function ProjectCostsPage() {
  const { summary, error, reload } = useProjectDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const c = summary.costs;
  const actual = c.actual;

  const marginPct = c.marginPercent ?? 0;

  return (
    <DetailSection title="Costos y margen">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 18 }}>
        <KpiCard label="Presupuesto" value={<Money value={Number(c.budget ?? 0)} compact />} icon="💰" variant="accent" />
        <KpiCard label="Costo total" value={<Money value={Number(c.totalCost ?? 0)} compact />} variant={c.isOverBudget ? "danger" : "default"} icon="📊" />
        <KpiCard label="Margen" value={<Money value={Number(c.margin ?? 0)} compact />} variant={marginPct >= 20 ? "positive" : marginPct >= 10 ? "accent" : "warning"} icon="📈" hint={`${marginPct.toFixed(1)}%`} />
        <KpiCard label="Estado" value={c.isOverBudget ? "Sobre presupuesto" : "Dentro del rango"} variant={c.isOverBudget ? "danger" : "positive"} icon={c.isOverBudget ? "⚠️" : "✅"} />
      </div>
      {Number(c.totalCost ?? 0) > 0 && (() => {
        const costs = [
          { label: "Productos", amount: Number(c.costProducts ?? 0), color: "var(--primary)" },
          { label: "Viáticos", amount: Number(c.costViaticos ?? 0), color: "var(--warning)" },
          { label: "Operativo", amount: Number(c.costOperativo ?? 0), color: "#a855f7" },
        ].filter((r) => r.amount > 0);
        if (costs.length === 0) return null;
        const totalCost = costs.reduce((s, r) => s + r.amount, 0);
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Desglose planeado</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {costs.map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 40px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.amount / totalCost) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{Math.round((r.amount / totalCost) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
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

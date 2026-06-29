"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { updateSalesOpportunity, ALL_OPPORTUNITY_STAGES, formatOpportunityStage } from "@/lib/sales-api";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDate, formatMoney } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

const STAGE_VARIANT: Record<string, "accent" | "positive" | "warning" | "danger" | "neutral"> = {
  DISCOVERY: "neutral", QUALIFICATION: "neutral", PROPOSAL: "accent",
  NEGOTIATION: "warning", CLOSING: "warning", WON: "positive", LOST: "danger",
};

export default function OpportunityDetailPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { opportunity, error, reload } = useOpportunityDetail();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", stage: "DISCOVERY",
    value: 0, probability: 20, expectedCloseDate: "",
  });

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const openEdit = () => {
    setForm({
      title: opportunity.title ?? "",
      description: opportunity.description ?? "",
      stage: opportunity.stage ?? "DISCOVERY",
      value: Number(opportunity.value ?? 0),
      probability: opportunity.probability ?? 20,
      expectedCloseDate: opportunity.expectedCloseDate?.slice(0, 10) ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !form.title.trim()) return;
    setSaving(true);
    try {
      await updateSalesOpportunity(token, opportunity.id, {
        ...form,
        expectedCloseDate: form.expectedCloseDate || undefined,
      });
      reload();
      setEditing(false);
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally { setSaving(false); }
  };

  const clientName = opportunity.client?.name ?? opportunity.clientName ?? "—";

  if (editing) {
    return (
      <DetailSection title="Editar oportunidad">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Título *</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Nombre de la oportunidad" style={inp} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Etapa</label>
            <select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} style={inp}>
              {ALL_OPPORTUNITY_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Probabilidad (%)</label>
            <input type="number" min={0} max={100} value={form.probability}
              onChange={(e) => setForm((f) => ({ ...f, probability: Number(e.target.value) }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Valor estimado (MXN)</label>
            <input type="number" min={0} step={1000} value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha de cierre esperada</label>
            <input type="date" value={form.expectedCloseDate}
              onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción / plan de acción</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4} style={{ ...inp, resize: "vertical" }} placeholder="Contexto, siguientes pasos, acuerdos…" />
          </div>
        </div>
        {/* Probability bar */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Probabilidad: {form.probability}%</div>
          <input type="range" min={0} max={100} step={5} value={form.probability}
            onChange={(e) => setForm((f) => ({ ...f, probability: Number(e.target.value) }))}
            style={{ width: "100%", accentColor: "var(--primary)" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.title.trim()}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Resumen del negocio">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <Tag variant={STAGE_VARIANT[opportunity.stage] ?? "neutral"}>
          {formatOpportunityStage(opportunity.stage)}
        </Tag>
        <Tag variant="neutral">{opportunity.probability}% probabilidad</Tag>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={openEdit}>✎ Editar</Button>
      </div>

      {/* Probability bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${opportunity.probability}%`, background: "var(--primary)", borderRadius: 3, transition: "width .3s" }} />
        </div>
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
      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {opportunity.clientId && (
          <Link href={`/crm/clients/${opportunity.clientId}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
            Ver ficha del cliente →
          </Link>
        )}
        <Link href={`/crm/opportunities/${opportunity.id}/quotes`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
          Ver cotizaciones →
        </Link>
      </div>
    </DetailSection>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { updateSalesOpportunity, ALL_OPPORTUNITY_STAGES, formatOpportunityStage, createSalesProject } from "@/lib/sales-api";
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
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectErr, setProjectErr] = useState<string | null>(null);
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
    setSaveErr(null);
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
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const clientName = opportunity.client?.name ?? opportunity.clientName ?? "—";
  const hasProject = (opportunity.projects?.length ?? 0) > 0;

  const createProjectFromWin = async () => {
    if (!token) return;
    setCreatingProject(true);
    setProjectErr(null);
    try {
      const created = await createSalesProject(token, {
        opportunityId: opportunity.id,
        name: opportunity.title,
        budget: Number(opportunity.value ?? 0),
        scopeSummary: opportunity.description ?? undefined,
        status: "PLANNED",
      });
      reload();
      window.location.href = `/crm/projects/${created.id}`;
    } catch (e) {
      setProjectErr(e instanceof Error ? e.message : "No se pudo crear el proyecto");
    } finally {
      setCreatingProject(false);
    }
  };

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
          {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: "4px 0" }}>{saveErr}</p>}
          <Button variant="secondary" onClick={() => { setEditing(false); setSaveErr(null); }}>Cancelar</Button>
          <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.title.trim()}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Resumen del negocio">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Valor" value={<Money value={Number(opportunity.value ?? 0)} compact />} variant="accent" icon="💰" />
        <KpiCard label="Probabilidad" value={`${opportunity.probability ?? 0}%`} variant={(opportunity.probability ?? 0) >= 70 ? "positive" : (opportunity.probability ?? 0) >= 40 ? "warning" : "danger"} icon="🎯" />
        <KpiCard label="Etapa" value={formatOpportunityStage(opportunity.stage)} variant={STAGE_VARIANT[opportunity.stage] ?? "default"} icon="📋" />
        <KpiCard label="Cotizaciones" value={opportunity.quotes?.length ?? 0} icon="📄" hint="Asociadas" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <Tag variant={STAGE_VARIANT[opportunity.stage] ?? "neutral"}>
          {formatOpportunityStage(opportunity.stage)}
        </Tag>
        <Tag variant="neutral">{opportunity.probability}% probabilidad</Tag>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={openEdit}>✎ Editar</Button>
      </div>

      {/* Stage flow stepper */}
      {(() => {
        const MAIN_FLOW = [
          { key: "DISCOVERY", label: "Descubrimiento", icon: "🔍" },
          { key: "QUALIFICATION", label: "Calificación", icon: "📋" },
          { key: "PROPOSAL", label: "Propuesta", icon: "📄" },
          { key: "NEGOTIATION", label: "Negociación", icon: "🤝" },
          { key: "CLOSING", label: "Cierre", icon: "🔒" },
          { key: "WON", label: "Ganada", icon: "🏆" },
        ];
        const isLost = opportunity.stage === "LOST";
        const flow = isLost
          ? [
              ...MAIN_FLOW.slice(0, MAIN_FLOW.findIndex((s) => s.key === "CLOSING") + 1),
              { key: "LOST", label: "Perdida", icon: "✕" },
            ]
          : MAIN_FLOW;
        const activeIdx = flow.findIndex((s) => s.key === opportunity.stage);
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Etapa del negocio</div>
            <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
              {flow.map((step, idx) => {
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                const isWon = step.key === "WON" && active;
                const isLostStep = step.key === "LOST" && active;
                const color = isLostStep ? "var(--danger)" : (isWon || done || active) ? "var(--success)" : "var(--text-tertiary)";
                const bg = isLostStep
                  ? "color-mix(in srgb, var(--danger) 15%, var(--surface-2))"
                  : (isWon || done || active)
                    ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))"
                    : "var(--surface)";
                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < flow.length - 1 ? 1 : undefined }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 56 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: bg,
                        border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: done ? 12 : 14, fontWeight: 700, color,
                      }}>
                        {done ? "✓" : step.icon}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>
                        {step.label}
                      </span>
                    </div>
                    {idx < flow.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 2px", marginBottom: 18, minWidth: 10 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Probability bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${opportunity.probability}%`,
            background: opportunity.probability >= 70 ? "var(--success)" : opportunity.probability >= 40 ? "var(--primary)" : "var(--warning)",
            borderRadius: 3,
            transition: "width .3s",
          }} />
        </div>
      </div>

      <DetailFieldGrid>
        <DetailField label="Cliente" value={opportunity.clientId ? (
          <Link href={`/crm/clients/${opportunity.clientId}`} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            {clientName} →
          </Link>
        ) : clientName} />
        <DetailField label="Monto" value={formatMoney(opportunity.value)} />
        <DetailField label="Cierre esperado" value={formatDate(opportunity.expectedCloseDate)} />
        <DetailField label="Ejecutivo" value={opportunity.owner?.nombre ?? "—"} />
      </DetailFieldGrid>
      {opportunity.description && (
        <div style={{ marginTop: 12 }}>
          <DetailField label="Descripción / plan de acción" value={opportunity.description} />
        </div>
      )}

      {opportunity.stage === "WON" && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--success) 35%, var(--border))",
            background: "color-mix(in srgb, var(--success) 8%, var(--surface))",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Oportunidad ganada</div>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {hasProject
              ? "Proyecto comercial vinculado. Revisa orden de venta, operaciones y facturación desde Proyectos."
              : "Al firmar la cotización o marcar WON se crea el proyecto comercial automáticamente. También puedes crearlo manualmente aquí."}
          </p>
          {projectErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{projectErr}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!hasProject && (
              <Button variant="primary" size="sm" onClick={() => void createProjectFromWin()} disabled={creatingProject}>
                {creatingProject ? "Creando proyecto…" : "Crear proyecto comercial"}
              </Button>
            )}
            {hasProject && opportunity.projects?.[0] && (
              <Link href={`/crm/projects/${opportunity.projects[0].id}`}>
                <Button variant="primary" size="sm">Ver proyecto →</Button>
              </Link>
            )}
          </div>
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

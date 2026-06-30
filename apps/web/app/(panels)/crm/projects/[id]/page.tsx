"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
  formatSalesProjectStatus,
  provisionSalesProjectOperacion,
  updateSalesProject,
} from "@/lib/sales-api";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { toast } from "@/components/Toast";

const PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "CLOSED", "CANCELLED"];
const PROJECT_TYPES = ["Instalación", "Mantenimiento", "Consultoría", "Soporte", "Integración", "Otro"];

const toDateOnly = (iso?: string | null) => {
  if (!iso) return "";
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
};

type EditForm = {
  status: string;
  projectType: string;
  budget: string;
  costProducts: string;
  costViaticos: string;
  costOperativo: string;
  siteCount: string;
  startDate: string;
  endDate: string;
  scopeSummary: string;
};

export default function CrmProjectDetailPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "projects"), [user]);
  const { id, summary, error, reload } = useProjectDetail();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    status: "", projectType: "", budget: "", costProducts: "",
    costViaticos: "", costOperativo: "", siteCount: "", startDate: "", endDate: "", scopeSummary: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const openEdit = useCallback(() => {
    if (!summary) return;
    const p = summary.project;
    const c = summary.costs;
    setForm({
      status: p.status ?? "PLANNING",
      projectType: p.projectType ?? "",
      budget: c.budget != null ? String(c.budget) : "",
      costProducts: c.costProducts != null ? String(c.costProducts) : "",
      costViaticos: c.costViaticos != null ? String(c.costViaticos) : "",
      costOperativo: c.costOperativo != null ? String(c.costOperativo) : "",
      siteCount: p.siteCount != null ? String(p.siteCount) : "",
      startDate: toDateOnly(p.startDate),
      endDate: toDateOnly(p.endDate),
      scopeSummary: p.scopeSummary ?? "",
    });
    setSaveErr(null);
    setEditing(true);
  }, [summary]);

  const saveEdit = useCallback(async () => {
    if (!token || !id) return;
    setSaving(true); setSaveErr(null);
    try {
      await updateSalesProject(token, Number(id), {
        status: form.status || undefined,
        projectType: form.projectType || undefined,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        costProducts: form.costProducts ? parseFloat(form.costProducts) : undefined,
        costViaticos: form.costViaticos ? parseFloat(form.costViaticos) : undefined,
        costOperativo: form.costOperativo ? parseFloat(form.costOperativo) : undefined,
        siteCount: form.siteCount ? parseInt(form.siteCount) : undefined,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        scopeSummary: form.scopeSummary || undefined,
      });
      setEditing(false);
      reload();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  }, [token, id, form, reload]);

  const provision = async () => {
    if (!token) return;
    try { await provisionSalesProjectOperacion(token, id); reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo provisionar el proyecto"); }
  };

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const p = summary.project;
  const opp = summary.opportunity;
  const ops = summary.operational;
  const c = summary.costs;

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13,
  };
  const lbl = (text: string) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>{text}</span>
  );

  return (
    <DetailSection title="Resumen del proyecto">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <Tag variant={p.status === "CLOSED" ? "neutral" : p.status === "IN_PROGRESS" ? "accent" : "warning"}>
          {formatSalesProjectStatus(p.status)}
        </Tag>
        {cfg.canEdit && !editing && (
          <Button size="sm" variant="ghost" onClick={openEdit}>✎ Editar</Button>
        )}
      </div>

      {!editing ? (
        <>
          <DetailFieldGrid>
            <DetailField label="Presupuesto" value={formatMoney(c.budget)} />
            <DetailField label="Margen" value={formatMoney(c.margin)} />
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
            {!ops && <Button variant="secondary" onClick={() => void provision()}>Activar en operación</Button>}
            {ops && (
              <Link href={`/ops/projects/${ops.id}`} style={{ textDecoration: "none" }}>
                <Button variant="secondary">Ver en OPS →</Button>
              </Link>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Estado")}
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{formatSalesProjectStatus(s)}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Tipo de proyecto")}
              <select value={form.projectType} onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))} style={inp}>
                <option value="">— Sin tipo —</option>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Fecha inicio")}
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Fecha fin")}
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} style={inp} />
            </label>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 4 }}>
            Presupuesto y costos
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Presupuesto total")}
              <input type="number" min="0" step="0.01" value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="0.00" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Número de sitios")}
              <input type="number" min="0" step="1" value={form.siteCount}
                onChange={(e) => setForm((f) => ({ ...f, siteCount: e.target.value }))} placeholder="1" style={inp} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Costo productos")}
              <input type="number" min="0" step="0.01" value={form.costProducts}
                onChange={(e) => setForm((f) => ({ ...f, costProducts: e.target.value }))} placeholder="0.00" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Costo viáticos")}
              <input type="number" min="0" step="0.01" value={form.costViaticos}
                onChange={(e) => setForm((f) => ({ ...f, costViaticos: e.target.value }))} placeholder="0.00" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              {lbl("Costo operativo")}
              <input type="number" min="0" step="0.01" value={form.costOperativo}
                onChange={(e) => setForm((f) => ({ ...f, costOperativo: e.target.value }))} placeholder="0.00" style={inp} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            {lbl("Resumen de alcance")}
            <textarea value={form.scopeSummary} onChange={(e) => setForm((f) => ({ ...f, scopeSummary: e.target.value }))}
              rows={4} placeholder="Describe el alcance, entregables y requisitos…"
              style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
          </label>

          {saveErr && (
            <div style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
              {saveErr}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      )}
    </DetailSection>
  );
}

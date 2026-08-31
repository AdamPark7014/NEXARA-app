"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import CrossPanelLink from "@/components/CrossPanelLink";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { DetailError, DetailField, DetailFieldGrid, formatDate } from "@/components/detail/DetailFrame";
import { useOpsProjectDetail } from "@/components/ops/OpsProjectDetailShell";
import { useUser } from "@/components/UserContext";
import { formatOperationalProjectStatus, updateOperationalProject, updateOperationalProjectStatus } from "@/lib/ops-operational-api";
import { getActivitiesSectionConfig } from "@/lib/section-views";

const STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED"];
const PROJECT_TYPES = ["Instalación", "Mantenimiento", "Consultoría", "Soporte", "Integración", "Otro"];

const toDateOnly = (iso?: string | null) => {
  if (!iso) return "";
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
};

export default function OpsProjectSummaryPage() {
  const { project, error, reload, id } = useOpsProjectDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);
  const canEdit = cfg.canCreate || user?.isSuperAdmin;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ status: "", title: "", scopeSummary: "", description: "", notes: "", endDate: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const openEdit = useCallback(() => {
    if (!project) return;
    setForm({
      status: project.status ?? "ACTIVE",
      title: project.title ?? "",
      scopeSummary: project.scopeSummary ?? "",
      description: project.description ?? "",
      notes: "",
      endDate: toDateOnly(project.endDate),
    });
    setSaveErr(null);
    setEditing(true);
  }, [project]);

  const saveEdit = useCallback(async () => {
    if (!token || !id) return;
    setSaving(true); setSaveErr(null);
    try {
      if (form.status !== project?.status) {
        await updateOperationalProjectStatus(token, id, form.status, form.notes || undefined);
      }
      await updateOperationalProject(token, id, {
        title: form.title.trim() || undefined,
        scopeSummary: form.scopeSummary.trim() || undefined,
        description: form.description.trim() || undefined,
        endDate: form.endDate || null,
      });
      setEditing(false);
      reload();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  }, [token, id, form, reload]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!project) return null;

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13,
  };

  const activities = project.activities ?? [];
  const completedOTs = activities.filter(a => a.estatus === "COMPLETADA" || a.estatus === "COMPLETED" || a.estatus === "DONE").length;
  const activeOTs = activities.filter(a => a.estatus === "EN_CURSO" || a.estatus === "PROGRAMADA").length;
  const otPct = activities.length > 0 ? Math.round((completedOTs / activities.length) * 100) : 0;

  return (
    <>
      {activities.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
            <KpiCard label="OTs completadas" value={`${completedOTs}/${activities.length}`} variant={otPct >= 100 ? "positive" : otPct >= 50 ? "accent" : "default"} icon="✅" hint={`${otPct}% completado`} />
            <KpiCard label="En curso" value={activeOTs} variant={activeOTs > 0 ? "accent" : "default"} icon="⚙️" />
            <KpiCard label="Estado" value={formatOperationalProjectStatus(project.status)} variant={project.status === "COMPLETED" ? "positive" : project.status === "ACTIVE" ? "accent" : "warning"} icon="📋" />
            <KpiCard label="Sitios" value={project.siteCount ?? "—"} icon="📍" hint="Ubicaciones de campo" />
          </div>
          {/* Status stepper */}
          {(() => {
            const FLOW = [
              { key: "ACTIVE", label: "Activo", icon: "⚙️" },
              { key: "ON_HOLD", label: "En pausa", icon: "⏸" },
              { key: "COMPLETED", label: "Completado", icon: "✅" },
            ];
            const COMPLETED_FLOW = [
              { key: "ACTIVE", label: "Activo", icon: "⚙️" },
              { key: "COMPLETED", label: "Completado", icon: "✅" },
            ];
            const flow = project.status === "COMPLETED" ? COMPLETED_FLOW : FLOW;
            const activeIdx = flow.findIndex((s) => s.key === project.status);
            return (
              <div style={{ marginBottom: 12, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Estado del proyecto</div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {flow.map((step, idx) => {
                    const done = idx < activeIdx;
                    const active = idx === activeIdx;
                    const color = done || active ? "var(--success)" : "var(--text-tertiary)";
                    const bg = (done || active) ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))" : "var(--surface)";
                    return (
                      <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < flow.length - 1 ? 1 : undefined }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 60 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 12 : 14, fontWeight: 700, color }}>
                            {done ? "✓" : step.icon}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>{step.label}</span>
                        </div>
                        {idx < flow.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 4px", marginBottom: 18 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div style={{ marginBottom: 16, padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avance del proyecto</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: otPct >= 80 ? "var(--success)" : "var(--primary)" }}>{otPct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--surface)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${otPct}%`, background: otPct >= 100 ? "var(--success)" : "var(--primary)", borderRadius: 4, transition: "width .4s" }} />
            </div>
          </div>
        </>
      )}
      <Section title="Datos generales"
        actions={
          canEdit && !editing
            ? <Button size="sm" variant="ghost" onClick={openEdit}>✎ Editar</Button>
            : undefined
        }
      >
        {!editing ? (
          <>
            <DetailFieldGrid>
              <DetailField label="Cliente" value={project.client?.id ? (
                <CrossPanelLink href={`/crm/clients/${project.client.id}`} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                  {project.client.name} →
                </CrossPanelLink>
              ) : (project.client?.name ?? "—")} />
              <DetailField label="Responsable" value={project.vendor?.nombre} />
              <DetailField label="Inicio" value={formatDate(project.startDate)} />
              <DetailField label="Fin planeado" value={formatDate(project.endDate)} />
              <DetailField label="Tipo" value={project.projectType ?? "—"} />
              <DetailField label="Sitios" value={project.siteCount ?? "—"} />
              <DetailField label="Actividades" value={project.activities?.length ?? 0} />
            </DetailFieldGrid>
            {project.scopeSummary && (
              <div style={{ marginTop: 12 }}>
                <DetailField label="Alcance" value={project.scopeSummary} />
              </div>
            )}
            {project.description && (
              <div style={{ marginTop: 8 }}>
                <DetailField label="Descripción" value={project.description} />
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Read-only context */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
              <div><strong>Cliente:</strong> {project.client?.name ?? "—"}</div>
              <div><strong>Responsable:</strong> {project.vendor?.nombre ?? "—"}</div>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Alcance</span>
              <textarea value={form.scopeSummary} onChange={(e) => setForm((f) => ({ ...f, scopeSummary: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fin planeado</span>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} style={inp} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Estado *</span>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
                {STATUSES.map((s) => <option key={s} value={s}>{formatOperationalProjectStatus(s)}</option>)}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nota de actualización</span>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3} placeholder="Describe el motivo del cambio de estado, avances, observaciones…"
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
      </Section>

      {project.salesProjectId && (
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <CrossPanelLink href={`/crm/projects/${project.salesProjectId}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
            Ver proyecto comercial →
          </CrossPanelLink>
        </p>
      )}
    </>
  );
}

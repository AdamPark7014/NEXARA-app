"use client";

import { useCallback, useState } from "react";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { buildApiUrl } from "@/lib/api-base";
import { DetailError, DetailField, DetailFieldGrid, DetailSection, formatDate, formatDateTime } from "@/components/detail/DetailFrame";
import ActivityEvidenceReviewPanel from "@/components/ops/ActivityEvidenceReviewPanel";
import ActivityIssuesPanel from "@/components/ops/ActivityIssuesPanel";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";
import { activityStatusVariant } from "@/lib/activity-status";
import { countEvidenceFiles } from "@/lib/evidence-display";
import Link from "next/link";

const STATUSES = ["PROGRAMADA", "EN_CURSO", "COMPLETADA", "REPROGRAMAR", "CANCELADA"];
const PRIORITIES = ["BAJA", "MEDIA", "ALTA", "URGENTE"];

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

type EditForm = {
  estatus: string;
  prioridad: string;
  descripcion: string;
  indicaciones: string;
  fechaInicio: string;
  fechaEntregaEsperada: string;
  fechaFinalizacion: string;
};

export default function ActivityDetailPage() {
  const { activity, error, reload, id } = useActivityDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const v2 = resolveV2RoleKey(user);

  const canEdit =
    user?.isSuperAdmin ||
    v2 === ROLES.COORD_OPERACIONES ||
    v2 === ROLES.DIR_OPERACIONES ||
    v2 === ROLES.COORD_ADMIN ||
    v2 === ROLES.ING_CAMPO;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    estatus: "",
    prioridad: "",
    descripcion: "",
    indicaciones: "",
    fechaInicio: "",
    fechaEntregaEsperada: "",
    fechaFinalizacion: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const toDateLocal = (iso?: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
  };
  const toDateOnly = (iso?: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
  };

  const openEdit = useCallback(() => {
    if (!activity) return;
    setForm({
      estatus: activity.estatus ?? "PROGRAMADA",
      prioridad: activity.prioridad ?? "",
      descripcion: activity.descripcion ?? "",
      indicaciones: activity.indicaciones ?? "",
      fechaInicio: toDateLocal(activity.fechaInicio),
      fechaEntregaEsperada: toDateOnly(activity.fechaEntregaEsperada),
      fechaFinalizacion: toDateLocal(activity.fechaFinalizacion),
    });
    setSaveErr(null);
    setEditing(true);
  }, [activity]);

  const saveEdit = useCallback(async () => {
    if (!token || !id) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const payload: Record<string, string | null> = {
        estatus: form.estatus,
        prioridad: form.prioridad || null,
        descripcion: form.descripcion || null,
        indicaciones: form.indicaciones || null,
      };
      if (form.fechaInicio) payload.fechaInicio = new Date(form.fechaInicio).toISOString();
      if (form.fechaEntregaEsperada) payload.fechaEntregaEsperada = new Date(form.fechaEntregaEsperada).toISOString();
      if (form.fechaFinalizacion) payload.fechaFinalizacion = new Date(form.fechaFinalizacion).toISOString();
      await apiFetch(`activities/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(false);
      reload();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [token, id, form, reload]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const branch = [activity.branchName, activity.branchCity, activity.branchState].filter(Boolean).join(" · ");

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13,
  };

  const evidenceCount = countEvidenceFiles(activity.activityEvidence);

  const isCancelOrReschedule = activity.estatus === "CANCELADA" || activity.estatus === "REPROGRAMAR";
  const activityFlow: { key: string; label: string; icon: string }[] = isCancelOrReschedule
    ? [
        { key: "PROGRAMADA", label: "Programada", icon: "📅" },
        { key: activity.estatus, label: activity.estatus === "CANCELADA" ? "Cancelada" : "Reprogramar", icon: activity.estatus === "CANCELADA" ? "✕" : "🔄" },
      ]
    : [
        { key: "PROGRAMADA", label: "Programada", icon: "📅" },
        { key: "EN_CURSO", label: "En curso", icon: "⚙️" },
        { key: "COMPLETADA", label: "Completada", icon: "✅" },
      ];
  const activeFlowIdx = activityFlow.findIndex((s) => s.key === activity.estatus);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Estado" value={activity.estatus.replace(/_/g, " ")} variant={activityStatusVariant(activity.estatus)} icon="📋" />
        <KpiCard label="Prioridad" value={activity.prioridad || "—"} variant={activity.prioridad === "URGENTE" ? "danger" : activity.prioridad === "ALTA" ? "warning" : "default"} icon="⚡" />
        <KpiCard label="Evidencias" value={evidenceCount} icon="📎" hint="Archivos adjuntos" />
        <KpiCard label="Responsable" value={activity.responsable?.nombre ?? "—"} icon="👷" />
      </div>

      {/* Status flow stepper */}
      <div style={{ marginBottom: 16, padding: "14px 20px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Flujo de la OT</div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {activityFlow.map((step, idx) => {
            const done = idx < activeFlowIdx;
            const active = idx === activeFlowIdx;
            const isBad = active && (step.key === "CANCELADA" || step.key === "REPROGRAMAR");
            const color = isBad ? "var(--danger)" : (done || active) ? "var(--success)" : "var(--text-tertiary)";
            const bg = isBad
              ? "color-mix(in srgb, var(--danger) 15%, var(--surface-2))"
              : (done || active)
                ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))"
                : "var(--surface)";
            return (
              <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < activityFlow.length - 1 ? 1 : undefined }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 72 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", background: bg,
                    border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: done ? 14 : 16, fontWeight: 700, color,
                  }}>
                    {done ? "✓" : step.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>
                    {step.label}
                  </span>
                </div>
                {idx < activityFlow.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 4px", marginBottom: 20 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <DetailSection title="Información general">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tag variant={activityStatusVariant(activity.estatus)}>{activity.estatus.replace(/_/g, " ")}</Tag>
            {activity.prioridad && <Tag variant="warning">{activity.prioridad}</Tag>}
            {activity.ticketType && <Tag variant="neutral">{activity.ticketType}</Tag>}
          </div>
          {canEdit && !editing && (
            <Button size="sm" variant="ghost" onClick={openEdit}>✎ Editar</Button>
          )}
        </div>

        {!editing ? (
          <>
            <DetailFieldGrid>
              <DetailField label="Cliente" value={activity.client?.id ? (
                <Link href={`/crm/clients/${activity.client.id}`} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                  {activity.client.name} →
                </Link>
              ) : (activity.client?.name ?? "—")} />
              <DetailField label="Sucursal" value={branch || activity.branchAddress} />
              <DetailField label="Responsable" value={activity.responsable?.nombre} />
              <DetailField label="Creador" value={activity.creador?.nombre} />
              <DetailField label="Asignación" value={formatDateTime(activity.fechaAsignacion)} />
              <DetailField label="Inicio" value={formatDateTime(activity.fechaInicio)} />
              <DetailField label="Entrega esperada" value={formatDate(activity.fechaEntregaEsperada)} />
              <DetailField label="Finalización" value={formatDateTime(activity.fechaFinalizacion)} />
            </DetailFieldGrid>
            {activity.descripcion && (
              <div style={{ marginTop: 12 }}>
                <DetailField label="Descripción" value={activity.descripcion} />
              </div>
            )}
            {activity.indicaciones && (
              <div style={{ marginTop: 12 }}>
                <DetailField label="Indicaciones" value={activity.indicaciones} />
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
            {/* Read-only context */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
              <div><strong>Cliente:</strong> {activity.client?.name ?? "—"}</div>
              <div><strong>Sucursal:</strong> {branch || activity.branchAddress || "—"}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Estado *</span>
                <select value={form.estatus} onChange={(e) => setForm((f) => ({ ...f, estatus: e.target.value }))} style={inp}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Prioridad</span>
                <select value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))} style={inp}>
                  <option value="">— Sin prioridad —</option>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha inicio</span>
                <input type="datetime-local" value={form.fechaInicio} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Entrega esperada</span>
                <input type="date" value={form.fechaEntregaEsperada} onChange={(e) => setForm((f) => ({ ...f, fechaEntregaEsperada: e.target.value }))} style={inp} />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha finalización</span>
              <input type="datetime-local" value={form.fechaFinalizacion} onChange={(e) => setForm((f) => ({ ...f, fechaFinalizacion: e.target.value }))} style={inp} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
              <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3} placeholder="Descripción de la actividad…"
                style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Indicaciones / Notas internas</span>
              <textarea value={form.indicaciones} onChange={(e) => setForm((f) => ({ ...f, indicaciones: e.target.value }))}
                rows={3} placeholder="Instrucciones para el ingeniero, accesos, contactos…"
                style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
            </label>

            {saveErr && (
              <div style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                {saveErr}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.estatus}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Evidencias de campo">
        {activity.activityEvidence ? (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
              {countEvidenceFiles(activity.activityEvidence)} archivo(s) en el paquete de evidencias.
              {" "}
              <Link href={`/ops/activities/${id}/evidences`} style={{ color: "var(--primary)", fontWeight: 600 }}>
                Ver pestaña Evidencias →
              </Link>
            </p>
            <ActivityEvidenceReviewPanel activity={activity} showHeader={false} />
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            Aún no hay fotos ni documentos cargados para esta actividad.{" "}
            <Link href={`/ops/activities/${id}/evidences`} style={{ color: "var(--primary)", fontWeight: 600 }}>
              Ir a Evidencias
            </Link>{" "}
            para capturar entrada, fotos en sitio y salida.
          </p>
        )}
      </DetailSection>

      <DetailSection title="Incidencias y recomendaciones">
        <ActivityIssuesPanel activityId={Number(id)} token={token} canManage={Boolean(canEdit)} />
      </DetailSection>
    </>
  );
}

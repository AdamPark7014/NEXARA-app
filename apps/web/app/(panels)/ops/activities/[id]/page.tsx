"use client";

import { useCallback, useState } from "react";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
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
import { getMissingEvidence, parseApiErrorWithEvidence } from "@/lib/parse-missing-evidence";
import Link from "next/link";
import CrossPanelLink from "@/components/CrossPanelLink";

const STATUSES = [
  "Pendiente",
  "Asignada",
  "En Proceso",
  "Por Validar",
  "Finalizada",
  "Rechazada",
  "Cancelada",
];
const PRIORITIES = ["Baja", "Media", "Alta", "Urgente"];

function workTypeLabel(workType?: string | null): string {
  if (workType === "PREVENTIVE_INVENTORY") return "Inventario preventivo";
  return "Incidencia / servicio";
}

function normalizePriorityDisplay(raw?: string | null): string {
  if (!raw) return "";
  const key = raw.trim().toLowerCase();
  if (key === "baja" || key === "low") return "Baja";
  if (key === "media" || key === "medium") return "Media";
  if (key === "alta" || key === "high") return "Alta";
  if (key === "urgente" || key === "urgent") return "Urgente";
  return raw;
}

function flowStepForStatus(estatus: string): string {
  if (/cancel/i.test(estatus)) return "Cancelada";
  if (/rechaz/i.test(estatus)) return "Rechazada";
  if (/finaliz|complet/i.test(estatus)) return "Finalizada";
  if (/validar|validaci/i.test(estatus)) return "Por Validar";
  if (/proceso|curso/i.test(estatus)) return "En Proceso";
  if (/asignad/i.test(estatus)) return "Asignada";
  return "Pendiente";
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => `HTTP ${res.status}`);
    throw parseApiErrorWithEvidence(raw, res.status);
  }
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
  const [missingEvidence, setMissingEvidence] = useState<string[] | null>(null);

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
      estatus: flowStepForStatus(activity.estatus ?? "Pendiente"),
      prioridad: normalizePriorityDisplay(activity.prioridad) || "Media",
      descripcion: activity.descripcion ?? "",
      indicaciones: activity.indicaciones ?? "",
      fechaInicio: toDateLocal(activity.fechaInicio),
      fechaEntregaEsperada: toDateOnly(activity.fechaEntregaEsperada),
      fechaFinalizacion: toDateLocal(activity.fechaFinalizacion),
    });
    setSaveErr(null);
    setMissingEvidence(null);
    setEditing(true);
  }, [activity]);

  const saveEdit = useCallback(async () => {
    if (!token || !id) return;
    setSaving(true);
    setSaveErr(null);
    setMissingEvidence(null);
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
      const missing = getMissingEvidence(e);
      if (missing) {
        setMissingEvidence(missing);
        setSaveErr("No se puede finalizar: faltan evidencias mínimas");
        return;
      }
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

  const isCancelOrReschedule = /cancel|rechaz/i.test(activity.estatus);
  const activityFlow: { key: string; label: string; icon: string }[] = isCancelOrReschedule
    ? [
        { key: "Pendiente", label: "Pendiente", icon: "📅" },
        { key: flowStepForStatus(activity.estatus), label: flowStepForStatus(activity.estatus), icon: /cancel/i.test(activity.estatus) ? "✕" : "⛔" },
      ]
    : [
        { key: "Pendiente", label: "Pendiente", icon: "📅" },
        { key: "En Proceso", label: "En proceso", icon: "⚙️" },
        { key: "Por Validar", label: "Por validar", icon: "🔎" },
        { key: "Finalizada", label: "Finalizada", icon: "✅" },
      ];
  const activeFlowKey = flowStepForStatus(activity.estatus);
  const activeFlowIdx = Math.max(0, activityFlow.findIndex((s) => s.key === activeFlowKey));
  const priorityDisplay = normalizePriorityDisplay(activity.prioridad) || activity.prioridad || "—";
  const hasProject = Boolean(activity.projectId || activity.project?.id);

  return (
    <>
      {missingEvidence && missingEvidence.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <InlineAlert
            variant="warning"
            message="Faltan evidencias para marcar la OT como completada"
            onDismiss={() => setMissingEvidence(null)}
          />
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 13, color: "var(--text-secondary)" }}>
            {missingEvidence.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link href={`/ops/activities/${id}/evidences`} style={{ textDecoration: "none" }}>
            <Button size="sm" variant="primary" iconLeft="📸">Subir evidencias</Button>
          </Link>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Estado" value={activity.estatus.replace(/_/g, " ")} variant={activityStatusVariant(activity.estatus)} icon="📋" />
        <KpiCard label="Prioridad" value={priorityDisplay} variant={/urgente|alta/i.test(priorityDisplay) ? (/urgente/i.test(priorityDisplay) ? "danger" : "warning") : "default"} icon="⚡" />
        <KpiCard label="Evidencias" value={evidenceCount} icon="📎" hint="Archivos adjuntos" />
        <KpiCard label="Responsable" value={activity.responsable?.nombre ?? "—"} icon="👷" />
      </div>

      <DetailSection title="Contexto de la OT">
        <DetailFieldGrid>
          <DetailField
            label="Modo"
            value={hasProject ? "Con proyecto" : "Sin proyecto"}
          />
          <DetailField
            label="Proyecto"
            value={
              activity.project?.id ? (
                <Link href={`/ops/projects/${activity.project.id}`} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                  {activity.project.title} →
                </Link>
              ) : (
                "Sin proyecto operativo"
              )
            }
          />
          <DetailField label="Tipo de ticket" value={activity.ticketTypeCustom || activity.ticketType || "—"} />
          <DetailField label="Tipo de trabajo" value={workTypeLabel(activity.workType)} />
        </DetailFieldGrid>
      </DetailSection>

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
            {priorityDisplay !== "—" && <Tag variant="warning">{priorityDisplay}</Tag>}
            {activity.ticketType && <Tag variant="neutral">{activity.ticketType}</Tag>}
            <Tag variant={hasProject ? "accent" : "neutral"}>{hasProject ? "Con proyecto" : "Sin proyecto"}</Tag>
          </div>
          {canEdit && !editing && (
            <Button size="sm" variant="ghost" onClick={openEdit}>✎ Editar</Button>
          )}
        </div>

        {!editing ? (
          <>
            <DetailFieldGrid>
              <DetailField label="Cliente" value={activity.client?.id ? (
                <CrossPanelLink
                  href={
                    activity.client.salesClients?.[0]?.id
                      ? `/crm/clients/${activity.client.salesClients[0].id}`
                      : `/ops/service-clients/${activity.client.id}`
                  }
                  style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}
                >
                  {activity.client.name} →
                </CrossPanelLink>
              ) : (activity.client?.name ?? "—")} />
              <DetailField label="Sucursal" value={branch || activity.branchAddress} />
              <DetailField label="Responsable" value={activity.responsable?.nombre} />
              <DetailField label="Creador" value={activity.creador?.nombre} />
              <DetailField label="Asignación" value={formatDateTime(activity.fechaAsignacion)} />
              <DetailField label="Inicio" value={formatDateTime(activity.fechaInicio)} />
              {activity.acsEnteredAt && (
                <DetailField
                  label="ACS"
                  value={
                    <span style={{ color: "var(--success, #15803d)", fontWeight: 600 }}>
                      {(() => {
                        try {
                          const hhmm = new Intl.DateTimeFormat("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                            timeZone: "America/Mexico_City",
                          }).format(new Date(activity.acsEnteredAt));
                          const who = activity.acsEnteredByUser?.nombre
                            ? ` · ${activity.acsEnteredByUser.nombre}`
                            : "";
                          const door = activity.acsEntryDoor ? ` (${activity.acsEntryDoor})` : "";
                          return `Entró por ACS a las ${hhmm}${who}${door}`;
                        } catch {
                          return "Entró por ACS";
                        }
                      })()}
                      {activity.acsLeftSite && activity.acsExitedAt
                        ? ` · Salió ${formatDateTime(activity.acsExitedAt)}`
                        : ""}
                    </span>
                  }
                />
              )}
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
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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

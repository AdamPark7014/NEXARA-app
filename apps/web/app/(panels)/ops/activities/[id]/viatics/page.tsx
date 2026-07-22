"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import FileDropzone from "@/components/ui/FileDropzone";
import { Tag, Money } from "@/components/ui/DataTable";
import { listViaticsForActivity, type ViaticoRow } from "@/lib/ops-activities-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { resolveV2RoleKey } from "@/lib/user-access";
import { getViaticsSectionConfig } from "@/lib/section-views";
import { ROLES } from "@/lib/rbac";
import { assignViatico, postViatico } from "@/lib/viatics-api";
import { listUsers, type ApiUserRow } from "@/lib/users-api";
import { buildApiUrl } from "@/lib/api-base";

const CONCEPTOS = [
  { label: "Gasolina", categoria: "COMBUSTIBLE" },
  { label: "Caseta", categoria: "CASETA" },
  { label: "Alimentos", categoria: "ALIMENTACION" },
  { label: "Hospedaje", categoria: "HOSPEDAJE" },
  { label: "Transporte", categoria: "TRANSPORTE" },
  { label: "Herramientas", categoria: "OTROS" },
  { label: "Material", categoria: "OTROS" },
  { label: "Otro", categoria: "OTROS" },
] as const;

const EMPTY_FORM = { concepto: "", montoSolicitado: "", motivo: "" };

type FormMode = "request" | "assign" | null;

export default function ActivityViaticsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, activity, error, reload } = useActivityDetail();
  const v2 = resolveV2RoleKey(user);
  const cfg = getViaticsSectionConfig(user);

  const canCreate =
    !user?.isSuperAdmin &&
    v2 !== ROLES.CEO &&
    (v2 === ROLES.ING_CAMPO ||
      v2 === ROLES.ING_SOPORTE ||
      v2 === ROLES.COORD_OPERACIONES ||
      v2 === ROLES.ADMINISTRATIVO ||
      v2 === ROLES.COORD_ADMIN);

  const canAssign = cfg.canAssign;

  const [viatics, setViatics] = useState<ViaticoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viaticError, setViaticError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<{ id: number; nombre: string; placas?: string | null }[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [users, setUsers] = useState<ApiUserRow[]>([]);
  const [assigneeId, setAssigneeId] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setViaticError(null);
    void listViaticsForActivity(token, id)
      .then(setViatics)
      .catch((e) => setViaticError(e instanceof Error ? e.message : "No se pudieron cargar viáticos"))
      .finally(() => setLoading(false));
  }, [token, id, activity]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    void fetch(buildApiUrl("vehicles/inventory"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : (data?.data ?? []);
      })
      .then((rows: { id: number; nombre?: string; placas?: string | null }[]) => {
        setVehicles(
          rows.map((v) => ({
            id: v.id,
            nombre: v.nombre || `Vehículo #${v.id}`,
            placas: v.placas,
          })),
        );
      })
      .catch(() => setVehicles([]));
  }, [token]);

  useEffect(() => {
    if (!token || !canAssign) return;
    void listUsers(token, { limit: 200 })
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [token, canAssign]);

  const openForm = (mode: FormMode) => {
    setFormMode(mode);
    setSaveErr(null);
    setForm({ ...EMPTY_FORM });
    setEvidenceFile(null);
    setVehicleId("");
    setAssigneeId(
      mode === "assign" && activity?.responsable?.id
        ? String(activity.responsable.id)
        : "",
    );
  };

  const submit = async () => {
    if (!token || !id || !form.concepto || !form.montoSolicitado) return;
    const cat =
      CONCEPTOS.find((c) => c.label === form.concepto)?.categoria ?? "OTROS";
    const motivo = (form.motivo || form.concepto).trim();
    const monto = parseFloat(form.montoSolicitado);

    if (formMode === "request") {
      if (!evidenceFile) {
        setSaveErr("Debes adjuntar el ticket o comprobante");
        return;
      }
      setSaving(true);
      setSaveErr(null);
      try {
        await postViatico(
          token,
          {
            usuarioId: user?.id,
            actividadId: Number(id),
            motivo,
            montoSolicitado: monto,
            categoria: cat,
            vehicleId: vehicleId ? Number(vehicleId) : null,
          },
          evidenceFile,
        );
        setFormMode(null);
        void load();
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : "Error al solicitar viático");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (formMode === "assign") {
      if (!assigneeId) {
        setSaveErr("Selecciona el usuario beneficiario");
        return;
      }
      setSaving(true);
      setSaveErr(null);
      try {
        await assignViatico(token, {
          usuarioId: Number(assigneeId),
          actividadId: Number(id),
          motivo,
          montoSolicitado: monto,
          categoria: cat,
          vehicleId: vehicleId ? Number(vehicleId) : null,
        });
        setFormMode(null);
        void load();
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : "Error al asignar viático");
      } finally {
        setSaving(false);
      }
    }
  };

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;
  if (viaticError) return <DetailError message={viaticError} onRetry={() => void load()} />;

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13,
  };

  const totalMonto = viatics.reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);

  const aprobados = viatics.filter((v) => {
    const s = (v.estatus ?? "").toLowerCase();
    return s === "aprobado" || s === "pagado";
  }).length;
  const pendientes = viatics.filter((v) => {
    const s = (v.estatus ?? "Pendiente").toLowerCase();
    return s === "pendiente" || s.includes("aprobado_coordinador");
  }).length;

  const isAssign = formMode === "assign";
  const canSubmit =
    !!form.concepto &&
    !!form.montoSolicitado &&
    (isAssign ? !!assigneeId : !!evidenceFile);

  return (
    <>
      {viatics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
          <KpiCard label="Total viáticos" value={<Money value={totalMonto} compact />} variant="accent" icon="💰" />
          <KpiCard label="Registros" value={viatics.length} icon="📋" />
          <KpiCard label="Aprobados" value={aprobados} variant={aprobados > 0 ? "positive" : "default"} icon="✅" />
          <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        </div>
      )}
      <DetailSection title="Viáticos vinculados">
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {viatics.length > 0 && (
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)", marginRight: "auto" }}>
              Total: <strong><Money value={totalMonto} /></strong>
            </span>
          )}
          {canAssign && (
            <Button size="sm" variant="secondary" iconLeft="+"
              onClick={() => openForm("assign")}>
              Asignar viático
            </Button>
          )}
          {canCreate && (
            <Button size="sm" variant="primary" iconLeft="+"
              onClick={() => openForm("request")}>
              Solicitar viático
            </Button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>Cargando viáticos…</div>
        ) : viatics.length === 0 ? (
          <EmptyState icon="💳" title="Sin viáticos"
            description={
              canAssign
                ? "Asigna un viático al responsable o solicita uno para esta actividad."
                : canCreate
                  ? "Solicita un viático para esta actividad."
                  : "No hay solicitudes asociadas."
            } />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {viatics.map((v) => (
              <li key={v.id} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{v.motivo ?? `Viático #${v.id}`}</span>
                  <Tag variant={
                    (v.estatus ?? "").includes("Aprobado") || (v.estatus ?? "").includes("APROBADO") || v.estatus === "Pagado"
                      ? "positive"
                      : (v.estatus ?? "").includes("Rechaz") || (v.estatus ?? "").includes("RECHAZ")
                        ? "danger"
                        : "warning"
                  }>
                    {(v.estatus ?? "Pendiente").replace(/_/g, " ")}
                  </Tag>
                </div>
                <div style={{ fontSize: 13 }}>
                  <Money value={Number(v.montoSolicitado)} />
                  {v.motivo && <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>· {v.motivo}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {v.User?.nombre ?? "—"} · {formatDateTime(v.fechaSolicitud)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {formMode && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setFormMode(null)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {isAssign ? "Asignar viático" : "Solicitar viático"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>
              OT: <strong>{(activity as Record<string, unknown>).anNumber as string ?? `#${id}`}</strong>
              {isAssign
                ? " · Presupuesto anticipado (sin comprobante aún)"
                : " · Requiere ticket o comprobante"}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {isAssign && (
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Asignar a *</span>
                  <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={inp} autoFocus>
                    <option value="">— Seleccionar usuario —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}{u.employeeNumber ? ` · ${u.employeeNumber}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto *</span>
                <select
                  value={form.concepto}
                  onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
                  style={inp}
                  autoFocus={!isAssign}
                >
                  <option value="">— Seleccionar —</option>
                  {CONCEPTOS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto (MXN) *</span>
                <input type="number" min="0" step="0.01" value={form.montoSolicitado}
                  onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: e.target.value }))}
                  placeholder="0.00" style={inp} />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo / Descripción</span>
                <textarea value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                  rows={3} placeholder="Destino, propósito, justificación…"
                  style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vehículo (opcional)</span>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inp}>
                  <option value="">— Sin vehículo —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>
                  ))}
                </select>
              </label>

              {!isAssign && (
                <FileDropzone
                  file={evidenceFile}
                  onFile={setEvidenceFile}
                  label="Ticket / comprobante"
                  required
                  hint="Obligatorio · PDF o imagen"
                />
              )}

              {saveErr && (
                <div style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {saveErr}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setFormMode(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !canSubmit}>
                {saving ? "Guardando…" : isAssign ? "Asignar" : "Solicitar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

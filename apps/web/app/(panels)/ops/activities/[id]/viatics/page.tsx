"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import { Tag, Money } from "@/components/ui/DataTable";
import { listViaticsForActivity, type ViaticoRow } from "@/lib/ops-activities-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

const CONCEPTOS = ["Gasolina", "Caseta", "Alimentos", "Hospedaje", "Herramientas", "Transporte", "Material", "Otro"];

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

const EMPTY_FORM = { concepto: "", montoSolicitado: "", motivo: "" };

export default function ActivityViaticsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, activity, error, reload } = useActivityDetail();
  const v2 = resolveV2RoleKey(user);

  const canCreate =
    user?.isSuperAdmin ||
    v2 === ROLES.ING_CAMPO ||
    v2 === ROLES.ING_SOPORTE ||
    v2 === ROLES.COORD_OPERACIONES;

  const [viatics, setViatics] = useState<ViaticoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viaticError, setViaticError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

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

  const submit = async () => {
    if (!token || !id || !form.concepto || !form.montoSolicitado) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await apiFetch("viatics", token, {
        method: "POST",
        body: JSON.stringify({
          actividadId: id,
          concepto: form.concepto,
          montoSolicitado: parseFloat(form.montoSolicitado),
          motivo: form.motivo || undefined,
        }),
      });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al solicitar viático");
    } finally {
      setSaving(false);
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

  const aprobados = viatics.filter((v) => v.estatus === "APROBADO").length;
  const pendientes = viatics.filter((v) => v.estatus === "PENDIENTE" || !v.estatus).length;

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          {viatics.length > 0 && (
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Total: <strong><Money value={totalMonto} /></strong>
            </span>
          )}
          {canCreate && (
            <Button size="sm" variant="primary" iconLeft="+"
              onClick={() => { setShowForm(true); setSaveErr(null); setForm({ ...EMPTY_FORM }); }}
              style={{ marginLeft: "auto" }}>
              Solicitar viático
            </Button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>Cargando viáticos…</div>
        ) : viatics.length === 0 ? (
          <EmptyState icon="💳" title="Sin viáticos"
            description={canCreate ? "Solicita un viático para esta actividad." : "No hay solicitudes asociadas."} />
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

      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Solicitar viático</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>
              OT: <strong>{(activity as Record<string, unknown>).anNumber as string ?? `#${id}`}</strong>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto *</span>
                <select value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} style={inp} autoFocus>
                  <option value="">— Seleccionar —</option>
                  {CONCEPTOS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto solicitado (MXN) *</span>
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

              {saveErr && (
                <div style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {saveErr}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.concepto || !form.montoSolicitado}>
                {saving ? "Enviando…" : "Solicitar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

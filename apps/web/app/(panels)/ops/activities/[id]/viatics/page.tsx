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
import { ROLES } from "@/lib/rbac";
import { postViatico } from "@/lib/viatics-api";
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

export default function ActivityViaticsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, activity, error, reload } = useActivityDetail();
  const v2 = resolveV2RoleKey(user);

  const canCreate =
    !user?.isSuperAdmin &&
    v2 !== ROLES.CEO &&
    (v2 === ROLES.ING_CAMPO ||
      v2 === ROLES.ING_SOPORTE ||
      v2 === ROLES.COORD_OPERACIONES ||
      v2 === ROLES.ADMINISTRATIVO ||
      v2 === ROLES.COORD_ADMIN);

  const [viatics, setViatics] = useState<ViaticoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viaticError, setViaticError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<{ id: number; nombre: string; placas?: string | null }[]>([]);
  const [vehicleId, setVehicleId] = useState("");

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

  const submit = async () => {
    if (!token || !id || !form.concepto || !form.montoSolicitado) return;
    if (!evidenceFile) {
      setSaveErr("Debes adjuntar el ticket o comprobante");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const cat =
        CONCEPTOS.find((c) => c.label === form.concepto)?.categoria ?? "OTROS";
      await postViatico(
        token,
        {
          usuarioId: user?.id,
          actividadId: Number(id),
          motivo: (form.motivo || form.concepto).trim(),
          montoSolicitado: parseFloat(form.montoSolicitado),
          categoria: cat,
          vehicleId: vehicleId ? Number(vehicleId) : null,
        },
        evidenceFile,
      );
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setEvidenceFile(null);
      setVehicleId("");
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

  const aprobados = viatics.filter((v) => {
    const s = (v.estatus ?? "").toLowerCase();
    return s === "aprobado" || s === "pagado";
  }).length;
  const pendientes = viatics.filter((v) => {
    const s = (v.estatus ?? "Pendiente").toLowerCase();
    return s === "pendiente" || s.includes("aprobado_coordinador");
  }).length;

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
      {viatics.length > 0 && (() => {
        const byConcepto: Record<string, number> = {};
        for (const v of viatics) { const c = v.motivo ?? "Otro"; byConcepto[c] = (byConcepto[c] ?? 0) + 1; }
        const byEstatus: Record<string, number> = {};
        for (const v of viatics) { const s = v.estatus ?? "PENDIENTE"; byEstatus[s] = (byEstatus[s] ?? 0) + 1; }
        const total = viatics.length;
        const estatusColors: Record<string, string> = { APROBADO: "var(--success)", PENDIENTE: "var(--warning)", RECHAZADO: "var(--danger)", PAGADO: "var(--primary)" };
        return (
          <div style={{ marginBottom: 14, padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Estado de viáticos</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(byEstatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "90px 1fr 30px", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 500 }}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
                  <div style={{ height: 5, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: estatusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <DetailSection title="Viáticos vinculados">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          {viatics.length > 0 && (
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Total: <strong><Money value={totalMonto} /></strong>
            </span>
          )}
          {canCreate && (
            <Button size="sm" variant="primary" iconLeft="+"
              onClick={() => { setShowForm(true); setSaveErr(null); setForm({ ...EMPTY_FORM }); setEvidenceFile(null); setVehicleId(""); }}
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
                  {CONCEPTOS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
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

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vehículo (opcional)</span>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inp}>
                  <option value="">— Sin vehículo —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>
                  ))}
                </select>
              </label>

              <FileDropzone
                file={evidenceFile}
                onFile={setEvidenceFile}
                label="Ticket / comprobante"
                required
                hint="Obligatorio · PDF o imagen"
              />

              {saveErr && (
                <div style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {saveErr}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.concepto || !form.montoSolicitado || !evidenceFile}>
                {saving ? "Enviando…" : "Solicitar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

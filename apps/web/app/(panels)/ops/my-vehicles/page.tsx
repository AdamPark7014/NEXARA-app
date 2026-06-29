"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getVehiclesSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";

interface Vehicle {
  id: number;
  marca?: string;
  modelo?: string;
  placas?: string;
  year?: number;
  estado?: string;
  poliza?: string;
  verificacionVence?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

const INCIDENT_TYPES = ["Accidente de tráfico", "Daño en carrocería", "Avería mecánica", "Robo de pertenencias", "Llanta ponchada", "Falla eléctrica", "Cristal roto", "Otro"];

export default function MyVehiclesPage() {
  const { user } = useUser();
  useOpsCanonicalRoute(user, "vehicles");
  const cfg = useMemo(() => getVehiclesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incidentVehicle, setIncidentVehicle] = useState<Vehicle | null>(null);
  const [incidentForm, setIncidentForm] = useState({ tipo: "", descripcion: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("vehicles", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tus vehículos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openIncident = (v: Vehicle) => {
    setIncidentVehicle(v);
    setIncidentForm({ tipo: "", descripcion: "" });
    setSaveErr(null);
  };

  const submitIncident = async () => {
    if (!incidentVehicle || !token || !incidentForm.descripcion) return;
    setSaving(true); setSaveErr(null);
    try {
      const nota = [incidentForm.tipo, incidentForm.descripcion].filter(Boolean).join(": ");
      await apiFetch(`vehicles/${incidentVehicle.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ estado: "Fuera_de_servicio", incidenteNotas: nota }),
      });
      setIncidentVehicle(null);
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al reportar incidente");
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13,
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus vehículos asignados." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && items.length === 0 && <EmptyState icon="🚗" title="Sin vehículo asignado" description="Actualmente no tienes una unidad asignada." />}

      {!loading && !error && items.length > 0 && (
        <Section title="Tu unidad">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {items.map((v) => (
              <article key={v.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>{v.marca} {v.modelo}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Placas {v.placas ?? "—"} · Año {v.year}</div>
                  </div>
                  <Tag variant={v.estado === "Fuera_de_servicio" ? "danger" : "positive"}>{(v.estado ?? "—").replace(/_/g, " ")}</Tag>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Póliza: {v.poliza ?? "—"} · Verificación: {v.verificacionVence ? new Date(v.verificacionVence).toLocaleDateString("es-MX") : "—"}
                </div>
                <Button size="sm" variant="danger" onClick={() => openIncident(v)}>⚠️ Reportar incidente</Button>
              </article>
            ))}
          </div>
        </Section>
      )}

      {incidentVehicle && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setIncidentVehicle(null)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>⚠️ Reportar incidente</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>
              Unidad: <strong>{incidentVehicle.marca} {incidentVehicle.modelo}</strong> · Placas {incidentVehicle.placas ?? "—"}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo de incidente</span>
                <select value={incidentForm.tipo} onChange={(e) => setIncidentForm((f) => ({ ...f, tipo: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción *</span>
                <textarea
                  value={incidentForm.descripcion}
                  onChange={(e) => setIncidentForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={4}
                  placeholder="Describe qué ocurrió, dónde, hora aproximada, daños visibles…"
                  style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
                  autoFocus
                />
              </label>
              {saveErr && (
                <div style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {saveErr}
                </div>
              )}
              <div style={{ padding: "10px 12px", background: "var(--state-warning-bg,#fffbeb)", border: "1px solid var(--warning,#f59e0b)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                Al reportar, la unidad quedará marcada como <strong>Fuera de servicio</strong> y se notificará a Administración.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setIncidentVehicle(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => void submitIncident()} disabled={saving || !incidentForm.descripcion}>
                {saving ? "Enviando…" : "Reportar incidente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

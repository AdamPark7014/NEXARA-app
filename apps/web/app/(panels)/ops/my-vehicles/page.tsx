"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import VehicleRequestForm from "@/components/VehicleRequestForm";
import VehicleCheckoutForm from "@/components/VehicleCheckoutForm";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getVehiclesSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";

interface VehicleRequest {
  id: number;
  nombreVehiculo?: string | null;
  placasVehiculo?: string | null;
  estatusAprobacion: string;
  entregaEstatus?: string | null;
  fechaInicioAprobada?: string | null;
  fechaFinAprobada?: string | null;
  fechaInicioSolicitada?: string | null;
  fechaFinSolicitada?: string | null;
  odometroInicio?: number | null;
  odometroFin?: number | null;
  fotosSalida?: unknown;
  fotosDevolucion?: unknown;
  renovacionEstatus?: string | null;
}

type CheckoutMode = "salida" | "devolucion" | null;

export default function MyVehiclesPage() {
  const { user } = useUser();
  useOpsCanonicalRoute(user, "vehicles");
  const cfg = useMemo(() => getVehiclesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<VehicleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<VehicleRequest | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("vehicles"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openCheckout = (v: VehicleRequest, mode: CheckoutMode) => {
    setCheckoutTarget(v);
    setCheckoutMode(mode);
    setActionErr(null);
  };

  const submitCheckout = async (payload: {
    files: Record<string, File | null>;
    odometroKm: number;
    combustiblePct: number;
  }) => {
    if (!token || !checkoutTarget || !checkoutMode) return;
    setCheckoutSaving(true);
    setActionErr(null);
    try {
      const form = new FormData();
      form.append("odometroKm", String(payload.odometroKm));
      form.append("combustiblePct", String(payload.combustiblePct));
      for (const [key, file] of Object.entries(payload.files)) {
        if (file) form.append(key, file);
      }
      const path = checkoutMode === "salida" ? `vehicles/${checkoutTarget.id}/start-use` : `vehicles/${checkoutTarget.id}/end-use`;
      const res = await fetch(buildApiUrl(path), { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setCheckoutTarget(null);
      setCheckoutMode(null);
      void load();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al enviar evidencia");
    } finally {
      setCheckoutSaving(false);
    }
  };

  const requestRenewal = async (id: number, inicio: string, fin: string) => {
    if (!token || !inicio || !fin) return;
    const res = await fetch(buildApiUrl(`vehicles/${id}/renewal`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ renovacionSolicitadaInicio: inicio, renovacionSolicitadaFin: fin }),
    });
    if (!res.ok) setActionErr(await res.text().catch(() => "Error al solicitar renovación"));
    else void load();
  };

  const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString("es-MX") : "—");

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowRequest((s) => !s)}>
                {showRequest ? "Ocultar formulario" : "Solicitar vehículo"}
              </Button>
            )}
          </>
        }
      />

      {showRequest && cfg.canCreate && (
        <Section title="Nueva solicitud">
          <VehicleRequestForm />
        </Section>
      )}

      {actionErr && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {actionErr}
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} solicitudes`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus solicitudes de vehículo." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState icon="🚗" title="Sin solicitudes" description="Solicita un vehículo para tu actividad de campo." action={cfg.canCreate ? <Button size="sm" variant="primary" onClick={() => setShowRequest(true)}>Solicitar vehículo</Button> : undefined} />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((v) => (
              <article key={v.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{v.nombreVehiculo ?? "Vehículo"} · {v.placasVehiculo ?? "—"}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Solicitud #{v.id}</div>
                  </div>
                  <Tag variant={v.estatusAprobacion === "Aprobado" ? "positive" : v.estatusAprobacion === "Rechazado" ? "danger" : "warning"}>
                    {v.estatusAprobacion}
                  </Tag>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, fontSize: 12, marginBottom: 12 }}>
                  <div><strong>Solicitado:</strong><br />{fmt(v.fechaInicioSolicitada)} → {fmt(v.fechaFinSolicitada)}</div>
                  <div><strong>Aprobado:</strong><br />{fmt(v.fechaInicioAprobada)} → {fmt(v.fechaFinAprobada)}</div>
                  <div><strong>Uso:</strong><br />{v.entregaEstatus ?? "Pendiente"}</div>
                  {v.odometroInicio != null && <div><strong>Km inicio/fin:</strong><br />{v.odometroInicio} / {v.odometroFin ?? "—"}</div>}
                </div>
                {v.estatusAprobacion === "Aprobado" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!v.fotosSalida && (
                      <Button size="sm" variant="primary" onClick={() => openCheckout(v, "salida")}>📸 Registrar salida (4+4 + odómetro)</Button>
                    )}
                    {v.fotosSalida && !v.fotosDevolucion && (
                      <Button size="sm" variant="secondary" onClick={() => openCheckout(v, "devolucion")}>📸 Registrar entrega</Button>
                    )}
                    {v.entregaEstatus === "En uso" && (
                      <RenewalInline id={v.id} onSubmit={requestRenewal} />
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Section>

      {checkoutTarget && checkoutMode && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => { setCheckoutTarget(null); setCheckoutMode(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <VehicleCheckoutForm mode={checkoutMode} loading={checkoutSaving} onSubmit={submitCheckout} />
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => { setCheckoutTarget(null); setCheckoutMode(null); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RenewalInline({ id, onSubmit }: { id: number; onSubmit: (id: number, inicio: string, fin: string) => void }) {
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} style={{ fontSize: 11, padding: 4 }} />
      <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} style={{ fontSize: 11, padding: 4 }} />
      <Button size="sm" variant="ghost" onClick={() => onSubmit(id, inicio, fin)}>Renovar tiempo</Button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Viatico {
  id: number;
  concepto?: string;
  montoSolicitado?: number;
  estatus?: string;
  fechaSolicitud?: string;
  actividad?: { id: number; folio?: string } | null;
}

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

const emptyForm = { concepto: "", montoSolicitado: 0 };

export default function MyViaticsPage() {
  const { user } = useUser();
  const { canCreate } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Viatico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("viatics", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tus viáticos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pendiente = items.filter((v) => v.estatus !== "Rechazado" && v.estatus !== "Pagado").reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);
  const pagado = items.filter((v) => v.estatus === "Pagado").reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);

  const submit = async () => {
    if (!token || !form.concepto || !form.montoSolicitado) return;
    setSaving(true);
    try {
      await apiFetch("viatics", token, { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const estatusVariant = (e?: string): "positive" | "warning" | "danger" | "accent" => {
    if (e === "Aprobado" || e === "Pagado") return "positive";
    if (e === "Rechazado") return "danger";
    if (e === "Aprobado_Coordinador") return "accent";
    return "warning";
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<Viatico>[] = [
    { key: "concepto", label: "Concepto", accessor: (v) => v.concepto ?? "—" },
    { key: "montoSolicitado", label: "Monto", align: "right" as const, render: (v) => <Money value={Number(v.montoSolicitado) || 0} />, width: 110 },
    { key: "fechaSolicitud", label: "Fecha", render: (v) => <span style={{ fontSize: 12 }}>{v.fechaSolicitud ? new Date(v.fechaSolicitud).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    { key: "estatus", label: "Estado", render: (v) => <Tag variant={estatusVariant(v.estatus)}>{(v.estatus ?? "Pendiente").replace(/_/g, " ")}</Tag>, width: 160 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="Mis viáticos"
        subtitle="Solicita anticipos y revisa el estado de tus comprobaciones. Tu coordinador y administración aprueban el flujo."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Solicitar viático</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Pendiente de cobro" value={`$${pendiente.toLocaleString("es-MX")}`} variant="warning" icon="⏳" />
        <KpiCard label="Pagado" value={`$${pagado.toLocaleString("es-MX")}`} variant="positive" icon="💳" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} solicitudes`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus viáticos." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(v) => v.id} emptyTitle="Sin solicitudes" emptyDescription="Solicita tu primer viático con el botón de arriba." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Solicitar viático</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto</span>
                <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} placeholder="Hospedaje + gasolina Puebla" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto solicitado ($)</span>
                <input type="number" min={0} value={form.montoSolicitado} onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: Number(e.target.value) }))} style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.concepto || !form.montoSolicitado}>{saving ? "Enviando…" : "Enviar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

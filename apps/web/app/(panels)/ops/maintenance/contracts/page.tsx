"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface Contract {
  id: number;
  contractNumber: string;
  title: string;
  frequency: string;
  slaResponseHours: number;
  slaResolutionHours: number;
  monthlyFee: number | string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";
  nextVisitDate?: string | null;
  client?: { id: number; name: string };
  branch?: { id: number; name: string } | null;
  owner?: { id: number; nombre: string } | null;
  _count?: { visits: number };
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

const FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const;
const FREQ_LABEL: Record<string, string> = { WEEKLY: "Semanal", BIWEEKLY: "Quincenal", MONTHLY: "Mensual", BIMONTHLY: "Bimestral", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", ANNUAL: "Anual" };

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

const emptyForm = { clientId: "", title: "", frequency: "MONTHLY", startDate: new Date().toISOString().slice(0, 10), monthlyFee: "", slaResponseHours: "8", slaResolutionHours: "24" };

interface ServiceClient { id: number; name: string; }

export default function MaintenanceContractsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "maintenance-contracts"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Create form ────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ServiceClient[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("maintenance-contracts", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar contratos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (showForm && token && !clients.length) {
      apiFetch("service-clients?limit=200", token).then((d) => setClients(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
    }
  }, [showForm, token, clients.length]);

  const save = async () => {
    if (!token || !form.clientId || !form.title.trim() || !form.startDate) return;
    setSaving(true);
    try {
      const created = await apiFetch("maintenance-contracts", token, {
        method: "POST",
        body: JSON.stringify({
          clientId: Number(form.clientId),
          title: form.title.trim(),
          frequency: form.frequency,
          startDate: form.startDate,
          monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : 0,
          slaResponseHours: Number(form.slaResponseHours),
          slaResolutionHours: Number(form.slaResolutionHours),
        }),
      });
      setItems((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({ ...emptyForm });
    } catch (e) {
      window.alert("Error: " + (e instanceof Error ? e.message : "No se pudo crear"));
    } finally { setSaving(false); }
  };

  const activos = items.filter((c) => c.status === "ACTIVE").length;
  const mrr = items.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + Number(c.monthlyFee), 0);
  const proximaSemana = items.filter((c) => c.nextVisitDate && new Date(c.nextVisitDate) <= new Date(Date.now() + 7 * 86400000)).length;

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "default" => {
    if (s === "ACTIVE") return "positive";
    if (s === "EXPIRED" || s === "CANCELLED") return "danger";
    if (s === "PAUSED") return "warning";
    return "default";
  };

  const setStatus = async (c: Contract, status: string) => {
    if (!token) return;
    try {
      await apiFetch(`maintenance-contracts/${c.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === c.id ? { ...i, status: status as Contract["status"] } : i)));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const columns: Column<Contract>[] = [
    { key: "contractNumber", label: "Folio", render: (c) => <code style={{ fontSize: 11.5 }}>{c.contractNumber}</code>, width: 120 },
    {
      key: "title", label: "Contrato",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.client?.name ?? "—"} · {c.branch?.name ?? "Todas las sucursales"}</div>
        </div>
      ),
    },
    { key: "frequency", label: "Frecuencia", accessor: (c) => c.frequency, width: 100 },
    { key: "slaResponseHours", label: "SLA resp.", accessor: (c) => `${c.slaResponseHours}h`, width: 90 },
    { key: "monthlyFee", label: "Cuota mensual", render: (c) => <Money value={Number(c.monthlyFee)} />, width: 120 },
    { key: "nextVisitDate", label: "Próx. visita", render: (c) => <span style={{ fontSize: 12 }}>{c.nextVisitDate ? new Date(c.nextVisitDate).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    {
      key: "status", label: "Estado",
      render: (c) => cfg.canEdit ? (
        <select value={c.status} onChange={(e) => void setStatus(c, e.target.value)} style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)" }}>
          {["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : <Tag variant={statusVariant(c.status)}>{c.status}</Tag>,
      width: 130,
    },
    { key: "_count" as keyof Contract, label: "Visitas", accessor: (c) => c._count?.visits ?? 0, width: 80 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Servicio continuo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/ops/maintenance">
              <Button variant="ghost">← Órdenes de mantenimiento</Button>
            </Link>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo contrato</Button>
            )}
          </div>
        }
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 13 }}>Nuevo contrato de mantenimiento</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Nombre del contrato *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. Mantenimiento preventivo mensual" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Cliente *</label>
              <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} style={inp}>
                <option value="">— Seleccionar —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Frecuencia *</label>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} style={inp}>
                {FREQUENCIES.map((fq) => <option key={fq} value={fq}>{FREQ_LABEL[fq]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Fecha de inicio *</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Cuota mensual (MXN)</label>
              <input type="number" min="0" value={form.monthlyFee} onChange={(e) => setForm((f) => ({ ...f, monthlyFee: e.target.value }))} placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>SLA respuesta (hrs)</label>
              <input type="number" min="1" value={form.slaResponseHours} onChange={(e) => setForm((f) => ({ ...f, slaResponseHours: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>SLA resolución (hrs)</label>
              <input type="number" min="1" value={form.slaResolutionHours} onChange={(e) => setForm((f) => ({ ...f, slaResolutionHours: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving || !form.clientId || !form.title.trim() || !form.startDate}>
              {saving ? "Creando…" : "Crear contrato"}
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Contratos activos" value={activos} icon="📑" />
        <KpiCard label="Ingreso recurrente (MRR)" value={`$${(mrr / 1000).toFixed(1)}k`} variant="positive" icon="💰" />
        <KpiCard label="Visitas próx. 7 días" value={proximaSemana} icon="📅" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} contratos`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando contratos de mantenimiento." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(c) => c.id} emptyTitle="Sin contratos" emptyDescription={cfg.canCreate ? "Crea el primer contrato con el botón de arriba." : "Sin contratos de mantenimiento registrados."} />}
      </Section>
    </>
  );
}

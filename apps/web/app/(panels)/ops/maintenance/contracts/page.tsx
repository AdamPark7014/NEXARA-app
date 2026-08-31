"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { toast } from "@/components/Toast";

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
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
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
  const [clientsErr, setClientsErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [visits, setVisits] = useState<Array<{ id: number; scheduledDate: string; description?: string; status: string; activityId?: number | null }>>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsErr, setVisitsErr] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", monthlyFee: "", slaResponseHours: "", slaResolutionHours: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

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
      apiFetch("service-clients?limit=200", token)
        .then((d) => setClients(Array.isArray(d) ? d : (d?.data ?? [])))
        .catch((e) => setClientsErr(e instanceof Error ? e.message : "No se pudieron cargar clientes"));
    }
  }, [showForm, token, clients.length]);

  const loadVisits = useCallback(async (contractId: number) => {
    if (!token) return;
    setVisitsLoading(true);
    setVisitsErr(null);
    try {
      const data = await apiFetch(`maintenance-contracts/visits?contractId=${contractId}`, token);
      setVisits(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setVisits([]);
      setVisitsErr(e instanceof Error ? e.message : "No se pudieron cargar visitas");
    } finally {
      setVisitsLoading(false);
    }
  }, [token]);

  const openContract = (c: Contract) => {
    setSelected(c);
    setEditForm({
      title: c.title,
      monthlyFee: String(c.monthlyFee ?? ""),
      slaResponseHours: String(c.slaResponseHours ?? ""),
      slaResolutionHours: String(c.slaResolutionHours ?? ""),
    });
    void loadVisits(c.id);
  };

  const saveContractEdit = async () => {
    if (!token || !selected) return;
    setEditSaving(true);
    try {
      const updated = await apiFetch(`maintenance-contracts/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          title: editForm.title.trim(),
          monthlyFee: editForm.monthlyFee ? Number(editForm.monthlyFee) : undefined,
          slaResponseHours: editForm.slaResponseHours ? Number(editForm.slaResponseHours) : undefined,
          slaResolutionHours: editForm.slaResolutionHours ? Number(editForm.slaResolutionHours) : undefined,
        }),
      });
      setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, ...updated } : i)));
      setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setEditSaving(false);
    }
  };

  const downloadPdf = async (contractId: number) => {
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl(`maintenance-contracts/${contractId}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrato-${contractId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al descargar PDF");
    }
  };

  const generateOt = async (visitId: number) => {
    if (!token) return;
    try {
      await apiFetch(`maintenance-contracts/visits/${visitId}/generate-ot`, token, { method: "POST", body: "{}" });
      if (selected) void loadVisits(selected.id);
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const completeVisit = async (visitId: number) => {
    if (!token) return;
    try {
      await apiFetch(`maintenance-contracts/visits/${visitId}/complete`, token, { method: "POST", body: "{}" });
      if (selected) void loadVisits(selected.id);
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

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
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo crear"));
    } finally { setSaving(false); }
  };

  const visibleContracts = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        (c.client?.name ?? "").toLowerCase().includes(q) ||
        c.contractNumber.toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((c) => c.status === filterStatus);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
      }
    }
    return rows;
  }, [items, searchQ, filterStatus, highlightId]);

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
    } catch (e) { toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const columns: Column<Contract>[] = [
    { key: "contractNumber", label: "Folio", render: (c) => <code style={{ fontSize: 11.5 }}>{c.contractNumber}</code>, width: 120 },
    {
      key: "title", label: "Contrato",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {c.client?.id ? <Link href={`/ops/service-clients/${c.client.id}`} style={{ color: "var(--primary)", textDecoration: "none" }}>{c.client.name}</Link> : "—"}
            {" · "}{c.branch?.name ?? "Todas las sucursales"}
          </div>
        </div>
      ),
    },
    { key: "frequency", label: "Frecuencia", accessor: (c) => c.frequency, width: 100 },
    { key: "slaResponseHours", label: "SLA resp.", accessor: (c) => `${c.slaResponseHours}h`, width: 90 },
    { key: "monthlyFee", label: "Cuota mensual", render: (c) => <Money value={Number(c.monthlyFee)} />, width: 120 },
    {
      key: "nextVisitDate", label: "Próx. visita",
      render: (c) => {
        if (!c.nextVisitDate) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(c.nextVisitDate).getTime() - Date.now()) / 86400000);
        const isActive = c.status === "ACTIVE";
        const color = !isActive ? "var(--text-tertiary)" : daysLeft < 0 ? "var(--danger)" : daysLeft <= 3 ? "var(--danger)" : daysLeft <= 7 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>{new Date(c.nextVisitDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            {isActive && <span style={{ fontSize: 10.5, fontWeight: daysLeft <= 7 ? 700 : 400, color }}>{daysLeft < 0 ? "ATRASADA" : `${daysLeft}d`}</span>}
          </div>
        );
      },
      width: 100,
    },
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
    {
      key: "id" as keyof Contract,
      label: "",
      width: 140,
      render: (c) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => openContract(c)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer" }}>
            Detalle
          </button>
          <button type="button" onClick={() => void downloadPdf(c.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>
            PDF
          </button>
        </div>
      ),
    },
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
              {clientsErr && <p style={{ fontSize: 11, color: "var(--danger)", margin: "4px 0 0" }}>{clientsErr}</p>}
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

      {!loading && items.length > 0 && (() => {
        const byStatus = [
          { label: "Activos", count: activos, color: "var(--success)" },
          { label: "Borradores", count: items.filter(c => c.status === "DRAFT").length, color: "var(--warning)" },
          { label: "Pausados", count: items.filter(c => c.status === "PAUSED").length, color: "var(--text-tertiary)" },
          { label: "Vencidos/Cancelados", count: items.filter(c => c.status === "EXPIRED" || c.status === "CANCELLED").length, color: "var(--danger)" },
        ].filter(s => s.count > 0);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
              <KpiCard label="Total contratos" value={items.length} icon="📋" />
              <KpiCard label="Contratos activos" value={activos} variant={activos > 0 ? "positive" : "default"} icon="📑" />
              <KpiCard label="Ingreso recurrente (MRR)" value={<Money value={mrr} compact />} variant="accent" icon="💰" hint="Mensual recurrente" />
              <KpiCard label="Visitas próx. 7 días" value={proximaSemana} variant={proximaSemana > 0 ? "warning" : "default"} icon="📅" />
            </div>
            {byStatus.length > 1 && (
              <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estado</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byStatus.map(s => (
                    <div key={s.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr 36px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{s.label}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(s.count / items.length) * 100}%`, background: s.color, borderRadius: 3, transition: "width .4s" }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <Section title={loading ? "Cargando…" : `${visibleContracts.length} contratos`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Contrato resaltado <strong>#{highlightId}</strong> desde enlace.
          </p>
        )}
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por cliente, título o folio…" }}
          selects={[{
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: "ACTIVE", label: "Activo" },
              { value: "DRAFT", label: "Borrador" },
              { value: "PAUSED", label: "Pausado" },
              { value: "EXPIRED", label: "Expirado" },
              { value: "CANCELLED", label: "Cancelado" },
            ],
            allowAll: true,
          }]}
          onClear={() => { setSearchQ(""); setFilterStatus(""); }}
          resultCount={loading ? null : visibleContracts.length}
          rightActions={items.length > 0 ? (
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleContracts, [
              { key: "contractNumber", label: "Folio" },
              { key: "title", label: "Contrato" },
              { key: "client", label: "Cliente", format: (v) => (v as Contract["client"])?.name ?? "—" },
              { key: "frequency", label: "Frecuencia" },
              { key: "monthlyFee", label: "Cuota mensual (MXN)" },
              { key: "status", label: "Estado" },
              { key: "nextVisitDate", label: "Próx. visita", format: (v) => v ? String(v).slice(0, 10) : "—" },
            ], "contratos-mantenimiento")}>Excel</Button>
          ) : undefined}
        />
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando contratos de mantenimiento." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={visibleContracts} rowKey={(c) => c.id} emptyTitle="Sin contratos" emptyDescription={cfg.canCreate ? "Crea el primer contrato con el botón de arriba." : "Sin contratos de mantenimiento registrados."} />}
      </Section>

      {selected && (
        <Section title={`Contrato ${selected.contractNumber}`} actions={<Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Cerrar</Button>}>
          {cfg.canEdit && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
                <input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Cuota mensual</span>
                <input type="number" value={editForm.monthlyFee} onChange={(e) => setEditForm((f) => ({ ...f, monthlyFee: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>SLA respuesta (h)</span>
                <input type="number" value={editForm.slaResponseHours} onChange={(e) => setEditForm((f) => ({ ...f, slaResponseHours: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>SLA resolución (h)</span>
                <input type="number" value={editForm.slaResolutionHours} onChange={(e) => setEditForm((f) => ({ ...f, slaResolutionHours: e.target.value }))} style={inp} />
              </label>
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                <Button variant="primary" size="sm" disabled={editSaving} onClick={() => void saveContractEdit()}>
                  {editSaving ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </div>
          )}

          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Visitas programadas</p>
          {visitsLoading && <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Cargando visitas…</p>}
          {visitsErr && <p style={{ fontSize: 12, color: "var(--danger)" }}>{visitsErr}</p>}
          {!visitsLoading && visits.length === 0 && <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin visitas registradas.</p>}
          {!visitsLoading && visits.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {visits.map((v) => (
                <li key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(v.scheduledDate).toLocaleDateString("es-MX")}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{v.description ?? v.status}{v.activityId ? ` · OT #${v.activityId}` : ""}</div>
                  </div>
                  {cfg.canEdit && (
                    <div style={{ display: "flex", gap: 4 }}>
                      {!v.activityId && (
                        <Button size="sm" variant="secondary" onClick={() => void generateOt(v.id)}>Generar OT</Button>
                      )}
                      {v.status !== "COMPLETED" && (
                        <Button size="sm" variant="ghost" onClick={() => void completeVisit(v.id)}>Completar</Button>
                      )}
                      {v.activityId && (
                        <Link href={`/ops/activities/${v.activityId}`} style={{ fontSize: 12, color: "var(--primary)", alignSelf: "center" }}>Ver OT</Link>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

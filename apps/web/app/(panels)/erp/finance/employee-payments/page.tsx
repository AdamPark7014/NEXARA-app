"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

interface Payment {
  id: number;
  userId: number;
  periodFrom: string;
  periodTo: string;
  totalMinutes: number;
  amount: number | string;
  note?: string | null;
  user?: { nombre: string };
  createdAt?: string;
}

interface ApiUserLite { id: number; nombre: string }

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

const emptyForm = { userId: "", periodFrom: "", periodTo: "", amount: 0, note: "" };

export default function EmployeePaymentsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "employee-payments"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Payment[]>([]);
  const [users, setUsers] = useState<ApiUserLite[]>([]);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [data, usersData] = await Promise.all([
        apiFetch("employee-payments", token),
        apiFetch("users", token).catch((e) => { setUsersErr(e instanceof Error ? e.message : "No se cargó el catálogo de empleados"); return []; }),
      ]);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
      setUsers(Array.isArray(usersData) ? usersData : (usersData?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pagos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => items.reduce((s, p) => s + Number(p.amount), 0), [items]);

  const submit = async () => {
    if (!token || !form.userId || !form.periodFrom || !form.periodTo || !form.amount) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const fd = new FormData();
      fd.append("userId", form.userId);
      fd.append("periodFrom", form.periodFrom);
      fd.append("periodTo", form.periodTo);
      fd.append("amount", String(form.amount));
      if (form.note.trim()) fd.append("note", form.note.trim());
      evidenceFiles.forEach((file) => fd.append("files", file));
      const res = await fetch(buildApiUrl("employee-payments"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setShowForm(false);
      setForm({ ...emptyForm });
      setEvidenceFiles([]);
      void load();
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo registrar el pago"));
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<Payment>[] = [
    { key: "user", label: "Empleado", accessor: (p) => p.user?.nombre ?? `#${p.userId}`, width: 180 },
    { key: "periodFrom", label: "Periodo", render: (p) => <span style={{ fontSize: 12 }}>{new Date(p.periodFrom).toLocaleDateString("es-MX")} – {new Date(p.periodTo).toLocaleDateString("es-MX")}</span>, width: 200 },
    { key: "amount", label: "Monto", align: "right" as const, render: (p) => <Money value={Number(p.amount)} />, width: 130 },
    { key: "note", label: "Concepto", accessor: (p) => p.note ?? "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Pagos a personal"
        subtitle="Nómina, bonos, comisiones y finiquitos registrados por periodo."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Registrar pago</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total pagado" value={<Money value={total} compact />} icon="💼" variant="positive" hint="Nómina y bonos registrados" />
        <KpiCard label="Registros" value={items.length} icon="📋" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} pagos`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando pagos a personal." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(p) => p.id} emptyTitle="Sin pagos registrados" emptyDescription="Registra el primer pago a personal." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Registrar pago a personal</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Empleado</span>
                <select value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {users.map((u) => <option key={u.id} value={String(u.id)}>{u.nombre}</option>)}
                </select></label>
              {usersErr && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{usersErr}</p>}
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Periodo desde</span>
                <input type="date" value={form.periodFrom} onChange={(e) => setForm((f) => ({ ...f, periodFrom: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Periodo hasta</span>
                <input type="date" value={form.periodTo} onChange={(e) => setForm((f) => ({ ...f, periodTo: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto ($)</span>
                <input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto / nota</span>
                <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Nómina quincenal, bono proyecto UDLA…" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Comprobantes (PDF/imagen)</span>
                <input type="file" accept=".pdf,image/*" multiple onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))} style={inp} /></label>
              {saveErr && <p role="alert" style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{saveErr}</p>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setSaveErr(null); setEvidenceFiles([]); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.userId || !form.amount}>{saving ? "Guardando…" : "Registrar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

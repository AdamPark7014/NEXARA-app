"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface JournalEntry {
  id: number;
  reference?: string;
  description?: string;
  totalDebit?: number;
  totalCredit?: number;
  status?: string;
  date?: string;
  createdBy?: { nombre?: string };
  type?: string;
}

const TIPOS = ["DIARIO", "EGRESOS", "INGRESOS", "AJUSTE"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { description: "", type: "DIARIO", date: new Date().toISOString().slice(0, 10), totalDebit: 0, totalCredit: 0 };

export default function AccountingPage() {
  const { user } = useUser();
  const { canCreate, canApprove, isDirector } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("accounting/journal-entries", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!token) return;
    try {
      const created = await apiFetch("accounting/journal-entries", token, { method: "POST", body: JSON.stringify(form) });
      setItems(prev => [created, ...prev]);
      setShowForm(false);
    } catch { /* skip */ }
  };

  const postEntry = async (id: number) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`accounting/journal-entries/${id}/post`, token, { method: "PATCH" });
      setItems(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch { /* skip */ }
  };

  const reverseEntry = async (id: number) => {
    if (!token || !confirm("¿Reversar esta póliza? Se generará una contrapóliza.")) return;
    try {
      const updated = await apiFetch(`accounting/journal-entries/${id}/reverse`, token, { method: "POST" });
      setItems(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch { /* skip */ }
  };

  const ingresos = items.filter(e => e.type === "INGRESOS").reduce((s, e) => s + (e.totalCredit ?? 0), 0);
  const egresos = items.filter(e => e.type === "EGRESOS").reduce((s, e) => s + (e.totalDebit ?? 0), 0);
  const borradores = items.filter(e => e.status === "DRAFT" || e.status === "BORRADOR").length;

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "POSTED" || s === "CONTABILIZADA" ? "neutral" : s === "REVERSED" ? "danger" : "warning";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<JournalEntry>[] = [
    { key: "reference", label: "Referencia", render: e => <code style={{ fontSize: 11.5 }}>{e.reference ?? `P-${e.id}`}</code>, width: 130 },
    { key: "description", label: "Concepto", render: e => (
      <div>
        <div style={{ fontSize: 13 }}>{e.description ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.type} · {e.createdBy?.nombre}</div>
      </div>
    )},
    { key: "totalDebit", label: "Cargo", render: e => e.totalDebit ? <Money value={e.totalDebit} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "totalCredit", label: "Abono", render: e => e.totalCredit ? <Money value={e.totalCredit} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "date", label: "Fecha", accessor: e => e.date ? new Date(e.date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "—", width: 90 },
    { key: "status", label: "Estado", render: e => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={statusVariant(e.status)}>{e.status ?? "BORRADOR"}</Tag>
        {(e.status === "DRAFT" || e.status === "BORRADOR") && canApprove && (
          <button onClick={() => postEntry(e.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Contabilizar</button>
        )}
        {(e.status === "POSTED" || e.status === "CONTABILIZADA") && isDirector && (
          <button onClick={() => reverseEntry(e.id)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Reversar</button>
        )}
      </div>
    ), width: 200 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Contabilidad · Pólizas"
        subtitle="Libro diario de pólizas contables: ingresos, egresos, ajustes y diarios."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}>Nueva póliza</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Ingresos registrados" value={`$${(ingresos / 1000000).toFixed(2)}M`} />
        <KpiCard label="Egresos registrados" value={`$${(egresos / 1000000).toFixed(2)}M`} />
        <KpiCard label="Borradores" value={borradores} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Concepto / Descripción</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción de la póliza" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cargo ($)</label>
            <input type="number" min={0} value={form.totalDebit} onChange={e => setForm(f => ({ ...f, totalDebit: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Abono ($)</label>
            <input type="number" min={0} value={form.totalCredit} onChange={e => setForm(f => ({ ...f, totalCredit: +e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>Crear póliza</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} pólizas`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={e => e.id} emptyTitle="Sin pólizas" emptyDescription="Registra la primera póliza contable." />
        )}
      </Section>
    </>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface Expense {
  id: number;
  concepto?: string;
  monto?: number;
  categoria?: string;
  estado?: string;
  fecha?: string;
  esRecurrente?: boolean;
  creadoPor?: { nombre?: string };
  aprobadoPor?: { nombre?: string };
}

const CATEGORIAS = ["Renta", "Servicios", "Suscripciones", "Viáticos", "Material", "Publicidad", "Equipo", "Otro"];
const ESTADOS = ["BORRADOR", "PENDIENTE_APROBACION", "APROBADO", "RECHAZADO", "PAGADO"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { concepto: "", monto: 0, categoria: "Servicios", estado: "BORRADOR", esRecurrente: false, fecha: new Date().toISOString().slice(0, 10) };

export default function ExpensesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("expenses", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ concepto: e.concepto ?? "", monto: e.monto ?? 0, categoria: e.categoria ?? "Servicios", estado: e.estado ?? "BORRADOR", esRecurrente: e.esRecurrente ?? false, fecha: e.fecha?.slice(0, 10) ?? "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`expenses/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(e => e.id === editing.id ? { ...e, ...updated } : e));
      } else {
        const created = await apiFetch("expenses", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar este gasto?")) return;
    try {
      await apiFetch(`expenses/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(e => e.id !== id));
    } catch { /* skip */ }
  };

  const totalMes = items.filter(e => e.estado === "PAGADO" || e.estado === "APROBADO").reduce((s, e) => s + (e.monto ?? 0), 0);
  const pendientes = items.filter(e => e.estado === "PENDIENTE_APROBACION").length;
  const recurrentes = items.filter(e => e.esRecurrente).length;

  const estadoVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "PAGADO" || s === "APROBADO" ? "neutral" : s === "RECHAZADO" ? "danger" : s === "PENDIENTE_APROBACION" ? "accent" : "warning";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<Expense>[] = [
    { key: "concepto", label: "Concepto", render: e => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{e.concepto ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.categoria}{e.esRecurrente ? " · Recurrente 🔄" : ""}</div>
      </div>
    )},
    { key: "monto", label: "Monto", render: e => <Money value={e.monto ?? 0} />, width: 110 },
    { key: "fecha", label: "Fecha", accessor: e => e.fecha ? new Date(e.fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "creadoPor", label: "Creado por", accessor: e => e.creadoPor?.nombre ?? "—", width: 130 },
    { key: "estado", label: "Estado", render: e => <Tag variant={estadoVariant(e.estado)}>{(e.estado ?? "—").replace(/_/g, " ")}</Tag>, width: 160 },
    { key: "id", label: "", render: e => (
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => openEdit(e)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>
        <button onClick={() => remove(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Gastos · Administración"
        subtitle="Captura y autorización de gastos no operativos: renta, servicios, suscripciones, recurrentes."
        actions={<Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo gasto</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Total aprobado / pagado" value={`$${(totalMes / 1000).toFixed(0)}k`} />
        <KpiCard label="Pendientes de aprobar" value={pendientes} />
        <KpiCard label="Recurrentes activos" value={recurrentes} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Concepto</label>
            <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Renta oficinas, internet, SaaS…" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Categoría</label>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inp}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto ($)</label>
            <input type="number" min={0} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
            <input type="checkbox" id="recurrente" checked={form.esRecurrente} onChange={e => setForm(f => ({ ...f, esRecurrente: e.target.checked }))} />
            <label htmlFor="recurrente" style={{ fontSize: 13, fontWeight: 500 }}>Gasto recurrente mensual</label>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear gasto"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} gastos`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={e => e.id} emptyTitle="Sin gastos" emptyDescription="Registra el primer gasto administrativo." />
        )}
      </Section>
    </>
  );
}

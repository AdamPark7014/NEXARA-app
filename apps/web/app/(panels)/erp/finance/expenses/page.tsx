"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { filterRowsByScope, getErpExpensesSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";

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

function mapExpenseRow(raw: Record<string, unknown>): Expense {
  try {
    const meta = JSON.parse(String(raw.razonGasto ?? "{}")) as Record<string, unknown>;
    if (meta.tipo === "ADMIN") {
      return {
        id: Number(raw.id),
        concepto: String(meta.concepto ?? ""),
        monto: Number(raw.montoSolicitado ?? 0),
        categoria: String(meta.categoria ?? ""),
        estado: String(meta.estado ?? ""),
        esRecurrente: Boolean(meta.esRecurrente),
        fecha: String(meta.fecha ?? ""),
        creadoPor: raw.usuario as Expense["creadoPor"],
      };
    }
  } catch { /* legacy row */ }
  return {
    id: Number(raw.id),
    concepto: String(raw.razonGasto ?? "—"),
    monto: Number(raw.montoSolicitado ?? 0),
    estado: String(raw.estatusPago ?? ""),
    fecha: raw.fechaSolicitud ? String(raw.fechaSolicitud).slice(0, 10) : undefined,
    creadoPor: raw.usuario as Expense["creadoPor"],
  };
}

export default function ExpensesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpExpensesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Expense[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("expenses", token);
      const rows = Array.isArray(data) ? data : (data.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => mapExpenseRow(r)));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los gastos"));
      setItems([]);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const [searchQ, setSearchQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

  const visibleItems = useMemo(() => {
    let result = filterRowsByScope(items, user, cfg.defaultScope);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter((e) => (e.concepto ?? "").toLowerCase().includes(q));
    }
    if (filterCat) result = result.filter((e) => e.categoria === filterCat);
    if (filterEstado) result = result.filter((e) => e.estado === filterEstado);
    return result;
  }, [items, user, cfg.defaultScope, searchQ, filterCat, filterEstado]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setSaveErr(null); setShowForm(true); };
  const openEdit = async (e: Expense) => {
    setEditing(e);
    setSaveErr(null);
    setShowForm(true);
    setForm({ concepto: e.concepto ?? "", monto: e.monto ?? 0, categoria: e.categoria ?? "Servicios", estado: e.estado ?? "BORRADOR", esRecurrente: e.esRecurrente ?? false, fecha: e.fecha?.slice(0, 10) ?? "" });
    try {
      const full = await apiFetch(`expenses/${e.id}`, token) as Record<string, unknown>;
      const mapped = mapExpenseRow(full);
      setForm({ concepto: mapped.concepto ?? "", monto: mapped.monto ?? 0, categoria: mapped.categoria ?? "Servicios", estado: mapped.estado ?? "BORRADOR", esRecurrente: mapped.esRecurrente ?? false, fecha: mapped.fecha?.slice(0, 10) ?? "" });
    } catch (err) {
      setSaveErr(formatApiError(err, "No se pudo cargar el gasto"));
    }
  };

  const save = async () => {
    if (!token || !user?.id || !form.concepto.trim() || !form.monto) return;
    setSaveErr(null);
    try {
      const payload = { ...form, usuarioId: user.id };
      if (editing) {
        const updated = await apiFetch(`expenses/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        setItems(prev => prev.map(e => e.id === editing.id ? mapExpenseRow(updated) : e));
      } else {
        const created = await apiFetch("expenses", token, { method: "POST", body: JSON.stringify(payload) });
        setItems(prev => [mapExpenseRow(created), ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el gasto"));
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Eliminar este gasto?", fn: async () => {
    try {
      await apiFetch(`expenses/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      toast.error("Error al eliminar: " + (e instanceof Error ? e.message : "error"));
    }
  } });
  };

  const totalMes = visibleItems.filter(e => e.estado === "PAGADO" || e.estado === "APROBADO").reduce((s, e) => s + (e.monto ?? 0), 0);
  const pendientes = visibleItems.filter(e => e.estado === "PENDIENTE_APROBACION").length;
  const recurrentes = visibleItems.filter(e => e.esRecurrente).length;

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
        {cfg.canEdit && <button onClick={() => void openEdit(e)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {cfg.canDelete && <button onClick={() => remove(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo gasto</Button> : undefined}
      />

      {!loading && visibleItems.length > 0 && (() => {
        const totalGastos = visibleItems.reduce((s, e) => s + (e.monto ?? 0), 0);
        const byCat = Object.entries(
          visibleItems.reduce<Record<string, number>>((acc, e) => { const k = e.categoria ?? "Sin categoría"; acc[k] = (acc[k] ?? 0) + (e.monto ?? 0); return acc; }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
              <KpiCard label="Total aprobado / pagado" value={<Money value={totalMes} compact />} variant="positive" icon="✅" hint="Gastos autorizados" />
              <KpiCard label="Pendientes de aprobar" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" hint="Esperando autorización" />
              <KpiCard label="Recurrentes activos" value={recurrentes} variant={recurrentes > 0 ? "accent" : "default"} icon="🔄" hint="Gastos mensuales fijos" />
              <KpiCard label="Total registrado" value={<Money value={totalGastos} compact />} icon="📊" hint="Todos los estados" />
            </div>
            {byCat.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Gasto por categoría</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byCat.map(([cat, amount]) => (
                    <div key={cat} style={{ display: "grid", gridTemplateColumns: "120px 1fr 90px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{cat}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(amount / totalGastos) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

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
            {saveErr && <div role="alert" style={{ gridColumn: "1 / -1", padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>{saveErr}</div>}
            <Button variant="primary" onClick={() => void save()}>{editing ? "Guardar" : "Crear gasto"}</Button>
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto…" }}
        selects={[
          { label: "Categoría", value: filterCat, onChange: setFilterCat, options: CATEGORIAS.map((c) => ({ value: c, label: c })), allowAll: true },
          { label: "Estado", value: filterEstado, onChange: setFilterEstado, options: ESTADOS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })), allowAll: true },
        ]}
        onClear={() => { setSearchQ(""); setFilterCat(""); setFilterEstado(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={visibleItems.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems, [
            { key: "concepto", label: "Concepto" },
            { key: "monto", label: "Monto", format: (v) => `${Number(v).toFixed(2)}` },
            { key: "categoria", label: "Categoría" },
            { key: "estado", label: "Estado" },
            { key: "fecha", label: "Fecha" },
          ], "gastos")}>CSV</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} gastos`}>
        {error && (
          <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
            {error} <Button size="sm" variant="ghost" onClick={() => void load()}>Reintentar</Button>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : !error ? (
          <DataTable columns={columns} rows={visibleItems} rowKey={e => e.id} emptyTitle="Sin gastos" emptyDescription="Registra el primer gasto administrativo." />
        ) : null}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

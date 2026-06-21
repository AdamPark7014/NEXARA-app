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

interface StockItem {
  id: number;
  sku?: string;
  nombre?: string;
  categoria?: string;
  ubicacion?: string;
  existencia?: number;
  minimo?: number;
  costo?: number;
  estado?: string;
}

const CATEGORIAS = ["Cámaras", "DVR/NVR", "Redes", "Cómputo", "Pantallas", "Consumibles", "Herramientas", "Otro"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { sku: "", nombre: "", categoria: "Cámaras", ubicacion: "", existencia: 0, minimo: 5, costo: 0 };

export default function WarehousePage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("warehouse", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (s: StockItem) => {
    setEditing(s);
    setForm({ sku: s.sku ?? "", nombre: s.nombre ?? "", categoria: s.categoria ?? "Cámaras", ubicacion: s.ubicacion ?? "", existencia: s.existencia ?? 0, minimo: s.minimo ?? 5, costo: s.costo ?? 0 });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`warehouse/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(s => s.id === editing.id ? { ...s, ...updated } : s));
      } else {
        const created = await apiFetch("warehouse", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (s: StockItem) => {
    if (!token || !confirm(`¿Retirar "${s.nombre}" del inventario? Se marcará existencia en 0.`)) return;
    try {
      const updated = await apiFetch(`warehouse/${s.id}`, token, { method: "PATCH", body: JSON.stringify({ existencia: 0, estado: "Retirado" }) });
      setItems(prev => prev.map(i => i.id === s.id ? { ...i, ...updated } : i));
    } catch { /* skip */ }
  };

  const sinStock = items.filter(s => (s.existencia ?? 0) === 0).length;
  const bajoMinimo = items.filter(s => (s.existencia ?? 0) > 0 && (s.existencia ?? 0) < (s.minimo ?? 0)).length;
  const valorTotal = items.reduce((sum, s) => sum + (s.existencia ?? 0) * (s.costo ?? 0), 0);

  const stockEstado = (s: StockItem): "danger" | "warning" | "neutral" =>
    (s.existencia ?? 0) === 0 ? "danger" : (s.existencia ?? 0) < (s.minimo ?? 0) ? "warning" : "neutral";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<StockItem>[] = [
    { key: "sku", label: "SKU", render: s => <code style={{ fontSize: 11.5 }}>{s.sku ?? "—"}</code>, width: 110 },
    { key: "nombre", label: "Producto", render: s => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{s.nombre ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.categoria} · {s.ubicacion}</div>
      </div>
    )},
    { key: "existencia", label: "Stock", render: s => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700 }}>{s.existencia ?? 0}</span>
        <Tag variant={stockEstado(s)}>{(s.existencia ?? 0) === 0 ? "Sin stock" : (s.existencia ?? 0) < (s.minimo ?? 0) ? "Bajo mínimo" : "OK"}</Tag>
      </div>
    ), width: 160 },
    { key: "minimo", label: "Mínimo", accessor: s => s.minimo ?? 0, width: 80 },
    { key: "costo", label: "Costo unit.", render: s => <Money value={s.costo ?? 0} />, width: 110 },
    { key: "id", label: "", render: s => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(s)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(s)} title="Retirar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Almacén"
        title="Inventario / Almacén"
        subtitle="Stock de productos, cámaras, cómputo, redes y consumibles en CEDIS Puebla."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Agregar producto</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Sin stock" value={sinStock} />
        <KpiCard label="Bajo mínimo" value={bajoMinimo} />
        <KpiCard label="Valor inventario" value={`$${(valorTotal / 1000000).toFixed(2)}M`} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "SKU", key: "sku", ph: "HK-2143" },
            { label: "Nombre del producto", key: "nombre", ph: "Cámara Hikvision 4MP…" },
            { label: "Ubicación", key: "ubicacion", ph: "CEDIS Puebla · A1-03" },
          ].map(({ label, key, ph }) => (
            <div key={key} style={key === "nombre" ? { gridColumn: "1 / -1" } : {}}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={(form as Record<string, string | number>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Categoría</label>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inp}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Existencia</label>
            <input type="number" min={0} value={form.existencia} onChange={e => setForm(f => ({ ...f, existencia: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Mínimo</label>
            <input type="number" min={0} value={form.minimo} onChange={e => setForm(f => ({ ...f, minimo: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Costo unitario ($)</label>
            <input type="number" min={0} value={form.costo} onChange={e => setForm(f => ({ ...f, costo: +e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Agregar"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} productos`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={s => s.id} emptyTitle="Almacén vacío" emptyDescription="Agrega el primer producto al inventario." />
        )}
      </Section>
    </>
  );
}

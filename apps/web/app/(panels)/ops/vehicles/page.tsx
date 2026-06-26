"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getVehiclesSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";
import { buildApiUrl } from "@/lib/api-base";

interface Vehicle {
  id: number;
  marca?: string;
  modelo?: string;
  placas?: string;
  year?: number;
  estado?: string;
  asignadoA?: string;
  poliza?: string;
  verificacionVence?: string;
}

const ESTADOS = ["Disponible", "Asignado", "En_servicio", "Fuera_de_servicio"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { marca: "", modelo: "", placas: "", year: new Date().getFullYear(), estado: "Disponible", poliza: "" };

export default function VehiclesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getVehiclesSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "vehicles");
  const token = user?.token ?? "";

  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("vehicles", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({ marca: v.marca ?? "", modelo: v.modelo ?? "", placas: v.placas ?? "", year: v.year ?? new Date().getFullYear(), estado: v.estado ?? "Disponible", poliza: v.poliza ?? "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`vehicles/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(v => v.id === editing.id ? { ...v, ...updated } : v));
      } else {
        const created = await apiFetch("vehicles", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar este vehículo?")) return;
    try {
      await apiFetch(`vehicles/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado: "Eliminado" }) });
      setItems(prev => prev.filter(v => v.id !== id));
    } catch { /* skip */ }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const visibleVehicles = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<Vehicle>[] = [
    { key: "placas", label: "Placas", render: v => <Tag variant="accent">{v.placas ?? "—"}</Tag>, width: 110 },
    { key: "marca", label: "Vehículo", render: v => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{v.marca} {v.modelo}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Año {v.year}</div>
      </div>
    )},
    { key: "estado", label: "Estado", render: v => <Tag variant={v.estado === "Asignado" ? "warning" : v.estado === "Fuera_de_servicio" ? "danger" : "neutral"}>{(v.estado ?? "—").replace(/_/g, " ")}</Tag>, width: 140 },
    { key: "asignadoA", label: "Asignado a", accessor: v => v.asignadoA ?? "—", width: 140 },
    { key: "poliza", label: "Póliza", accessor: v => v.poliza ?? "—", width: 130 },
    { key: "id", label: "", render: v => (
      <div style={{ display: "flex", gap: 4 }}>
        {cfg.canEdit && <button onClick={() => openEdit(v)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {cfg.canDelete && <button onClick={() => remove(v.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Agregar vehículo</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Marca", key: "marca", ph: "Toyota, Nissan…" },
            { label: "Modelo", key: "modelo", ph: "Hilux, NP300…" },
            { label: "Placas", key: "placas", ph: "ABC-123-D" },
            { label: "Póliza de seguro", key: "poliza", ph: "Número de póliza" },
          ].map(({ label, key, ph }) => (
            <div key={key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={(form as Record<string,unknown>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Año</label>
            <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Agregar"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleVehicles.length} unidades`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando vehículo <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleVehicles} rowKey={v => v.id} emptyTitle="Sin vehículos" emptyDescription="Registra el primer vehículo de la flotilla." />
        )}
      </Section>
    </>
  );
}

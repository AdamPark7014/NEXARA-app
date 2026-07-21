"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { toast } from "@/components/Toast";

interface ServiceClient {
  id: number;
  nombre: string;
  contacto?: string;
  telefono?: string;
  direccion?: string;
  estado: string;
}

const ESTADOS = ["Activo", "Inactivo"];

function mapClient(raw: Record<string, unknown>): ServiceClient {
  const isActive = raw.isActive !== false && raw.estado !== "Inactivo";
  return {
    id: Number(raw.id),
    nombre: String(raw.name ?? raw.nombre ?? ""),
    contacto: String(raw.contactName ?? raw.contacto ?? ""),
    telefono: String(raw.contactPhone ?? raw.telefono ?? ""),
    direccion: String(raw.address ?? raw.direccion ?? ""),
    estado: isActive ? "Activo" : "Inactivo",
  };
}

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

const emptyForm = { nombre: "", contacto: "", telefono: "", direccion: "", estado: "Activo" };

export default function ServiceClientsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "service-clients"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<ServiceClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceClient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch("service-clients", token);
      const rows = Array.isArray(data) ? data : (data.data ?? []);
      setItems(rows.map((row: Record<string, unknown>) => mapClient(row)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar clientes");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: ServiceClient) => {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      contacto: c.contacto ?? "",
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      estado: c.estado,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !form.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.nombre.trim(),
        contactName: form.contacto || undefined,
        contactPhone: form.telefono || undefined,
        address: form.direccion || undefined,
        isActive: form.estado === "Activo",
      };
      if (editing) {
        const updated = await apiFetch(`service-clients/${editing.id}`, token, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        const mapped = mapClient(updated?.client ?? updated);
        setItems(prev => prev.map(c => c.id === editing.id ? mapped : c));
      } else {
        const fd = new FormData();
        fd.append("name", payload.name);
        if (payload.contactName) fd.append("contactName", payload.contactName);
        if (payload.contactPhone) fd.append("contactPhone", payload.contactPhone);
        if (payload.address) fd.append("address", payload.address);
        fd.append("isActive", payload.isActive ? "true" : "false");
        const res = await fetch(buildApiUrl("service-clients"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        const created = await res.json();
        const mapped = mapClient(created?.client ?? created);
        setItems(prev => [mapped, ...prev]);
        if (created?.salesClient?.id) {
          toast.success(`Cliente operativo listo · vinculado a CRM #${created.salesClient.id}`);
        } else {
          toast.success("Cliente operativo creado");
        }
      }
      setShowForm(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar cliente");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Dar de baja este cliente?", confirmLabel: "Dar de baja", fn: async () => {
    try {
      await apiFetch(`service-clients/${id}`, token, {
        method: "PUT",
        body: JSON.stringify({ isActive: false }),
      });
      setItems(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al dar de baja");
    }
  } });
  };

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((c) =>
        (c.nombre + " " + (c.contacto ?? "") + " " + (c.direccion ?? "")).toLowerCase().includes(q)
      );
    }
    if (filterEstado) rows = rows.filter((c) => c.estado === filterEstado);
    return rows;
  }, [items, searchQ, filterEstado]);

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
    background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
  };

  const columns: Column<ServiceClient>[] = [
    { key: "nombre", label: "Cliente", render: c => (
      <div>
        <Link href={`/ops/service-clients/${c.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>{c.nombre || "—"}</Link>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.direccion}</div>
      </div>
    )},
    { key: "contacto", label: "Contacto", render: c => (
      <div>
        <div style={{ fontSize: 13 }}>{c.contacto || "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.telefono}</div>
      </div>
    ), width: 150 },
    { key: "estado", label: "Estado", render: c => (
      <Tag variant={c.estado === "Activo" ? "accent" : "neutral"}>{c.estado}</Tag>
    ), width: 90 },
    { key: "id", label: "", render: c => (
      <div style={{ display: "flex", gap: 4 }}>
        {cfg.canEdit && (
          <button type="button" onClick={() => openEdit(c)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>
        )}
        {cfg.canDelete && (
          <button type="button" onClick={() => remove(c.id)} title="Dar de baja" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>
        )}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Clientes en servicio"
        title="Clientes en servicio"
        subtitle="Base de clientes con contratos de mantenimiento activos y visitas programadas."
        actions={cfg.canCreate ? (
          <Button variant="primary" iconLeft="+" onClick={openNew}>Agregar cliente</Button>
        ) : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre del cliente / empresa *</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Contacto</label>
            <input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="Nombre del contacto" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Teléfono</label>
            <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Dirección</label>
            <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Dirección" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving || !form.nombre.trim()}>
              {saving ? "Guardando…" : editing ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Clientes totales" value={items.length} icon="🏢" />
          <KpiCard label="Activos" value={items.filter(c => c.estado === "Activo").length} variant="positive" icon="✅" hint="Con contrato vigente" />
          <KpiCard label="Inactivos" value={items.filter(c => c.estado !== "Activo").length} variant={items.filter(c => c.estado !== "Activo").length > 0 ? "warning" : "default"} icon="⛔" />
          <KpiCard
            label="Tasa de actividad"
            value={`${Math.round((items.filter(c => c.estado === "Activo").length / items.length) * 100)}%`}
            variant={items.filter(c => c.estado === "Activo").length / items.length >= 0.8 ? "positive" : "warning"}
            icon="📊"
            hint="Activos vs total"
          />
        </div>
      )}

      {!loading && items.length > 0 && (() => {
        const activos = items.filter(c => c.estado === "Activo").length;
        const pct = Math.round((activos / items.length) * 100);
        return (
          <div style={{ marginBottom: 16, padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Clientes activos</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--primary)" : "var(--warning)" }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--surface)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "var(--success)" : "var(--primary)", borderRadius: 4, transition: "width .4s" }} />
            </div>
          </div>
        );
      })()}

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por nombre, contacto o dirección…" }}
        selects={[{
          label: "Estado",
          value: filterEstado,
          onChange: setFilterEstado,
          options: ESTADOS.map((s) => ({ value: s, label: s })),
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterEstado(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "nombre", label: "Cliente" },
            { key: "contacto", label: "Contacto" },
            { key: "telefono", label: "Teléfono" },
            { key: "direccion", label: "Dirección" },
            { key: "estado", label: "Estado" },
          ], "clientes-servicio")}>Excel</Button>
        ) : undefined}
      />

      <Section title={`${items.length} cliente${items.length !== 1 ? "s" : ""}`}>
        {loadError && (
          <p style={{ color: "var(--danger, #ef4444)", fontSize: 13, marginBottom: 12 }}>{loadError}</p>
        )}
        <DataTable
          columns={columns}
          rows={visibleItems}
          rowKey={(c) => c.id}
          emptyTitle={loading ? "Cargando…" : "Sin clientes registrados"}
          emptyDescription={loadError ?? "Agrega el primer cliente con contrato de servicio continuo."}
        />
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

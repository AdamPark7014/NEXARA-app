"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getVehiclesSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";

interface Vehicle {
  id: number;
  nombre?: string;
  placas?: string;
  estatus?: string;
  activo?: boolean;
  notas?: string;
  assignedToId?: number | null;
  assignedAt?: string | null;
  salidaFotos?: string[] | null;
  devolucionFotos?: string[] | null;
  tiempoUsoMinutos?: number | null;
}

const ESTADOS = ["Disponible", "Asignado", "En_servicio", "Fuera_de_servicio", "En_mantenimiento"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { marca: "", modelo: "", placas: "", poliza: "", anio: "", estatus: "Disponible", notas: "" };

function buildVehicleName(form: typeof emptyForm): string {
  const parts = [form.marca.trim(), form.modelo.trim()].filter(Boolean);
  if (form.anio.trim()) parts.push(form.anio.trim());
  return parts.join(" ").trim();
}

function parseVehicleName(nombre?: string): Pick<typeof emptyForm, "marca" | "modelo" | "anio"> {
  if (!nombre) return { marca: "", modelo: "", anio: "" };
  const yearMatch = nombre.match(/\b(19|20)\d{2}\b/);
  const anio = yearMatch?.[0] ?? "";
  const withoutYear = anio ? nombre.replace(anio, "").trim() : nombre;
  const [marca = "", ...rest] = withoutYear.split(/\s+/);
  return { marca, modelo: rest.join(" "), anio };
}

export default function VehiclesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getVehiclesSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "vehicles");
  const token = user?.token ?? "";

  const [items, setItems] = useState<Vehicle[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [checkoutId, setCheckoutId] = useState<number | null>(null);
  const [checkoutPhotos, setCheckoutPhotos] = useState<File[]>([]);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [returnPhotos, setReturnPhotos] = useState<File[]>([]);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<{ id: number; solicitante?: { nombre?: string }; nombreVehiculo?: string; estatusAprobacion?: string; fechaInicioSolicitada?: string; fechaFinSolicitada?: string }[]>([]);
  const [usageStats, setUsageStats] = useState<{ users?: { nombre: string; kmTotal: number; kmPorLitroPromedio: number | null; trips: number }[] } | null>(null);

  const loadRequests = useCallback(async () => {
    if (!token || !cfg.canApprove) return;
    try {
      const data = await apiFetch("vehicles", token);
      setRequests(Array.isArray(data) ? data : (data.data ?? []));
    } catch { setRequests([]); }
  }, [token, cfg.canApprove]);

  const loadAnalytics = useCallback(async () => {
    if (!token || !cfg.canApprove) return;
    try {
      setUsageStats(await apiFetch("vehicles/analytics/usage", token));
    } catch { setUsageStats(null); }
  }, [token, cfg.canApprove]);

  const approveRequest = async (id: number, action: "approve" | "reject") => {
    if (!token) return;
    try {
      await apiFetch(`vehicles/${id}/approve`, token, { method: "PATCH", body: JSON.stringify({ action }) });
      void loadRequests();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al autorizar"); }
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch("vehicles/inventory", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar la flotilla");
      setItems([]);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { void loadRequests(); void loadAnalytics(); }, [loadRequests, loadAnalytics]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    const parsed = parseVehicleName(v.nombre);
    setForm({
      ...parsed,
      placas: v.placas ?? "",
      poliza: v.notas?.includes("Póliza:") ? v.notas.replace(/^Póliza:\s*/i, "") : "",
      estatus: v.estatus ?? "Disponible",
      notas: v.notas?.includes("Póliza:") ? "" : (v.notas ?? ""),
    });
    setShowForm(true);
  };

  const save = async () => {
    const nombre = buildVehicleName(form);
    if (!token || !nombre) {
      toast.warning("Marca y modelo son obligatorios");
      return;
    }
    const notas = [
      form.poliza.trim() ? `Póliza: ${form.poliza.trim()}` : "",
      form.notas.trim(),
    ].filter(Boolean).join(" · ") || undefined;
    setSaving(true);
    try {
      const body = {
        nombre,
        placas: form.placas.trim() || undefined,
        estatus: editing ? form.estatus : "Disponible",
        notas,
      };
      if (editing) {
        const updated = await apiFetch(`vehicles/inventory/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        setItems(prev => prev.map(v => v.id === editing.id ? { ...v, ...updated } : v));
      } else {
        const created = await apiFetch("vehicles/inventory", token, { method: "POST", body: JSON.stringify(body) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar vehículo");
    } finally {
      setSaving(false);
    }
  };

  const doCheckout = async () => {
    if (!checkoutId || !token) return;
    if (checkoutPhotos.length === 0) { toast.warning("Sube al menos 1 foto del estado actual del vehículo"); return; }
    setPhotoSaving(true);
    try {
      const fd = new FormData();
      checkoutPhotos.forEach(f => fd.append("photos", f));
      const res = await fetch(buildApiUrl(`vehicles/inventory/${checkoutId}/checkout`), {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setCheckoutId(null); setCheckoutPhotos([]); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al registrar salida"); }
    finally { setPhotoSaving(false); }
  };

  const doReturn = async () => {
    if (!returnId || !token) return;
    if (returnPhotos.length === 0) { toast.warning("Sube al menos 1 foto del estado en que se entrega el vehículo"); return; }
    setPhotoSaving(true);
    try {
      const fd = new FormData();
      returnPhotos.forEach(f => fd.append("photos", f));
      const res = await fetch(buildApiUrl(`vehicles/inventory/${returnId}/return`), {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setReturnId(null); setReturnPhotos([]); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al registrar devolución"); }
    finally { setPhotoSaving(false); }
  };

  const remove = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Eliminar este vehículo?", fn: async () => {
    try {
      await apiFetch(`vehicles/inventory/${id}`, token, { method: "PATCH", body: JSON.stringify({ activo: false }) });
      setItems(prev => prev.filter(v => v.id !== id));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al eliminar vehículo"); }
  } });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const [searchQ, setSearchQ] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

  const visibleVehicles = useMemo(() => {
    let result = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter((v) => (v.nombre ?? "").toLowerCase().includes(q) || (v.placas ?? "").toLowerCase().includes(q));
    }
    if (filterEstado) result = result.filter((v) => v.estatus === filterEstado);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) result = [...result].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return result;
  }, [items, highlightId, searchQ, filterEstado]);

  const columns: Column<Vehicle>[] = [
    { key: "nombre", label: "Vehículo", render: v => <span style={{ fontWeight: 700, fontSize: 13 }}>{v.nombre ?? "—"}</span> },
    { key: "placas", label: "Placas", render: v => <Tag variant="accent">{v.placas ?? "—"}</Tag>, width: 120 },
    { key: "estatus", label: "Estado", render: v => <Tag variant={v.estatus === "Asignado" ? "warning" : v.estatus === "Fuera_de_servicio" || v.estatus === "En_mantenimiento" ? "danger" : "positive"}>{(v.estatus ?? "Disponible").replace(/_/g, " ")}</Tag>, width: 150 },
    { key: "notas", label: "Notas", accessor: v => v.notas ?? "—" },
    { key: "assignedAt", label: "Desde", accessor: v => v.assignedAt ? new Date(v.assignedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "tiempoUsoMinutos", label: "Último uso", accessor: v => v.tiempoUsoMinutos != null ? `${Math.floor(v.tiempoUsoMinutos / 60)}h ${v.tiempoUsoMinutos % 60}m` : "—", width: 100 },
    { key: "id", label: "", render: v => (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {cfg.canEdit && v.estatus !== "Asignado" && (
          <button onClick={() => { setCheckoutId(v.id); setCheckoutPhotos([]); }} title="Registrar salida" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer" }}>📤 Salida</button>
        )}
        {cfg.canEdit && v.estatus === "Asignado" && (
          <button onClick={() => { setReturnId(v.id); setReturnPhotos([]); }} title="Registrar devolución" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--success,#22c55e)", background: "transparent", color: "var(--success,#22c55e)", cursor: "pointer" }}>📥 Devolución</button>
        )}
        {cfg.canEdit && <button onClick={() => openEdit(v)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {cfg.canDelete && <button onClick={() => remove(v.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 160 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Agregar vehículo</Button> : undefined}
      />

      {cfg.canApprove && requests.filter((r) => r.estatusAprobacion === "Pendiente").length > 0 && (
        <Section title="Solicitudes pendientes de autorización">
          <div style={{ display: "grid", gap: 8 }}>
            {requests.filter((r) => r.estatusAprobacion === "Pendiente").map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{r.solicitante?.nombre ?? "—"} · {r.nombreVehiculo ?? "Vehículo"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>#{r.id}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" variant="primary" onClick={() => void approveRequest(r.id, "approve")}>Autorizar</Button>
                  <Button size="sm" variant="danger" onClick={() => void approveRequest(r.id, "reject")}>Rechazar</Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {cfg.canApprove && usageStats?.users && usageStats.users.length > 0 && (
        <Section title="Control de kilometraje y eficiencia por usuario">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {usageStats.users.map((u) => (
              <div key={u.nombre} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{u.nombre}</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Km total: <strong>{u.kmTotal}</strong></div>
                <div style={{ fontSize: 12 }}>Viajes: {u.trips}</div>
                <div style={{ fontSize: 12 }}>Km/L prom.: {u.kmPorLitroPromedio ?? "—"}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Marca *</label>
            <input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Nissan, Toyota…" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Modelo *</label>
            <input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} placeholder="Frontier, Hilux…" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Placas</label>
            <input value={form.placas} onChange={e => setForm(f => ({ ...f, placas: e.target.value }))} placeholder="ABC-123-D" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Año</label>
            <input value={form.anio} onChange={e => setForm(f => ({ ...f, anio: e.target.value }))} placeholder="2026" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Póliza de seguro</label>
            <input value={form.poliza} onChange={e => setForm(f => ({ ...f, poliza: e.target.value }))} placeholder="N/A o número de póliza" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estatus} onChange={e => setForm(f => ({ ...f, estatus: e.target.value }))} style={inp} disabled={!editing}>
              {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Verificación, observaciones…" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving || !buildVehicleName(form)}>
              {saving ? "Guardando…" : editing ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Flotilla total" value={items.length} icon="🚗" hint="Unidades registradas" />
          <KpiCard label="Disponibles" value={items.filter(v => v.estatus === "Disponible").length} variant="positive" icon="✅" />
          <KpiCard label="Asignados" value={items.filter(v => v.estatus === "Asignado").length} variant="accent" icon="🔑" hint="En uso activo" />
          <KpiCard label="En mantenimiento" value={items.filter(v => v.estatus === "En_mantenimiento" || v.estatus === "Fuera_de_servicio").length} variant={items.filter(v => v.estatus === "En_mantenimiento" || v.estatus === "Fuera_de_servicio").length > 0 ? "danger" : "positive"} icon="🔧" />
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por vehículo o placas…" }}
        selects={[{
          label: "Estado",
          value: filterEstado,
          onChange: setFilterEstado,
          options: ESTADOS.map((e) => ({ value: e, label: e.replace(/_/g, " ") })),
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterEstado(""); }}
        resultCount={loading ? null : visibleVehicles.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleVehicles, [
            { key: "nombre", label: "Vehículo" },
            { key: "placas", label: "Placas" },
            { key: "estatus", label: "Estado" },
            { key: "notas", label: "Notas" },
          ], "vehiculos")}>CSV</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleVehicles.length} unidades`}>
        {loadError && (
          <p style={{ color: "var(--danger, #ef4444)", fontSize: 13, marginBottom: 12 }}>{loadError}</p>
        )}
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
      {/* ── Checkout modal ── */}
      {checkoutId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 28, maxWidth: 420, width: "90%", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📤 Registrar salida de vehículo</div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Sube fotos del estado actual del vehículo <strong>antes</strong> de entregarlo al usuario.</p>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Fotos antes de salida *
              <input type="file" accept="image/*" multiple style={{ display: "block", marginTop: 6, width: "100%" }}
                onChange={e => setCheckoutPhotos(Array.from(e.target.files ?? []))} />
            </label>
            {checkoutPhotos.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{checkoutPhotos.length} foto{checkoutPhotos.length > 1 ? "s" : ""} seleccionada{checkoutPhotos.length > 1 ? "s" : ""}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setCheckoutId(null); setCheckoutPhotos([]); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void doCheckout()} disabled={photoSaving || checkoutPhotos.length === 0}>
                {photoSaving ? "Guardando…" : "Confirmar salida"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return modal ── */}
      {returnId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 28, maxWidth: 420, width: "90%", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📥 Registrar devolución de vehículo</div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Sube fotos del estado en que <strong>regresa</strong> el vehículo para evidenciar la entrega.</p>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Fotos al devolver *
              <input type="file" accept="image/*" multiple style={{ display: "block", marginTop: 6, width: "100%" }}
                onChange={e => setReturnPhotos(Array.from(e.target.files ?? []))} />
            </label>
            {returnPhotos.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{returnPhotos.length} foto{returnPhotos.length > 1 ? "s" : ""} seleccionada{returnPhotos.length > 1 ? "s" : ""}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setReturnId(null); setReturnPhotos([]); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void doReturn()} disabled={photoSaving || returnPhotos.length === 0}>
                {photoSaving ? "Guardando…" : "Confirmar devolución"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

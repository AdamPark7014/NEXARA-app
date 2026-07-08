"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";

interface VehicleDetail {
  id: number;
  nombre?: string;
  placas?: string;
  estatus?: string;
  activo?: boolean;
  notas?: string;
  assignedToId?: number | null;
  assignedAt?: string | null;
  tiempoUsoMinutos?: number | null;
  createdAt?: string;
}

interface VehicleLog {
  id: number;
  action?: string;
  userId?: number;
  userName?: string;
  createdAt: string;
  notes?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  return res.json();
}

const ESTADOS = ["Disponible", "Asignado", "En_servicio", "Fuera_de_servicio", "En_mantenimiento"];

const statusVariant = (s?: string): "positive" | "warning" | "danger" | "accent" | "neutral" => {
  if (!s || s === "Disponible") return "positive";
  if (s === "Asignado" || s === "En_servicio") return "warning";
  return "danger";
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();
  const token = user?.token ?? "";
  const canEdit = user?.isSuperAdmin || ["ceo", "super_admin", "dir_admin", "coord_admin", "dir_operaciones", "coord_operaciones"].includes(user?.roleKey ?? "");

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre: "", placas: "", estatus: "Disponible", notas: "" });

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [vData, lData] = await Promise.allSettled([
        apiFetch(`vehicles/inventory/${id}`, token),
        apiFetch(`vehicles/inventory/${id}/logs`, token),
      ]);
      if (vData.status === "fulfilled" && vData.value) {
        setVehicle(vData.value);
      } else if (vData.status === "rejected") {
        throw vData.reason;
      }
      if (lData.status === "fulfilled") {
        const arr = Array.isArray(lData.value) ? lData.value : (lData.value?.data ?? []);
        setLogs(arr.slice(0, 15));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el vehículo");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = () => {
    if (!vehicle) return;
    setForm({
      nombre: vehicle.nombre ?? "",
      placas: vehicle.placas ?? "",
      estatus: vehicle.estatus ?? "Disponible",
      notas: vehicle.notas ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !id) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`vehicles/inventory/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ nombre: form.nombre || undefined, placas: form.placas || undefined, estatus: form.estatus, notas: form.notas || undefined }),
      });
      if (updated) setVehicle((prev) => prev ? { ...prev, ...updated } : prev);
      else setVehicle((prev) => prev ? { ...prev, ...form } : prev);
      setEditing(false);
      toast.success("Vehículo actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  };

  const usageLabel = useMemo(() => {
    if (!vehicle?.tiempoUsoMinutos) return null;
    const h = Math.floor(vehicle.tiempoUsoMinutos / 60);
    const m = vehicle.tiempoUsoMinutos % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [vehicle]);

  if (loading) return <EmptyState icon="⏳" title="Cargando vehículo…" description="Consultando datos de la flotilla." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!vehicle) return null;

  return (
    <>
      <PageHeader
        eyebrow="OPS · Flotilla"
        title={vehicle.nombre ?? `Vehículo #${id}`}
        subtitle={vehicle.placas ? `Placas: ${vehicle.placas}` : "Sin placas registradas"}
        meta={<Tag variant={statusVariant(vehicle.estatus)} dot>{(vehicle.estatus ?? "Disponible").replace(/_/g, " ")}</Tag>}
        actions={
          <>
            <Link href="/ops/vehicles" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Flotilla</Button>
            </Link>
            {canEdit && !editing && (
              <Button variant="primary" iconLeft="✎" onClick={openEdit}>Editar</Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Estado" value={(vehicle.estatus ?? "Disponible").replace(/_/g, " ")} icon="🚗" />
        {usageLabel && <KpiCard label="Último uso" value={usageLabel} icon="⏱" />}
        {vehicle.assignedAt && <KpiCard label="Asignado desde" value={new Date(vehicle.assignedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} icon="📅" />}
      </div>

      {editing ? (
        <Section title="Editar vehículo">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre (marca modelo año) *</label>
              <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Toyota Hilux 2022" style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Placas</label>
              <input value={form.placas} onChange={(e) => setForm((f) => ({ ...f, placas: e.target.value }))} placeholder="ABC-123-D" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
              <select value={form.estatus} onChange={(e) => setForm((f) => ({ ...f, estatus: e.target.value }))} style={inp}>
                {ESTADOS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas / póliza</label>
              <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.nombre.trim()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Información del vehículo" actions={canEdit ? <Button size="sm" variant="ghost" iconLeft="✎" onClick={openEdit}>Editar</Button> : undefined}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Nombre", value: vehicle.nombre },
              { label: "Placas", value: vehicle.placas },
              { label: "Estado", value: (vehicle.estatus ?? "Disponible").replace(/_/g, " ") },
              { label: "Activo", value: vehicle.activo !== false ? "Sí" : "No" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
              </div>
            ))}
            {vehicle.notas && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Notas</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{vehicle.notas}</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {logs.length > 0 && (
        <Section eyebrow="Historial" title="Movimientos recientes" subtitle="Últimos registros de uso y asignación">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{log.action?.replace(/_/g, " ") ?? "Movimiento"}</div>
                  {log.userName && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{log.userName}</div>}
                  {log.notes && <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>{log.notes}</div>}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                  {new Date(log.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

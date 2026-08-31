"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CrossPanelLink from "@/components/CrossPanelLink";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import { activityDisplayLabel, activityDisplayVariant } from "@/lib/activity-status";

interface ServiceClient {
  id: number;
  nombre: string;
  contacto?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  estado: string;
  salesClientId?: number | null;
  salesClient?: { id: number; name: string } | null;
  createdAt?: string | null;
}

interface ActivityRow {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaEntregaEsperada?: string | null;
  responsable?: { nombre: string } | null;
}

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

function mapClient(raw: Record<string, unknown>): ServiceClient {
  const isActive = raw.isActive !== false && raw.estado !== "Inactivo";
  return {
    id: Number(raw.id),
    nombre: String(raw.name ?? raw.nombre ?? ""),
    contacto: raw.contactName != null ? String(raw.contactName) : raw.contacto != null ? String(raw.contacto) : null,
    telefono: raw.contactPhone != null ? String(raw.contactPhone) : raw.telefono != null ? String(raw.telefono) : null,
    direccion: raw.address != null ? String(raw.address) : raw.direccion != null ? String(raw.direccion) : null,
    estado: isActive ? "Activo" : "Inactivo",
    salesClientId: raw.salesClientId != null ? Number(raw.salesClientId) : null,
    salesClient: raw.salesClient as ServiceClient["salesClient"] ?? null,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
  };
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function ServiceClientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "service-clients"), [user]);
  const token = user?.token ?? "";

  const [client, setClient] = useState<ServiceClient | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre: "", contacto: "", telefono: "", direccion: "", estado: "Activo" });

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [clientData, actData] = await Promise.allSettled([
        apiFetch(`service-clients/${id}`, token),
        apiFetch(`activities?serviceClientId=${id}&limit=10`, token),
      ]);
      if (clientData.status === "fulfilled") {
        setClient(mapClient(clientData.value?.client ?? clientData.value));
      } else {
        throw clientData.reason;
      }
      if (actData.status === "fulfilled") {
        const arr = Array.isArray(actData.value) ? actData.value : (actData.value?.data ?? []);
        setActivities(arr.slice(0, 10));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el cliente");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = () => {
    if (!client) return;
    setForm({ nombre: client.nombre, contacto: client.contacto ?? "", telefono: client.telefono ?? "", direccion: client.direccion ?? "", estado: client.estado });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !id || !form.nombre.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`service-clients/${id}`, token, {
        method: "PUT",
        body: JSON.stringify({ name: form.nombre.trim(), contactName: form.contacto || undefined, contactPhone: form.telefono || undefined, address: form.direccion || undefined, isActive: form.estado === "Activo" }),
      });
      setClient(mapClient(updated?.client ?? updated));
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  };

  if (loading) return <EmptyState icon="⏳" title="Cargando cliente…" description="Consultando datos de operación." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!client) return null;

  const openActivities = activities.filter((a) => a.estatus !== "COMPLETADA" && a.estatus !== "CANCELADA");

  return (
    <>
      <PageHeader
        eyebrow="OPS · Clientes en servicio"
        title={client.nombre}
        subtitle={client.direccion ?? "Cliente de servicio continuo"}
        meta={<Tag variant={client.estado === "Activo" ? "positive" : "neutral"} dot>{client.estado}</Tag>}
        actions={
          <>
            {client.salesClientId && (
              <CrossPanelLink href={`/crm/clients/${client.salesClientId}`} style={{ textDecoration: "none" }}>
                <Button variant="secondary" iconLeft="↗">Ver en CRM</Button>
              </CrossPanelLink>
            )}
            {cfg.canEdit && (
              <Button variant="primary" iconLeft="✎" onClick={openEdit}>Editar</Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Estado" value={client.estado} variant={client.estado === "Activo" ? "positive" : "default"} icon="🏢" />
        <KpiCard label="OTs abiertas" value={openActivities.length} icon="🔧" variant={openActivities.length > 0 ? "accent" : "default"} />
        <KpiCard label="OTs totales" value={activities.length} icon="📋" />
        <KpiCard label="OTs completadas" value={activities.filter((a) => a.estatus === "COMPLETADA" || a.estatus === "COMPLETED" || a.estatus === "DONE").length} icon="✅" variant="positive" />
      </div>

      {activities.length > 0 && (() => {
        const byEstatus: Record<string, number> = {};
        for (const a of activities) byEstatus[a.estatus] = (byEstatus[a.estatus] ?? 0) + 1;
        const total = activities.length;
        const estatusColors: Record<string, string> = { COMPLETADA: "var(--success)", COMPLETED: "var(--success)", DONE: "var(--success)", EN_CURSO: "var(--primary)", PROGRAMADA: "var(--warning)", REPROGRAMAR: "var(--danger)", CANCELADA: "var(--text-tertiary)" };
        const estatusLabels: Record<string, string> = { COMPLETADA: "Completadas", COMPLETED: "Completadas", DONE: "Completadas", EN_CURSO: "En curso", PROGRAMADA: "Programadas", REPROGRAMAR: "Reprogramar", CANCELADA: "Canceladas" };
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Estado de OTs recientes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byEstatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{estatusLabels[s] ?? s}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: estatusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {editing ? (
        <Section title="Editar cliente de servicio">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Contacto</label>
              <input value={form.contacto} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} placeholder="Nombre del contacto" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Teléfono</label>
              <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Dirección</label>
              <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} placeholder="Dirección" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
              <select value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))} style={inp}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
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
        <Section title="Datos del cliente">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Contacto", value: client.contacto },
              { label: "Teléfono", value: client.telefono },
              { label: "Dirección", value: client.direccion },
              { label: "Estado", value: client.estado },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value || "—"}</div>
              </div>
            ))}
          </div>
          {client.salesClient && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Vinculado en CRM</div>
              <CrossPanelLink href={`/crm/clients/${client.salesClientId}`} style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
                {client.salesClient.name} →
              </CrossPanelLink>
            </div>
          )}
        </Section>
      )}

      <Section
        eyebrow="Órdenes de trabajo"
        title="Actividades recientes"
        subtitle="Últimas 10 OTs vinculadas a este cliente"
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href={`/ops/activities/new?clientId=${client?.id ?? ""}`} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="primary">Crear OT</Button>
            </Link>
            <Link href={`/ops/activities`} style={{ fontSize: 12, color: "var(--primary)" }}>Ver todas →</Link>
          </div>
        }
      >
        {activities.length === 0 ? (
          <EmptyState
            title="Sin actividades"
            description="No hay órdenes de trabajo registradas para este cliente."
            action={
              <Link href={`/ops/activities/new?clientId=${client?.id ?? ""}`} style={{ textDecoration: "none" }}>
                <Button size="sm" variant="primary">Crear OT</Button>
              </Link>
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activities.map((a) => (
              <Link key={a.id} href={`/ops/activities/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <Tag variant="neutral">{a.anNumber}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.titulo}</div>
                    {a.responsable && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{a.responsable.nombre}</div>}
                  </div>
                  {a.fechaEntregaEsperada && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}>
                      {new Date(a.fechaEntregaEsperada).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                    </span>
                  )}
                  <Tag variant={activityDisplayVariant(a.estatus, null)}>
                    {activityDisplayLabel(a.estatus, null)}
                  </Tag>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

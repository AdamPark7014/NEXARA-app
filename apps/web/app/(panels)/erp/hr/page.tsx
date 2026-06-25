"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getHrSectionConfig } from "@/lib/section-views";

type HrEmpleado = {
  id: number;
  nombre: string;
  email: string;
  employeeNumber?: string | null;
  avatarUrl?: string | null;
  puesto?: string | null;
  tipoContrato?: string | null;
  estadoRRHH?: string | null;
  isActive?: boolean;
  fechaIngreso?: string | null;
  fechaCreacion?: string;
  department?: { id: number; nombre: string } | null;
  role?: { id: number; nombre: string; nivelAutoridad?: number | null } | null;
};

type ApiRole = { id: number; nombre: string };
type ApiDept = { id: number; nombre: string };

type HrState =
  | { kind: "loading" }
  | { kind: "ready"; items: HrEmpleado[] }
  | { kind: "error"; message: string };

const TIPO_CONTRATO = ["Planta", "Honorarios", "Contratista"] as const;
const ESTADOS_RRHH = ["Activo", "Vacaciones", "Incidencia", "Baja"] as const;

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.message || text || msg; } catch { msg = text || msg; }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyCreateForm = { nombre: "", email: "", password: "", roleId: "", departmentId: "", puesto: "", tipoContrato: "Planta" as string };

export default function HrPage() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getHrSectionConfig(user), [user]);
  const [state, setState] = useState<HrState>({ kind: "loading" });
  const [editing, setEditing] = useState<HrEmpleado | null>(null);
  const [editForm, setEditForm] = useState<Partial<HrEmpleado>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [depts, setDepts] = useState<ApiDept[]>([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm });
  const [createErr, setCreateErr] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!user?.token) return;
    setState({ kind: "loading" });
    try {
      const [data, rolesData, deptsData] = await Promise.all([
        apiFetch("users/hr-staff?limit=50", user.token),
        apiFetch("users/roles", user.token).catch(() => []),
        apiFetch("departments", user.token).catch(() => []),
      ]);
      const items: HrEmpleado[] = Array.isArray(data) ? data : (data?.data ?? []);
      setState({ kind: "ready", items });
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setDepts(Array.isArray(deptsData) ? deptsData : []);
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Error al cargar plantilla" });
    }
  }, [user?.token]);

  useEffect(() => { void fetchStaff(); }, [fetchStaff]);

  useEffect(() => {
    if (!cfg.canAccess) {
      router.replace("/erp/hr/attendance");
    }
  }, [cfg.canAccess, router]);

  const filtered = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = filter.trim().toLowerCase();
    if (!q) return state.items;
    return state.items.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.puesto ?? "").toLowerCase().includes(q) ||
        (e.department?.nombre ?? "").toLowerCase().includes(q),
    );
  }, [state, filter]);

  const activos = state.kind === "ready" ? state.items.filter((e) => e.isActive !== false && e.estadoRRHH !== "Baja").length : 0;
  const vac     = state.kind === "ready" ? state.items.filter((e) => e.estadoRRHH === "Vacaciones").length : 0;
  const total   = state.kind === "ready" ? state.items.length : 0;

  const openEdit = (e: HrEmpleado) => {
    setEditing(e);
    setEditForm({
      puesto: e.puesto ?? "",
      tipoContrato: e.tipoContrato ?? "Planta",
      estadoRRHH: e.estadoRRHH ?? "Activo",
      isActive: e.isActive !== false,
      fechaIngreso: e.fechaIngreso ? e.fechaIngreso.slice(0, 10) : "",
    });
  };

  const saveEdit = async () => {
    if (!editing || !user?.token) return;
    setSaving(true);
    try {
      await apiFetch(`users/${editing.id}/hr`, user.token, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      setState((s) => {
        if (s.kind !== "ready") return s;
        return { kind: "ready", items: s.items.map((i) => (i.id === editing.id ? { ...i, ...editForm } : i)) };
      });
      setEditing(null);
    } catch (e) {
      alert(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (e: HrEmpleado) => {
    if (!user?.token) return;
    const next = e.isActive === false ? true : false;
    try {
      await apiFetch(`users/${e.id}/hr`, user.token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next, estadoRRHH: next ? "Activo" : "Baja" }),
      });
      setState((s) => {
        if (s.kind !== "ready") return s;
        return {
          kind: "ready",
          items: s.items.map((i) => i.id === e.id ? { ...i, isActive: next, estadoRRHH: next ? "Activo" : "Baja" } : i),
        };
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "desconocido"}`);
    }
  };

  const openCreate = () => { setCreateForm({ ...emptyCreateForm }); setCreateErr(null); setCreating(true); };

  const submitCreate = async () => {
    if (!user?.token) return;
    if (!createForm.nombre || !createForm.email || !createForm.password || !createForm.roleId || !createForm.departmentId) {
      setCreateErr("Nombre, email, contraseña, rol y departamento son requeridos.");
      return;
    }
    setSaving(true);
    setCreateErr(null);
    try {
      const created = await apiFetch("users", user.token, {
        method: "POST",
        body: JSON.stringify({
          nombre: createForm.nombre,
          email: createForm.email,
          password: createForm.password,
          roleId: Number(createForm.roleId),
          departmentId: Number(createForm.departmentId),
          puesto: createForm.puesto || undefined,
          tipoContrato: createForm.tipoContrato,
        }),
      });
      if (created) {
        setState((s) => (s.kind === "ready" ? { kind: "ready", items: [created, ...s.items] } : s));
      }
      setCreating(false);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Error al crear empleado");
    } finally {
      setSaving(false);
    }
  };

  const deleteEmpleado = async (e: HrEmpleado) => {
    if (!user?.token) return;
    if (!confirm(`⚠️ Eliminar permanentemente a "${e.nombre}" (${e.email})?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await apiFetch(`users/${e.id}`, user.token, { method: "DELETE" });
      setState((s) => (s.kind === "ready" ? { kind: "ready", items: s.items.filter((i) => i.id !== e.id) } : s));
    } catch (err) {
      alert(`Error al eliminar: ${err instanceof Error ? err.message : "desconocido"}`);
    }
  };

  const columns: Column<HrEmpleado>[] = [
    {
      key: "id", label: "ID",
      render: (e) => <code style={{ fontSize: 11 }}>{e.employeeNumber ?? `EMP-${String(e.id).padStart(3, "0")}`}</code>,
      width: 110,
    },
    {
      key: "nombre", label: "Persona",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{e.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.puesto || e.role?.nombre || "Sin puesto asignado"}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.email}</div>
        </div>
      ),
    },
    {
      key: "area", label: "Área",
      render: (e) => <Tag variant="default">{e.department?.nombre ?? "—"}</Tag>,
    },
    {
      key: "tipoContrato", label: "Tipo",
      render: (e) => {
        const t = e.tipoContrato ?? "—";
        return <Tag variant={t === "Planta" ? "positive" : t === "Honorarios" ? "accent" : "warning"}>{t}</Tag>;
      },
    },
    {
      key: "fechaIngreso", label: "Ingreso",
      render: (e) => {
        const d = e.fechaIngreso ?? e.fechaCreacion;
        return <span style={{ fontSize: 12 }}>{d ? new Date(d).getFullYear() : "—"}</span>;
      },
      width: 80,
    },
    {
      key: "estadoRRHH", label: "Estado",
      render: (e) => {
        const s = e.estadoRRHH ?? "Activo";
        return <Tag variant={s === "Activo" ? "positive" : s === "Vacaciones" ? "accent" : s === "Incidencia" ? "warning" : "danger"}>{s}</Tag>;
      },
      width: 110,
    },
    {
      key: "acciones", label: "Acciones",
      render: (e) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" iconLeft="✏️" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}>Editar</Button>
          {cfg.canEdit && (
            <>
              <Button
                size="sm"
                variant={e.isActive === false ? "secondary" : "danger"}
                iconLeft={e.isActive === false ? "✅" : "🚫"}
                onClick={(ev) => { ev.stopPropagation(); void toggleActive(e); }}
              >
                {e.isActive === false ? "Reactivar" : "Dar baja"}
              </Button>
              <Button size="sm" variant="danger" iconLeft="🗑️" onClick={(ev) => { ev.stopPropagation(); void deleteEmpleado(e); }}>
                Eliminar
              </Button>
            </>
          )}
        </div>
      ),
      width: 280,
    },
  ];

  const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  if (!cfg.canAccess) return null;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        variant="hero"
        meta={
          state.kind === "ready" ? (
            <>
              <Tag variant="accent" dot>{total} personas en plantilla</Tag>
              <Tag variant="positive">{activos} activos</Tag>
              {vac > 0 && <Tag variant="default">{vac} en vacaciones</Tag>}
            </>
          ) : undefined
        }
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void fetchStaff()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="👤" onClick={openCreate}>Alta de personal</Button>
            )}
          </>
        }
      />

      {state.kind === "ready" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Plantilla total" value={total} hint={`${activos} activos`} variant="default" icon="🧑‍💼" />
          <KpiCard label="En vacaciones" value={vac} hint="Esta semana" variant="accent" icon="🏖️" />
          <KpiCard
            label="Incidencias"
            value={state.items.filter((e) => e.estadoRRHH === "Incidencia").length}
            hint="Abiertas"
            variant={state.items.some((e) => e.estadoRRHH === "Incidencia") ? "warning" : "positive"}
            icon="🛡️"
          />
          <KpiCard
            label="Honorarios"
            value={state.items.filter((e) => e.tipoContrato === "Honorarios").length}
            hint="Sin prestaciones"
            variant="default"
            icon="📋"
          />
        </div>
      )}

      {state.kind === "ready" && (
        <div style={{ marginBottom: 12 }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nombre, puesto, área…"
            style={{ width: "100%", maxWidth: 400, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
          />
        </div>
      )}

      <Section title="Plantilla activa">
        {state.kind === "loading" && <EmptyState icon="⏳" title="Cargando plantilla…" description="Consultando usuarios desde la API." />}
        {state.kind === "error" && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={state.message}
            action={<Button size="sm" variant="secondary" onClick={() => void fetchStaff()}>Reintentar</Button>}
          />
        )}
        {state.kind === "ready" && (
          <DataTable columns={columns} rows={filtered} rowKey={(e) => e.id} onRowClick={(e) => openEdit(e)} />
        )}
      </Section>

      {editing && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Editar ficha de {editing.nombre}</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 20 }}>{editing.email}</div>

            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Puesto / cargo</span>
                <input
                  value={editForm.puesto ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, puesto: e.target.value }))}
                  placeholder="Ej: Ingeniero de Campo"
                  style={inp}
                />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo de contrato</span>
                <select
                  value={editForm.tipoContrato ?? "Planta"}
                  onChange={(e) => setEditForm((f) => ({ ...f, tipoContrato: e.target.value }))}
                  style={inp}
                >
                  {TIPO_CONTRATO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Estado RRHH</span>
                <select
                  value={editForm.estadoRRHH ?? "Activo"}
                  onChange={(e) => setEditForm((f) => ({ ...f, estadoRRHH: e.target.value }))}
                  style={inp}
                >
                  {ESTADOS_RRHH.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha de ingreso</span>
                <input
                  type="date"
                  value={(editForm.fechaIngreso as string | undefined) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, fechaIngreso: e.target.value }))}
                  style={inp}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={editForm.isActive !== false}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span style={{ fontSize: 13 }}>Empleado activo en sistema</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveEdit()} disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setCreating(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Alta de personal</div>

            {createErr && (
              <div style={{ background: "rgba(220,38,38,0.1)", color: "var(--danger)", padding: "8px 12px", borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
                {createErr}
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre completo</span>
                <input value={createForm.nombre} onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre Apellido Apellido" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Email</span>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@nexara.com.mx" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Contraseña temporal</span>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Puesto / cargo</span>
                <input value={createForm.puesto} onChange={(e) => setCreateForm((f) => ({ ...f, puesto: e.target.value }))}
                  placeholder="Ej: Ingeniero de Campo" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Rol / nivel de acceso</span>
                <select value={createForm.roleId} onChange={(e) => setCreateForm((f) => ({ ...f, roleId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Departamento</span>
                <select value={createForm.departmentId} onChange={(e) => setCreateForm((f) => ({ ...f, departmentId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo de contrato</span>
                <select value={createForm.tipoContrato} onChange={(e) => setCreateForm((f) => ({ ...f, tipoContrato: e.target.value }))} style={inp}>
                  {TIPO_CONTRATO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitCreate()} disabled={saving}>
                {saving ? "Creando…" : "Crear empleado"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

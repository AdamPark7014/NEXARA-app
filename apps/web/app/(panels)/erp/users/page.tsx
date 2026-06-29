"use client";

/**
 * ERP · Gestión de Usuarios
 * ==========================
 * CRUD completo conectado a /api/users.
 * - CEO / Director Admin: crear, editar, desactivar, cambiar contraseña, asignar rol.
 * - Managers: ver equipo, editar datos básicos.
 * - El dueño/CEO ve panel administrativo global, no "Mis actividades".
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

/* ─── tipos ─────────────────────────────────────────────────────────── */
interface ApiUser {
  id: number;
  nombre: string;
  email: string;
  isActive: boolean;
  orgRoleKey?: string | null;
  roleId?: number;
  departmentId?: number;
  managerId?: number | null;
  role?: { id: number; nombre: string; orgRoleKey?: string };
  department?: { id: number; nombre: string };
  manager?: { id: number; nombre: string };
  lastLoginAt?: string;
  createdAt?: string;
}

interface ApiRole { id: number; nombre: string; orgRoleKey?: string }
interface ApiDept { id: number; nombre: string }

type ModalMode = "create" | "edit" | "password" | null;

/* ─── API helper ─────────────────────────────────────────────────────── */
async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)",
  fontSize: 13, boxSizing: "border-box",
};

function Lbl({ text }: { text: string }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
      {text}
    </label>
  );
}

const emptyForm = { nombre: "", email: "", password: "", roleId: "", departmentId: "", managerId: "" };

function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: T[] }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

function userRoleId(u: ApiUser): string {
  const id = u.role?.id ?? u.roleId;
  return id != null ? String(id) : "";
}

function userDepartmentId(u: ApiUser): string {
  const id = u.department?.id ?? u.departmentId;
  return id != null ? String(id) : "";
}

function userManagerId(u: ApiUser): string {
  const id = u.manager?.id ?? u.managerId;
  return id != null ? String(id) : "";
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function UsersPage() {
  const { user: currentUser } = useUser();
  const token = currentUser?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getErpGovernanceSectionConfig(currentUser, "users"), [currentUser]);

  const [users,   setUsers]   = useState<ApiUser[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [roles,   setRoles]   = useState<ApiRole[]>([]);
  const [depts,   setDepts]   = useState<ApiDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [modal,   setModal]   = useState<ModalMode>(null);
  const [target,  setTarget]  = useState<ApiUser | null>(null);
  const [form,    setForm]    = useState({ ...emptyForm });
  const [pwForm,  setPwForm]  = useState({ newPassword: "", confirm: "" });
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  /* ── carga ───────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null); setMetaError(null);
    try {
      const [usersResult, rolesResult, deptsResult] = await Promise.allSettled([
        apiFetch("users", token),
        apiFetch("users/roles", token),
        apiFetch("users/departments", token),
      ]);

      if (usersResult.status === "rejected") {
        throw usersResult.reason;
      }
      setUsers(asList<ApiUser>(usersResult.value));

      const metaProblems: string[] = [];
      if (rolesResult.status === "fulfilled") {
        setRoles(asList<ApiRole>(rolesResult.value));
      } else {
        setRoles([]);
        metaProblems.push("roles");
      }
      if (deptsResult.status === "fulfilled") {
        setDepts(asList<ApiDept>(deptsResult.value));
      } else {
        setDepts([]);
        metaProblems.push("departamentos");
      }
      if (metaProblems.length > 0) {
        setMetaError(`No se pudieron cargar ${metaProblems.join(" ni ")}. Recarga la página o vuelve a iniciar sesión.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando usuarios");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /* ── modales ─────────────────────────────────────────────────────── */
  const openCreate = () => { setTarget(null); setForm({ ...emptyForm }); setSaveErr(null); setModal("create"); };
  const openEdit = (u: ApiUser) => {
    setTarget(u);
    setForm({
      nombre: u.nombre,
      email: u.email,
      password: "",
      roleId: userRoleId(u),
      departmentId: userDepartmentId(u),
      managerId: userManagerId(u),
    });
    setSaveErr(null); setModal("edit");
  };
  const openPassword = (u: ApiUser) => { setTarget(u); setPwForm({ newPassword: "", confirm: "" }); setSaveErr(null); setModal("password"); };
  const closeModal = () => { setModal(null); setTarget(null); setSaveErr(null); };

  /* ── guardar ─────────────────────────────────────────────────────── */
  const saveUser = async () => {
    setSaving(true); setSaveErr(null);
    try {
      if (modal === "create") {
        if (!form.nombre || !form.email || !form.password || !form.roleId || !form.departmentId) {
          setSaveErr("Nombre, email, contraseña, rol y departamento son requeridos."); setSaving(false); return;
        }
        const body = {
          nombre: form.nombre, email: form.email, password: form.password,
          roleId: Number(form.roleId), departmentId: Number(form.departmentId),
          ...(form.managerId ? { managerId: Number(form.managerId) } : {}),
        };
        const created = await apiFetch("users", token, { method: "POST", body: JSON.stringify(body) });
        setUsers(prev => [created, ...prev]);
      } else if (modal === "edit" && target) {
        const body: Record<string, unknown> = {
          nombre: form.nombre, email: form.email,
          roleId: Number(form.roleId), departmentId: Number(form.departmentId),
          managerId: form.managerId ? Number(form.managerId) : null,
        };
        const updated = await apiFetch(`users/${target.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        setUsers(prev => prev.map(u => u.id === target.id ? { ...u, ...updated } : u));
      }
      closeModal(); load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (!target) return;
    if (pwForm.newPassword.length < 6) { setSaveErr("Mínimo 6 caracteres."); return; }
    if (pwForm.newPassword !== pwForm.confirm) { setSaveErr("Las contraseñas no coinciden."); return; }
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`users/${target.id}`, token, { method: "PATCH", body: JSON.stringify({ password: pwForm.newPassword }) });
      closeModal();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error");
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: ApiUser) => {
    setConfirmState({ message: `¿${u.isActive ? "Desactivar" : "Activar"} a ${u.nombre}?`, confirmLabel: u.isActive ? "Desactivar" : "Activar", fn: async () => {
    try {
      await apiFetch(`users/${u.id}/hr`, token, { method: "PATCH", body: JSON.stringify({ isActive: !u.isActive }) });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
    } catch (e) {
      alert(formatApiError(e, "No se pudo cambiar el estado"));
    }
  } });
  };

  const deleteUser = async (u: ApiUser) => {
    setConfirmState({ message: `⚠️ Eliminar permanentemente a "${u.nombre}" (${u.email}). Esta acción no se puede deshacer.`, fn: async () => {
    try {
      await apiFetch(`users/${u.id}`, token, { method: "DELETE" });
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e) {
      alert(`Error al eliminar: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  } });
  };

  /* ── KPIs ────────────────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return {
      total:    users.length,
      activos:  users.filter(u => u.isActive).length,
      inact:    users.filter(u => !u.isActive).length,
      nuevos:   users.filter(u => u.createdAt?.slice(0, 10) === hoy).length,
    };
  }, [users]);

  const visibleUsers = useMemo(() => {
    if (!highlightId) return users;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return users;
    return [...users].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [users, highlightId]);

  /* ── columnas ────────────────────────────────────────────────────── */
  const columns: Column<ApiUser>[] = [
    {
      key: "nombre", label: "Usuario",
      render: u => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
            {u.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{u.nombre}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: "role",       label: "Rol",       render: u => <Tag variant="accent">{u.role?.nombre ?? "—"}</Tag>, width: 160 },
    { key: "department", label: "Área",       accessor: u => u.department?.nombre ?? "—", width: 140 },
    { key: "manager",    label: "Reporta a",  accessor: u => u.manager?.nombre ?? "—", width: 160 },
    { key: "isActive",   label: "Estado",     render: u => <Tag variant={u.isActive ? "positive" : "danger"}>{u.isActive ? "Activo" : "Inactivo"}</Tag>, width: 90 },
    { key: "lastLoginAt", label: "Último acceso",
      accessor: u => u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca",
      width: 130 },
    ...(cfg.canAssign ? [{
      key: "id" as const, label: "Acciones" as const,
      render: (u: ApiUser) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => openEdit(u)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11.5, padding: "3px 8px", color: "var(--text-secondary)" }}>✎ Editar</button>
          <button onClick={() => openPassword(u)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11.5, padding: "3px 8px", color: "var(--text-secondary)" }}>🔑</button>
          {cfg.canApprove && (
            <button onClick={() => toggleActive(u)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11.5, padding: "3px 8px", color: u.isActive ? "var(--danger)" : "var(--success)" }}>
              {u.isActive ? "✕ Des." : "✓ Act."}
            </button>
          )}
          {/* Eliminar: solo superadmin / CEO para prevenir borrado accidental */}
          {(currentUser?.isSuperAdmin || (currentUser?.nivelAutoridad ?? 0) >= 5) && (
            <button
              onClick={() => deleteUser(u)}
              title="Eliminar usuario permanentemente"
              style={{ background: "none", border: "1px solid var(--danger)", borderRadius: 6, cursor: "pointer", fontSize: 11.5, padding: "3px 8px", color: "var(--danger)" }}
            >
              🗑
            </button>
          )}
        </div>
      ), width: 200,
    }] : []),
  ];

  const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
  const box: React.CSSProperties = { background: "var(--surface)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" };

  return (
    <>
      <PageHeader
        eyebrow="ERP · RRHH"
        title="Gestión de usuarios"
        subtitle="Administración de cuentas, roles, departamentos y contraseñas del equipo NEXARA."
        actions={cfg.canAssign ? <Button variant="primary" iconLeft="+" onClick={openCreate}>Nuevo usuario</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard label="Total" value={kpis.total} icon="👥" />
        <KpiCard label="Activos" value={kpis.activos} icon="✅" variant="positive" />
        <KpiCard label="Inactivos" value={kpis.inact} icon="⛔" variant={kpis.inact > 0 ? "danger" : "default"} />
        <KpiCard label="Nuevos hoy" value={kpis.nuevos} icon="🆕" variant="accent" />
      </div>

      {metaError && (
        <div style={{ padding: "10px 14px", background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "var(--state-warning-text)" }}>
          ⚠️ {metaError}
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "var(--state-warning-text)" }}>
          ⚠️ {error}
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleUsers.length} usuarios`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando usuario <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading
          ? <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          : <DataTable columns={columns} rows={visibleUsers} rowKey={u => u.id} emptyTitle="Sin usuarios" emptyDescription="Crea el primer usuario con el botón +" />
        }
      </Section>

      {/* Modal crear / editar */}
      {(modal === "create" || modal === "edit") && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={box}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontFamily: "var(--nx-font-display)", fontWeight: 700 }}>
              {modal === "create" ? "➕ Nuevo usuario" : `✎ Editar · ${target?.nombre}`}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <Lbl text="Nombre completo *" />
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre Apellido Apellido" style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Lbl text="Email *" />
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="usuario@nexara.com.mx" style={inp} />
              </div>
              {modal === "create" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <Lbl text="Contraseña inicial *" />
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" style={inp} />
                </div>
              )}
              <div>
                <Lbl text="Rol *" />
                <select value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))} style={inp} disabled={roles.length === 0}>
                  <option value="">— Seleccionar —</option>
                  {roles.map(r => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <Lbl text="Departamento *" />
                <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} style={inp} disabled={depts.length === 0}>
                  <option value="">— Seleccionar —</option>
                  {depts.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Lbl text="Reporta a (manager)" />
                <select value={form.managerId} onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))} style={inp}>
                  <option value="">— Sin manager —</option>
                  {users.filter(u => u.id !== target?.id && u.isActive).map(u => (
                    <option key={u.id} value={String(u.id)}>{u.nombre} · {u.role?.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            {saveErr && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg)", borderRadius: 8, fontSize: 12.5, color: "var(--state-danger-text)" }}>{saveErr}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" onClick={saveUser} disabled={saving}>{saving ? "Guardando…" : modal === "create" ? "Crear usuario" : "Guardar cambios"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambiar contraseña */}
      {modal === "password" && target && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ ...box, maxWidth: 400 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 17, fontFamily: "var(--nx-font-display)", fontWeight: 700 }}>🔑 Cambiar contraseña</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)" }}>{target.nombre} · {target.email}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Lbl text="Nueva contraseña *" />
                <input type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Mínimo 6 caracteres" style={inp} />
              </div>
              <div>
                <Lbl text="Confirmar contraseña *" />
                <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repetir contraseña" style={inp} />
              </div>
            </div>
            {saveErr && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg)", borderRadius: 8, fontSize: 12.5, color: "var(--state-danger-text)" }}>{saveErr}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" onClick={savePassword} disabled={saving}>{saving ? "Guardando…" : "Cambiar contraseña"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

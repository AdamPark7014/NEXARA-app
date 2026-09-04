"use client";

/**
 * ERP · IAM Command Center
 * ========================
 * Gestión enterprise de identidades: KPIs, riesgo, sesiones,
 * actividad de auth, acciones masivas y CRUD de cuentas.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { DashGrid, DashCol, DashPanel, StatStrip, DashPill } from "@/components/dashboard/DashKit";
import RoleAccessMatrix from "@/components/RoleAccessMatrix";

/* ─── tipos ─────────────────────────────────────────────────────────── */
interface ApiUser {
  id: number;
  nombre: string;
  email: string;
  isActive: boolean;
  employeeNumber?: string | null;
  orgRoleKey?: string | null;
  roleId?: number;
  departmentId?: number;
  managerId?: number | null;
  role?: { id: number; nombre: string; orgRoleKey?: string };
  department?: { id: number; nombre: string };
  manager?: { id: number; nombre: string };
  lastLoginAt?: string | null;
  lastLoginDevice?: string | null;
  lastLoginIp?: string | null;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  mfaEnabled?: boolean;
  passwordChangedAt?: string | null;
  createdAt?: string;
  fechaCreacion?: string;
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high";
  riskFactors?: string[];
  activeSessions?: number;
}

interface ApiRole { id: number; nombre: string; orgRoleKey?: string }
interface OrgRoleTemplate {
  orgRoleKey: string;
  nombre: string;
  label: string;
  description?: string;
  flags?: Record<string, boolean>;
}
interface ApiDept { id: number; nombre: string }

interface IamInsights {
  generatedAt: string;
  kpis: {
    total: number;
    active: number;
    inactive: number;
    neverLoggedIn: number;
    activeLast7d: number;
    activeLast30d: number;
    stale30d: number;
    locked: number;
    highRisk: number;
    createdLast7d: number;
    createdLast30d: number;
    mfaEnabled: number;
    mfaCoveragePct: number;
    activeSessions: number;
    retentionProxy30d: number;
  };
  distributions: {
    byDepartment: Array<{ name: string; count: number }>;
    byRole: Array<{ name: string; count: number }>;
    byDevice: Array<{ name: string; count: number }>;
  };
  trends: {
    loginsSuccess14d: Array<{ date: string; count: number }>;
    loginsFailed14d: Array<{ date: string; count: number }>;
    peakHours: Array<{ hour: number; count: number }>;
  };
  riskTop: Array<{
    id: number;
    nombre: string;
    email: string;
    riskScore: number;
    riskLevel: string;
    riskFactors: string[];
    lastLoginAt?: string | null;
    failedLoginCount?: number;
  }>;
  alerts: Array<{ severity: "danger" | "warning"; message: string }>;
}

interface UserSessionRow {
  id: number;
  device?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revokeReason?: string | null;
}

interface AuthActivityRow {
  id: number;
  action: string;
  changes?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

type ModalMode = "create" | "edit" | "password" | "role" | null;
type DrawerTab = "sessions" | "activity";

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

const emptyForm = {
  nombre: "",
  email: "",
  password: "",
  roleId: "",
  departmentId: "",
  managerId: "",
  employeeNumber: "",
  autoEmployeeNumber: true,
  autoPassword: true,
};

function generateTempPassword() {
  const chunk = Math.random().toString(36).slice(2, 8);
  return `Nexara-${chunk}!`;
}

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

function formatWhen(iso?: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function MiniBars({
  points,
  color = "var(--primary)",
}: {
  points: Array<{ label: string; count: number }>;
  color?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 72 }}>
      {points.map((p) => (
        <div key={p.label} title={`${p.label}: ${p.count}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%",
            height: `${Math.max(4, (p.count / max) * 56)}px`,
            background: color,
            borderRadius: 3,
            opacity: p.count ? 1 : 0.25,
          }} />
          <span style={{ fontSize: 9, color: "var(--text-tertiary)", transform: "rotate(-40deg)", whiteSpace: "nowrap" }}>
            {p.label.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RiskTag({ level, score }: { level?: string; score?: number }) {
  const tone = level === "high" ? "danger" : level === "medium" ? "warning" : "positive";
  return <Tag variant={tone}>{level ?? "low"} · {score ?? 0}</Tag>;
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

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [insights, setInsights] = useState<IamInsights | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [depts, setDepts] = useState<ApiDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode>(null);
  const [target, setTarget] = useState<ApiUser | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [pwForm, setPwForm] = useState({ newPassword: "", confirm: "" });
  const [createdCreds, setCreatedCreds] = useState<{
    nombre: string;
    email: string;
    password: string;
    employeeNumber?: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [roleTemplates, setRoleTemplates] = useState<OrgRoleTemplate[]>([]);
  const [roleForm, setRoleForm] = useState({ nombre: "", templateKey: "" });

  const [userSearch, setUserSearch] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [drawerUser, setDrawerUser] = useState<ApiUser | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("sessions");
  const [sessions, setSessions] = useState<UserSessionRow[]>([]);
  const [activity, setActivity] = useState<AuthActivityRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [integraSchedule, setIntegraSchedule] = useState<{
    employeeNumber?: string | null;
    schedule?: {
      key: string;
      label: string;
      description: string;
      hint: string;
      beginTime: string;
      endTime: string;
      doorScope: string;
      planTemplateNo: string;
      integraEditorPath: string;
    };
    targetIps?: string[];
    note?: string;
  } | null>(null);

  const [myMfa, setMyMfa] = useState<{ mfaEnabled: boolean; mfaEnabledAt?: string | null } | null>(null);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null); setMetaError(null);
    try {
      const [usersResult, rolesResult, deptsResult, insightsResult] = await Promise.allSettled([
        apiFetch("users", token),
        apiFetch("users/roles", token),
        apiFetch("users/departments", token),
        apiFetch("users/iam/insights", token),
      ]);

      if (usersResult.status === "rejected") throw usersResult.reason;
      setUsers(asList<ApiUser>(usersResult.value));

      if (insightsResult.status === "fulfilled") {
        setInsights(insightsResult.value as IamInsights);
      } else {
        setInsights(null);
      }

      const metaProblems: string[] = [];
      if (rolesResult.status === "fulfilled") setRoles(asList<ApiRole>(rolesResult.value));
      else { setRoles([]); metaProblems.push("roles"); }
      if (deptsResult.status === "fulfilled") setDepts(asList<ApiDept>(deptsResult.value));
      else { setDepts([]); metaProblems.push("departamentos"); }
      if (metaProblems.length > 0) {
        setMetaError(`No se pudieron cargar ${metaProblems.join(" ni ")}. Recarga la página o vuelve a iniciar sesión.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    void apiFetch("users/mfa/status", token)
      .then((s) => setMyMfa(s))
      .catch(() => setMyMfa(null));
  }, [token]);

  const startMfaSetup = async () => {
    if (!token) return;
    setMfaBusy(true);
    try {
      const data = await apiFetch("users/mfa/setup", token, { method: "POST", body: "{}" });
      setMfaSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
      setMfaToken("");
      toast.success("Secreto MFA generado — escanea o copia en tu autenticador");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfa = async () => {
    if (!token || mfaToken.length < 6) return;
    setMfaBusy(true);
    try {
      await apiFetch("users/mfa/confirm", token, {
        method: "POST",
        body: JSON.stringify({ token: mfaToken }),
      });
      setMyMfa({ mfaEnabled: true, mfaEnabledAt: new Date().toISOString() });
      setMfaSetup(null);
      setMfaToken("");
      toast.success("MFA activado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfa = async () => {
    if (!token) return;
    setMfaBusy(true);
    try {
      await apiFetch("users/mfa/disable", token, {
        method: "POST",
        body: JSON.stringify({ token: mfaToken || undefined }),
      });
      setMyMfa({ mfaEnabled: false, mfaEnabledAt: null });
      setMfaSetup(null);
      setMfaToken("");
      toast.success("MFA desactivado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setMfaBusy(false);
    }
  };

  const openDrawer = async (u: ApiUser, tab: DrawerTab = "sessions") => {
    setDrawerUser(u);
    setDrawerTab(tab);
    setDrawerLoading(true);
    setIntegraSchedule(null);
    try {
      const [sess, act, sched] = await Promise.all([
        apiFetch(`users/${u.id}/sessions`, token),
        apiFetch(`users/${u.id}/auth-activity`, token),
        apiFetch(`users/${u.id}/integra-access-schedule`, token).catch(() => null),
      ]);
      setSessions(asList<UserSessionRow>(sess));
      setActivity(asList<AuthActivityRow>(act));
      setIntegraSchedule(sched);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar el detalle IAM"));
    } finally {
      setDrawerLoading(false);
    }
  };

  const resolveDefaultManagerId = useCallback(() => {
    const ceo = users.find((u) =>
      u.email?.toLowerCase() === "gerencia@nexara.com.mx" ||
      u.orgRoleKey === "ceo" ||
      u.role?.orgRoleKey === "ceo",
    );
    return ceo ? String(ceo.id) : "";
  }, [users]);

  const openCreate = () => {
    setTarget(null);
    const defaultRole =
      roles.find((r) => /empleado|staff|operador/i.test(r.nombre))?.id ??
      roles.find((r) => r.orgRoleKey && r.orgRoleKey !== "ceo" && r.orgRoleKey !== "super_admin")?.id ??
      roles[0]?.id;
    setForm({
      ...emptyForm,
      managerId: resolveDefaultManagerId(),
      roleId: defaultRole != null ? String(defaultRole) : "",
      departmentId: depts[0] ? String(depts[0].id) : "",
      password: generateTempPassword(),
      autoPassword: true,
      autoEmployeeNumber: true,
      employeeNumber: "",
    });
    setCreatedCreds(null);
    setSaveErr(null);
    setModal("create");
  };
  const openEdit = (u: ApiUser) => {
    setTarget(u);
    setForm({
      nombre: u.nombre,
      email: u.email,
      password: "",
      roleId: userRoleId(u),
      departmentId: userDepartmentId(u),
      managerId: userManagerId(u),
      employeeNumber: u.employeeNumber || "",
      autoEmployeeNumber: !u.employeeNumber,
      autoPassword: false,
    });
    setSaveErr(null); setModal("edit");
  };
  const openPassword = (u: ApiUser) => {
    setTarget(u); setPwForm({ newPassword: "", confirm: "" }); setSaveErr(null); setModal("password");
  };
  const openRoleCreate = async () => {
    setSaveErr(null);
    setRoleForm({ nombre: "", templateKey: "" });
    setModal("role");
    if (!token || roleTemplates.length) return;
    try {
      const data = await apiFetch("roles/org-templates", token);
      setRoleTemplates(asList<OrgRoleTemplate>(data));
    } catch {
      setRoleTemplates([]);
    }
  };
  const closeModal = () => { setModal(null); setTarget(null); setSaveErr(null); };

  const saveUser = async () => {
    setSaving(true); setSaveErr(null);
    try {
      if (modal === "create") {
        const password = form.autoPassword ? (form.password || generateTempPassword()) : form.password;
        if (!form.nombre.trim() || !form.email.trim() || !password || !form.roleId) {
          setSaveErr("Nombre, correo, contraseña y rol son obligatorios.");
          setSaving(false);
          return;
        }
        if (!form.departmentId) {
          setSaveErr("No hay departamento disponible. Crea uno antes de dar de alta.");
          setSaving(false);
          return;
        }
        if (!form.autoEmployeeNumber && !form.employeeNumber.trim()) {
          setSaveErr("Indica el nº de empleado o deja el automático.");
          setSaving(false);
          return;
        }
        const body: Record<string, unknown> = {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          password,
          roleId: Number(form.roleId),
          departmentId: Number(form.departmentId),
          ...(form.managerId ? { managerId: Number(form.managerId) } : {}),
          ...(!form.autoEmployeeNumber && form.employeeNumber.trim()
            ? { employeeNumber: form.employeeNumber.trim() }
            : {}),
        };
        const created = (await apiFetch("users", token, {
          method: "POST",
          body: JSON.stringify(body),
        })) as ApiUser;
        setCreatedCreds({
          nombre: created?.nombre || form.nombre.trim(),
          email: created?.email || form.email.trim(),
          password,
          employeeNumber: created?.employeeNumber ?? null,
        });
        setModal(null);
        setTarget(null);
        toast.success("Usuario creado — guarda la contraseña temporal");
        void load();
        return;
      } else if (modal === "edit" && target) {
        const body: Record<string, unknown> = {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          roleId: Number(form.roleId),
          departmentId: Number(form.departmentId),
          managerId: form.managerId ? Number(form.managerId) : null,
          employeeNumber: form.autoEmployeeNumber ? undefined : (form.employeeNumber.trim() || null),
        };
        if (!form.autoEmployeeNumber && form.employeeNumber.trim()) {
          body.employeeNumber = form.employeeNumber.trim();
        }
        await apiFetch(`users/${target.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Usuario actualizado");
      }
      closeModal(); void load();
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el usuario"));
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
      toast.success("Contraseña actualizada");
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error");
    } finally { setSaving(false); }
  };

  const saveRole = async () => {
    if (!roleForm.nombre.trim()) { setSaveErr("Nombre del rol requerido."); return; }
    setSaving(true); setSaveErr(null);
    try {
      const template = roleTemplates.find((t) => t.orgRoleKey === roleForm.templateKey);
      const body: Record<string, unknown> = {
        nombre: roleForm.nombre.trim(),
        ...(template?.flags ?? {}),
        ...(template?.orgRoleKey ? { orgRoleKey: template.orgRoleKey } : {}),
      };
      const created = await apiFetch("roles", token, { method: "POST", body: JSON.stringify(body) });
      setRoles((prev) => [...prev, created as ApiRole]);
      closeModal();
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al crear rol");
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: ApiUser) => {
    setConfirmState({
      message: `¿${u.isActive ? "Desactivar" : "Activar"} a ${u.nombre}?`,
      confirmLabel: u.isActive ? "Desactivar" : "Activar",
      fn: async () => {
        try {
          await apiFetch(`users/${u.id}/hr`, token, { method: "PATCH", body: JSON.stringify({ isActive: !u.isActive }) });
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo cambiar el estado"));
        }
      },
    });
  };

  const deleteUser = async (u: ApiUser) => {
    setConfirmState({
      message: `Eliminar permanentemente a "${u.nombre}" (${u.email}). Esta acción no se puede deshacer.`,
      fn: async () => {
        try {
          await apiFetch(`users/${u.id}`, token, { method: "DELETE" });
          void load();
        } catch (e) {
          toast.error(`Error al eliminar: ${e instanceof Error ? e.message : "desconocido"}`);
        }
      },
    });
  };

  const forceLogout = (u: ApiUser) => {
    setConfirmState({
      message: `¿Cerrar todas las sesiones activas de ${u.nombre}?`,
      confirmLabel: "Force logout",
      fn: async () => {
        try {
          const res = await apiFetch(`users/${u.id}/sessions/revoke-all`, token, { method: "POST", body: "{}" });
          toast.success(`${res?.revoked ?? 0} sesión(es) revocada(s)`);
          if (drawerUser?.id === u.id) void openDrawer(u, "sessions");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo forzar logout"));
        }
      },
    });
  };

  const eraseSubject = (u: ApiUser) => {
    setConfirmState({
      message: `GDPR/LFPDPPP: anonimizar PII de "${u.nombre}" (${u.email}). Se desactiva la cuenta; el histórico fiscal/operativo se conserva.`,
      confirmLabel: "Anonimizar PII",
      fn: async () => {
        try {
          await apiFetch(`audit/privacy/erase/${u.id}`, token, { method: "POST", body: "{}" });
          toast.success("Sujeto anonimizado");
          setDrawerUser(null);
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo anonimizar"));
        }
      },
    });
  };

  const unlockUser = async (u: ApiUser) => {
    try {
      await apiFetch(`users/${u.id}/unlock`, token, { method: "POST", body: "{}" });
      toast.success("Cuenta desbloqueada");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo desbloquear"));
    }
  };

  const revokeOneSession = async (sessionId: number) => {
    try {
      await apiFetch(`users/sessions/${sessionId}/revoke`, token, { method: "POST", body: "{}" });
      toast.success("Sesión revocada");
      if (drawerUser) void openDrawer(drawerUser, "sessions");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo revocar"));
    }
  };

  const bulkSetActive = (isActive: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    setConfirmState({
      message: `¿${isActive ? "Activar" : "Desactivar"} ${ids.length} usuario(s)?`,
      confirmLabel: isActive ? "Activar" : "Desactivar",
      fn: async () => {
        try {
          const res = await apiFetch("users/bulk/active", token, {
            method: "POST",
            body: JSON.stringify({ ids, isActive }),
          });
          toast.success(`${res?.updated ?? 0} actualizado(s)`);
          setSelected(new Set());
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "Acción masiva fallida"));
        }
      },
    });
  };

  const visibleUsers = useMemo(() => {
    let list = users;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) list = [...list].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    if (filterActive === "active") list = list.filter((u) => u.isActive);
    else if (filterActive === "inactive") list = list.filter((u) => !u.isActive);
    else if (filterActive === "never") list = list.filter((u) => u.isActive && !u.lastLoginAt);
    else if (filterActive === "locked") list = list.filter((u) => u.lockedUntil && new Date(u.lockedUntil) > new Date());
    else if (filterActive === "stale") {
      const d30 = Date.now() - 30 * 86_400_000;
      list = list.filter((u) => u.isActive && u.lastLoginAt && new Date(u.lastLoginAt).getTime() < d30);
    }
    if (filterRisk === "high" || filterRisk === "medium" || filterRisk === "low") {
      list = list.filter((u) => u.riskLevel === filterRisk);
    }
    const q = userSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role?.nombre ?? "").toLowerCase().includes(q) ||
        (u.department?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, highlightId, userSearch, filterActive, filterRisk]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === visibleUsers.length) setSelected(new Set());
    else setSelected(new Set(visibleUsers.map((u) => u.id)));
  };

  const columns: Column<ApiUser>[] = [
    ...(cfg.canAssign ? [{
      key: "select" as const,
      label: (
        <input type="checkbox" checked={selected.size > 0 && selected.size === visibleUsers.length} onChange={toggleSelectAll} aria-label="Seleccionar todos" />
      ) as unknown as string,
      width: 40,
      render: (u: ApiUser) => (
        <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} aria-label={`Seleccionar ${u.nombre}`} />
      ),
    }] : []),
    {
      key: "nombre", label: "Usuario",
      render: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            background: "var(--primary)", color: "#fff", display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
          }}>
            {u.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <button
              type="button"
              onClick={() => void openDrawer(u)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 13, color: "var(--primary)" }}
            >
              {u.nombre}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: "role", label: "Rol", render: (u) => <Tag variant="accent">{u.role?.nombre ?? "—"}</Tag>, width: 140 },
    {
      key: "employeeNumber",
      label: "Nº empleado",
      width: 120,
      render: (u) => (
        <code style={{ fontSize: 11 }}>{u.employeeNumber || "—"}</code>
      ),
    },
    { key: "department", label: "Área", accessor: (u) => u.department?.nombre ?? "—", width: 120 },
    {
      key: "risk", label: "Riesgo", width: 110,
      render: (u) => <RiskTag level={u.riskLevel} score={u.riskScore} />,
    },
    {
      key: "isActive", label: "Estado", width: 100,
      render: (u) => {
        const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
        if (locked) return <Tag variant="danger">Bloqueado</Tag>;
        return <Tag variant={u.isActive ? "positive" : "danger"}>{u.isActive ? "Activo" : "Inactivo"}</Tag>;
      },
    },
    {
      key: "sessions", label: "Sesiones", width: 80,
      accessor: (u) => String(u.activeSessions ?? 0),
    },
    {
      key: "lastLoginAt", label: "Último acceso", width: 140,
      render: (u) => (
        <div>
          <div style={{ fontSize: 12 }}>{formatWhen(u.lastLoginAt)}</div>
          {u.lastLoginDevice && (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{u.lastLoginDevice}</div>
          )}
        </div>
      ),
    },
    ...(cfg.canAssign ? [{
      key: "id" as const, label: "Acciones" as const, width: 220,
      render: (u: ApiUser) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button type="button" onClick={() => openEdit(u)} style={btnSm}>Editar</button>
          <button type="button" onClick={() => openPassword(u)} style={btnSm}>Pass</button>
          <button type="button" onClick={() => void openDrawer(u, "sessions")} style={btnSm}>IAM</button>
          <button type="button" onClick={() => forceLogout(u)} style={btnSm}>Logout</button>
          {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
            <button type="button" onClick={() => void unlockUser(u)} style={{ ...btnSm, color: "var(--success)" }}>Unlock</button>
          )}
          {cfg.canApprove && (
            <button type="button" onClick={() => void toggleActive(u)} style={{ ...btnSm, color: u.isActive ? "var(--danger)" : "var(--success)" }}>
              {u.isActive ? "Off" : "On"}
            </button>
          )}
          {(currentUser?.isSuperAdmin || (currentUser?.nivelAutoridad ?? 0) >= 5) && (
            <button type="button" onClick={() => void deleteUser(u)} style={{ ...btnSm, color: "var(--danger)", borderColor: "var(--danger)" }}>Del</button>
          )}
        </div>
      ),
    }] : []),
  ];

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  };
  const box: React.CSSProperties = {
    background: "var(--surface)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520,
    boxShadow: "0 24px 64px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto",
  };

  const k = insights?.kpis;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Seguridad / IAM"
        title="Identidad y acceso"
        subtitle="Usuarios, roles, riesgo, sesiones activas, auditoría de login y acciones masivas."
        actions={cfg.canAssign ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => void openRoleCreate()}>Nuevo rol</Button>
            <Button variant="ghost" onClick={() => { window.location.href = "/integra/people"; }}>
              Personas ACS
            </Button>
            <Button variant="primary" onClick={openCreate}>+ Alta rápida</Button>
          </div>
        ) : undefined}
      />

      {k && (
        <div style={{ marginBottom: 16 }}>
          <StatStrip
            stats={[
              { label: "Total", value: k.total, sub: `+${k.createdLast30d} / 30d`, big: true },
              { label: "Activos", value: k.active, tone: "positive", sub: `${k.activeLast7d} DAU proxy 7d` },
              { label: "Retención 30d", value: `${k.retentionProxy30d}%`, tone: k.retentionProxy30d >= 70 ? "positive" : "warning" },
              { label: "Sesiones live", value: k.activeSessions, tone: "accent" },
              { label: "Riesgo alto", value: k.highRisk, tone: k.highRisk ? "danger" : "default" },
              { label: "MFA", value: `${k.mfaCoveragePct}%`, sub: `${k.mfaEnabled} habilitados`, tone: k.mfaCoveragePct < 20 ? "warning" : "positive" },
            ]}
          />
        </div>
      )}

      {insights?.alerts && insights.alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {insights.alerts.map((a) => (
            <div
              key={a.message}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                background: a.severity === "danger" ? "var(--state-danger-bg)" : "var(--state-warning-bg)",
                border: `1px solid ${a.severity === "danger" ? "var(--state-danger-border)" : "var(--state-warning-border)"}`,
                color: a.severity === "danger" ? "var(--state-danger-text)" : "var(--state-warning-text)",
              }}
            >
              {a.message}
            </div>
          ))}
        </div>
      )}

      {token && (
        <Section title="Mi seguridad · MFA TOTP">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                Estado:{" "}
                <Tag variant={myMfa?.mfaEnabled ? "positive" : "warning"}>
                  {myMfa?.mfaEnabled ? "MFA activo" : "MFA off"}
                </Tag>
              </div>
              {mfaSetup && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  Secreto: <code>{mfaSetup.secret}</code>
                  <div style={{ marginTop: 4 }}>URI: {mfaSetup.otpauthUrl}</div>
                </div>
              )}
            </div>
            {(mfaSetup || myMfa?.mfaEnabled) && (
              <div style={{ minWidth: 140 }}>
                <Lbl text="Código 6 dígitos" />
                <input
                  style={inp}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!myMfa?.mfaEnabled && !mfaSetup && (
                <Button variant="primary" disabled={mfaBusy} onClick={() => void startMfaSetup()}>
                  Activar MFA
                </Button>
              )}
              {mfaSetup && (
                <Button variant="primary" disabled={mfaBusy || mfaToken.length < 6} onClick={() => void confirmMfa()}>
                  Confirmar
                </Button>
              )}
              {myMfa?.mfaEnabled && (
                <Button variant="ghost" disabled={mfaBusy} onClick={() => void disableMfa()}>
                  Desactivar MFA
                </Button>
              )}
            </div>
          </div>
        </Section>
      )}

      {insights && (
        <DashGrid>
          <DashCol span={4}>
            <DashPanel title="Logins exitosos · 14d" subtitle="Fuente: AuditLog LOGIN_SUCCESS">
              <MiniBars
                points={insights.trends.loginsSuccess14d.map((p) => ({ label: p.date, count: p.count }))}
              />
            </DashPanel>
          </DashCol>
          <DashCol span={4}>
            <DashPanel title="Logins fallidos · 14d" subtitle="Detección de fuerza bruta">
              <MiniBars
                points={insights.trends.loginsFailed14d.map((p) => ({ label: p.date, count: p.count }))}
                color="var(--danger)"
              />
            </DashPanel>
          </DashCol>
          <DashCol span={4}>
            <DashPanel title="Top riesgo" subtitle="Priorizar revisión de acceso">
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 160, overflowY: "auto" }}>
                {insights.riskTop.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      const u = users.find((x) => x.id === r.id);
                      if (u) void openDrawer(u);
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                      background: "none", border: "none", padding: "4px 0", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" }}>{r.nombre}</span>
                    <RiskTag level={r.riskLevel} score={r.riskScore} />
                  </button>
                ))}
                {!insights.riskTop.length && (
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin señales de riesgo altas</span>
                )}
              </div>
            </DashPanel>
          </DashCol>
          <DashCol span={6}>
            <DashPanel title="Distribución por área" subtitle={`${insights.distributions.byDepartment.length} departamentos`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {insights.distributions.byDepartment.slice(0, 6).map((d) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "140px 1fr 32px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.name}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${(d.count / Math.max(1, insights.kpis.total)) * 100}%`,
                        background: "var(--primary)", borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </DashPanel>
          </DashCol>
          <DashCol span={6}>
            <DashPanel title="Dispositivos de acceso" subtitle="Último dispositivo conocido">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {insights.distributions.byDevice.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin datos de dispositivo aún</span>
                )}
                {insights.distributions.byDevice.map((d) => (
                  <DashPill key={d.name} tone="accent">{d.name}: {d.count}</DashPill>
                ))}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <DashPill tone={insights.kpis.neverLoggedIn ? "warning" : "positive"}>
                  Nunca login: {insights.kpis.neverLoggedIn}
                </DashPill>
                <DashPill tone={insights.kpis.stale30d ? "warning" : "neutral"}>
                  Stale 30d: {insights.kpis.stale30d}
                </DashPill>
                <DashPill tone={insights.kpis.locked ? "danger" : "neutral"}>
                  Bloqueados: {insights.kpis.locked}
                </DashPill>
              </div>
            </DashPanel>
          </DashCol>
        </DashGrid>
      )}

      {metaError && (
        <div style={{ padding: "10px 14px", background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 10, margin: "16px 0", fontSize: 13, color: "var(--state-warning-text)" }}>
          {metaError}
        </div>
      )}
      {error && (
        <div style={{ padding: "10px 14px", background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 10, margin: "16px 0", fontSize: 13, color: "var(--state-warning-text)" }}>
          {error}
        </div>
      )}

      {selected.size > 0 && cfg.canAssign && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 8,
          padding: "10px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)",
        }}>
          <strong style={{ fontSize: 13 }}>{selected.size} seleccionados</strong>
          <Button variant="secondary" size="sm" onClick={() => bulkSetActive(true)}>Activar</Button>
          <Button variant="secondary" size="sm" onClick={() => bulkSetActive(false)}>Desactivar</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpiar</Button>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <FilterToolbar
          search={{ value: userSearch, onChange: setUserSearch, placeholder: "Buscar por nombre, email, rol o área…" }}
          selects={[
            {
              label: "Estado",
              value: filterActive,
              onChange: setFilterActive,
              options: [
                { value: "active", label: "Activos" },
                { value: "inactive", label: "Inactivos" },
                { value: "never", label: "Nunca login" },
                { value: "stale", label: "Stale 30d" },
                { value: "locked", label: "Bloqueados" },
              ],
              allowAll: true,
            },
            {
              label: "Riesgo",
              value: filterRisk,
              onChange: setFilterRisk,
              options: [
                { value: "high", label: "Alto" },
                { value: "medium", label: "Medio" },
                { value: "low", label: "Bajo" },
              ],
              allowAll: true,
            },
          ]}
          onClear={() => { setUserSearch(""); setFilterActive(""); setFilterRisk(""); }}
          resultCount={loading ? null : visibleUsers.length}
          rightActions={users.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportToExcel(visibleUsers, [
                { key: "nombre", label: "Nombre" },
                { key: "email", label: "Email" },
                { key: "role", label: "Rol", format: (v) => (v as ApiUser["role"])?.nombre ?? "—" },
                { key: "department", label: "Área", format: (v) => (v as ApiUser["department"])?.nombre ?? "—" },
                { key: "isActive", label: "Estado", format: (v) => (v ? "Activo" : "Inactivo") },
                { key: "riskScore", label: "Riesgo" },
                { key: "riskLevel", label: "Nivel riesgo" },
                { key: "activeSessions", label: "Sesiones" },
                { key: "lastLoginAt", label: "Último acceso", format: (v) => (v ? new Date(String(v)).toLocaleDateString("es-MX") : "Nunca") },
                { key: "lastLoginDevice", label: "Dispositivo" },
                { key: "mfaEnabled", label: "MFA", format: (v) => (v ? "Sí" : "No") },
              ], "usuarios-iam")}
            >
              Excel
            </Button>
          ) : undefined}
        />
      </div>

      <Section title={loading ? "Cargando…" : `${visibleUsers.length} identidades`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Destacando usuario <strong>#{highlightId}</strong>.
          </p>
        )}
        {loading
          ? <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          : <DataTable columns={columns} rows={visibleUsers} rowKey={(u) => u.id} emptyTitle="Sin usuarios" emptyDescription="Crea el primer usuario" />
        }
      </Section>

      {/* Qué alcanza cada rol: lo que el sistema aplica de verdad, no las casillas. */}
      <Section>
        <RoleAccessMatrix token={token} />
      </Section>

      {/* Drawer IAM */}
      {drawerUser && (
        <div style={{ ...overlay, justifyContent: "flex-end", padding: 0 }} onClick={(e) => { if (e.target === e.currentTarget) setDrawerUser(null); }}>
          <aside style={{
            width: "min(440px, 100%)", height: "100%", background: "var(--surface)",
            borderLeft: "1px solid var(--border)", padding: 24, overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontFamily: "var(--nx-font-display)" }}>{drawerUser.nombre}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{drawerUser.email}</p>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <RiskTag level={drawerUser.riskLevel} score={drawerUser.riskScore} />
                  <Tag variant={drawerUser.mfaEnabled ? "positive" : "warning"}>
                    MFA {drawerUser.mfaEnabled ? "on" : "off"}
                  </Tag>
                  <Link href={`/erp/hr/${drawerUser.id}`} style={{ fontSize: 12, color: "var(--primary)" }}>Expediente HR →</Link>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDrawerUser(null)}>Cerrar</Button>
            </div>

            {integraSchedule?.schedule && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  HORARIO DE ACCESO INTEGRA
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                  {integraSchedule.schedule.label}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  {integraSchedule.schedule.hint}
                </p>
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  Nº empleado ACS: <code>{integraSchedule.employeeNumber || "—"}</code>
                  {integraSchedule.targetIps && integraSchedule.targetIps.length > 0
                    ? ` · terminales ${integraSchedule.targetIps.join(", ")}`
                    : ""}
                </p>
                <Link
                  href={integraSchedule.schedule.integraEditorPath || "/integra/people"}
                  style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "var(--primary)" }}
                >
                  Abrir Personas Integra (editor semanal) →
                </Link>
              </div>
            )}

            {drawerUser.riskFactors && drawerUser.riskFactors.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 6 }}>FACTORES DE RIESGO</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  {drawerUser.riskFactors.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Button variant={drawerTab === "sessions" ? "primary" : "ghost"} size="sm" onClick={() => setDrawerTab("sessions")}>Sesiones</Button>
              <Button variant={drawerTab === "activity" ? "primary" : "ghost"} size="sm" onClick={() => setDrawerTab("activity")}>Actividad</Button>
              {cfg.canAssign && (
                <Button variant="secondary" size="sm" onClick={() => forceLogout(drawerUser)}>Force logout</Button>
              )}
              {cfg.canAssign && !drawerUser.email?.includes("@privacy.nexara.local") && (
                <Button variant="danger" size="sm" onClick={() => eraseSubject(drawerUser)}>Borrar PII</Button>
              )}
            </div>

            {drawerLoading ? (
              <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Cargando…</div>
            ) : drawerTab === "sessions" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sessions.length === 0 && <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin sesiones registradas</span>}
                {sessions.map((s) => {
                  const active = !s.revokedAt && new Date(s.expiresAt) > new Date();
                  return (
                    <div key={s.id} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ fontSize: 13 }}>{s.device || "Dispositivo"}</strong>
                        <Tag variant={active ? "positive" : "danger"}>{active ? "Activa" : "Revocada/expirada"}</Tag>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                        IP {s.ipAddress || "—"} · visto {formatWhen(s.lastSeenAt)}
                      </div>
                      {active && cfg.canAssign && (
                        <button type="button" onClick={() => void revokeOneSession(s.id)} style={{ ...btnSm, marginTop: 8, color: "var(--danger)" }}>
                          Revocar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activity.length === 0 && <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin eventos de auth</span>}
                {activity.map((a) => (
                  <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.action}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {formatWhen(a.createdAt)} · {a.ipAddress || "sin IP"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {(modal === "create" || modal === "edit") && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={box}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontFamily: "var(--nx-font-display)", fontWeight: 700 }}>
              {modal === "create" ? "Alta rápida de usuario" : `Editar · ${target?.nombre}`}
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {modal === "create"
                ? "Nombre, correo y rol. El nº de empleado se genera solo (mismo código que usará ACS / Integra Personas)."
                : "Actualiza identidad, rol y nº de empleado (enlace canónico con terminales ACS)."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <Lbl text="Nombre completo *" />
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  style={inp}
                  placeholder="Ej. Ariadna Sierra"
                  autoFocus={modal === "create"}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Lbl text="Correo *" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={inp}
                  placeholder="nombre@empresa.com"
                />
              </div>
              {modal === "create" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={form.autoPassword}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setForm((f) => ({
                          ...f,
                          autoPassword: on,
                          password: on ? generateTempPassword() : "",
                        }));
                      }}
                    />
                    Contraseña temporal automática
                  </label>
                  {!form.autoPassword && (
                    <>
                      <Lbl text="Contraseña inicial *" />
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        style={inp}
                      />
                    </>
                  )}
                  {form.autoPassword && (
                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      Se mostrará una sola vez al crear. Mínimo 6 caracteres.
                    </p>
                  )}
                </div>
              )}
              <div>
                <Lbl text="Rol ERP *" />
                <select
                  value={form.roleId}
                  onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                  style={inp}
                  disabled={roles.length === 0}
                >
                  <option value="">— Seleccionar —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={String(r.id)}>{r.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <Lbl text="Departamento *" />
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                  style={inp}
                  disabled={depts.length === 0}
                >
                  <option value="">— Seleccionar —</option>
                  {depts.map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={form.autoEmployeeNumber}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        autoEmployeeNumber: e.target.checked,
                        employeeNumber: e.target.checked ? "" : f.employeeNumber,
                      }))
                    }
                  />
                  Nº empleado automático (NXR25SYS…)
                </label>
                {!form.autoEmployeeNumber && (
                  <>
                    <Lbl text="Nº empleado (código ACS)" />
                    <input
                      value={form.employeeNumber}
                      onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))}
                      style={inp}
                      placeholder="Mismo código en terminales"
                    />
                  </>
                )}
                {form.autoEmployeeNumber && (
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    El backend asigna el siguiente libre del tenant. Ese código es el enlace con Integra / ACS.
                  </p>
                )}
              </div>
              {modal === "edit" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <Lbl text="Reporta a (manager)" />
                  <select
                    value={form.managerId}
                    onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
                    style={inp}
                  >
                    <option value="">— Sin manager —</option>
                    {users.filter((u) => u.id !== target?.id && u.isActive).map((u) => (
                      <option key={u.id} value={String(u.id)}>{u.nombre} · {u.role?.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {saveErr && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg)", borderRadius: 8, fontSize: 12.5, color: "var(--state-danger-text)" }}>
                {saveErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveUser()} disabled={saving || roles.length === 0 || depts.length === 0}>
                {saving ? "Guardando…" : modal === "create" ? "Crear usuario" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {createdCreds && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setCreatedCreds(null); }}>
          <div style={{ ...box, maxWidth: 440 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 17, fontFamily: "var(--nx-font-display)", fontWeight: 700 }}>
              Usuario listo
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-secondary)" }}>
              Guarda la contraseña temporal ahora. Luego puedes enrolar Face ID en Integra → Personas con el mismo nº.
            </p>
            <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 13 }}>
              <div>
                <dt style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Nombre</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{createdCreds.nombre}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Correo</dt>
                <dd style={{ margin: 0 }}>{createdCreds.email}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Nº empleado / ACS</dt>
                <dd style={{ margin: 0 }}>
                  <code>{createdCreds.employeeNumber || "auto (revisa el listado)"}</code>
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Contraseña temporal</dt>
                <dd style={{ margin: 0 }}>
                  <code style={{ userSelect: "all" }}>{createdCreds.password}</code>
                </dd>
              </div>
            </dl>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" }}>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `${createdCreds.email}\n${createdCreds.password}\n${createdCreds.employeeNumber || ""}`,
                  );
                  toast.success("Copiado al portapapeles");
                }}
              >
                Copiar
              </Button>
              <Button variant="secondary" onClick={() => { window.location.href = "/integra/people"; }}>
                Ir a Personas
              </Button>
              <Button variant="primary" onClick={() => setCreatedCreds(null)}>Listo</Button>
            </div>
          </div>
        </div>
      )}

      {modal === "role" && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={box}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontFamily: "var(--nx-font-display)", fontWeight: 700 }}>Nuevo rol</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Lbl text="Nombre del rol *" />
                <input value={roleForm.nombre} onChange={(e) => setRoleForm((f) => ({ ...f, nombre: e.target.value }))} style={inp} />
              </div>
              <div>
                <Lbl text="Plantilla base (opcional)" />
                <select value={roleForm.templateKey} onChange={(e) => setRoleForm((f) => ({ ...f, templateKey: e.target.value }))} style={inp}>
                  <option value="">— Sin plantilla —</option>
                  {roleTemplates.map((t) => (
                    <option key={t.orgRoleKey} value={t.orgRoleKey}>{t.label || t.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            {saveErr && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg)", borderRadius: 8, fontSize: 12.5, color: "var(--state-danger-text)" }}>{saveErr}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveRole()} disabled={saving}>{saving ? "Guardando…" : "Crear rol"}</Button>
            </div>
          </div>
        </div>
      )}

      {modal === "password" && target && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ ...box, maxWidth: 400 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 17, fontFamily: "var(--nx-font-display)", fontWeight: 700 }}>Cambiar contraseña</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)" }}>{target.nombre} · {target.email}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Lbl text="Nueva contraseña *" />
                <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} style={inp} />
              </div>
              <div>
                <Lbl text="Confirmar contraseña *" />
                <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} style={inp} />
              </div>
            </div>
            {saveErr && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg)", borderRadius: 8, fontSize: 12.5, color: "var(--state-danger-text)" }}>{saveErr}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" onClick={() => void savePassword()} disabled={saving}>{saving ? "Guardando…" : "Cambiar contraseña"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

const btnSm: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11.5,
  padding: "3px 8px",
  color: "var(--text-secondary)",
};

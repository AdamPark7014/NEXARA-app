"use client";

/**
 * ERP · Usuarios y roles
 * ======================
 * Gestión de identidades: indicadores, riesgo, sesiones,
 * actividad de acceso, acciones masivas y alta/edición de cuentas.
 */

import { useEffect, useState, useCallback, useDeferredValue, useMemo, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { Avatar } from "@/components/base";
import { useUser } from "@/components/UserContext";
import AccesoCuentasEnlace from "@/components/team/AccesoCuentasEnlace";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { getOrgRoleLabel } from "@/lib/org-roles";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { DashGrid, DashCol, DashPanel, StatStrip, DashPill } from "@/components/dashboard/DashKit";
import { defaultModesFromWebModuleIds, normalizeModuleAccess, type ModuleAccessMap } from "@/lib/access-tree";

const UserAccessTree = dynamic(() => import("@/components/UserAccessTree"), {
  ssr: false,
  loading: () => <SkeletonList rows={3} />,
});
const RoleAccessMatrix = dynamic(() => import("@/components/RoleAccessMatrix"), {
  ssr: false,
  loading: () => <SkeletonList rows={4} tableLike />,
});

/* ─── tipos ─────────────────────────────────────────────────────────── */
interface ApiUser {
  moduleAccess?: Record<string, string> | null;
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

/** Sin fontSize: FormField fija 16 px (evita el zoom de iOS). */
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)",
  boxSizing: "border-box", minHeight: 40,
};

const checkRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, minHeight: 40, fontSize: 13.5, cursor: "pointer",
};

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
  moduleAccess: null as ModuleAccessMap | null,
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

function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Nombre visible del rol: nunca la clave interna (p. ej. `ing_soporte`). */
function friendlyRole(nombre?: string | null, orgRoleKey?: string | null): string {
  const raw = (nombre ?? "").trim();
  if (raw && !/^[a-z0-9_]+$/.test(raw)) return raw;
  const label = getOrgRoleLabel(raw || null, orgRoleKey ?? null);
  if (label) return label;
  if (raw) return humanizeKey(raw);
  return orgRoleKey ? humanizeKey(orgRoleKey) : "Sin rol";
}

function userRoleLabel(u: ApiUser): string {
  if (!u.role && !u.orgRoleKey) return "Sin rol";
  return friendlyRole(u.role?.nombre, u.role?.orgRoleKey ?? u.orgRoleKey);
}

function isLocked(u: ApiUser): boolean {
  return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
}

const AUTH_ACTION_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: "Inicio de sesión",
  LOGIN_FAILED: "Intento fallido de inicio de sesión",
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  PASSWORD_RESET: "Contraseña restablecida",
  PASSWORD_CHANGE: "Contraseña cambiada",
  MFA_ENABLED: "Verificación en dos pasos activada",
  MFA_DISABLED: "Verificación en dos pasos desactivada",
  SESSION_REVOKED: "Sesión cerrada por un administrador",
  ACCOUNT_LOCKED: "Cuenta bloqueada",
  ACCOUNT_UNLOCKED: "Cuenta desbloqueada",
};

function authActionLabel(action: string): string {
  return AUTH_ACTION_LABEL[action.toUpperCase()] ?? humanizeKey(action.toLowerCase());
}

const RISK_LABEL: Record<string, string> = { high: "Alto", medium: "Medio", low: "Bajo" };

function MiniBars({
  points,
  color = "var(--primary)",
  label,
}: {
  points: Array<{ label: string; count: number }>;
  color?: string;
  label: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((s, p) => s + p.count, 0);
  return (
    <div role="img" aria-label={`${label}: ${total} en total`} style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 72 }}>
      {points.map((p) => (
        <div key={p.label} title={`${p.label}: ${p.count}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%",
            height: `${Math.max(4, (p.count / max) * 56)}px`,
            background: color,
            borderRadius: 3,
            opacity: p.count ? 1 : 0.25,
          }} />
          <span aria-hidden="true" style={{ fontSize: 9, color: "var(--text-tertiary)", transform: "rotate(-40deg)", whiteSpace: "nowrap" }}>
            {p.label.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RiskTag({ level, score }: { level?: string; score?: number }) {
  const tone = level === "high" ? "danger" : level === "medium" ? "warning" : "positive";
  return (
    <Tag variant={tone} size="sm">
      {RISK_LABEL[level ?? "low"] ?? "Bajo"} · <span style={{ fontVariantNumeric: "tabular-nums" }}>{score ?? 0}</span>
    </Tag>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {children}
    </div>
  );
}

type RowAction = { label: string; onSelect: () => void; tone?: "danger" | "success" };

/** Menú «Más» por fila: evita la hilera de botones crípticos. */
function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Más acciones para ${label}`}
        onClick={() => setOpen((v) => !v)}
        style={iconBtn}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 30, minWidth: 210,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 12px 32px color-mix(in srgb, var(--shadow, #000) 22%, transparent)", padding: 4,
          }}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); a.onSelect(); }}
              style={{
                display: "block", width: "100%", textAlign: "left", minHeight: 40, padding: "8px 12px",
                background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13.5,
                color: a.tone === "danger" ? "var(--danger)" : a.tone === "success" ? "var(--success)" : "var(--text-primary)",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function UsersPage() {
  const { user: currentUser } = useUser();
  const token = currentUser?.token ?? "";
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cfg = useMemo(() => getErpGovernanceSectionConfig(currentUser, "users"), [currentUser]);

  useEffect(() => {
    setHighlightId(new URLSearchParams(window.location.search).get("highlight"));
  }, []);

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [insights, setInsights] = useState<IamInsights | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [depts, setDepts] = useState<ApiDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode>(null);
  const [target, setTarget] = useState<ApiUser | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [roleDefaultModes, setRoleDefaultModes] = useState<ModuleAccessMap>(() => defaultModesFromWebModuleIds([]));
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
  const deferredSearch = useDeferredValue(userSearch);
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
      setLoaded(true);

      if (insightsResult.status === "fulfilled") {
        setInsights(insightsResult.value as IamInsights);
      }

      const metaProblems: string[] = [];
      if (rolesResult.status === "fulfilled") setRoles(asList<ApiRole>(rolesResult.value));
      else metaProblems.push("los roles");
      if (deptsResult.status === "fulfilled") setDepts(asList<ApiDept>(deptsResult.value));
      else metaProblems.push("los departamentos");
      if (metaProblems.length > 0) {
        setMetaError(`No se pudieron cargar ${metaProblems.join(" ni ")}. Sin ellos no es posible dar de alta ni editar cuentas.`);
      }
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los usuarios."));
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

  useEffect(() => {
    if (!drawerUser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerUser(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerUser]);

  const startMfaSetup = async () => {
    if (!token) return;
    setMfaBusy(true);
    try {
      const data = await apiFetch("users/mfa/setup", token, { method: "POST", body: "{}" });
      setMfaSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
      setMfaToken("");
      toast.success("Código generado: agrégalo a tu app de autenticación");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo iniciar la verificación en dos pasos"));
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
      toast.success("Verificación en dos pasos activada");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "El código no es válido"));
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
      toast.success("Verificación en dos pasos desactivada");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo desactivar"));
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
      toast.error(formatApiError(e, "No se pudo cargar el detalle de acceso"));
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

  const loadRoleNavPreview = useCallback(async (roleId: string) => {
    if (!token || !roleId) {
      setRoleDefaultModes(defaultModesFromWebModuleIds([]));
      return;
    }
    try {
      const res = await fetch(buildApiUrl(`roles/${roleId}/nav-preview`), {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRoleDefaultModes(defaultModesFromWebModuleIds(Array.isArray(data.webModuleIds) ? data.webModuleIds : []));
    } catch {
      setRoleDefaultModes(defaultModesFromWebModuleIds([]));
    }
  }, [token]);

  const openCreate = () => {
    setTarget(null);
    const defaultRole =
      roles.find((r) => /empleado|staff|operador/i.test(r.nombre))?.id ??
      roles.find((r) => r.orgRoleKey && r.orgRoleKey !== "ceo" && r.orgRoleKey !== "super_admin")?.id ??
      roles[0]?.id;
    const roleId = defaultRole != null ? String(defaultRole) : "";
    setForm({
      ...emptyForm,
      managerId: resolveDefaultManagerId(),
      roleId,
      departmentId: depts[0] ? String(depts[0].id) : "",
      password: generateTempPassword(),
      autoPassword: true,
      autoEmployeeNumber: true,
      employeeNumber: "",
      moduleAccess: null,
    });
    void loadRoleNavPreview(roleId);
    setCreatedCreds(null);
    setSaveErr(null);
    setModal("create");
  };
  const openEdit = (u: ApiUser) => {
    setTarget(u);
    const roleId = userRoleId(u);
    setForm({
      nombre: u.nombre,
      email: u.email,
      password: "",
      roleId,
      departmentId: userDepartmentId(u),
      managerId: userManagerId(u),
      employeeNumber: u.employeeNumber || "",
      autoEmployeeNumber: !u.employeeNumber,
      autoPassword: false,
      moduleAccess: normalizeModuleAccess(u.moduleAccess),
    });
    void loadRoleNavPreview(roleId);
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
    } catch (e) {
      setRoleTemplates([]);
      setSaveErr(formatApiError(e, "No se pudieron cargar las plantillas de rol"));
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
          setSaveErr("Indica el número de empleado o deja el automático.");
          setSaving(false);
          return;
        }
        const body: Record<string, unknown> = {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          password,
          roleId: Number(form.roleId),
          moduleAccess: form.moduleAccess,
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
        toast.success("Usuario creado: guarda la contraseña temporal");
        void load();
        return;
      } else if (modal === "edit" && target) {
        const body: Record<string, unknown> = {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          roleId: Number(form.roleId),
          moduleAccess: form.moduleAccess,
          departmentId: Number(form.departmentId),
          managerId: form.managerId ? Number(form.managerId) : null,
          employeeNumber: form.autoEmployeeNumber ? undefined : (form.employeeNumber.trim() || null),
        };
        if (!form.autoEmployeeNumber && form.employeeNumber.trim()) {
          body.employeeNumber = form.employeeNumber.trim();
        }
        await apiFetch(`users/${target.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Cambios guardados");
      }
      closeModal(); void load();
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el usuario"));
    } finally { setSaving(false); }
  };

  const savePassword = async () => {
    if (!target) return;
    if (pwForm.newPassword.length < 6) { setSaveErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pwForm.newPassword !== pwForm.confirm) { setSaveErr("Las contraseñas no coinciden."); return; }
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`users/${target.id}`, token, { method: "PATCH", body: JSON.stringify({ password: pwForm.newPassword }) });
      closeModal();
      toast.success("Contraseña actualizada");
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo cambiar la contraseña"));
    } finally { setSaving(false); }
  };

  const saveRole = async () => {
    if (!roleForm.nombre.trim()) { setSaveErr("Escribe el nombre del rol."); return; }
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
      toast.success("Rol creado");
      closeModal();
      void load();
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo crear el rol"));
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: ApiUser) => {
    setConfirmState({
      title: u.isActive ? "Desactivar cuenta" : "Activar cuenta",
      message: u.isActive
        ? `${u.nombre} ya no podrá iniciar sesión hasta que se vuelva a activar.`
        : `${u.nombre} podrá volver a iniciar sesión con sus accesos actuales.`,
      confirmLabel: u.isActive ? "Desactivar" : "Activar",
      danger: u.isActive,
      fn: async () => {
        try {
          await apiFetch(`users/${u.id}/hr`, token, { method: "PATCH", body: JSON.stringify({ isActive: !u.isActive }) });
          toast.success(u.isActive ? "Cuenta desactivada" : "Cuenta activada");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo cambiar el estado"));
        }
      },
    });
  };

  const deleteUser = async (u: ApiUser) => {
    setConfirmState({
      title: "Eliminar usuario",
      message: `Se eliminará permanentemente a ${u.nombre} (${u.email}). Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`users/${u.id}`, token, { method: "DELETE" });
          toast.success("Usuario eliminado");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo eliminar el usuario"));
        }
      },
    });
  };

  const forceLogout = (u: ApiUser) => {
    setConfirmState({
      title: "Cerrar todas las sesiones",
      message: `${u.nombre} tendrá que volver a iniciar sesión en todos sus dispositivos.`,
      confirmLabel: "Cerrar sesiones",
      danger: true,
      fn: async () => {
        try {
          const res = await apiFetch(`users/${u.id}/sessions/revoke-all`, token, { method: "POST", body: "{}" });
          const n = Number(res?.revoked ?? 0);
          toast.success(n === 1 ? "Se cerró 1 sesión" : `Se cerraron ${n} sesiones`);
          if (drawerUser?.id === u.id) void openDrawer(u, "sessions");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudieron cerrar las sesiones"));
        }
      },
    });
  };

  const eraseSubject = (u: ApiUser) => {
    setConfirmState({
      title: "Borrar datos personales",
      message: `Se anonimizarán los datos personales de ${u.nombre} (${u.email}) y la cuenta quedará desactivada. El histórico fiscal y operativo se conserva.`,
      confirmLabel: "Borrar datos personales",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`audit/privacy/erase/${u.id}`, token, { method: "POST", body: "{}" });
          toast.success("Datos personales anonimizados");
          setDrawerUser(null);
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudieron anonimizar los datos"));
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
      toast.success("Sesión cerrada");
      if (drawerUser) void openDrawer(drawerUser, "sessions");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cerrar la sesión"));
    }
  };

  const bulkSetActive = (isActive: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    setConfirmState({
      title: isActive ? "Activar cuentas" : "Desactivar cuentas",
      message: `¿${isActive ? "Activar" : "Desactivar"} ${ids.length === 1 ? "1 cuenta seleccionada" : `${ids.length} cuentas seleccionadas`}?`,
      confirmLabel: isActive ? "Activar" : "Desactivar",
      danger: !isActive,
      fn: async () => {
        try {
          const res = await apiFetch("users/bulk/active", token, {
            method: "POST",
            body: JSON.stringify({ ids, isActive }),
          });
          const n = Number(res?.updated ?? 0);
          toast.success(n === 1 ? "1 cuenta actualizada" : `${n} cuentas actualizadas`);
          setSelected(new Set());
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo aplicar la acción masiva"));
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
    else if (filterActive === "locked") list = list.filter(isLocked);
    else if (filterActive === "stale") {
      const d30 = Date.now() - 30 * 86_400_000;
      list = list.filter((u) => u.isActive && u.lastLoginAt && new Date(u.lastLoginAt).getTime() < d30);
    }
    if (filterRisk === "high" || filterRisk === "medium" || filterRisk === "low") {
      list = list.filter((u) => u.riskLevel === filterRisk);
    }
    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        userRoleLabel(u).toLowerCase().includes(q) ||
        (u.employeeNumber ?? "").toLowerCase().includes(q) ||
        (u.department?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, highlightId, deferredSearch, filterActive, filterRisk]);

  const activeManagers = useMemo(() => users.filter((u) => u.isActive), [users]);

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

  const canDelete = !!currentUser?.isSuperAdmin || (currentUser?.nivelAutoridad ?? 0) >= 5;

  const rowActions = (u: ApiUser): RowAction[] => {
    const list: RowAction[] = [
      { label: "Ver sesiones y actividad", onSelect: () => void openDrawer(u, "sessions") },
      { label: "Cambiar contraseña", onSelect: () => openPassword(u) },
      { label: "Cerrar todas las sesiones", onSelect: () => forceLogout(u) },
    ];
    if (isLocked(u)) list.push({ label: "Desbloquear cuenta", onSelect: () => void unlockUser(u), tone: "success" });
    if (cfg.canApprove) {
      list.push({
        label: u.isActive ? "Desactivar cuenta" : "Activar cuenta",
        onSelect: () => void toggleActive(u),
        tone: u.isActive ? "danger" : "success",
      });
    }
    if (canDelete) list.push({ label: "Eliminar usuario", onSelect: () => void deleteUser(u), tone: "danger" });
    return list;
  };

  const columns: Column<ApiUser>[] = [
    ...(cfg.canAssign ? [{
      key: "select" as const,
      label: (
        <input
          type="checkbox"
          checked={selected.size > 0 && selected.size === visibleUsers.length}
          onChange={toggleSelectAll}
          aria-label="Seleccionar todos"
          style={{ width: 18, height: 18 }}
        />
      ) as unknown as string,
      width: 44,
      render: (u: ApiUser) => (
        <input
          type="checkbox"
          checked={selected.has(u.id)}
          onChange={() => toggleSelect(u.id)}
          aria-label={`Seleccionar a ${u.nombre}`}
          style={{ width: 18, height: 18 }}
        />
      ),
    }] : []),
    {
      key: "nombre", label: "Persona",
      render: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar name={u.nombre} size={34} />
          <div style={{ minWidth: 0 }}>
            <button
              type="button"
              onClick={() => void openDrawer(u)}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 650, fontSize: 13.5,
                color: "var(--text-primary)", textAlign: "left",
              }}
            >
              {u.nombre}
            </button>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
              {u.email}
            </div>
          </div>
        </div>
      ),
    },
    { key: "role", label: "Rol", render: (u) => <Tag variant="accent" size="sm">{userRoleLabel(u)}</Tag>, width: 170 },
    {
      key: "department", label: "Área", width: 140,
      render: (u) => (
        <div>
          <div style={{ fontSize: 13 }}>{u.department?.nombre ?? "—"}</div>
          {u.employeeNumber && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>Nº {u.employeeNumber}</div>
          )}
        </div>
      ),
    },
    {
      key: "isActive", label: "Estado", width: 110,
      render: (u) => {
        if (isLocked(u)) return <Tag variant="danger" size="sm" dot>Bloqueado</Tag>;
        return <Tag variant={u.isActive ? "positive" : "neutral"} size="sm" dot>{u.isActive ? "Activo" : "Inactivo"}</Tag>;
      },
    },
    {
      key: "risk", label: "Riesgo", width: 100,
      render: (u) => <RiskTag level={u.riskLevel} score={u.riskScore} />,
    },
    {
      key: "lastLoginAt", label: "Último acceso", width: 150,
      render: (u) => (
        <div>
          <div style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: u.lastLoginAt ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {formatWhen(u.lastLoginAt)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {u.activeSessions ? `${u.activeSessions} ${u.activeSessions === 1 ? "sesión abierta" : "sesiones abiertas"}` : u.lastLoginDevice ?? ""}
          </div>
        </div>
      ),
    },
    ...(cfg.canAssign ? [{
      key: "id" as const, label: "Acciones" as const, width: 130, align: "right" as const,
      render: (u: ApiUser) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>Editar</Button>
          <RowMenu label={u.nombre} actions={rowActions(u)} />
        </div>
      ),
    }] : []),
  ];

  const k = insights?.kpis;
  const initialLoading = loading && !loaded;
  const clearFilters = () => { setUserSearch(""); setFilterActive(""); setFilterRisk(""); };

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Seguridad"
        title="Usuarios y roles"
        subtitle="Cuentas, roles, sesiones abiertas y señales de riesgo de acceso."
        actions={cfg.canAssign ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Solo el dueño lo ve: restablecer la contraseña de cualquier cuenta volviendo a escribir la suya. */}
            <AccesoCuentasEnlace />
            <Button variant="ghost" onClick={() => { window.location.href = "/integra/people"; }}>
              Personas de acceso físico
            </Button>
            <Button variant="secondary" onClick={() => void openRoleCreate()}>Nuevo rol</Button>
            <Button variant="primary" iconLeft="+" onClick={openCreate} disabled={initialLoading}>Nuevo usuario</Button>
          </div>
        ) : undefined}
      />

      {k && (
        <div style={{ marginBottom: 16 }}>
          <StatStrip
            stats={[
              { label: "Cuentas", value: k.total, sub: `+${k.createdLast30d} en 30 días`, big: true },
              { label: "Activas", value: k.active, tone: "positive", sub: `${k.activeLast7d} entraron esta semana` },
              { label: "Uso sostenido (30 días)", value: `${k.retentionProxy30d}%`, tone: k.retentionProxy30d >= 70 ? "positive" : "warning" },
              { label: "Sesiones abiertas", value: k.activeSessions, tone: "accent" },
              { label: "Riesgo alto", value: k.highRisk, tone: k.highRisk ? "danger" : "default" },
              { label: "Verificación en dos pasos", value: `${k.mfaCoveragePct}%`, sub: `${k.mfaEnabled} cuentas`, tone: k.mfaCoveragePct < 20 ? "warning" : "positive" },
            ]}
          />
        </div>
      )}

      {insights?.alerts && insights.alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {insights.alerts.map((a) => (
            <InlineAlert key={a.message} variant={a.severity} message={a.message} dense />
          ))}
        </div>
      )}

      {token && (
        <Section
          title="Mi seguridad"
          subtitle="Protege tu cuenta con un código de 6 dígitos de tu app de autenticación además de la contraseña."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 8 }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                Verificación en dos pasos:
                <Tag variant={myMfa?.mfaEnabled ? "positive" : "warning"} size="sm" dot>
                  {myMfa?.mfaEnabled ? "Activa" : "Desactivada"}
                </Tag>
              </div>
              {mfaSetup && (
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.5, maxWidth: "70ch" }}>
                  Agrega esta clave en tu app de autenticación: <code style={{ userSelect: "all" }}>{mfaSetup.secret}</code>
                  <div style={{ marginTop: 4, color: "var(--text-tertiary)" }}>Enlace de configuración: {mfaSetup.otpauthUrl}</div>
                </div>
              )}
            </div>
            {(mfaSetup || myMfa?.mfaEnabled) && (
              <div style={{ width: 170 }}>
                <FormField label="Código de 6 dígitos">
                  <input
                    style={{ ...inp, letterSpacing: "0.2em", fontVariantNumeric: "tabular-nums" }}
                    value={mfaToken}
                    onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </FormField>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!myMfa?.mfaEnabled && !mfaSetup && (
                <Button variant="primary" loading={mfaBusy} onClick={() => void startMfaSetup()}>
                  Activar verificación
                </Button>
              )}
              {mfaSetup && (
                <Button variant="primary" loading={mfaBusy} disabled={mfaToken.length < 6} onClick={() => void confirmMfa()}>
                  Confirmar código
                </Button>
              )}
              {myMfa?.mfaEnabled && (
                <Button variant="ghost" loading={mfaBusy} onClick={() => void disableMfa()}>
                  Desactivar
                </Button>
              )}
            </div>
          </div>
        </Section>
      )}

      {insights && (
        <DashGrid>
          <DashCol span={4}>
            <DashPanel title="Inicios de sesión" subtitle="Últimos 14 días">
              <MiniBars
                label="Inicios de sesión exitosos"
                points={insights.trends.loginsSuccess14d.map((p) => ({ label: p.date, count: p.count }))}
              />
            </DashPanel>
          </DashCol>
          <DashCol span={4}>
            <DashPanel title="Intentos fallidos" subtitle="Últimos 14 días · un pico puede indicar un ataque">
              <MiniBars
                label="Intentos fallidos"
                points={insights.trends.loginsFailed14d.map((p) => ({ label: p.date, count: p.count }))}
                color="var(--danger)"
              />
            </DashPanel>
          </DashCol>
          <DashCol span={4}>
            <DashPanel title="Mayor riesgo" subtitle="Cuentas que conviene revisar primero">
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 176, overflowY: "auto" }}>
                {insights.riskTop.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      const u = users.find((x) => x.id === r.id);
                      if (u) void openDrawer(u);
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 40,
                      background: "none", border: "none", padding: "4px 6px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{r.nombre}</span>
                    <RiskTag level={r.riskLevel} score={r.riskScore} />
                  </button>
                ))}
                {!insights.riskTop.length && (
                  <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Ninguna cuenta con riesgo alto.</span>
                )}
              </div>
            </DashPanel>
          </DashCol>
          <DashCol span={6}>
            <DashPanel title="Cuentas por área" subtitle={`${insights.distributions.byDepartment.length} departamentos`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {insights.distributions.byDepartment.slice(0, 6).map((d) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) 1fr 32px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${(d.count / Math.max(1, insights.kpis.total)) * 100}%`,
                        background: "var(--primary)", borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </DashPanel>
          </DashCol>
          <DashCol span={6}>
            <DashPanel title="Dispositivos de acceso" subtitle="Último dispositivo con el que entró cada cuenta">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {insights.distributions.byDevice.length === 0 && (
                  <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Aún no hay datos de dispositivos.</span>
                )}
                {insights.distributions.byDevice.map((d) => (
                  <DashPill key={d.name} tone="accent">{d.name}: {d.count}</DashPill>
                ))}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <DashPill tone={insights.kpis.neverLoggedIn ? "warning" : "positive"}>
                  Nunca han entrado: {insights.kpis.neverLoggedIn}
                </DashPill>
                <DashPill tone={insights.kpis.stale30d ? "warning" : "neutral"}>
                  Sin entrar en 30 días: {insights.kpis.stale30d}
                </DashPill>
                <DashPill tone={insights.kpis.locked ? "danger" : "neutral"}>
                  Bloqueadas: {insights.kpis.locked}
                </DashPill>
              </div>
            </DashPanel>
          </DashCol>
        </DashGrid>
      )}

      {metaError && (
        <InlineAlert
          variant="warning"
          message={metaError}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ margin: "16px 0" }}
        />
      )}
      {error && loaded && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ margin: "16px 0" }}
        />
      )}

      {selected.size > 0 && cfg.canAssign && (
        <div
          role="region"
          aria-label="Acciones sobre la selección"
          style={{
            display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 8, flexWrap: "wrap",
            padding: "10px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)",
            position: "sticky", top: 8, zIndex: 5,
          }}
        >
          <strong style={{ fontSize: 13.5 }}>
            {selected.size === 1 ? "1 seleccionada" : `${selected.size} seleccionadas`}
          </strong>
          <Button variant="secondary" size="sm" onClick={() => bulkSetActive(true)}>Activar</Button>
          <Button variant="secondary" size="sm" onClick={() => bulkSetActive(false)}>Desactivar</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Quitar selección</Button>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <FilterToolbar
          search={{ value: userSearch, onChange: setUserSearch, placeholder: "Buscar por nombre, correo, rol, área o nº de empleado…", ariaLabel: "Buscar usuarios" }}
          selects={[
            {
              label: "Estado",
              value: filterActive,
              onChange: setFilterActive,
              options: [
                { value: "active", label: "Activas" },
                { value: "inactive", label: "Inactivas" },
                { value: "never", label: "Nunca han entrado" },
                { value: "stale", label: "Sin entrar en 30 días" },
                { value: "locked", label: "Bloqueadas" },
              ],
              allowAll: true,
              allLabel: "Todas",
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
          onClear={clearFilters}
          resultCount={initialLoading ? null : visibleUsers.length}
          rightActions={users.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft="⬇"
              onClick={() => exportToExcel(visibleUsers, [
                { key: "nombre", label: "Nombre" },
                { key: "email", label: "Correo" },
                { key: "role", label: "Rol", format: (_v, u) => userRoleLabel(u) },
                { key: "department", label: "Área", format: (v) => (v as ApiUser["department"])?.nombre ?? "—" },
                { key: "employeeNumber", label: "Nº empleado" },
                { key: "isActive", label: "Estado", format: (v) => (v ? "Activa" : "Inactiva") },
                { key: "riskScore", label: "Puntaje de riesgo" },
                { key: "riskLevel", label: "Nivel de riesgo", format: (v) => RISK_LABEL[String(v ?? "low")] ?? "Bajo" },
                { key: "activeSessions", label: "Sesiones abiertas" },
                { key: "lastLoginAt", label: "Último acceso", format: (v) => (v ? new Date(String(v)).toLocaleDateString("es-MX") : "Nunca") },
                { key: "lastLoginDevice", label: "Dispositivo" },
                { key: "mfaEnabled", label: "Verificación en dos pasos", format: (v) => (v ? "Sí" : "No") },
              ], "usuarios")}
            >
              Exportar a Excel
            </Button>
          ) : undefined}
        />
      </div>

      <Section title={initialLoading ? "Cargando cuentas" : `${visibleUsers.length.toLocaleString("es-MX")} ${visibleUsers.length === 1 ? "cuenta" : "cuentas"}`}>
        {highlightId && loaded && (
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            La cuenta solicitada aparece al inicio de la lista.
          </p>
        )}
        {initialLoading && !error && <SkeletonList rows={8} tableLike />}
        {!loaded && !loading && error && (
          <InlineAlert
            variant="danger"
            title="No se pudieron cargar los usuarios"
            message={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && (
          <DataTable
            columns={columns}
            rows={visibleUsers}
            rowKey={(u) => u.id}
            ariaLabel="Usuarios"
            emptyTitle={users.length === 0 ? "Aún no hay usuarios" : "Sin coincidencias"}
            emptyDescription={users.length === 0 ? "Da de alta la primera cuenta para empezar." : "Ninguna cuenta coincide con la búsqueda o los filtros."}
            emptyAction={
              users.length === 0
                ? (cfg.canAssign ? <Button size="sm" variant="primary" onClick={openCreate}>Nuevo usuario</Button> : undefined)
                : <Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
            }
          />
        )}
      </Section>

      {/* Qué alcanza cada rol: lo que el sistema aplica de verdad, no las casillas. */}
      <Section>
        <RoleAccessMatrix token={token} />
      </Section>

      {/* Panel lateral de acceso */}
      {drawerUser && (
        <div
          role="presentation"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
            display: "flex", justifyContent: "flex-end",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDrawerUser(null); }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="users-drawer-title"
            style={{
              width: "min(460px, 100%)", height: "100%", background: "var(--surface)",
              borderLeft: "1px solid var(--border)", padding: "20px 20px 28px", overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                <Avatar name={drawerUser.nombre} size={44} />
                <div style={{ minWidth: 0 }}>
                  <h2 id="users-drawer-title" style={{ margin: 0, fontSize: 18, fontFamily: "var(--nx-font-display)" }}>{drawerUser.nombre}</h2>
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)", wordBreak: "break-all" }}>{drawerUser.email}</p>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Tag variant="accent" size="sm">{userRoleLabel(drawerUser)}</Tag>
                    <RiskTag level={drawerUser.riskLevel} score={drawerUser.riskScore} />
                    <Tag variant={drawerUser.mfaEnabled ? "positive" : "warning"} size="sm">
                      {drawerUser.mfaEnabled ? "Dos pasos activa" : "Sin dos pasos"}
                    </Tag>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerUser(null)} aria-label="Cerrar panel" style={iconBtn}>✕</button>
            </div>

            <Link href={`/erp/hr/${drawerUser.id}`} style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>
              Ver expediente de RR. HH. →
            </Link>

            {integraSchedule?.schedule && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <SectionLabel>Horario de acceso físico</SectionLabel>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>
                  {integraSchedule.schedule.label}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {integraSchedule.schedule.hint}
                </p>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                  Nº de empleado en lectores: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{integraSchedule.employeeNumber || "—"}</strong>
                  {integraSchedule.targetIps && integraSchedule.targetIps.length > 0
                    ? ` · ${integraSchedule.targetIps.length} ${integraSchedule.targetIps.length === 1 ? "lector" : "lectores"}`
                    : ""}
                </p>
                <Link
                  href={integraSchedule.schedule.integraEditorPath || "/integra/people"}
                  style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: "var(--primary)" }}
                >
                  Editar horario semanal →
                </Link>
              </div>
            )}

            {drawerUser.riskFactors && drawerUser.riskFactors.length > 0 && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <SectionLabel>Por qué tiene riesgo</SectionLabel>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {drawerUser.riskFactors.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}

            {cfg.canAssign && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary" size="sm" onClick={() => forceLogout(drawerUser)}>Cerrar todas las sesiones</Button>
                {!drawerUser.email?.includes("@privacy.nexara.local") && (
                  <Button variant="danger" size="sm" onClick={() => eraseSubject(drawerUser)}>Borrar datos personales</Button>
                )}
              </div>
            )}

            <div role="tablist" aria-label="Detalle de acceso" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
              {([
                ["sessions", `Sesiones${sessions.length ? ` (${sessions.length})` : ""}`],
                ["activity", "Actividad"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === key}
                  onClick={() => setDrawerTab(key)}
                  style={{
                    minHeight: 40, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13.5,
                    fontWeight: drawerTab === key ? 650 : 500,
                    color: drawerTab === key ? "var(--text-primary)" : "var(--text-secondary)",
                    borderBottom: `2px solid ${drawerTab === key ? "var(--primary)" : "transparent"}`, marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {drawerLoading ? (
              <SkeletonList rows={3} />
            ) : drawerTab === "sessions" ? (
              <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sessions.length === 0 && <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No hay sesiones registradas.</span>}
                {sessions.map((s) => {
                  const active = !s.revokedAt && new Date(s.expiresAt) > new Date();
                  return (
                    <div key={s.id} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <strong style={{ fontSize: 13.5 }}>{s.device || "Dispositivo sin nombre"}</strong>
                        <Tag variant={active ? "positive" : "neutral"} size="sm" dot>{active ? "Abierta" : s.revokedAt ? "Cerrada" : "Vencida"}</Tag>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
                        Última actividad {formatWhen(s.lastSeenAt)}{s.ipAddress ? ` · IP ${s.ipAddress}` : ""}
                      </div>
                      {active && cfg.canAssign && (
                        <Button variant="ghost" size="sm" onClick={() => void revokeOneSession(s.id)} style={{ marginTop: 8, color: "var(--danger)" }}>
                          Cerrar esta sesión
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <ul role="tabpanel" style={{ display: "flex", flexDirection: "column", listStyle: "none", margin: 0, padding: 0 }}>
                {activity.length === 0 && <li style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin actividad de acceso reciente.</li>}
                {activity.map((a) => (
                  <li key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{authActionLabel(a.action)}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {formatWhen(a.createdAt)}{a.ipAddress ? ` · IP ${a.ipAddress}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      <Modal
        open={modal === "create" || modal === "edit"}
        onClose={closeModal}
        title={modal === "create" ? "Nuevo usuario" : `Editar a ${target?.nombre ?? ""}`}
        maxWidth={600}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => void saveUser()}
              loading={saving}
              disabled={roles.length === 0 || depts.length === 0}
            >
              {modal === "create" ? "Crear usuario" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {modal === "create"
            ? "Con nombre, correo y rol basta. El número de empleado se genera solo y es el mismo que usan los lectores de acceso."
            : "Actualiza los datos, el rol y el número de empleado vinculado a los lectores de acceso."}
        </p>
        <FormGrid>
          <FormField label="Nombre completo" fullWidth>
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              style={inp}
              placeholder="Ej. Ariadna Sierra"
              autoComplete="name"
              required
            />
          </FormField>
          <FormField label="Correo" fullWidth>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={inp}
              placeholder="nombre@empresa.com"
              autoComplete="email"
              required
            />
          </FormField>
          {modal === "create" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={checkRow}>
                <input
                  type="checkbox"
                  checked={form.autoPassword}
                  style={{ width: 18, height: 18 }}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      autoPassword: on,
                      password: on ? generateTempPassword() : "",
                    }));
                  }}
                />
                Generar contraseña temporal automáticamente
              </label>
              {!form.autoPassword ? (
                <FormField label="Contraseña inicial" hint="Mínimo 6 caracteres.">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    style={inp}
                    autoComplete="new-password"
                  />
                </FormField>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)" }}>
                  Se mostrará una sola vez al crear la cuenta.
                </p>
              )}
            </div>
          )}
          <FormField label="Rol">
            <select
              value={form.roleId}
              onChange={(e) => {
                const roleId = e.target.value;
                setForm((f) => ({ ...f, roleId, moduleAccess: null }));
                void loadRoleNavPreview(roleId);
              }}
              style={inp}
              disabled={roles.length === 0}
            >
              <option value="">Selecciona un rol</option>
              {roles.map((r) => (
                <option key={r.id} value={String(r.id)}>{friendlyRole(r.nombre, r.orgRoleKey)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Departamento">
            <select
              value={form.departmentId}
              onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              style={inp}
              disabled={depts.length === 0}
            >
              <option value="">Selecciona un departamento</option>
              {depts.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.nombre}</option>
              ))}
            </select>
          </FormField>
          {modal === "edit" && (
            <FormField label="Reporta a" optional fullWidth>
              <select
                value={form.managerId}
                onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
                style={inp}
              >
                <option value="">Sin jefe directo</option>
                {activeManagers.filter((u) => u.id !== target?.id).map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.nombre} · {userRoleLabel(u)}</option>
                ))}
              </select>
            </FormField>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <UserAccessTree
              value={form.moduleAccess}
              defaultModes={roleDefaultModes}
              onChange={(next) => setForm((f) => ({ ...f, moduleAccess: next }))}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={form.autoEmployeeNumber}
                style={{ width: 18, height: 18 }}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    autoEmployeeNumber: e.target.checked,
                    employeeNumber: e.target.checked ? "" : f.employeeNumber,
                  }))
                }
              />
              Asignar número de empleado automáticamente
            </label>
            {!form.autoEmployeeNumber ? (
              <FormField label="Número de empleado" hint="Debe coincidir con el código registrado en los lectores de acceso.">
                <input
                  value={form.employeeNumber}
                  onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))}
                  style={inp}
                  placeholder="Mismo código que en los lectores"
                />
              </FormField>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)" }}>
                Se asigna el siguiente número libre de la empresa.
              </p>
            )}
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>Horario de acceso físico:</strong> al crear la cuenta o cambiar su rol o estado,
              se aplica automáticamente la plantilla correspondiente en los lectores. El horario semanal detallado se edita en Personas de acceso físico.
            </p>
          </div>
        </FormGrid>
        {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 14 }} />}
      </Modal>

      <Modal
        open={!!createdCreds}
        onClose={() => setCreatedCreds(null)}
        title="Usuario creado"
        maxWidth={460}
        footer={createdCreds ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${createdCreds.email}\n${createdCreds.password}\n${createdCreds.employeeNumber || ""}`,
                );
                toast.success("Datos copiados");
              }}
            >
              Copiar datos
            </Button>
            <Button variant="secondary" onClick={() => { window.location.href = "/integra/people"; }}>
              Registrar rostro
            </Button>
            <Button variant="primary" onClick={() => setCreatedCreds(null)}>Listo</Button>
          </>
        ) : undefined}
      >
        {createdCreds && (
          <>
            <InlineAlert
              variant="warning"
              message="Guarda la contraseña temporal ahora: no volverá a mostrarse."
              dense
              style={{ marginBottom: 14 }}
            />
            <dl style={{ margin: 0, display: "grid", gap: 12, fontSize: 13.5 }}>
              <div>
                <dt style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Nombre</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{createdCreds.nombre}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Correo</dt>
                <dd style={{ margin: 0 }}>{createdCreds.email}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Número de empleado</dt>
                <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {createdCreds.employeeNumber || "Asignado automáticamente (consúltalo en la lista)"}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Contraseña temporal</dt>
                <dd style={{ margin: 0 }}>
                  <code style={{ userSelect: "all", fontSize: 14 }}>{createdCreds.password}</code>
                </dd>
              </div>
            </dl>
          </>
        )}
      </Modal>

      <Modal
        open={modal === "role"}
        onClose={closeModal}
        title="Nuevo rol"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveRole()} loading={saving}>Crear rol</Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Nombre del rol" fullWidth>
            <input
              value={roleForm.nombre}
              onChange={(e) => setRoleForm((f) => ({ ...f, nombre: e.target.value }))}
              style={inp}
              placeholder="Ej. Coordinador de compras"
            />
          </FormField>
          <FormField label="Basar en un rol existente" optional fullWidth hint="Copia los permisos iniciales del rol elegido.">
            <select value={roleForm.templateKey} onChange={(e) => setRoleForm((f) => ({ ...f, templateKey: e.target.value }))} style={inp}>
              <option value="">Empezar sin permisos</option>
              {roleTemplates.map((t) => (
                <option key={t.orgRoleKey} value={t.orgRoleKey}>{t.label || friendlyRole(t.nombre, t.orgRoleKey)}</option>
              ))}
            </select>
          </FormField>
        </FormGrid>
        {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 14 }} />}
      </Modal>

      <Modal
        open={modal === "password" && !!target}
        onClose={closeModal}
        title="Cambiar contraseña"
        maxWidth={420}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" onClick={() => void savePassword()} loading={saving}>Cambiar contraseña</Button>
          </>
        }
      >
        {target && (
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>{target.nombre} · {target.email}</p>
        )}
        <FormGrid>
          <FormField label="Nueva contraseña" fullWidth hint="Mínimo 6 caracteres.">
            <input
              type="password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
              style={inp}
              autoComplete="new-password"
            />
          </FormField>
          <FormField
            label="Confirmar contraseña"
            fullWidth
            error={pwForm.confirm && pwForm.confirm !== pwForm.newPassword ? "Las contraseñas no coinciden." : null}
          >
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              style={inp}
              autoComplete="new-password"
            />
          </FormField>
        </FormGrid>
        {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 14 }} />}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  color: "var(--text-secondary)",
};

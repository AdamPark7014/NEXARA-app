"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getHrSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

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

const TABS = [
  { key: "plantilla", label: "Plantilla" },
  { key: "permisos", label: "Solicitudes de permiso" },
  { key: "evaluaciones", label: "Evaluaciones de desempeño" },
  { key: "dashboard", label: "Dashboard" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const LEAVE_TYPE_LABEL: Record<string, string> = {
  VACATION: "Vacaciones",
  SICK: "Enfermedad",
  PERSONAL: "Personal",
  MATERNITY: "Maternidad",
  PATERNITY: "Paternidad",
  BEREAVEMENT: "Duelo",
  UNPAID: "Sin goce de sueldo",
};
const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABEL);

const LEAVE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};

const REVIEW_PERIOD_LABEL: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMI_ANNUAL: "Semestral",
  ANNUAL: "Anual",
};
const REVIEW_PERIODS = Object.keys(REVIEW_PERIOD_LABEL);

const REVIEW_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  ACKNOWLEDGED: "Confirmada",
};

type LeaveRequest = {
  id: number;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  user?: { id: number; nombre: string; email?: string } | null;
  approvedBy?: { id: number; nombre: string } | null;
};

type PerformanceReview = {
  id: number;
  period: string;
  reviewDate: string;
  overallRating: number;
  strengths?: string | null;
  areasOfImprovement?: string | null;
  goals?: string | null;
  comments?: string | null;
  status: string;
  user?: { id: number; nombre: string } | null;
  reviewer?: { id: number; nombre: string } | null;
};

type HrDashboard = { pendingLeaves: number; approvedLeavesThisMonth: number; totalReviews: number; avgRating: number };

const emptyLeaveForm = { userId: "", type: "VACATION", startDate: "", endDate: "", reason: "" };
const emptyReviewForm = { userId: "", period: "ANNUAL", reviewDate: new Date().toISOString().slice(0, 10), overallRating: 3, strengths: "", areasOfImprovement: "", goals: "", comments: "" };

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
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [depts, setDepts] = useState<ApiDept[]>([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm });
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [tab, setTab] = useState<TabKey>("plantilla");

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ ...emptyLeaveForm });
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveSaveErr, setLeaveSaveErr] = useState<string | null>(null);

  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ ...emptyReviewForm });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaveErr, setReviewSaveErr] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<HrDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const fetchStaff = useCallback(async () => {
    if (!user?.token) return;
    setState({ kind: "loading" });
    try {
      const [data, rolesData, deptsData] = await Promise.all([
        apiFetch("users/hr-staff?limit=50", user.token),
        apiFetch("users/roles", user.token),
        apiFetch("users/departments", user.token),
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
    let rows = state.items;
    const q = filter.trim().toLowerCase();
    if (q) rows = rows.filter((e) =>
      e.nombre.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.puesto ?? "").toLowerCase().includes(q) ||
      (e.department?.nombre ?? "").toLowerCase().includes(q)
    );
    if (filterDept) rows = rows.filter((e) => String(e.department?.id ?? "") === filterDept);
    if (filterEstado) {
      if (filterEstado === "activo") rows = rows.filter((e) => e.isActive !== false && e.estadoRRHH !== "Baja");
      else if (filterEstado === "baja") rows = rows.filter((e) => e.estadoRRHH === "Baja");
      else rows = rows.filter((e) => e.estadoRRHH === filterEstado);
    }
    return rows;
  }, [state, filter, filterDept, filterEstado]);

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
      setSaveErr(e instanceof Error ? e.message : "Error al guardar empleado");
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
      setActionErr(err instanceof Error ? err.message : "Error en la operación");
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
    setConfirmState({ message: `⚠️ Eliminar permanentemente a "${e.nombre}" (${e.email}). Esta acción no se puede deshacer.`, fn: async () => {
    try {
      await apiFetch(`users/${e.id}`, user.token, { method: "DELETE" });
      setState((s) => (s.kind === "ready" ? { kind: "ready", items: s.items.filter((i) => i.id !== e.id) } : s));
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Error al eliminar empleado");
    }
  } });
  };

  // ── Solicitudes de permiso ──────────────────────────────────────────
  const loadLeaves = useCallback(async () => {
    if (!user?.token) return;
    setLeavesLoading(true);
    try {
      const qs = new URLSearchParams();
      if (leaveStatusFilter) qs.set("status", leaveStatusFilter);
      if (leaveTypeFilter) qs.set("type", leaveTypeFilter);
      const data = await apiFetch(`hr/leaves?${qs}`, user.token);
      setLeaves(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes de permiso");
      setLeaves([]);
    } finally {
      setLeavesLoading(false);
    }
  }, [user?.token, leaveStatusFilter, leaveTypeFilter]);

  const saveLeave = async () => {
    if (!user?.token || !leaveForm.userId || !leaveForm.startDate || !leaveForm.endDate) {
      setLeaveSaveErr("Empleado, fecha de inicio y fecha de fin son obligatorios.");
      return;
    }
    setLeaveSaving(true);
    setLeaveSaveErr(null);
    try {
      const created = await apiFetch("hr/leaves", user.token, {
        method: "POST",
        body: JSON.stringify({
          userId: Number(leaveForm.userId),
          type: leaveForm.type,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          reason: leaveForm.reason.trim() || undefined,
        }),
      });
      setLeaves((prev) => [created, ...prev]);
      setShowLeaveForm(false);
      setLeaveForm({ ...emptyLeaveForm });
    } catch (e) {
      setLeaveSaveErr(e instanceof Error ? e.message : "No se pudo crear la solicitud");
    } finally {
      setLeaveSaving(false);
    }
  };

  const approveLeave = async (leave: LeaveRequest) => {
    if (!user?.token) return;
    try {
      const updated = await apiFetch(`hr/leaves/${leave.id}/approve`, user.token, { method: "PATCH" });
      setLeaves((prev) => prev.map((l) => (l.id === leave.id ? { ...l, ...updated } : l)));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo aprobar la solicitud");
    }
  };

  const rejectLeave = (leave: LeaveRequest) => {
    setConfirmState({
      message: `¿Rechazar la solicitud de ${leave.user?.nombre ?? "este empleado"}?`,
      confirmLabel: "Rechazar",
      fn: async () => {
        if (!user?.token) return;
        try {
          const updated = await apiFetch(`hr/leaves/${leave.id}/reject`, user.token, {
            method: "PATCH",
            body: JSON.stringify({ rejectionReason: "Rechazada desde RRHH" }),
          });
          setLeaves((prev) => prev.map((l) => (l.id === leave.id ? { ...l, ...updated } : l)));
        } catch (e) {
          setActionErr(e instanceof Error ? e.message : "No se pudo rechazar la solicitud");
        }
      },
    });
  };

  // ── Evaluaciones de desempeño ─────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    if (!user?.token) return;
    setReviewsLoading(true);
    try {
      const data = await apiFetch("hr/reviews", user.token);
      setReviews(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudieron cargar las evaluaciones");
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [user?.token]);

  const saveReview = async () => {
    if (!user?.token || !reviewForm.userId || !reviewForm.reviewDate) {
      setReviewSaveErr("Empleado y fecha de evaluación son obligatorios.");
      return;
    }
    setReviewSaving(true);
    setReviewSaveErr(null);
    try {
      const created = await apiFetch("hr/reviews", user.token, {
        method: "POST",
        body: JSON.stringify({
          userId: Number(reviewForm.userId),
          period: reviewForm.period,
          reviewDate: reviewForm.reviewDate,
          overallRating: Number(reviewForm.overallRating),
          strengths: reviewForm.strengths.trim() || undefined,
          areasOfImprovement: reviewForm.areasOfImprovement.trim() || undefined,
          goals: reviewForm.goals.trim() || undefined,
          comments: reviewForm.comments.trim() || undefined,
        }),
      });
      setReviews((prev) => [created, ...prev]);
      setShowReviewForm(false);
      setReviewForm({ ...emptyReviewForm, reviewDate: new Date().toISOString().slice(0, 10) });
    } catch (e) {
      setReviewSaveErr(e instanceof Error ? e.message : "No se pudo crear la evaluación");
    } finally {
      setReviewSaving(false);
    }
  };

  const submitReview = async (review: PerformanceReview) => {
    if (!user?.token) return;
    try {
      const updated = await apiFetch(`hr/reviews/${review.id}/submit`, user.token, { method: "PATCH" });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...updated } : r)));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo enviar la evaluación");
    }
  };

  const acknowledgeReview = async (review: PerformanceReview) => {
    if (!user?.token) return;
    try {
      const updated = await apiFetch(`hr/reviews/${review.id}/acknowledge`, user.token, { method: "PATCH" });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...updated } : r)));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo confirmar la evaluación");
    }
  };

  // ── Dashboard ─────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    if (!user?.token) return;
    setDashboardLoading(true);
    try {
      const data = await apiFetch("hr/dashboard", user.token);
      setDashboard(data);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo cargar el dashboard");
      setDashboard(null);
    } finally {
      setDashboardLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    if (tab === "permisos") void loadLeaves();
  }, [tab, loadLeaves]);

  // Precarga silenciosa para el contador de pendientes en la pestaña.
  useEffect(() => {
    if (user?.token) void loadLeaves();
  }, [user?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "evaluaciones") void loadReviews();
  }, [tab, loadReviews]);

  useEffect(() => {
    if (tab === "dashboard") void loadDashboard();
  }, [tab, loadDashboard]);

  const pendingLeavesCount = useMemo(() => leaves.filter((l) => l.status === "PENDING").length, [leaves]);

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
          <Link href={`/erp/hr/${e.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>{e.nombre}</Link>
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
      key: "fechaIngreso", label: "Antigüedad",
      render: (e) => {
        const d = e.fechaIngreso ?? e.fechaCreacion;
        if (!d) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const months = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
        const label = months >= 12 ? `${Math.floor(months / 12)}a ${months % 12}m` : `${months}m`;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{new Date(d).getFullYear()}</span>
          </div>
        );
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
  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 };
  const formCard: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

  const leaveColumns: Column<LeaveRequest>[] = [
    { key: "user", label: "Empleado", render: (l) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.user?.nombre ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{LEAVE_TYPE_LABEL[l.type] ?? l.type}</div>
      </div>
    ) },
    { key: "range", label: "Fechas", render: (l) => (
      <span style={{ fontSize: 12.5 }}>
        {new Date(l.startDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} — {new Date(l.endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
      </span>
    ), width: 160 },
    { key: "days", label: "Días", render: (l) => <strong style={{ fontSize: 13 }}>{l.days}</strong>, width: 60, numeric: true },
    { key: "reason", label: "Motivo", accessor: (l) => l.reason ?? "—" },
    { key: "status", label: "Estado", width: 220, render: (l) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={l.status === "APPROVED" ? "positive" : l.status === "REJECTED" ? "danger" : l.status === "CANCELLED" ? "default" : "warning"}>
          {LEAVE_STATUS_LABEL[l.status] ?? l.status}
        </Tag>
        {l.status === "PENDING" && cfg.canEdit && (
          <>
            <button onClick={() => void approveLeave(l)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Aprobar</button>
            <button onClick={() => rejectLeave(l)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Rechazar</button>
          </>
        )}
      </div>
    ) },
  ];

  const reviewColumns: Column<PerformanceReview>[] = [
    { key: "user", label: "Empleado", render: (r) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.user?.nombre ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Evaluador: {r.reviewer?.nombre ?? "—"}</div>
      </div>
    ) },
    { key: "period", label: "Periodo", render: (r) => (
      <div>
        <Tag variant="default">{REVIEW_PERIOD_LABEL[r.period] ?? r.period}</Tag>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>{new Date(r.reviewDate).toLocaleDateString("es-MX")}</div>
      </div>
    ), width: 130 },
    { key: "overallRating", label: "Calificación", render: (r) => (
      <span style={{ fontSize: 13, fontWeight: 700, color: r.overallRating >= 4 ? "var(--success)" : r.overallRating >= 3 ? "var(--text-primary)" : "var(--danger)" }}>
        {"★".repeat(Math.round(r.overallRating))}{"☆".repeat(5 - Math.round(r.overallRating))} <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>({r.overallRating})</span>
      </span>
    ), width: 150 },
    { key: "status", label: "Estado", width: 220, render: (r) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={r.status === "ACKNOWLEDGED" ? "positive" : r.status === "SUBMITTED" ? "accent" : "default"}>
          {REVIEW_STATUS_LABEL[r.status] ?? r.status}
        </Tag>
        {r.status === "DRAFT" && cfg.canEdit && (
          <button onClick={() => void submitReview(r)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Enviar</button>
        )}
        {r.status === "SUBMITTED" && (
          <button onClick={() => void acknowledgeReview(r)} style={{ fontSize: 11, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Confirmar recibido</button>
        )}
      </div>
    ) },
  ];

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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "permisos" && pendingLeavesCount > 0 && (
              <span style={{ marginLeft: 6, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10.5 }}>{pendingLeavesCount}</span>
            )}
          </Button>
        ))}
      </div>

      {tab === "plantilla" && (
      <>
      {state.kind === "ready" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
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
          {total > 0 && depts.length > 0 && (() => {
            const byDept = depts
              .map((d) => ({ nombre: d.nombre, count: state.items.filter((e) => e.department?.id === d.id).length }))
              .filter((d) => d.count > 0)
              .sort((a, b) => b.count - a.count);
            if (byDept.length === 0) return null;
            return (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Headcount por departamento</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byDept.map(({ nombre, count }) => (
                    <div key={nombre} style={{ display: "grid", gridTemplateColumns: "140px 1fr 32px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      <FilterToolbar
        search={{ value: filter, onChange: setFilter, placeholder: "Buscar por nombre, puesto, área…" }}
        selects={[
          ...(depts.length > 0 ? [{
            label: "Área",
            value: filterDept,
            onChange: setFilterDept,
            options: depts.map((d) => ({ value: String(d.id), label: d.nombre })),
            allowAll: true,
          }] : []),
          {
            label: "Estado",
            value: filterEstado,
            onChange: setFilterEstado,
            options: [
              { value: "activo", label: "Activos" },
              { value: "Vacaciones", label: "Vacaciones" },
              { value: "Baja", label: "Baja" },
            ],
            allowAll: true,
          },
        ]}
        onClear={() => { setFilter(""); setFilterDept(""); setFilterEstado(""); }}
        resultCount={state.kind === "ready" ? filtered.length : null}
        rightActions={state.kind === "ready" && filtered.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(filtered, [
            { key: "nombre", label: "Nombre" },
            { key: "email", label: "Email" },
            { key: "puesto", label: "Puesto" },
            { key: "department", label: "Área", format: (v) => (v as HrEmpleado["department"])?.nombre ?? "—" },
            { key: "estadoRRHH", label: "Estado" },
            { key: "tipoContrato", label: "Contrato" },
          ], "plantilla")}>CSV</Button>
        ) : undefined}
      />

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
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
      </>
      )}

      {tab === "permisos" && (
        <Section
          title="Solicitudes de permiso"
          subtitle="Vacaciones, incapacidades y otros permisos, con flujo de aprobación."
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={leaveStatusFilter} onChange={(e) => setLeaveStatusFilter(e.target.value)} style={{ ...inp, width: 150 }}>
                <option value="">Todos los estados</option>
                {Object.entries(LEAVE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)} style={{ ...inp, width: 150 }}>
                <option value="">Todos los tipos</option>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
              </select>
              {cfg.canCreate && (
                <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setLeaveForm({ ...emptyLeaveForm }); setLeaveSaveErr(null); setShowLeaveForm(true); }}>
                  Nueva solicitud
                </Button>
              )}
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
            <KpiCard label="Pendientes de aprobar" value={pendingLeavesCount} variant={pendingLeavesCount > 0 ? "warning" : "positive"} icon="⏳" />
            <KpiCard label="Aprobadas" value={leaves.filter((l) => l.status === "APPROVED").length} variant="positive" icon="✅" />
            <KpiCard label="Rechazadas" value={leaves.filter((l) => l.status === "REJECTED").length} icon="🚫" />
          </div>
          {showLeaveForm && (
            <div style={formCard}>
              <div>
                <label style={label}>Empleado</label>
                <select value={leaveForm.userId} onChange={(e) => setLeaveForm((f) => ({ ...f, userId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {state.kind === "ready" && state.items.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Tipo de permiso</label>
                <select value={leaveForm.type} onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))} style={inp}>
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Fecha de inicio</label>
                <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={label}>Fecha de fin</label>
                <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Motivo (opcional)</label>
                <input value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} style={inp} />
              </div>
              {leaveSaveErr && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{leaveSaveErr}</div>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => { setShowLeaveForm(false); setLeaveSaveErr(null); }}>Cancelar</Button>
                <Button variant="primary" onClick={() => void saveLeave()} disabled={leaveSaving}>{leaveSaving ? "Guardando…" : "Crear solicitud"}</Button>
              </div>
            </div>
          )}
          {leavesLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable columns={leaveColumns} rows={leaves} rowKey={(l) => l.id} emptyTitle="Sin solicitudes" emptyDescription="No hay solicitudes de permiso registradas con estos filtros." />
          )}
        </Section>
      )}

      {tab === "evaluaciones" && (
        <Section
          title="Evaluaciones de desempeño"
          subtitle="Ciclo de evaluación con calificación general, fortalezas, áreas de mejora y metas."
          actions={cfg.canCreate ? (
            <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setReviewForm({ ...emptyReviewForm, reviewDate: new Date().toISOString().slice(0, 10) }); setReviewSaveErr(null); setShowReviewForm(true); }}>
              Nueva evaluación
            </Button>
          ) : undefined}
        >
          {showReviewForm && (
            <div style={formCard}>
              <div>
                <label style={label}>Empleado</label>
                <select value={reviewForm.userId} onChange={(e) => setReviewForm((f) => ({ ...f, userId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {state.kind === "ready" && state.items.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Periodo</label>
                <select value={reviewForm.period} onChange={(e) => setReviewForm((f) => ({ ...f, period: e.target.value }))} style={inp}>
                  {REVIEW_PERIODS.map((p) => <option key={p} value={p}>{REVIEW_PERIOD_LABEL[p]}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Fecha de evaluación</label>
                <input type="date" value={reviewForm.reviewDate} onChange={(e) => setReviewForm((f) => ({ ...f, reviewDate: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={label}>Calificación general (1–5)</label>
                <input type="number" min={1} max={5} step="0.5" value={reviewForm.overallRating} onChange={(e) => setReviewForm((f) => ({ ...f, overallRating: +e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Fortalezas</label>
                <input value={reviewForm.strengths} onChange={(e) => setReviewForm((f) => ({ ...f, strengths: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Áreas de mejora</label>
                <input value={reviewForm.areasOfImprovement} onChange={(e) => setReviewForm((f) => ({ ...f, areasOfImprovement: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Metas</label>
                <input value={reviewForm.goals} onChange={(e) => setReviewForm((f) => ({ ...f, goals: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Comentarios</label>
                <input value={reviewForm.comments} onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))} style={inp} />
              </div>
              {reviewSaveErr && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{reviewSaveErr}</div>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => { setShowReviewForm(false); setReviewSaveErr(null); }}>Cancelar</Button>
                <Button variant="primary" onClick={() => void saveReview()} disabled={reviewSaving}>{reviewSaving ? "Guardando…" : "Crear evaluación"}</Button>
              </div>
            </div>
          )}
          {reviewsLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable columns={reviewColumns} rows={reviews} rowKey={(r) => r.id} emptyTitle="Sin evaluaciones" emptyDescription="Registra la primera evaluación de desempeño." />
          )}
        </Section>
      )}

      {tab === "dashboard" && (
        <Section title="Dashboard de RRHH" subtitle="Resumen de permisos y evaluaciones de toda la organización.">
          {dashboardLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : dashboard ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <KpiCard label="Permisos pendientes" value={dashboard.pendingLeaves} variant={dashboard.pendingLeaves > 0 ? "warning" : "positive"} icon="⏳" />
              <KpiCard label="Aprobados este mes" value={dashboard.approvedLeavesThisMonth} variant="positive" icon="✅" />
              <KpiCard label="Evaluaciones totales" value={dashboard.totalReviews} icon="📋" />
              <KpiCard label="Calificación promedio" value={dashboard.avgRating.toFixed(1)} hint="Sobre 5" variant={dashboard.avgRating >= 4 ? "positive" : dashboard.avgRating >= 3 ? "default" : "warning"} icon="⭐" />
            </div>
          ) : null}
        </Section>
      )}

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
                  {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Departamento</span>
                <select value={createForm.departmentId} onChange={(e) => setCreateForm((f) => ({ ...f, departmentId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {depts.map((d) => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
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
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

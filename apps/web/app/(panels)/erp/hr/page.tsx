"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import MetricStrip from "@/components/ui/MetricStrip";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { FormField, FormGrid } from "@/components/ui/FormField";
import FilterToolbar from "@/components/FilterToolbar";
import PanelTabs from "@/components/ui/PanelTabs";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { SkeletonList } from "@/components/PageState";
import { Avatar } from "@/components/base";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
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

const TIPO_CONTRATO = ["Planta", "Honorarios", "Contratista"] as const;
const ESTADOS_RRHH = ["Activo", "Vacaciones", "Incidencia", "Baja"] as const;

const TABS = [
  { key: "plantilla", label: "Plantilla" },
  { key: "permisos", label: "Permisos" },
  { key: "evaluaciones", label: "Evaluaciones" },
  { key: "dashboard", label: "Resumen" },
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
  ACKNOWLEDGED: "Recibida",
};

const ESTADO_VARIANT: Record<string, "positive" | "accent" | "warning" | "danger"> = {
  Activo: "positive",
  Vacaciones: "accent",
  Incidencia: "warning",
  Baja: "danger",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isoLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tenureLabel(months: number): string {
  if (months < 1) return "Menos de 1 mes";
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ${years === 1 ? "año" : "años"}`;
  return rest ? `${y} y ${rest} ${rest === 1 ? "mes" : "meses"}` : y;
}

function shortDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

const HTTP_FALLBACK: Record<number, string> = {
  400: "Revisa los datos capturados.",
  401: "Tu sesión expiró. Vuelve a iniciar sesión.",
  403: "No tienes permiso para esta acción.",
  404: "No encontramos el registro.",
  409: "Ya existe un registro con esos datos.",
};

const emptyLeaveForm = { userId: "", type: "VACATION", startDate: "", endDate: "", reason: "" };
const emptyReviewForm = { userId: "", period: "ANNUAL", reviewDate: isoLocal(), overallRating: 3, strengths: "", areasOfImprovement: "", goals: "", comments: "" };

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
    let msg = "";
    try {
      const parsed = JSON.parse(text)?.message;
      msg = Array.isArray(parsed) ? parsed.join(", ") : parsed || "";
    } catch {
      msg = text.trim().startsWith("<") ? "" : text;
    }
    throw new Error(msg || HTTP_FALLBACK[res.status] || "El servidor no respondió. Intenta de nuevo en unos minutos.");
  }
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyCreateForm = { nombre: "", email: "", password: "", roleId: "", departmentId: "", puesto: "", tipoContrato: "Planta" as string };

const selectStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-tertiary)" };

export default function HrPage() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getHrSectionConfig(user), [user]);

  const [items, setItems] = useState<HrEmpleado[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<HrEmpleado | null>(null);
  const [editForm, setEditForm] = useState<Partial<HrEmpleado>>({});
  const [editDirty, setEditDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [filterDept, setFilterDept] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [depts, setDepts] = useState<ApiDept[]>([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm });
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createTouched, setCreateTouched] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [tab, setTab] = useState<TabKey>("plantilla");

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leavesLoaded, setLeavesLoaded] = useState(false);
  const [leavesError, setLeavesError] = useState<string | null>(null);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ ...emptyLeaveForm });
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveSaveErr, setLeaveSaveErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ ...emptyReviewForm });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaveErr, setReviewSaveErr] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<HrDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const [data, rolesData, deptsData] = await Promise.all([
        apiFetch("users/hr-staff?limit=50", user.token),
        apiFetch("users/roles", user.token),
        apiFetch("users/departments", user.token),
      ]);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setDepts(Array.isArray(deptsData) ? deptsData : []);
      setLoaded(true);
      setLoadError(null);
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar la plantilla."));
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { void fetchStaff(); }, [fetchStaff]);

  useEffect(() => {
    if (!cfg.canAccess) {
      router.replace("/erp/hr/attendance");
    }
  }, [cfg.canAccess, router]);

  const filtered = useMemo(() => {
    let rows = items;
    const q = deferredFilter.trim().toLowerCase();
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
  }, [items, deferredFilter, filterDept, filterEstado]);

  const stats = useMemo(() => {
    let activos = 0, vac = 0, incidencias = 0, honorarios = 0;
    const byDeptId = new Map<number, number>();
    for (const e of items) {
      if (e.isActive !== false && e.estadoRRHH !== "Baja") activos++;
      if (e.estadoRRHH === "Vacaciones") vac++;
      if (e.estadoRRHH === "Incidencia") incidencias++;
      if (e.tipoContrato === "Honorarios") honorarios++;
      if (e.department?.id != null) byDeptId.set(e.department.id, (byDeptId.get(e.department.id) ?? 0) + 1);
    }
    const byDept = depts
      .map((d) => ({ nombre: d.nombre, count: byDeptId.get(d.id) ?? 0 }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
    return { total: items.length, activos, vac, incidencias, honorarios, byDept };
  }, [items, depts]);

  const openEdit = (e: HrEmpleado) => {
    setEditing(e);
    setSaveErr(null);
    setEditDirty(false);
    setEditForm({
      puesto: e.puesto ?? "",
      tipoContrato: e.tipoContrato ?? "Planta",
      estadoRRHH: e.estadoRRHH ?? "Activo",
      isActive: e.isActive !== false,
      fechaIngreso: e.fechaIngreso ? e.fechaIngreso.slice(0, 10) : "",
    });
  };

  const patchEdit = (patch: Partial<HrEmpleado>) => {
    setEditForm((f) => ({ ...f, ...patch }));
    setEditDirty(true);
  };

  const saveEdit = async () => {
    if (!editing || !user?.token) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await apiFetch(`users/${editing.id}/hr`, user.token, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, ...editForm } : i)));
      setEditing(null);
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const applyToggleActive = async (e: HrEmpleado) => {
    if (!user?.token) return;
    const next = e.isActive === false;
    setBusyId(`emp-${e.id}`);
    try {
      await apiFetch(`users/${e.id}/hr`, user.token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next, estadoRRHH: next ? "Activo" : "Baja" }),
      });
      setItems((prev) => prev.map((i) => i.id === e.id ? { ...i, isActive: next, estadoRRHH: next ? "Activo" : "Baja" } : i));
    } catch (err) {
      setActionErr(formatApiError(err, next ? "No se pudo reactivar a la persona." : "No se pudo dar de baja a la persona."));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = (e: HrEmpleado) => {
    if (e.isActive === false) {
      void applyToggleActive(e);
      return;
    }
    setConfirmState({
      title: "Dar de baja",
      message: `${e.nombre} quedará con estado «Baja» y su cuenta se desactivará. Podrás reactivarla después.`,
      confirmLabel: "Dar de baja",
      fn: () => applyToggleActive(e),
    });
  };

  const openCreate = () => { setCreateForm({ ...emptyCreateForm }); setCreateErr(null); setCreateTouched(false); setCreating(true); };

  const createErrors = useMemo(() => {
    const errs: Partial<Record<keyof typeof emptyCreateForm, string>> = {};
    if (!createForm.nombre.trim()) errs.nombre = "Escribe el nombre completo.";
    if (!createForm.email.trim()) errs.email = "Escribe el correo.";
    else if (!EMAIL_PATTERN.test(createForm.email.trim())) errs.email = "El correo no parece válido.";
    if (!createForm.password) errs.password = "Asigna una contraseña temporal.";
    else if (createForm.password.length < 8) errs.password = "Debe tener al menos 8 caracteres.";
    if (!createForm.roleId) errs.roleId = "Elige un rol.";
    if (!createForm.departmentId) errs.departmentId = "Elige un departamento.";
    return errs;
  }, [createForm]);

  const submitCreate = async () => {
    if (!user?.token) return;
    setCreateTouched(true);
    if (Object.keys(createErrors).length > 0) {
      setCreateErr("Completa los campos marcados.");
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
      if (created) setItems((prev) => [created, ...prev]);
      setCreating(false);
    } catch (e) {
      setCreateErr(formatApiError(e, "No se pudo dar de alta a la persona."));
    } finally {
      setSaving(false);
    }
  };

  const deleteEmpleado = (e: HrEmpleado) => {
    if (!user?.token) return;
    setConfirmState({
      title: "Eliminar persona",
      message: `Se eliminará permanentemente a ${e.nombre} (${e.email}). Esta acción no se puede deshacer. Si solo dejó de trabajar aquí, usa «Dar de baja».`,
      confirmLabel: "Eliminar",
      fn: async () => {
        try {
          await apiFetch(`users/${e.id}`, user.token, { method: "DELETE" });
          setItems((prev) => prev.filter((i) => i.id !== e.id));
        } catch (err) {
          setActionErr(formatApiError(err, "No se pudo eliminar a la persona."));
        }
      },
    });
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
      setLeavesLoaded(true);
      setLeavesError(null);
    } catch (e) {
      setLeavesError(formatApiError(e, "No se pudieron cargar las solicitudes de permiso."));
    } finally {
      setLeavesLoading(false);
    }
  }, [user?.token, leaveStatusFilter, leaveTypeFilter]);

  const leaveRangeError = leaveForm.startDate && leaveForm.endDate && leaveForm.endDate < leaveForm.startDate
    ? "La fecha de fin no puede ser anterior al inicio."
    : null;

  const saveLeave = async () => {
    if (!user?.token || !leaveForm.userId || !leaveForm.startDate || !leaveForm.endDate) {
      setLeaveSaveErr("Elige a la persona y las fechas de inicio y fin.");
      return;
    }
    if (leaveRangeError) {
      setLeaveSaveErr(leaveRangeError);
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
      setLeaveSaveErr(formatApiError(e, "No se pudo crear la solicitud."));
    } finally {
      setLeaveSaving(false);
    }
  };

  const approveLeave = async (leave: LeaveRequest) => {
    if (!user?.token) return;
    setBusyId(`leave-${leave.id}`);
    try {
      const updated = await apiFetch(`hr/leaves/${leave.id}/approve`, user.token, { method: "PATCH" });
      setLeaves((prev) => prev.map((l) => (l.id === leave.id ? { ...l, ...updated } : l)));
    } catch (e) {
      setActionErr(formatApiError(e, "No se pudo aprobar la solicitud."));
    } finally {
      setBusyId(null);
    }
  };

  const rejectLeave = (leave: LeaveRequest) => {
    setConfirmState({
      title: "Rechazar permiso",
      message: `¿Rechazar la solicitud de ${leave.user?.nombre ?? "esta persona"}? Se le notificará como rechazada por Recursos Humanos.`,
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
          setActionErr(formatApiError(e, "No se pudo rechazar la solicitud."));
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
      setReviewsLoaded(true);
      setReviewsError(null);
    } catch (e) {
      setReviewsError(formatApiError(e, "No se pudieron cargar las evaluaciones."));
    } finally {
      setReviewsLoading(false);
    }
  }, [user?.token]);

  const ratingError = reviewForm.overallRating < 1 || reviewForm.overallRating > 5 || Number.isNaN(reviewForm.overallRating)
    ? "La calificación va de 1 a 5."
    : null;

  const saveReview = async () => {
    if (!user?.token || !reviewForm.userId || !reviewForm.reviewDate) {
      setReviewSaveErr("Elige a la persona y la fecha de evaluación.");
      return;
    }
    if (ratingError) {
      setReviewSaveErr(ratingError);
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
      setReviewForm({ ...emptyReviewForm, reviewDate: isoLocal() });
    } catch (e) {
      setReviewSaveErr(formatApiError(e, "No se pudo crear la evaluación."));
    } finally {
      setReviewSaving(false);
    }
  };

  const submitReview = async (review: PerformanceReview) => {
    if (!user?.token) return;
    setBusyId(`review-${review.id}`);
    try {
      const updated = await apiFetch(`hr/reviews/${review.id}/submit`, user.token, { method: "PATCH" });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...updated } : r)));
    } catch (e) {
      setActionErr(formatApiError(e, "No se pudo enviar la evaluación."));
    } finally {
      setBusyId(null);
    }
  };

  const acknowledgeReview = async (review: PerformanceReview) => {
    if (!user?.token) return;
    setBusyId(`review-${review.id}`);
    try {
      const updated = await apiFetch(`hr/reviews/${review.id}/acknowledge`, user.token, { method: "PATCH" });
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, ...updated } : r)));
    } catch (e) {
      setActionErr(formatApiError(e, "No se pudo confirmar la evaluación."));
    } finally {
      setBusyId(null);
    }
  };

  // ── Resumen ─────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    if (!user?.token) return;
    setDashboardLoading(true);
    try {
      const data = await apiFetch("hr/dashboard", user.token);
      setDashboard(data);
      setDashboardError(null);
    } catch (e) {
      setDashboardError(formatApiError(e, "No se pudo cargar el resumen."));
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

  const leaveStats = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    for (const l of leaves) {
      if (l.status === "PENDING") pending++;
      else if (l.status === "APPROVED") approved++;
      else if (l.status === "REJECTED") rejected++;
    }
    return { pending, approved, rejected };
  }, [leaves]);
  const pendingLeavesCount = leaveStats.pending;

  const columns: Column<HrEmpleado>[] = [
    {
      key: "nombre", label: "Persona",
      render: (e) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar name={e.nombre} size={32} />
          <div style={{ minWidth: 0 }}>
            <Link
              href={`/erp/hr/${e.id}`}
              onClick={(ev) => ev.stopPropagation()}
              style={{ fontWeight: 700, fontSize: 13.5, color: "var(--primary)", textDecoration: "none" }}
            >
              {e.nombre}
            </Link>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{e.puesto || e.role?.nombre || "Sin puesto asignado"}</div>
            <div style={{ ...muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "id", label: "No. empleado",
      render: (e) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{e.employeeNumber ?? `EMP-${String(e.id).padStart(3, "0")}`}</span>,
      width: 120,
    },
    {
      key: "area", label: "Área",
      render: (e) => e.department?.nombre ? <Tag variant="default" size="sm">{e.department.nombre}</Tag> : <span style={muted}>Sin área</span>,
    },
    {
      key: "tipoContrato", label: "Contrato",
      render: (e) => {
        const t = e.tipoContrato;
        if (!t) return <span style={muted}>Sin definir</span>;
        return <Tag size="sm" variant={t === "Planta" ? "positive" : t === "Honorarios" ? "accent" : "warning"}>{t}</Tag>;
      },
      width: 120,
    },
    {
      key: "fechaIngreso", label: "Antigüedad",
      render: (e) => {
        const d = e.fechaIngreso ?? e.fechaCreacion;
        if (!d) return <span style={muted}>—</span>;
        const months = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{tenureLabel(months)}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Desde {shortDate(d)}</span>
          </div>
        );
      },
      width: 150,
    },
    {
      key: "estadoRRHH", label: "Situación",
      render: (e) => {
        const s = e.estadoRRHH ?? "Activo";
        return <Tag size="sm" dot variant={ESTADO_VARIANT[s] ?? "default"}>{s}</Tag>;
      },
      width: 120,
    },
    {
      key: "acciones", label: "Acciones", align: "right",
      render: (e) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }} aria-label={`Editar ficha de ${e.nombre}`}>Editar</Button>
          {cfg.canEdit && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={busyId === `emp-${e.id}`}
                onClick={(ev) => { ev.stopPropagation(); toggleActive(e); }}
              >
                {e.isActive === false ? "Reactivar" : "Dar de baja"}
              </Button>
              <Button size="sm" variant="danger" onClick={(ev) => { ev.stopPropagation(); deleteEmpleado(e); }} aria-label={`Eliminar a ${e.nombre}`}>
                Eliminar
              </Button>
            </>
          )}
        </div>
      ),
      width: 290,
    },
  ];

  const leaveColumns: Column<LeaveRequest>[] = [
    { key: "user", label: "Persona", render: (l) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.user?.nombre ?? "Sin asignar"}</div>
        <div style={muted}>{LEAVE_TYPE_LABEL[l.type] ?? "Otro"}</div>
      </div>
    ) },
    { key: "range", label: "Fechas", render: (l) => (
      <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        {shortDate(l.startDate)} – {shortDate(l.endDate)}
      </span>
    ), width: 210 },
    { key: "days", label: "Días", render: (l) => <strong style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{l.days}</strong>, width: 70, numeric: true, align: "right" },
    { key: "reason", label: "Motivo", render: (l) => l.reason ? <span style={{ fontSize: 12.5 }}>{l.reason}</span> : <span style={muted}>Sin motivo</span> },
    { key: "status", label: "Estado", width: 250, render: (l) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Tag size="sm" dot variant={l.status === "APPROVED" ? "positive" : l.status === "REJECTED" ? "danger" : l.status === "CANCELLED" ? "neutral" : "warning"}>
          {LEAVE_STATUS_LABEL[l.status] ?? "Sin estado"}
        </Tag>
        {l.status === "PENDING" && cfg.canEdit && (
          <>
            <Button size="sm" variant="primary" loading={busyId === `leave-${l.id}`} onClick={() => void approveLeave(l)}>Aprobar</Button>
            <Button size="sm" variant="ghost" onClick={() => rejectLeave(l)}>Rechazar</Button>
          </>
        )}
      </div>
    ) },
  ];

  const reviewColumns: Column<PerformanceReview>[] = [
    { key: "user", label: "Persona", render: (r) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.user?.nombre ?? "Sin asignar"}</div>
        <div style={muted}>Evaluó: {r.reviewer?.nombre ?? "Sin registrar"}</div>
      </div>
    ) },
    { key: "period", label: "Periodo", render: (r) => (
      <div>
        <Tag size="sm" variant="default">{REVIEW_PERIOD_LABEL[r.period] ?? "Otro"}</Tag>
        <div style={{ ...muted, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{shortDate(r.reviewDate)}</div>
      </div>
    ), width: 150 },
    { key: "overallRating", label: "Calificación", render: (r) => {
      const rounded = Math.max(0, Math.min(5, Math.round(r.overallRating)));
      return (
        <span
          aria-label={`${r.overallRating} de 5`}
          style={{ fontSize: 13, fontWeight: 700, color: r.overallRating >= 4 ? "var(--success)" : r.overallRating >= 3 ? "var(--text-primary)" : "var(--danger)" }}
        >
          <span aria-hidden="true">{"★".repeat(rounded)}{"☆".repeat(5 - rounded)}</span>{" "}
          <span style={{ fontWeight: 500, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{r.overallRating}</span>
        </span>
      );
    }, width: 160 },
    { key: "status", label: "Estado", width: 260, render: (r) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Tag size="sm" dot variant={r.status === "ACKNOWLEDGED" ? "positive" : r.status === "SUBMITTED" ? "accent" : "default"}>
          {REVIEW_STATUS_LABEL[r.status] ?? "Sin estado"}
        </Tag>
        {r.status === "DRAFT" && cfg.canEdit && (
          <Button size="sm" variant="primary" loading={busyId === `review-${r.id}`} onClick={() => void submitReview(r)}>Enviar</Button>
        )}
        {r.status === "SUBMITTED" && (
          <Button size="sm" variant="secondary" loading={busyId === `review-${r.id}`} onClick={() => void acknowledgeReview(r)}>Confirmar recibido</Button>
        )}
      </div>
    ) },
  ];

  if (!cfg.canAccess) return null;

  const initialLoading = loading && !loaded;
  const createDirty = Object.entries(createForm).some(([k, v]) => v !== (emptyCreateForm as Record<string, string>)[k]);
  const createFieldErr = (k: keyof typeof emptyCreateForm) => (createTouched ? createErrors[k] ?? null : null);
  const leaveDirty = Object.entries(leaveForm).some(([k, v]) => v !== (emptyLeaveForm as Record<string, string>)[k]);
  const reviewDirty = Boolean(reviewForm.userId || reviewForm.strengths || reviewForm.areasOfImprovement || reviewForm.goals || reviewForm.comments);
  const staffOptions = items.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombre}</option>);

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        title={cfg.title}
        subtitle={cfg.subtitle}
        density="ops"
        meta={
          loaded ? (
            <>
              <Tag variant="accent" dot>{stats.total} {stats.total === 1 ? "persona" : "personas"} en plantilla</Tag>
              <Tag variant="positive">{stats.activos} activas</Tag>
              {stats.vac > 0 && <Tag variant="default">{stats.vac} de vacaciones</Tag>}
            </>
          ) : undefined
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void fetchStaff()} loading={loading && loaded}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" onClick={openCreate}>Alta de personal</Button>
            )}
          </>
        }
      />

      <HrModuleRail />

      <PanelTabs
        ariaLabel="Secciones de plantilla"
        value={tab}
        onChange={setTab}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          badge: t.key === "permisos" && pendingLeavesCount > 0 ? pendingLeavesCount : undefined,
        }))}
      />

      {actionErr && (
        <InlineAlert
          variant="danger"
          message={actionErr}
          onDismiss={() => setActionErr(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      {tab === "plantilla" && (
        <>
          {loaded && loadError && (
            <InlineAlert
              variant="warning"
              title="No se pudo actualizar"
              message={`${loadError} Mostramos la última información cargada.`}
              action={<Button size="sm" variant="secondary" onClick={() => void fetchStaff()}>Reintentar</Button>}
              style={{ marginBottom: 12 }}
            />
          )}

          {loaded && (
            <>
              <MetricStrip
                ariaLabel="Resumen de plantilla"
                metrics={[
                  { label: "Plantilla total", value: stats.total, hint: `${stats.activos} activas`, onClick: () => setFilterEstado("") },
                  { label: "De vacaciones", value: stats.vac, hint: "Según su ficha", onClick: () => setFilterEstado("Vacaciones") },
                  {
                    label: "Con incidencia",
                    value: stats.incidencias,
                    tone: stats.incidencias > 0 ? "warning" : "success",
                    hint: stats.incidencias > 0 ? "Ver quiénes" : "Ninguna abierta",
                    onClick: () => setFilterEstado("Incidencia"),
                  },
                  { label: "Por honorarios", value: stats.honorarios, hint: "Sin prestaciones" },
                ]}
              />
              {stats.byDept.length > 0 && (
                <section
                  aria-label="Personas por área"
                  style={{ margin: "14px 0 16px", padding: "12px 14px", background: "var(--nx-panel-surface-overlay)", border: "1px solid var(--nx-panel-hairline)", borderRadius: "var(--nx-panel-radius-sm)", boxShadow: "var(--nx-panel-elev-1)" }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Personas por área</div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {stats.byDept.map(({ nombre, count }) => (
                      <li key={nombre} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 160px) 1fr 36px", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={nombre}>{nombre}</span>
                        <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }} aria-hidden="true">
                          <div style={{ height: "100%", width: `${(count / Math.max(stats.total, 1)) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <FilterToolbar
            search={{ value: filter, onChange: setFilter, placeholder: "Buscar por nombre, correo, puesto o área…", ariaLabel: "Buscar en la plantilla" }}
            selects={[
              ...(depts.length > 0 ? [{
                label: "Área",
                value: filterDept,
                onChange: setFilterDept,
                options: depts.map((d) => ({ value: String(d.id), label: d.nombre })),
                allowAll: true,
              }] : []),
              {
                label: "Situación",
                value: filterEstado,
                onChange: setFilterEstado,
                options: [
                  { value: "activo", label: "Activas" },
                  { value: "Vacaciones", label: "De vacaciones" },
                  { value: "Incidencia", label: "Con incidencia" },
                  { value: "Baja", label: "Dadas de baja" },
                ],
                allowAll: true,
              },
            ]}
            onClear={() => { setFilter(""); setFilterDept(""); setFilterEstado(""); }}
            resultCount={loaded ? filtered.length : null}
            rightActions={loaded && filtered.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filtered, [
                { key: "nombre", label: "Nombre" },
                { key: "email", label: "Correo" },
                { key: "puesto", label: "Puesto" },
                { key: "department", label: "Área", format: (v) => (v as HrEmpleado["department"])?.nombre ?? "—" },
                { key: "estadoRRHH", label: "Situación" },
                { key: "tipoContrato", label: "Contrato" },
              ], "plantilla")}>Exportar a Excel</Button>
            ) : undefined}
          />

          <Section title="Plantilla">
            {initialLoading && <SkeletonList rows={6} tableLike />}
            {!loaded && !loading && loadError && (
              <InlineAlert
                variant="danger"
                title="No se pudo cargar la plantilla"
                message={loadError}
                action={<Button size="sm" variant="secondary" onClick={() => void fetchStaff()}>Reintentar</Button>}
              />
            )}
            {loaded && (
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(e) => e.id}
                onRowClick={(e) => openEdit(e)}
                ariaLabel="Plantilla de personal"
                emptyTitle={items.length === 0 ? "Aún no hay personas registradas" : "Nadie coincide con los filtros"}
                emptyDescription={items.length === 0 ? "Da de alta a la primera persona para empezar." : "Prueba con otro nombre o quita los filtros."}
                emptyAction={items.length === 0 && cfg.canCreate
                  ? <Button size="sm" variant="primary" onClick={openCreate}>Alta de personal</Button>
                  : items.length > 0
                    ? <Button size="sm" variant="secondary" onClick={() => { setFilter(""); setFilterDept(""); setFilterEstado(""); }}>Quitar filtros</Button>
                    : undefined}
              />
            )}
          </Section>
        </>
      )}

      {tab === "permisos" && (
        <Section
          title="Solicitudes de permiso"
          subtitle="Vacaciones, incapacidades y otros permisos, con aprobación de Recursos Humanos."
          actions={cfg.canCreate ? (
            <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setLeaveForm({ ...emptyLeaveForm }); setLeaveSaveErr(null); setShowLeaveForm(true); }}>
              Nueva solicitud
            </Button>
          ) : undefined}
        >
          {leavesLoaded && (
            <MetricStrip
              ariaLabel="Resumen de permisos"
              metrics={[
                { label: "Por aprobar", value: leaveStats.pending, tone: leaveStats.pending > 0 ? "warning" : "success", onClick: () => setLeaveStatusFilter("PENDING") },
                { label: "Aprobados", value: leaveStats.approved, tone: "success", onClick: () => setLeaveStatusFilter("APPROVED") },
                { label: "Rechazados", value: leaveStats.rejected, onClick: () => setLeaveStatusFilter("REJECTED") },
              ]}
            />
          )}
          <div style={{ marginTop: 14 }}>
            <FilterToolbar
              selects={[
                {
                  label: "Estado",
                  value: leaveStatusFilter,
                  onChange: setLeaveStatusFilter,
                  options: Object.entries(LEAVE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
                  allowAll: true,
                },
                {
                  label: "Tipo",
                  value: leaveTypeFilter,
                  onChange: setLeaveTypeFilter,
                  options: LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABEL[t] })),
                  allowAll: true,
                },
              ]}
              onClear={() => { setLeaveStatusFilter(""); setLeaveTypeFilter(""); }}
              resultCount={leavesLoaded ? leaves.length : null}
            />
          </div>
          {leavesError && (
            <InlineAlert
              variant={leavesLoaded ? "warning" : "danger"}
              title={leavesLoaded ? "No se pudo actualizar" : "No se pudieron cargar los permisos"}
              message={leavesLoaded ? `${leavesError} Mostramos la última información cargada.` : leavesError}
              action={<Button size="sm" variant="secondary" onClick={() => void loadLeaves()}>Reintentar</Button>}
              style={{ marginBottom: 12 }}
            />
          )}
          {leavesLoading && !leavesLoaded ? (
            <SkeletonList rows={4} tableLike />
          ) : leavesLoaded ? (
            <DataTable
              columns={leaveColumns}
              rows={leaves}
              rowKey={(l) => l.id}
              ariaLabel="Solicitudes de permiso"
              emptyTitle="Sin solicitudes"
              emptyDescription={leaveStatusFilter || leaveTypeFilter ? "No hay solicitudes con estos filtros." : "Aún no se ha registrado ninguna solicitud de permiso."}
            />
          ) : null}
        </Section>
      )}

      {tab === "evaluaciones" && (
        <Section
          title="Evaluaciones de desempeño"
          subtitle="Calificación general, fortalezas, áreas de mejora y metas de cada persona."
          actions={cfg.canCreate ? (
            <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setReviewForm({ ...emptyReviewForm, reviewDate: isoLocal() }); setReviewSaveErr(null); setShowReviewForm(true); }}>
              Nueva evaluación
            </Button>
          ) : undefined}
        >
          {reviewsError && (
            <InlineAlert
              variant={reviewsLoaded ? "warning" : "danger"}
              title={reviewsLoaded ? "No se pudo actualizar" : "No se pudieron cargar las evaluaciones"}
              message={reviewsLoaded ? `${reviewsError} Mostramos la última información cargada.` : reviewsError}
              action={<Button size="sm" variant="secondary" onClick={() => void loadReviews()}>Reintentar</Button>}
              style={{ marginBottom: 12 }}
            />
          )}
          {reviewsLoading && !reviewsLoaded ? (
            <SkeletonList rows={4} tableLike />
          ) : reviewsLoaded ? (
            <DataTable
              columns={reviewColumns}
              rows={reviews}
              rowKey={(r) => r.id}
              ariaLabel="Evaluaciones de desempeño"
              emptyTitle="Sin evaluaciones"
              emptyDescription="Registra la primera evaluación de desempeño."
            />
          ) : null}
        </Section>
      )}

      {tab === "dashboard" && (
        <Section title="Resumen de Recursos Humanos" subtitle="Permisos y evaluaciones de toda la organización.">
          {dashboardError && (
            <InlineAlert
              variant={dashboard ? "warning" : "danger"}
              title={dashboard ? "No se pudo actualizar" : "No se pudo cargar el resumen"}
              message={dashboard ? `${dashboardError} Mostramos la última información cargada.` : dashboardError}
              action={<Button size="sm" variant="secondary" onClick={() => void loadDashboard()}>Reintentar</Button>}
              style={{ marginBottom: 12 }}
            />
          )}
          {dashboardLoading && !dashboard ? (
            <SkeletonList rows={2} />
          ) : dashboard ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <KpiCard label="Permisos por aprobar" value={dashboard.pendingLeaves} variant={dashboard.pendingLeaves > 0 ? "warning" : "positive"} />
              <KpiCard label="Aprobados este mes" value={dashboard.approvedLeavesThisMonth} variant="positive" />
              <KpiCard label="Evaluaciones registradas" value={dashboard.totalReviews} />
              <KpiCard
                label="Calificación promedio"
                value={Number(dashboard.avgRating ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                hint="De 1 a 5"
                variant={dashboard.avgRating >= 4 ? "positive" : dashboard.avgRating >= 3 ? "default" : "warning"}
              />
            </div>
          ) : null}
        </Section>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        dirty={editDirty && !saving}
        maxWidth={520}
        title={editing ? `Ficha de ${editing.nombre}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} loading={saving} disabled={!editDirty}>
              Guardar cambios
            </Button>
          </>
        }
      >
        {editing && (
          <>
            <p style={{ ...muted, margin: "0 0 16px" }}>{editing.email}</p>
            <FormGrid>
              <FormField label="Puesto" fullWidth optional>
                <input
                  value={editForm.puesto ?? ""}
                  onChange={(e) => patchEdit({ puesto: e.target.value })}
                  placeholder="Ej. Ingeniero de campo"
                  style={selectStyle}
                />
              </FormField>
              <FormField label="Tipo de contrato">
                <select value={editForm.tipoContrato ?? "Planta"} onChange={(e) => patchEdit({ tipoContrato: e.target.value })} style={selectStyle}>
                  {TIPO_CONTRATO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Situación laboral">
                <select value={editForm.estadoRRHH ?? "Activo"} onChange={(e) => patchEdit({ estadoRRHH: e.target.value })} style={selectStyle}>
                  {ESTADOS_RRHH.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Fecha de ingreso" optional>
                <input
                  type="date"
                  value={(editForm.fechaIngreso as string | undefined) ?? ""}
                  onChange={(e) => patchEdit({ fechaIngreso: e.target.value })}
                  style={selectStyle}
                />
              </FormField>
            </FormGrid>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 40, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={editForm.isActive !== false}
                onChange={(e) => patchEdit({ isActive: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14 }}>Cuenta activa en el sistema</span>
            </label>
            {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 12 }} />}
          </>
        )}
      </Modal>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        dirty={createDirty && !saving}
        maxWidth={560}
        title="Alta de personal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submitCreate()} loading={saving}>Dar de alta</Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Nombre completo" fullWidth error={createFieldErr("nombre")}>
            <input value={createForm.nombre} onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre y apellidos" autoComplete="off" style={selectStyle} />
          </FormField>
          <FormField label="Correo" error={createFieldErr("email")}>
            <input type="email" inputMode="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="usuario@nexara.com.mx" autoComplete="off" style={selectStyle} />
          </FormField>
          <FormField label="Contraseña temporal" error={createFieldErr("password")} hint="Mínimo 8 caracteres. La persona podrá cambiarla.">
            <input type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password" style={selectStyle} />
          </FormField>
          <FormField label="Rol" error={createFieldErr("roleId")} hint="Define a qué partes del sistema tendrá acceso.">
            <select value={createForm.roleId} onChange={(e) => setCreateForm((f) => ({ ...f, roleId: e.target.value }))} style={selectStyle}>
              <option value="">Elige un rol</option>
              {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
            </select>
          </FormField>
          <FormField label="Departamento" error={createFieldErr("departmentId")}>
            <select value={createForm.departmentId} onChange={(e) => setCreateForm((f) => ({ ...f, departmentId: e.target.value }))} style={selectStyle}>
              <option value="">Elige un departamento</option>
              {depts.map((d) => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
            </select>
          </FormField>
          <FormField label="Puesto" optional>
            <input value={createForm.puesto} onChange={(e) => setCreateForm((f) => ({ ...f, puesto: e.target.value }))}
              placeholder="Ej. Ingeniero de campo" style={selectStyle} />
          </FormField>
          <FormField label="Tipo de contrato">
            <select value={createForm.tipoContrato} onChange={(e) => setCreateForm((f) => ({ ...f, tipoContrato: e.target.value }))} style={selectStyle}>
              {TIPO_CONTRATO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
        </FormGrid>
        {createErr && <InlineAlert message={createErr} style={{ marginTop: 14 }} />}
      </Modal>

      <Modal
        open={showLeaveForm}
        onClose={() => { setShowLeaveForm(false); setLeaveSaveErr(null); }}
        dirty={leaveDirty && !leaveSaving}
        maxWidth={560}
        title="Nueva solicitud de permiso"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowLeaveForm(false); setLeaveSaveErr(null); }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveLeave()} loading={leaveSaving} disabled={!!leaveRangeError}>Crear solicitud</Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Persona">
            <select value={leaveForm.userId} onChange={(e) => setLeaveForm((f) => ({ ...f, userId: e.target.value }))} style={selectStyle}>
              <option value="">Elige a la persona</option>
              {staffOptions}
            </select>
          </FormField>
          <FormField label="Tipo de permiso">
            <select value={leaveForm.type} onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))} style={selectStyle}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
            </select>
          </FormField>
          <FormField label="Desde">
            <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} style={selectStyle} />
          </FormField>
          <FormField label="Hasta" error={leaveRangeError}>
            <input type="date" min={leaveForm.startDate || undefined} value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} style={selectStyle} />
          </FormField>
          <FormField label="Motivo" fullWidth optional>
            <input value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} style={selectStyle} />
          </FormField>
        </FormGrid>
        {leaveSaveErr && <InlineAlert message={leaveSaveErr} style={{ marginTop: 14 }} />}
      </Modal>

      <Modal
        open={showReviewForm}
        onClose={() => { setShowReviewForm(false); setReviewSaveErr(null); }}
        dirty={reviewDirty && !reviewSaving}
        maxWidth={640}
        title="Nueva evaluación de desempeño"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowReviewForm(false); setReviewSaveErr(null); }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveReview()} loading={reviewSaving} disabled={!!ratingError}>Crear evaluación</Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Persona">
            <select value={reviewForm.userId} onChange={(e) => setReviewForm((f) => ({ ...f, userId: e.target.value }))} style={selectStyle}>
              <option value="">Elige a la persona</option>
              {staffOptions}
            </select>
          </FormField>
          <FormField label="Periodo">
            <select value={reviewForm.period} onChange={(e) => setReviewForm((f) => ({ ...f, period: e.target.value }))} style={selectStyle}>
              {REVIEW_PERIODS.map((p) => <option key={p} value={p}>{REVIEW_PERIOD_LABEL[p]}</option>)}
            </select>
          </FormField>
          <FormField label="Fecha de evaluación">
            <input type="date" value={reviewForm.reviewDate} onChange={(e) => setReviewForm((f) => ({ ...f, reviewDate: e.target.value }))} style={selectStyle} />
          </FormField>
          <FormField label="Calificación general" hint="De 1 a 5; admite medios puntos." error={ratingError}>
            <input type="number" inputMode="decimal" min={1} max={5} step="0.5" value={reviewForm.overallRating} onChange={(e) => setReviewForm((f) => ({ ...f, overallRating: +e.target.value }))} style={selectStyle} />
          </FormField>
          <FormField label="Fortalezas" fullWidth optional>
            <textarea rows={2} value={reviewForm.strengths} onChange={(e) => setReviewForm((f) => ({ ...f, strengths: e.target.value }))} style={{ ...selectStyle, resize: "vertical" }} />
          </FormField>
          <FormField label="Áreas de mejora" fullWidth optional>
            <textarea rows={2} value={reviewForm.areasOfImprovement} onChange={(e) => setReviewForm((f) => ({ ...f, areasOfImprovement: e.target.value }))} style={{ ...selectStyle, resize: "vertical" }} />
          </FormField>
          <FormField label="Metas" fullWidth optional>
            <textarea rows={2} value={reviewForm.goals} onChange={(e) => setReviewForm((f) => ({ ...f, goals: e.target.value }))} style={{ ...selectStyle, resize: "vertical" }} />
          </FormField>
          <FormField label="Comentarios" fullWidth optional>
            <textarea rows={2} value={reviewForm.comments} onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))} style={{ ...selectStyle, resize: "vertical" }} />
          </FormField>
        </FormGrid>
        {reviewSaveErr && <InlineAlert message={reviewSaveErr} style={{ marginTop: 14 }} />}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

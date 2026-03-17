"use client";

import { useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import HelpTab from "@/components/HelpTab";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

type HrTab = "request-leave" | "my-leaves" | "my-reviews" | "manage-leaves" | "manage-reviews" | "create-review";

export default function HrPage() {
  const { user } = useUser();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canManage = hasPermission(user, PERMISSIONS.HR_MANAGE);
  const canApproveLeave = hasPermission(user, PERMISSIONS.HR_APPROVE_LEAVE);
  const canCreateReview = canManage;
  const isSuperAdmin = Boolean((user as any)?.isSuperAdmin || (user as any)?.superadmin);
  const isAdmin = !isSuperAdmin && canManage;

  const visibleTabs: HrTab[] = isSuperAdmin
    ? ["manage-leaves", "manage-reviews", "create-review"]
    : isAdmin
      ? ["request-leave", "my-leaves", "my-reviews", "manage-reviews", "create-review"]
      : ["request-leave", "my-leaves", "my-reviews"];

  const defaultTab: HrTab = isSuperAdmin ? "manage-leaves" : "request-leave";

  const [tab, setTab] = useState<HrTab>(defaultTab);

  const [leaveForm, setLeaveForm] = useState({
    type: "PERSONAL",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const [reviewForm, setReviewForm] = useState({
    userId: "",
    period: "MONTHLY",
    reviewDate: "",
    overallRating: "3",
    strengths: "",
    areasOfImprovement: "",
    goals: "",
    comments: "",
  });

  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab(defaultTab);
    }
  }, [tab, defaultTab, visibleTabs]);

  const parseRows = (payload: any) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  };

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${user?.token || ""}` }),
    [user?.token],
  );

  const loadData = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError("");
    try {
      const leavesUrl = new URL(`${API_URL}/hr/leaves`);
      const reviewsUrl = new URL(`${API_URL}/hr/reviews`);

      if (!canManage && user.id) {
        leavesUrl.searchParams.set("userId", String(user.id));
        reviewsUrl.searchParams.set("userId", String(user.id));
      }

      const [lv, rv, db, usersResponse] = await Promise.all([
        fetch(leavesUrl.toString(), { headers: authHeaders }).then((r) => r.json()),
        fetch(reviewsUrl.toString(), { headers: authHeaders }).then((r) => r.json()),
        fetch(`${API_URL}/hr/dashboard`, { headers: authHeaders }).then((r) => r.json()),
        canCreateReview
          ? fetch(`${API_URL}/users`, { headers: authHeaders }).then((r) => r.json())
          : Promise.resolve([]),
      ]);

      const listUsers = parseRows(usersResponse)
        .filter((item: any) => {
          const email = String(item?.email || "").toLowerCase();
          if (email === "gerencia@nexara.com.mx" || email === "developer@nexara.com.mx") return false;
          if (!user?.isSuperAdmin && user?.departmentId && item?.department?.id) {
            return user.departmentId === item.department.id;
          }
          return true;
        });

      setLeaves(parseRows(lv));
      setReviews(parseRows(rv));
      setDashboard(db?.data ?? db ?? null);
      setUsers(listUsers);
    } catch {
      setError("No se pudo cargar la información de RRHH");
      setLeaves([]);
      setReviews([]);
      setDashboard(null);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.token, canManage]);

  const myLeaves = useMemo(() => leaves.filter((row) => Number(row?.userId) === Number(user?.id)), [leaves, user?.id]);
  const myReviews = useMemo(() => reviews.filter((row) => Number(row?.userId) === Number(user?.id)), [reviews, user?.id]);

  const leaveTypeLabel: Record<string, string> = {
    VACATION: "Vacaciones",
    SICK: "Enfermedad",
    PERSONAL: "Personal",
    MATERNITY: "Maternidad",
    PATERNITY: "Paternidad",
    BEREAVEMENT: "Duelo",
    UNPAID: "Sin goce",
  };

  const periodLabel: Record<string, string> = {
    MONTHLY: "Mensual",
    QUARTERLY: "Trimestral",
    SEMI_ANNUAL: "Semestral",
    ANNUAL: "Anual",
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "#f59e0b",
      APPROVED: "#10b981",
      REJECTED: "#ef4444",
      CANCELLED: "#6b7280",
      DRAFT: "#8b5cf6",
      SUBMITTED: "#3b82f6",
      ACKNOWLEDGED: "#10b981",
    };
    return (
      <span
        style={{
          padding: "2px 10px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: `${colors[status] || "#6b7280"}22`,
          color: colors[status] || "#6b7280",
        }}
      >
        {status}
      </span>
    );
  };

  const requestLeave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.token) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/hr/leaves`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(leaveForm),
      });
      if (!response.ok) throw new Error("No se pudo registrar el permiso");
      setLeaveForm({ type: "PERSONAL", startDate: "", endDate: "", reason: "" });
      setTab("my-leaves");
      await loadData();
    } catch {
      setError("No se pudo registrar el permiso");
    } finally {
      setSaving(false);
    }
  };

  const createReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.token || !canCreateReview) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        userId: Number(reviewForm.userId),
        period: reviewForm.period,
        reviewDate: reviewForm.reviewDate,
        overallRating: Number(reviewForm.overallRating),
        strengths: reviewForm.strengths,
        areasOfImprovement: reviewForm.areasOfImprovement,
        goals: reviewForm.goals,
        comments: reviewForm.comments,
      };
      const response = await fetch(`${API_URL}/hr/reviews`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("No se pudo crear la evaluación");
      setReviewForm({
        userId: "",
        period: "MONTHLY",
        reviewDate: "",
        overallRating: "3",
        strengths: "",
        areasOfImprovement: "",
        goals: "",
        comments: "",
      });
      setTab("manage-reviews");
      await loadData();
    } catch {
      setError("No se pudo crear la evaluación");
    } finally {
      setSaving(false);
    }
  };

  const approveLeave = async (id: number) => {
    if (!user?.token || !canApproveLeave) return;
    const response = await fetch(`${API_URL}/hr/leaves/${id}/approve`, {
      method: "PATCH",
      headers: authHeaders,
    });
    if (response.ok) await loadData();
  };

  const rejectLeave = async (id: number) => {
    if (!user?.token || !canApproveLeave) return;
    const reason = window.prompt("Motivo de rechazo:", "") || "";
    const response = await fetch(`${API_URL}/hr/leaves/${id}/reject`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: reason }),
    });
    if (response.ok) await loadData();
  };

  const submitReview = async (id: number) => {
    if (!user?.token || !canManage) return;
    const response = await fetch(`${API_URL}/hr/reviews/${id}/submit`, {
      method: "PATCH",
      headers: authHeaders,
    });
    if (response.ok) await loadData();
  };

  const acknowledgeReview = async (id: number) => {
    if (!user?.token) return;
    const response = await fetch(`${API_URL}/hr/reviews/${id}/acknowledge`, {
      method: "PATCH",
      headers: authHeaders,
    });
    if (response.ok) await loadData();
  };

  const tabStyle = (current: HrTab) => ({
    padding: "10px 14px",
    background: tab === current ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === current ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer" as const,
  });

  const kpis = canManage
    ? [
        { label: "Permisos pendientes", value: dashboard?.pendingLeaves ?? 0, color: "#f59e0b" },
        { label: "Aprobados este mes", value: dashboard?.approvedLeavesThisMonth ?? 0, color: "#10b981" },
        { label: "Evaluaciones totales", value: dashboard?.totalReviews ?? 0, color: "#3b82f6" },
        { label: "Calificación promedio", value: Number(dashboard?.avgRating ?? 0).toFixed(1), color: "#8b5cf6" },
      ]
    : [
        { label: "Mis permisos", value: myLeaves.length, color: "#3b82f6" },
        { label: "Pendientes", value: myLeaves.filter((row) => row.status === "PENDING").length, color: "#f59e0b" },
        { label: "Aprobados", value: myLeaves.filter((row) => row.status === "APPROVED").length, color: "#10b981" },
        { label: "Mis evaluaciones", value: myReviews.length, color: "#8b5cf6" },
      ];

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE]}>
      <div style={{ display: "grid", gap: 20 }}>
        <HelpTab module="hr" user={user} />

        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>👥 Recursos Humanos</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Flujo por rol: colaboradores solicitan permisos y consultan evaluaciones; administración crea y gestiona evaluaciones; superadmin aprueba permisos.
          </p>
        </div>

        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {kpis.map((kpi) => (
              <div key={kpi.label} className="card" style={{ padding: 14, borderLeft: `4px solid ${kpi.color}` }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {visibleTabs.includes("request-leave") && <button style={tabStyle("request-leave")} onClick={() => setTab("request-leave")}>📝 Solicitar permiso</button>}
          {visibleTabs.includes("my-leaves") && <button style={tabStyle("my-leaves")} onClick={() => setTab("my-leaves")}>📋 Mis permisos</button>}
          {visibleTabs.includes("my-reviews") && <button style={tabStyle("my-reviews")} onClick={() => setTab("my-reviews")}>📊 Mis evaluaciones</button>}
          {visibleTabs.includes("manage-leaves") && canApproveLeave && <button style={tabStyle("manage-leaves")} onClick={() => setTab("manage-leaves")}>✅ Aprobar permisos</button>}
          {visibleTabs.includes("manage-reviews") && canManage && <button style={tabStyle("manage-reviews")} onClick={() => setTab("manage-reviews")}>🧭 Gestión evaluaciones</button>}
          {visibleTabs.includes("create-review") && canCreateReview && <button style={tabStyle("create-review")} onClick={() => setTab("create-review")}>➕ Crear evaluación</button>}
        </div>

        {error && <div className="card" style={{ padding: 12, color: "var(--danger)" }}>{error}</div>}
        {loading && <div className="card" style={{ padding: 24, textAlign: "center" }}>Cargando...</div>}

        {!loading && tab === "request-leave" && (
          <form className="card" style={{ display: "grid", gap: 12, padding: 16 }} onSubmit={requestLeave}>
            <h3 style={{ margin: 0 }}>Nueva solicitud de permiso</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <select className="input" value={leaveForm.type} onChange={(event) => setLeaveForm((prev) => ({ ...prev, type: event.target.value }))}>
                {Object.entries(leaveTypeLabel).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <input className="input" type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm((prev) => ({ ...prev, startDate: event.target.value }))} required />
              <input className="input" type="date" value={leaveForm.endDate} onChange={(event) => setLeaveForm((prev) => ({ ...prev, endDate: event.target.value }))} required />
            </div>
            <textarea className="input" placeholder="Motivo" value={leaveForm.reason} onChange={(event) => setLeaveForm((prev) => ({ ...prev, reason: event.target.value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="button-primary" disabled={saving}>Enviar solicitud</button>
            </div>
          </form>
        )}

        {!loading && tab === "create-review" && canCreateReview && (
          <form className="card" style={{ display: "grid", gap: 12, padding: 16 }} onSubmit={createReview}>
            <h3 style={{ margin: 0 }}>Crear evaluación de desempeño</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <select className="input" value={reviewForm.userId} onChange={(event) => setReviewForm((prev) => ({ ...prev, userId: event.target.value }))} required>
                <option value="">Selecciona colaborador</option>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>{item.nombre} ({item.email})</option>
                ))}
              </select>
              <select className="input" value={reviewForm.period} onChange={(event) => setReviewForm((prev) => ({ ...prev, period: event.target.value }))}>
                {Object.entries(periodLabel).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <input className="input" type="date" value={reviewForm.reviewDate} onChange={(event) => setReviewForm((prev) => ({ ...prev, reviewDate: event.target.value }))} required />
              <input className="input" type="number" min={1} max={5} step={0.1} value={reviewForm.overallRating} onChange={(event) => setReviewForm((prev) => ({ ...prev, overallRating: event.target.value }))} required />
            </div>
            <textarea className="input" placeholder="Fortalezas" value={reviewForm.strengths} onChange={(event) => setReviewForm((prev) => ({ ...prev, strengths: event.target.value }))} />
            <textarea className="input" placeholder="Áreas de mejora" value={reviewForm.areasOfImprovement} onChange={(event) => setReviewForm((prev) => ({ ...prev, areasOfImprovement: event.target.value }))} />
            <textarea className="input" placeholder="Objetivos" value={reviewForm.goals} onChange={(event) => setReviewForm((prev) => ({ ...prev, goals: event.target.value }))} />
            <textarea className="input" placeholder="Comentarios" value={reviewForm.comments} onChange={(event) => setReviewForm((prev) => ({ ...prev, comments: event.target.value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="button-primary" disabled={saving}>Guardar evaluación</button>
            </div>
          </form>
        )}

        {!loading && (tab === "my-leaves" || tab === "manage-leaves") && (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  <th style={{ padding: 10, textAlign: "left" }}>Empleado</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Tipo</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Inicio</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Fin</th>
                  <th style={{ padding: 10, textAlign: "center" }}>Días</th>
                  <th style={{ padding: 10, textAlign: "center" }}>Estado</th>
                  {tab === "manage-leaves" && canApproveLeave && <th style={{ padding: 10, textAlign: "center" }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {(tab === "my-leaves" ? myLeaves : leaves).map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 10 }}>{row.user?.nombre || "—"}</td>
                    <td style={{ padding: 10 }}>{leaveTypeLabel[row.type] || row.type}</td>
                    <td style={{ padding: 10 }}>{row.startDate?.slice(0, 10)}</td>
                    <td style={{ padding: 10 }}>{row.endDate?.slice(0, 10)}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{row.days}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{statusBadge(row.status)}</td>
                    {tab === "manage-leaves" && canApproveLeave && (
                      <td style={{ padding: 10, textAlign: "center" }}>
                        {row.status === "PENDING" ? (
                          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                            <button className="button-primary" type="button" onClick={() => approveLeave(row.id)}>Aprobar</button>
                            <button className="button-secondary" type="button" onClick={() => rejectLeave(row.id)}>Rechazar</button>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Sin acciones</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {(tab === "my-leaves" ? myLeaves : leaves).length === 0 && (
                  <tr>
                    <td colSpan={tab === "manage-leaves" && canApproveLeave ? 7 : 6} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                      Sin solicitudes de permiso
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (tab === "my-reviews" || tab === "manage-reviews") && (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  <th style={{ padding: 10, textAlign: "left" }}>Empleado</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Evaluador</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Período</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Fecha</th>
                  <th style={{ padding: 10, textAlign: "center" }}>Calificación</th>
                  <th style={{ padding: 10, textAlign: "center" }}>Estado</th>
                  <th style={{ padding: 10, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(tab === "my-reviews" ? myReviews : reviews).map((row) => {
                  const canAcknowledge = row.status === "SUBMITTED" && Number(row.userId) === Number(user?.id);
                  const canSubmit = canManage && row.status === "DRAFT";
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 10 }}>{row.user?.nombre || "—"}</td>
                      <td style={{ padding: 10 }}>{row.reviewer?.nombre || "—"}</td>
                      <td style={{ padding: 10 }}>{periodLabel[row.period] || row.period}</td>
                      <td style={{ padding: 10 }}>{row.reviewDate?.slice(0, 10)}</td>
                      <td style={{ padding: 10, textAlign: "center" }}>
                        <span style={{ fontWeight: 700 }}>{Number(row.overallRating || 0).toFixed(1)} / 5</span>
                      </td>
                      <td style={{ padding: 10, textAlign: "center" }}>{statusBadge(row.status)}</td>
                      <td style={{ padding: 10, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          {canSubmit && <button type="button" className="button-primary" onClick={() => submitReview(row.id)}>Enviar</button>}
                          {canAcknowledge && <button type="button" className="button-secondary" onClick={() => acknowledgeReview(row.id)}>Acusar recibido</button>}
                          {!canSubmit && !canAcknowledge && <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Sin acciones</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(tab === "my-reviews" ? myReviews : reviews).length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                      Sin evaluaciones de desempeño
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

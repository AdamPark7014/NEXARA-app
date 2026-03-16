"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '../../../../components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function HrPage() {
  const { user } = useUser();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"leaves" | "reviews">("leaves");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/hr/leaves`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/hr/reviews`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/hr/dashboard`, { headers }).then((r) => r.json()),
    ])
      .then(([lv, rv, db]) => {
        setLeaves(Array.isArray(lv) ? lv : lv.data || []);
        setReviews(Array.isArray(rv) ? rv : rv.data || []);
        setDashboard(db);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const pendingLeaves = leaves.filter((l: any) => l.status === "PENDING").length;
  const approvedLeaves = leaves.filter((l: any) => l.status === "APPROVED").length;

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer" as const,
  });

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

  const leaveTypeLabel: Record<string, string> = {
    VACATION: "Vacaciones",
    SICK: "Enfermedad",
    PERSONAL: "Personal",
    MATERNITY: "Maternidad",
    PATERNITY: "Paternidad",
    BEREAVEMENT: "Duelo",
    UNPAID: "Sin goce",
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="hr" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>👥 Recursos Humanos</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Solicitudes de permiso, evaluaciones de desempeño y métricas HR.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {[
              { label: "Permisos pendientes", value: dashboard.pendingLeaves, color: "#f59e0b" },
              { label: "Aprobados este mes", value: dashboard.approvedLeavesThisMonth, color: "#10b981" },
              { label: "Evaluaciones totales", value: dashboard.totalReviews, color: "#3b82f6" },
              { label: "Calificación promedio", value: dashboard.avgRating?.toFixed(1) || "—", color: "#8b5cf6" },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="card"
                style={{ padding: 16, borderLeft: `4px solid ${kpi.color}` }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={tabStyle("leaves")} onClick={() => setTab("leaves")}>
            📋 Permisos ({leaves.length})
          </button>
          <button style={tabStyle("reviews")} onClick={() => setTab("reviews")}>
            📊 Evaluaciones ({reviews.length})
          </button>
        </div>

        {loading && <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando...</div>}

        {/* Leaves Tab */}
        {!loading && tab === "leaves" && (
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
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                      Sin solicitudes de permiso
                    </td>
                  </tr>
                )}
                {leaves.map((l: any) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 10 }}>{l.user?.nombre || "—"}</td>
                    <td style={{ padding: 10 }}>{leaveTypeLabel[l.type] || l.type}</td>
                    <td style={{ padding: 10 }}>{l.startDate?.slice(0, 10)}</td>
                    <td style={{ padding: 10 }}>{l.endDate?.slice(0, 10)}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{l.days}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{statusBadge(l.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Reviews Tab */}
        {!loading && tab === "reviews" && (
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
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                      Sin evaluaciones de desempeño
                    </td>
                  </tr>
                )}
                {reviews.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 10 }}>{r.user?.nombre || "—"}</td>
                    <td style={{ padding: 10 }}>{r.reviewer?.nombre || "—"}</td>
                    <td style={{ padding: 10 }}>{r.period}</td>
                    <td style={{ padding: 10 }}>{r.reviewDate?.slice(0, 10)}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: r.overallRating >= 4 ? "#10b981" : r.overallRating >= 3 ? "#f59e0b" : "#ef4444" }}>
                        {r.overallRating?.toFixed(1)} / 5
                      </span>
                    </td>
                    <td style={{ padding: 10, textAlign: "center" }}>{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

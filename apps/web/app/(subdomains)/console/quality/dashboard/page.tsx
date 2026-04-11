"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

export default function QualityDashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl(`quality/ncr/dashboard`), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className="card" style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.QUALITY_VIEW, PERMISSIONS.QUALITY_INSPECT]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="quality" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📊 Dashboard de Calidad</h1>
          <p style={{ color: "var(--text-secondary)" }}>Resumen de inspecciones y reportes de no conformidad.</p>
        </div>

        {loading && <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando...</div>}

        {data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <StatCard label="Total inspecciones" value={data.totalInspections} color="var(--primary)" />
              <StatCard label="Aprobadas" value={data.passedInspections} color="#22c55e" />
              <StatCard label="Rechazadas" value={data.failedInspections} color="#ef4444" />
              <StatCard label="Tasa de aprobación" value={`${data.passRate}%`} color="#3b82f6" />
              <StatCard label="NCRs abiertas" value={data.openNCRs} color="#f59e0b" />
              <StatCard label="NCRs críticas" value={data.criticalNCRs} color="#dc2626" />
            </div>

            {data.recentNCRs?.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ marginBottom: 12 }}>NCRs recientes</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: 8 }}>#</th>
                        <th style={{ textAlign: "left", padding: 8 }}>Título</th>
                        <th style={{ textAlign: "left", padding: 8 }}>Severidad</th>
                        <th style={{ textAlign: "left", padding: 8 }}>Estatus</th>
                        <th style={{ textAlign: "left", padding: 8 }}>Reportado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentNCRs.map((ncr: any) => (
                        <tr key={ncr.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: 8, fontFamily: "monospace" }}>{ncr.ncrNumber}</td>
                          <td style={{ padding: 8 }}>{ncr.title}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                              background: ncr.severity === "CRITICAL" ? "#fee2e2" : ncr.severity === "MAJOR" ? "#fef3c7" : "#f0fdf4",
                              color: ncr.severity === "CRITICAL" ? "#dc2626" : ncr.severity === "MAJOR" ? "#d97706" : "#16a34a",
                            }}>
                              {ncr.severity}
                            </span>
                          </td>
                          <td style={{ padding: 8 }}>{ncr.status}</td>
                          <td style={{ padding: 8 }}>{ncr.reportedBy?.nombre || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}

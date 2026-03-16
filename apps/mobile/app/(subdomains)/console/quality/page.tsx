"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function QualityPage() {
  const { user } = useUser();
  const [inspections, setInspections] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"inspections" | "ncr">("inspections");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/quality/inspections`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/quality/ncr`, { headers }).then((r) => r.json()),
    ])
      .then(([ins, nc]) => {
        setInspections(Array.isArray(ins) ? ins : ins.data || []);
        setNcrs(Array.isArray(nc) ? nc : nc.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const passRate = inspections.length > 0 ? Math.round((inspections.filter((i: any) => i.result === "PASS").length / inspections.length) * 100) : 0;
  const openNCRs = ncrs.filter((n: any) => n.status === "OPEN").length;

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
  });

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.QUALITY_VIEW, PERMISSIONS.QUALITY_INSPECT]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🔍 Control de Calidad</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Inspecciones de calidad, checklists y reportes de no conformidad.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (inspections.length > 0 || ncrs.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Inspecciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{inspections.length}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Tasa de aprobación</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: passRate >= 80 ? "var(--success)" : "var(--danger)" }}>{passRate}%</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>NCRs abiertas</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: openNCRs > 0 ? "var(--danger)" : "var(--success)" }}>{openNCRs}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total NCRs</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{ncrs.length}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("inspections")} style={tabStyle("inspections")}>
            📋 Inspecciones
          </button>
          <button onClick={() => setTab("ncr")} style={tabStyle("ncr")}>
            ⚠️ No Conformidades {ncrs.length > 0 && `(${ncrs.length})`}
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "inspections" ? (
          inspections.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay inspecciones registradas.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Insp #</th>
                    <th>Tipo</th>
                    <th>Referencia</th>
                    <th>Inspector</th>
                    <th>Resultado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((i: any) => (
                    <tr key={i.id}>
                      <td><strong>QI-{i.id}</strong></td>
                      <td><span className="badge">{i.type}</span></td>
                      <td>{i.referenceType}: {i.referenceId}</td>
                      <td>{i.inspector?.nombre || i.inspectorId}</td>
                      <td>
                        <span className={i.result === "PASS" ? "status-active" : i.result === "FAIL" ? "status-inactive" : "status-pending"}>
                          {i.result || "Pendiente"}
                        </span>
                      </td>
                      <td>{new Date(i.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          ncrs.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay reportes de no conformidad.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>NCR #</th>
                    <th>Título</th>
                    <th>Severidad</th>
                    <th>Estado</th>
                    <th>Reportó</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {ncrs.map((n: any) => (
                    <tr key={n.id}>
                      <td><strong>NCR-{n.id}</strong></td>
                      <td>{n.title}</td>
                      <td><span className="badge">{n.severity}</span></td>
                      <td>
                        <span className={n.status === "CLOSED" ? "status-active" : n.status === "OPEN" ? "status-inactive" : "status-pending"}>
                          {n.status}
                        </span>
                      </td>
                      <td>{n.reportedBy?.nombre || n.reportedById}</td>
                      <td>{new Date(n.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </RoleGuard>
  );
}

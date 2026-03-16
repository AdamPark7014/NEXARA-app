"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function ManufacturingPage() {
  const { user } = useUser();
  const [boms, setBoms] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bom" | "centers">("bom");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/manufacturing/bom`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/manufacturing/bom/work-centers/all`, { headers }).then((r) => r.json()),
    ])
      .then(([b, wc]) => {
        setBoms(Array.isArray(b) ? b : b.data || []);
        setWorkCenters(Array.isArray(wc) ? wc : wc.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const activeBoms = boms.filter((b: any) => b.isActive).length;
  const activeWC = workCenters.filter((wc: any) => wc.isActive).length;
  const totalCapacity = workCenters.reduce((s: number, wc: any) => s + (wc.capacityPerHour || 0), 0);

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
    <RoleGuard anyPermissions={[PERMISSIONS.MANUFACTURING_VIEW, PERMISSIONS.BOM_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>⚙️ Manufactura / BOM</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Listas de materiales (BOM), rutas de producción y centros de trabajo.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (boms.length > 0 || workCenters.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>BOMs activos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{activeBoms}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{boms.length} totales</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Centros de trabajo</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{activeWC}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{workCenters.length} totales</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Capacidad total/h</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{totalCapacity}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("bom")} style={tabStyle("bom")}>📋 BOMs</button>
          <button onClick={() => setTab("centers")} style={tabStyle("centers")}>🏗️ Centros de Trabajo</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "bom" ? (
          boms.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay BOMs registrados.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Versión</th>
                    <th>Cantidad base</th>
                    <th>Componentes</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {boms.map((b: any) => (
                    <tr key={b.id}>
                      <td><strong>{b.productName}</strong></td>
                      <td>{b.version}</td>
                      <td>{b.baseQuantity} {b.unit}</td>
                      <td>{b._count?.components ?? b.components?.length ?? 0}</td>
                      <td>
                        <span className={b.isActive ? "status-active" : "status-inactive"}>
                          {b.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          workCenters.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay centros de trabajo.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Capacidad/h</th>
                    <th>Costo/h</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {workCenters.map((wc: any) => (
                    <tr key={wc.id}>
                      <td><strong>{wc.code}</strong></td>
                      <td>{wc.name}</td>
                      <td>{wc.capacityPerHour}</td>
                      <td>${Number(wc.costPerHour || 0).toFixed(2)}</td>
                      <td>
                        <span className={wc.isActive ? "status-active" : "status-inactive"}>
                          {wc.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
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

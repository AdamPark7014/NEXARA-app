"use client";
import { useEffect, useState, useMemo } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

interface Warehouse {
  id: number;
  name: string;
  code: string;
  location: string | null;
  type: string;
  isActive: boolean;
  _count?: { locations: number };
}

export default function WarehousePage() {
  const { user } = useUser();
  const [data, setData] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    if (!user?.token) return;
    fetch(`${API_URL}/warehouse`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then((d) => setData(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const stats = useMemo(() => {
    const active = data.filter((w) => w.isActive).length;
    const totalLocations = data.reduce((s, w) => s + (w._count?.locations ?? 0), 0);
    const types = [...new Set(data.map((w) => w.type).filter(Boolean))];
    return { total: data.length, active, inactive: data.length - active, totalLocations, types };
  }, [data]);

  const filtered = filterType ? data.filter((w) => w.type === filterType) : data;

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.WAREHOUSE_VIEW, PERMISSIONS.WAREHOUSE_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🏭 Almacenes</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Gestión de almacenes, ubicaciones y configuración logística de la cadena de suministro.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && data.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total almacenes</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.total}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Activos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{stats.active}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Inactivos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{stats.inactive}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total ubicaciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{stats.totalLocations}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        {!loading && stats.types.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setFilterType("")}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600,
                background: !filterType ? "var(--primary)" : "var(--card-bg)", color: !filterType ? "#fff" : "var(--text-primary)" }}>
              Todos ({stats.total})
            </button>
            {stats.types.map((t) => (
              <button key={t} onClick={() => setFilterType(t)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600,
                  background: filterType === t ? "var(--primary)" : "var(--card-bg)", color: filterType === t ? "#fff" : "var(--text-primary)" }}>
                {t} ({data.filter((w) => w.type === t).length})
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--text-secondary)" }}>No hay almacenes registrados.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Ubicación</th>
                  <th>Tipo</th>
                  <th>Ubicaciones</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.code}</strong></td>
                    <td>{w.name}</td>
                    <td>{w.location || "—"}</td>
                    <td><span className="badge">{w.type}</span></td>
                    <td style={{ fontWeight: 600 }}>{w._count?.locations ?? 0}</td>
                    <td>
                      <span className={w.isActive ? "status-active" : "status-inactive"}>
                        {w.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
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

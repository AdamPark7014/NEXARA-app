"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState, useMemo } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

const STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: "Operativo", UNDER_MAINTENANCE: "En mantenimiento",
  OUT_OF_SERVICE: "Fuera de servicio", RETIRED: "Retirado",
};

const CRITICALITY_COLORS: Record<string, string> = {
  LOW: "var(--success)", MEDIUM: "var(--warning)", HIGH: "var(--danger)", CRITICAL: "var(--danger)",
};

export default function AssetsPage() {
  const { user } = useUser();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl(`maintenance/assets`), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then((d) => setAssets(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const stats = useMemo(() => {
    const operational = assets.filter((a) => a.status === "OPERATIONAL").length;
    const maintenance = assets.filter((a) => a.status === "UNDER_MAINTENANCE").length;
    const outOfService = assets.filter((a) => a.status === "OUT_OF_SERVICE").length;
    const critical = assets.filter((a) => a.criticality === "HIGH" || a.criticality === "CRITICAL").length;
    const categories = [...new Set(assets.map((a) => a.category).filter(Boolean))];
    return { total: assets.length, operational, maintenance, outOfService, critical, categories };
  }, [assets]);

  const filtered = assets.filter((a) => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (searchTerm && !a.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !a.code?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ASSETS_VIEW, PERMISSIONS.ASSETS_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="assets" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🔧 Activos y Equipos</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Registro de activos, programas de mantenimiento preventivo y ciclo de vida de equipos industriales.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && assets.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total activos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.total}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{stats.categories.length} categorías</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Operativos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{stats.operational}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{stats.total > 0 ? Math.round((stats.operational / stats.total) * 100) : 0}% disponibilidad</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>En mantenimiento</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{stats.maintenance}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Criticidad alta</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{stats.critical}</p>
            </div>
          </div>
        )}

        {/* Search + Status Filters */}
        {!loading && assets.length > 0 && (
          <div className="card" style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input type="text" placeholder="Buscar por nombre o código..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", minWidth: 200 }} />
            {["", "OPERATIONAL", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"].map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: filterStatus === s ? "var(--primary)" : "var(--card-bg)", color: filterStatus === s ? "#fff" : "var(--text-primary)" }}>
                {s ? STATUS_LABELS[s] || s : "Todos"}
              </button>
            ))}
            <span style={{ color: "var(--text-secondary)", fontSize: 13, marginLeft: "auto" }}>{filtered.length} resultados</span>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--text-secondary)" }}>No hay activos registrados.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th>Criticidad</th>
                  <th>Instalación</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={a.id}>
                    <td><strong>{a.code}</strong></td>
                    <td>{a.name}</td>
                    <td><span className="badge">{a.category}</span></td>
                    <td>{a.location || "—"}</td>
                    <td>
                      <span className={a.status === "OPERATIONAL" ? "status-active" : a.status === "OUT_OF_SERVICE" ? "status-inactive" : "status-pending"}>
                        {STATUS_LABELS[a.status] || a.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: CRITICALITY_COLORS[a.criticality] || "var(--text-secondary)", fontWeight: 600 }}>
                        {a.criticality}
                      </span>
                    </td>
                    <td>{a.installDate ? new Date(a.installDate).toLocaleDateString("es-MX") : "—"}</td>
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

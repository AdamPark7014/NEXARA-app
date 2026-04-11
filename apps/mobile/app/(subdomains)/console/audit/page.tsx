"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState, useMemo } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

const ACTION_COLORS: Record<string, string> = {
  CREATE: "var(--success)", UPDATE: "var(--warning)", DELETE: "var(--danger)", LOGIN: "var(--primary)",
};

export default function AuditPage() {
  const { user } = useUser();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState("");
  const [filterAction, setFilterAction] = useState("");

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl(`audit`), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then((d) => setLogs(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayLogs = logs.filter((l) => new Date(l.createdAt).toDateString() === today);
    const creates = logs.filter((l) => l.action === "CREATE").length;
    const updates = logs.filter((l) => l.action === "UPDATE").length;
    const deletes = logs.filter((l) => l.action === "DELETE").length;
    const uniqueUsers = new Set(logs.map((l) => l.userId).filter(Boolean)).size;
    const entities = [...new Set(logs.map((l) => l.entity).filter(Boolean))];
    return { total: logs.length, today: todayLogs.length, creates, updates, deletes, uniqueUsers, entities };
  }, [logs]);

  const filtered = logs.filter((l) => {
    if (filterEntity && !l.entity?.toLowerCase().includes(filterEntity.toLowerCase())) return false;
    if (filterAction && l.action !== filterAction) return false;
    return true;
  });

  const actions = [...new Set(logs.map((l) => l.action).filter(Boolean))];

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.AUDIT_VIEW]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="audit" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🔒 Auditoría y Trazabilidad</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Registro completo de acciones del sistema, trazabilidad de cambios y cumplimiento normativo.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && logs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total registros</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.total}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Hoy</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{stats.today}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Creaciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{stats.creates}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Modificaciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{stats.updates}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Eliminaciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{stats.deletes}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Usuarios únicos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.uniqueUsers}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card" style={{ padding: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Buscar entidad..."
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", minWidth: 200 }}
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
          >
            <option value="">Todas las acciones</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <span style={{ color: "var(--text-secondary)", fontSize: 13, marginLeft: "auto" }}>
            {filtered.length} de {logs.length} registros
          </span>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--text-secondary)" }}>No hay registros de auditoría.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>ID Entidad</th>
                  <th>Usuario</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l: any) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 13 }}>{new Date(l.createdAt).toLocaleString("es-MX")}</td>
                    <td>
                      <span className="badge" style={{ color: ACTION_COLORS[l.action] || undefined, fontWeight: 600 }}>
                        {l.action}
                      </span>
                    </td>
                    <td>{l.entity}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{l.entityId || "—"}</td>
                    <td>{l.user?.nombre || l.userId}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{l.ipAddress || "—"}</td>
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

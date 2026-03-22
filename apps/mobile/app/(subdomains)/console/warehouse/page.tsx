"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

interface Warehouse {
  id: number;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  _count?: { locations: number; stockLevels: number };
}

export default function WarehousePage() {
  const { user } = useUser();
  const [data, setData] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", address: "", city: "", state: "" });

  const canManage = hasPermission(user, PERMISSIONS.WAREHOUSE_MANAGE);

  const loadData = useCallback(() => {
    if (!user?.token) return;
    setLoading(true);
    fetch(`${API_URL}/warehouse`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then((d) => setData(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  useEffect(() => { loadData(); }, [loadData]);

  const submitWarehouse = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/warehouse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          address: form.address || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setShowCreateModal(false);
      setForm({ code: "", name: "", address: "", city: "", state: "" });
      loadData();
    } catch {
      alert("Error al crear almacén. Verifica que el código no esté repetido.");
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const active = data.filter((w) => w.isActive).length;
    const totalLocations = data.reduce((s, w) => s + (w._count?.locations ?? 0), 0);
    const totalStockLevels = data.reduce((s, w) => s + (w._count?.stockLevels ?? 0), 0);
    const cities = [...new Set(data.map((w) => w.city).filter(Boolean))] as string[];
    return { total: data.length, active, inactive: data.length - active, totalLocations, totalStockLevels, cities };
  }, [data]);

  const filtered = data.filter((w) => {
    const text = `${w.code} ${w.name} ${w.city || ""} ${w.state || ""}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesCity = !filterCity || w.city === filterCity;
    return matchesSearch && matchesCity;
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 6,
    border: "1px solid var(--border-color)", background: "var(--bg-primary)",
    color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.WAREHOUSE_VIEW, PERMISSIONS.WAREHOUSE_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="warehouse" user={user} />
        <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🏭 Almacenes</h1>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Gestión de almacenes y su ubicación para entradas/salidas de inventario.
            </p>
          </div>
          {canManage && (
            <button onClick={() => setShowCreateModal(true)} style={{ padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
              + Nuevo almacén
            </button>
          )}
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
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Registros de stock</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.totalStockLevels}</p>
            </div>
          </div>
        )}

        {!loading && (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <input
                style={inputStyle}
                placeholder="Buscar por código, nombre, ciudad o estado"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select style={inputStyle} value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
                <option value="">Todas las ciudades</option>
                {stats.cities.map((city) => (<option key={city} value={city}>{city}</option>))}
              </select>
            </div>
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
                  <th>Dirección</th>
                  <th>Ciudad/Estado</th>
                  <th>Ubicaciones</th>
                  <th>Stock</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.code}</strong></td>
                    <td>{w.name}</td>
                    <td>{w.address || "—"}</td>
                    <td>{[w.city, w.state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{w._count?.locations ?? 0}</td>
                    <td style={{ fontWeight: 600 }}>{w._count?.stockLevels ?? 0}</td>
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

        {showCreateModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div className="card" style={{ width: "100%", maxWidth: 560, padding: 24 }}>
              <h2 style={{ color: "var(--primary)", marginBottom: 16 }}>🏭 Nuevo almacén</h2>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 2fr" }}>
                <div>
                  <label style={labelStyle}>Código *</label>
                  <input style={inputStyle} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="MTY-01" />
                </div>
                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Almacén Monterrey" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Dirección</label>
                  <input style={inputStyle} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Calle, número, colonia" />
                </div>
                <div>
                  <label style={labelStyle}>Ciudad</label>
                  <input style={inputStyle} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Monterrey" />
                </div>
                <div>
                  <label style={labelStyle}>Estado</label>
                  <input style={inputStyle} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="Nuevo León" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                <button onClick={() => { setShowCreateModal(false); setForm({ code: "", name: "", address: "", city: "", state: "" }); }} style={{ padding: "8px 16px", background: "var(--bg-secondary)", color: "var(--text-primary)", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={submitWarehouse} disabled={saving || !form.code.trim() || !form.name.trim()} style={{ padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Guardando..." : "Crear almacén"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

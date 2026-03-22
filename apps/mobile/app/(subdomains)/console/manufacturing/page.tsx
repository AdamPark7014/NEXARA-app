"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function ManufacturingPage() {
  const { user } = useUser();
  const [boms, setBoms] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bom" | "centers">("bom");
  const [saving, setSaving] = useState(false);
  const [showBomForm, setShowBomForm] = useState(false);
  const [showCenterForm, setShowCenterForm] = useState(false);

  const canManageBom = hasPermission(user, PERMISSIONS.BOM_MANAGE);
  const canManageCenters = hasPermission(user, PERMISSIONS.MANUFACTURING_MANAGE);

  const [bomForm, setBomForm] = useState({
    productId: "",
    name: "",
    version: "1.0",
    description: "",
    componentProductId: "",
    componentQuantity: "1",
    componentUnit: "PZ",
    wastePercent: "0",
  });

  const [centerForm, setCenterForm] = useState({
    code: "",
    name: "",
    description: "",
    capacityPerHour: "",
    costPerHour: "",
  });

  const loadData = () => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    setLoading(true);
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
  };

  useEffect(() => {
    if (!user?.token) return;
    loadData();
  }, [user?.token]);

  const submitBOM = async () => {
    if (!canManageBom) return;
    if (!bomForm.productId || !bomForm.name || !bomForm.componentProductId) {
      alert("Completa productId, nombre BOM y componente principal.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/manufacturing/bom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          productId: Number(bomForm.productId),
          name: bomForm.name,
          version: bomForm.version || "1.0",
          description: bomForm.description || undefined,
          components: [{
            componentProductId: Number(bomForm.componentProductId),
            quantity: Number(bomForm.componentQuantity || 1),
            unit: bomForm.componentUnit || "PZ",
            wastePercent: Number(bomForm.wastePercent || 0),
          }],
        }),
      });
      if (!res.ok) throw new Error();
      setShowBomForm(false);
      setBomForm({
        productId: "",
        name: "",
        version: "1.0",
        description: "",
        componentProductId: "",
        componentQuantity: "1",
        componentUnit: "PZ",
        wastePercent: "0",
      });
      loadData();
    } catch {
      alert("No se pudo crear el BOM.");
    } finally {
      setSaving(false);
    }
  };

  const submitWorkCenter = async () => {
    if (!canManageCenters) return;
    if (!centerForm.code || !centerForm.name) {
      alert("Completa código y nombre del centro de trabajo.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/manufacturing/bom/work-centers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          code: centerForm.code,
          name: centerForm.name,
          description: centerForm.description || undefined,
          capacityPerHour: centerForm.capacityPerHour ? Number(centerForm.capacityPerHour) : undefined,
          costPerHour: centerForm.costPerHour ? Number(centerForm.costPerHour) : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setShowCenterForm(false);
      setCenterForm({ code: "", name: "", description: "", capacityPerHour: "", costPerHour: "" });
      loadData();
    } catch {
      alert("No se pudo crear el centro de trabajo.");
    } finally {
      setSaving(false);
    }
  };

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
        <HelpTab module="manufacturing" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>⚙️ Manufactura / BOM</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Listas de materiales (BOM), rutas de producción y centros de trabajo.
          </p>
        </div>

        {(canManageBom || canManageCenters) && (
          <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canManageBom && (
                <button onClick={() => setShowBomForm((v) => !v)} style={tabStyle("bom")}>+ Nuevo BOM</button>
              )}
              {canManageCenters && (
                <button onClick={() => setShowCenterForm((v) => !v)} style={tabStyle("centers")}>+ Nuevo Centro de Trabajo</button>
              )}
            </div>

            {showBomForm && canManageBom && (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <input placeholder="Product ID" value={bomForm.productId} onChange={(e) => setBomForm((p) => ({ ...p, productId: e.target.value }))} />
                <input placeholder="Nombre BOM" value={bomForm.name} onChange={(e) => setBomForm((p) => ({ ...p, name: e.target.value }))} />
                <input placeholder="Versión (1.0)" value={bomForm.version} onChange={(e) => setBomForm((p) => ({ ...p, version: e.target.value }))} />
                <input placeholder="Componente Product ID" value={bomForm.componentProductId} onChange={(e) => setBomForm((p) => ({ ...p, componentProductId: e.target.value }))} />
                <input placeholder="Cantidad componente" value={bomForm.componentQuantity} onChange={(e) => setBomForm((p) => ({ ...p, componentQuantity: e.target.value }))} />
                <input placeholder="Unidad (PZ)" value={bomForm.componentUnit} onChange={(e) => setBomForm((p) => ({ ...p, componentUnit: e.target.value }))} />
                <input placeholder="Merma %" value={bomForm.wastePercent} onChange={(e) => setBomForm((p) => ({ ...p, wastePercent: e.target.value }))} />
                <input placeholder="Descripción (opcional)" value={bomForm.description} onChange={(e) => setBomForm((p) => ({ ...p, description: e.target.value }))} />
                <button onClick={submitBOM} disabled={saving} style={tabStyle("bom")}>{saving ? "Guardando..." : "Guardar BOM"}</button>
              </div>
            )}

            {showCenterForm && canManageCenters && (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <input placeholder="Código" value={centerForm.code} onChange={(e) => setCenterForm((p) => ({ ...p, code: e.target.value }))} />
                <input placeholder="Nombre" value={centerForm.name} onChange={(e) => setCenterForm((p) => ({ ...p, name: e.target.value }))} />
                <input placeholder="Capacidad por hora" value={centerForm.capacityPerHour} onChange={(e) => setCenterForm((p) => ({ ...p, capacityPerHour: e.target.value }))} />
                <input placeholder="Costo por hora" value={centerForm.costPerHour} onChange={(e) => setCenterForm((p) => ({ ...p, costPerHour: e.target.value }))} />
                <input placeholder="Descripción" value={centerForm.description} onChange={(e) => setCenterForm((p) => ({ ...p, description: e.target.value }))} />
                <button onClick={submitWorkCenter} disabled={saving} style={tabStyle("centers")}>{saving ? "Guardando..." : "Guardar Centro"}</button>
              </div>
            )}
          </div>
        )}

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

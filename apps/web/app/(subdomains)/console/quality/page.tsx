"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import HelpTab from '@/components/HelpTab';
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function QualityPage() {
  const { user } = useUser();
  const [inspections, setInspections] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"inspections" | "ncr">("inspections");
  const canInspect = hasPermission(user, PERMISSIONS.QUALITY_INSPECT);
  const canManage = hasPermission(user, PERMISSIONS.QUALITY_MANAGE);

  const [inspectionForm, setInspectionForm] = useState({
    type: "IN_PROCESS",
    productId: "",
    lotId: "",
    productionOrderId: "",
    purchaseOrderId: "",
    inspectedQty: "",
    inspectionDate: new Date().toISOString().slice(0, 10),
    notes: "",
    checklistText: "Dimensión|Dentro de tolerancia\nAcabado|Sin defectos visibles",
  });

  const [ncrForm, setNcrForm] = useState({
    inspectionId: "",
    productId: "",
    title: "",
    description: "",
    severity: "MAJOR",
    rootCause: "",
    correctiveAction: "",
    preventiveAction: "",
  });

  const loadData = () => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    setLoading(true);
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
  };

  useEffect(() => {
    if (!user?.token) return;
    loadData();
  }, [user?.token]);

  const passRate = inspections.length > 0
    ? Math.round((inspections.filter((i: any) => i.result === "PASSED" || i.result === "PASS").length / inspections.length) * 100)
    : 0;
  const openNCRs = ncrs.filter((n: any) => n.status === "OPEN").length;

  const createInspection = async () => {
    if (!canInspect) return;
    if (!inspectionForm.inspectedQty || !inspectionForm.inspectionDate) {
      alert("Cantidad inspeccionada y fecha son obligatorias.");
      return;
    }
    const checklist = inspectionForm.checklistText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [parameter, specification] = line.split("|");
        return { parameter: (parameter || "").trim(), specification: (specification || "").trim() || undefined };
      })
      .filter((x) => x.parameter);
    if (!checklist.length) {
      alert("Debes capturar al menos un criterio de checklist.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/quality/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          type: inspectionForm.type,
          productId: inspectionForm.productId ? Number(inspectionForm.productId) : undefined,
          lotId: inspectionForm.lotId ? Number(inspectionForm.lotId) : undefined,
          productionOrderId: inspectionForm.productionOrderId ? Number(inspectionForm.productionOrderId) : undefined,
          purchaseOrderId: inspectionForm.purchaseOrderId ? Number(inspectionForm.purchaseOrderId) : undefined,
          inspectedQty: Number(inspectionForm.inspectedQty),
          inspectionDate: inspectionForm.inspectionDate,
          notes: inspectionForm.notes || undefined,
          checklist,
        }),
      });
      if (!res.ok) throw new Error();
      setInspectionForm((p) => ({ ...p, productId: "", lotId: "", productionOrderId: "", purchaseOrderId: "", inspectedQty: "", notes: "" }));
      loadData();
    } catch {
      alert("No se pudo crear la inspección.");
    } finally {
      setSaving(false);
    }
  };

  const createNCR = async () => {
    if (!canManage) return;
    if (!ncrForm.title || !ncrForm.description) {
      alert("Título y descripción son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/quality/ncr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          inspectionId: ncrForm.inspectionId ? Number(ncrForm.inspectionId) : undefined,
          productId: ncrForm.productId ? Number(ncrForm.productId) : undefined,
          title: ncrForm.title,
          description: ncrForm.description,
          severity: ncrForm.severity,
          rootCause: ncrForm.rootCause || undefined,
          correctiveAction: ncrForm.correctiveAction || undefined,
          preventiveAction: ncrForm.preventiveAction || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setNcrForm({ inspectionId: "", productId: "", title: "", description: "", severity: "MAJOR", rootCause: "", correctiveAction: "", preventiveAction: "" });
      loadData();
    } catch {
      alert("No se pudo crear la no conformidad.");
    } finally {
      setSaving(false);
    }
  };

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
        <HelpTab module="quality" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🔍 Control de Calidad</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Inspecciones de calidad, checklists y reportes de no conformidad.
          </p>
        </div>

        {(canInspect || canManage) && (
          <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
            {canInspect && (
              <div style={{ display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Nueva Inspección</h3>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                  <select value={inspectionForm.type} onChange={(e) => setInspectionForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="INCOMING">Incoming</option>
                    <option value="IN_PROCESS">In Process</option>
                    <option value="FINAL">Final</option>
                    <option value="RANDOM">Random</option>
                  </select>
                  <input placeholder="Cantidad inspeccionada" value={inspectionForm.inspectedQty} onChange={(e) => setInspectionForm((p) => ({ ...p, inspectedQty: e.target.value }))} />
                  <input type="date" value={inspectionForm.inspectionDate} onChange={(e) => setInspectionForm((p) => ({ ...p, inspectionDate: e.target.value }))} />
                  <input placeholder="Product ID (opcional)" value={inspectionForm.productId} onChange={(e) => setInspectionForm((p) => ({ ...p, productId: e.target.value }))} />
                  <input placeholder="Lot ID (opcional)" value={inspectionForm.lotId} onChange={(e) => setInspectionForm((p) => ({ ...p, lotId: e.target.value }))} />
                  <input placeholder="Production Order ID" value={inspectionForm.productionOrderId} onChange={(e) => setInspectionForm((p) => ({ ...p, productionOrderId: e.target.value }))} />
                  <input placeholder="Purchase Order ID" value={inspectionForm.purchaseOrderId} onChange={(e) => setInspectionForm((p) => ({ ...p, purchaseOrderId: e.target.value }))} />
                  <input placeholder="Notas" value={inspectionForm.notes} onChange={(e) => setInspectionForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
                <textarea
                  rows={3}
                  placeholder="Checklist (una línea por criterio): Parámetro|Especificación"
                  value={inspectionForm.checklistText}
                  onChange={(e) => setInspectionForm((p) => ({ ...p, checklistText: e.target.value }))}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <button onClick={createInspection} disabled={saving} style={{ padding: "8px 12px", border: "none", borderRadius: 8, background: "var(--primary)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Guardando..." : "Crear inspección"}
                </button>
              </div>
            )}

            {canManage && (
              <div style={{ display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Nueva No Conformidad (NCR)</h3>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                  <input placeholder="Inspection ID (opcional)" value={ncrForm.inspectionId} onChange={(e) => setNcrForm((p) => ({ ...p, inspectionId: e.target.value }))} />
                  <input placeholder="Product ID (opcional)" value={ncrForm.productId} onChange={(e) => setNcrForm((p) => ({ ...p, productId: e.target.value }))} />
                  <input placeholder="Título" value={ncrForm.title} onChange={(e) => setNcrForm((p) => ({ ...p, title: e.target.value }))} />
                  <select value={ncrForm.severity} onChange={(e) => setNcrForm((p) => ({ ...p, severity: e.target.value }))}>
                    <option value="MINOR">Minor</option>
                    <option value="MAJOR">Major</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  <input placeholder="Causa raíz" value={ncrForm.rootCause} onChange={(e) => setNcrForm((p) => ({ ...p, rootCause: e.target.value }))} />
                  <input placeholder="Acción correctiva" value={ncrForm.correctiveAction} onChange={(e) => setNcrForm((p) => ({ ...p, correctiveAction: e.target.value }))} />
                  <input placeholder="Acción preventiva" value={ncrForm.preventiveAction} onChange={(e) => setNcrForm((p) => ({ ...p, preventiveAction: e.target.value }))} />
                </div>
                <textarea
                  rows={2}
                  placeholder="Descripción"
                  value={ncrForm.description}
                  onChange={(e) => setNcrForm((p) => ({ ...p, description: e.target.value }))}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <button onClick={createNCR} disabled={saving} style={{ padding: "8px 12px", border: "none", borderRadius: 8, background: "#ef4444", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Guardando..." : "Crear NCR"}
                </button>
              </div>
            )}
          </div>
        )}

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
                      <td>
                        {i.productId ? `Producto ${i.productId}` : i.purchaseOrderId ? `PO ${i.purchaseOrderId}` : i.productionOrderId ? `OP ${i.productionOrderId}` : "—"}
                      </td>
                      <td>{i.inspector?.nombre || i.inspectorId}</td>
                      <td>
                        <span className={i.result === "PASSED" || i.result === "PASS" ? "status-active" : i.result === "FAILED" || i.result === "FAIL" ? "status-inactive" : "status-pending"}>
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
                      <td><strong>{n.ncrNumber || `NCR-${n.id}`}</strong></td>
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

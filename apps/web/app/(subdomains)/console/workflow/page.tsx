"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

function deriveStatus(i: any): string {
  if (i.isComplete) return "COMPLETED";
  if (i.isCancelled) return "REJECTED";
  return "ACTIVE";
}

export default function WorkflowPage() {
  const { user } = useUser();
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "instances" | "definitions" | "create">("pending");

  // Form state for creating definition
  const [formName, setFormName] = useState("");
  const [formEntity, setFormEntity] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSteps, setFormSteps] = useState<Array<{ name: string; approverUserId: string }>>([{ name: "", approverUserId: "" }]);
  const [saving, setSaving] = useState(false);

  const fetchAll = () => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    setLoading(true);
    Promise.all([
      fetch(buildApiUrl(`workflow/definitions`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`workflow/instances`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`workflow/instances/pending`), { headers }).then((r) => r.json()),
    ])
      .then(([defs, inst, pend]) => {
        setDefinitions(Array.isArray(defs) ? defs : defs.data || []);
        setInstances(Array.isArray(inst) ? inst : inst.data || []);
        setPending(Array.isArray(pend) ? pend : pend.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [user?.token]);

  const handleCreateDefinition = async () => {
    if (!formName.trim() || !formEntity.trim() || formSteps.some(s => !s.name.trim())) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`workflow/definitions`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          name: formName.trim(),
          entityType: formEntity.trim(),
          description: formDesc.trim() || undefined,
          steps: formSteps.map((s, i) => ({
            name: s.name.trim(),
            stepNumber: i + 1,
            approverUserId: s.approverUserId ? Number(s.approverUserId) : undefined,
          })),
        }),
      });
      if (res.ok) {
        setFormName(""); setFormEntity(""); setFormDesc(""); setFormSteps([{ name: "", approverUserId: "" }]);
        setTab("definitions");
        fetchAll();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleApprove = async (instanceId: number, decision: "APPROVED" | "REJECTED") => {
    await fetch(buildApiUrl(`workflow/instances/${instanceId}/approve`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
      body: JSON.stringify({ decision }),
    });
    fetchAll();
  };

  const completedWF = instances.filter((i: any) => i.isComplete).length;
  const activeDefinitions = definitions.filter((d: any) => d.status === "ACTIVE").length;

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500 as const,
    cursor: "pointer" as const,
  });

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = { COMPLETED: "#10b981", REJECTED: "#ef4444", ACTIVE: "#3b82f6" };
    return (
      <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${colors[status] || "#6b7280"}22`, color: colors[status] || "#6b7280" }}>
        {status === "COMPLETED" ? "Completado" : status === "REJECTED" ? "Rechazado" : "Activo"}
      </span>
    );
  };

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", width: "100%" as const, fontSize: 14 };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🔄 Flujos de Aprobación</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Definición de workflows, instancias activas y aprobaciones pendientes.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (pending.length > 0 || instances.length > 0 || definitions.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Pendientes</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: pending.length > 0 ? "#f59e0b" : "#10b981" }}>{pending.length}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Instancias totales</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{instances.length}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Completados</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>{completedWF}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Flujos activos</p>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{activeDefinitions}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{definitions.length} definidos</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("pending")} style={tabStyle("pending")}>
            ⏳ Pendientes {pending.length > 0 && `(${pending.length})`}
          </button>
          <button onClick={() => setTab("instances")} style={tabStyle("instances")}>
            📋 Instancias
          </button>
          <button onClick={() => setTab("definitions")} style={tabStyle("definitions")}>
            ⚙️ Definiciones
          </button>
          <button onClick={() => setTab("create")} style={tabStyle("create")}>
            ➕ Crear flujo
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "pending" ? (
          pending.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>✅ Sin aprobaciones pendientes.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Flujo</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Paso actual</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Solicitante</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Inicio</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p: any) => {
                    const stepDef = p.workflow?.steps?.find((s: any) => s.stepNumber === p.currentStep);
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 10 }}><strong>{p.workflow?.name || `WF-${p.workflowId}`}</strong></td>
                        <td style={{ padding: 10 }}>{stepDef?.name || `Paso ${p.currentStep}`}</td>
                        <td style={{ padding: 10 }}>{p.startedBy?.nombre || "—"}</td>
                        <td style={{ padding: 10 }}>{p.startedAt ? new Date(p.startedAt).toLocaleDateString("es-MX") : "—"}</td>
                        <td style={{ padding: 10, textAlign: "center", display: "flex", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => handleApprove(p.id, "APPROVED")} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                            ✓ Aprobar
                          </button>
                          <button onClick={() => handleApprove(p.id, "REJECTED")} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                            ✗ Rechazar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "instances" ? (
          instances.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay instancias de flujo.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>ID</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Flujo</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Estado</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Paso</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Inicio</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Completado</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((i: any) => (
                    <tr key={i.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 10 }}><strong>WI-{i.id}</strong></td>
                      <td style={{ padding: 10 }}>{i.workflow?.name || `WF-${i.workflowId}`}</td>
                      <td style={{ padding: 10, textAlign: "center" }}>{statusBadge(deriveStatus(i))}</td>
                      <td style={{ padding: 10, textAlign: "center" }}>{i.currentStep}</td>
                      <td style={{ padding: 10 }}>{i.startedAt ? new Date(i.startedAt).toLocaleDateString("es-MX") : "—"}</td>
                      <td style={{ padding: 10 }}>{i.completedAt ? new Date(i.completedAt).toLocaleDateString("es-MX") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "definitions" ? (
          definitions.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay flujos definidos. Usa el tab &quot;Crear flujo&quot; para agregar uno.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {definitions.map((d: any) => (
                <div key={d.id} className="card" style={{ padding: 16 }}>
                  <h3 style={{ color: "var(--primary)", marginBottom: 4 }}>{d.name}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 8 }}>
                    {d.description || "Sin descripción"}
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 6, background: "var(--bg-secondary)", fontSize: 12 }}>{d.entityType}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                      {d.steps?.length ?? 0} pasos
                    </span>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: d.status === "ACTIVE" ? "#10b98122" : "#ef444422", color: d.status === "ACTIVE" ? "#10b981" : "#ef4444" }}>
                      {d.status === "ACTIVE" ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  {/* Show steps */}
                  {d.steps?.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>Pasos:</p>
                      {d.steps.map((s: any) => (
                        <div key={s.id} style={{ fontSize: 13, padding: "2px 0", display: "flex", gap: 6 }}>
                          <span style={{ color: "var(--primary)", fontWeight: 600 }}>{s.stepNumber}.</span>
                          <span>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          /* Create definition form */
          <div className="card" style={{ padding: 24, display: "grid", gap: 16, maxWidth: 600 }}>
            <h3 style={{ color: "var(--primary)" }}>Crear nueva definición de flujo</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Nombre del flujo *</label>
              <input style={inputStyle} placeholder="Ej: Aprobación de Orden de Compra" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Tipo de entidad *</label>
              <input style={inputStyle} placeholder="Ej: PurchaseOrder, Expense, LeaveRequest" value={formEntity} onChange={(e) => setFormEntity(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Descripción</label>
              <input style={inputStyle} placeholder="Descripción opcional del flujo" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Pasos de aprobación *</label>
              {formSteps.map((step, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: "var(--primary)", minWidth: 24 }}>{idx + 1}.</span>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={`Nombre del paso ${idx + 1}`}
                    value={step.name}
                    onChange={(e) => { const s = [...formSteps]; s[idx] = { ...s[idx], name: e.target.value }; setFormSteps(s); }}
                  />
                  <input
                    style={{ ...inputStyle, width: 120 }}
                    placeholder="User ID"
                    value={step.approverUserId}
                    onChange={(e) => { const s = [...formSteps]; s[idx] = { ...s[idx], approverUserId: e.target.value }; setFormSteps(s); }}
                  />
                  {formSteps.length > 1 && (
                    <button onClick={() => setFormSteps(formSteps.filter((_, i) => i !== idx))} style={{ background: "#ef444422", color: "#ef4444", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontWeight: 700 }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setFormSteps([...formSteps, { name: "", approverUserId: "" }])} style={{ padding: "6px 14px", borderRadius: 8, border: "1px dashed var(--border)", background: "transparent", color: "var(--primary)", cursor: "pointer", fontSize: 13 }}>
                + Agregar paso
              </button>
            </div>
            <button
              onClick={handleCreateDefinition}
              disabled={saving || !formName.trim() || !formEntity.trim()}
              style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Guardando..." : "Crear definición de flujo"}
            </button>
          </div>
        )}
        <HelpTab module="workflow" user={user} />
      </div>
    </RoleGuard>
  );
}

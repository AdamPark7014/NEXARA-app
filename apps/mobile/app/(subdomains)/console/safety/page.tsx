"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function SafetyPage() {
  const { user } = useUser();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [permits, setPermits] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"incidents" | "permits" | "training">("incidents");
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [showPermitForm, setShowPermitForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ type: "", severity: "MEDIUM", location: "", description: "" });
  const [permitForm, setPermitForm] = useState({ type: "APT", location: "", validDays: 30, description: "" });
  const [savingIncident, setSavingIncident] = useState(false);
  const [savingPermit, setSavingPermit] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/safety/incidents`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/safety/permits`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/safety/training`, { headers }).then((r) => r.json()),
    ])
      .then(([inc, per, tr]) => {
        setIncidents(Array.isArray(inc) ? inc : inc.data || []);
        setPermits(Array.isArray(per) ? per : per.data || []);
        setTraining(Array.isArray(tr) ? tr : tr.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const handleCreateIncident = async () => {
    if (!user?.token || !incidentForm.type) return;
    setSavingIncident(true);
    try {
      const res = await fetch(`${API_URL}/safety/incidents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...incidentForm, occurredAt: new Date() }),
      });
      if (res.ok) {
        const newIncident = await res.json();
        setIncidents([newIncident, ...incidents]);
        setIncidentForm({ type: "", severity: "MEDIUM", location: "", description: "" });
        setShowIncidentForm(false);
      }
    } catch (e) { console.error(e); }
    finally { setSavingIncident(false); }
  };

  const handleCreatePermit = async () => {
    if (!user?.token || !permitForm.type) return;
    setSavingPermit(true);
    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + permitForm.validDays);
      const res = await fetch(`${API_URL}/safety/permits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...permitForm, validUntil }),
      });
      if (res.ok) {
        const newPermit = await res.json();
        setPermits([newPermit, ...permits]);
        setPermitForm({ type: "APT", location: "", validDays: 30, description: "" });
        setShowPermitForm(false);
      }
    } catch (e) { console.error(e); }
    finally { setSavingPermit(false); }
  };

  const openIncidents = incidents.filter((i: any) => i.status === "OPEN").length;
  const activePermits = permits.filter((p: any) => p.status === "APPROVED").length;
  const expiredTraining = training.filter((t: any) => t.expiresAt && new Date(t.expiresAt) < new Date()).length;

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
    <RoleGuard anyPermissions={[PERMISSIONS.SAFETY_VIEW, PERMISSIONS.SAFETY_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="safety" user={user} />
        
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🦺 Seguridad Industrial</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Incidentes, permisos de trabajo y capacitaciones de seguridad.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (incidents.length > 0 || permits.length > 0 || training.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Incidentes abiertos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: openIncidents > 0 ? "var(--danger)" : "var(--success)" }}>{openIncidents}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{incidents.length} totales</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Permisos activos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{activePermits}</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{permits.length} totales</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Capacitaciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{training.length}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Certs. vencidos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: expiredTraining > 0 ? "var(--danger)" : "var(--success)" }}>{expiredTraining}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("incidents")} style={tabStyle("incidents")}>
            🚨 Incidentes
          </button>
          <button onClick={() => setTab("permits")} style={tabStyle("permits")}>
            📋 Permisos de Trabajo
          </button>
          <button onClick={() => setTab("training")} style={tabStyle("training")}>
            🎓 Capacitaciones
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "incidents" ? (
          incidents.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay incidentes reportados.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>INC #</th>
                    <th>Tipo</th>
                    <th>Severidad</th>
                    <th>Ubicación</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((i: any) => (
                    <tr key={i.id}>
                      <td><strong>INC-{i.id}</strong></td>
                      <td><span className="badge">{i.type}</span></td>
                      <td><span className="badge">{i.severity}</span></td>
                      <td>{i.location || "—"}</td>
                      <td>
                        <span className={i.status === "CLOSED" ? "status-active" : i.status === "OPEN" ? "status-inactive" : "status-pending"}>
                          {i.status}
                        </span>
                      </td>
                      <td>{new Date(i.occurredAt || i.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "permits" ? (
          permits.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay permisos de trabajo.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Permiso #</th>
                    <th>Tipo</th>
                    <th>Ubicación</th>
                    <th>Válido hasta</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p: any) => (
                    <tr key={p.id}>
                      <td><strong>PT-{p.id}</strong></td>
                      <td><span className="badge">{p.type}</span></td>
                      <td>{p.location || "—"}</td>
                      <td>{p.validUntil ? new Date(p.validUntil).toLocaleDateString("es-MX") : "—"}</td>
                      <td>
                        <span className={p.status === "APPROVED" ? "status-active" : p.status === "REJECTED" ? "status-inactive" : "status-pending"}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          training.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay capacitaciones registradas.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>Empleado</th>
                    <th>Completado</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {training.map((t: any) => {
                    const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
                    return (
                      <tr key={t.id}>
                        <td><strong>{t.courseName}</strong></td>
                        <td>{t.employee?.nombre || t.employeeId}</td>
                        <td>{t.completedAt ? new Date(t.completedAt).toLocaleDateString("es-MX") : "—"}</td>
                        <td style={{ color: expired ? "var(--danger)" : undefined }}>
                          {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString("es-MX") : "—"}
                        </td>
                        <td>
                          <span className={expired ? "status-inactive" : "status-active"}>
                            {expired ? "Vencido" : "Vigente"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </RoleGuard>
  );
}

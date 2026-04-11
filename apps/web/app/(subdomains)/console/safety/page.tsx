"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

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
    setLoading(true);
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(buildApiUrl(`safety/incidents`), { headers }).then(r => r.json()),
      fetch(buildApiUrl(`safety/permits`), { headers }).then(r => r.json()),
      fetch(buildApiUrl(`safety/training`), { headers }).then(r => r.json()),
    ])
      .then(([inc, per, tr]) => {
        setIncidents(Array.isArray(inc) ? inc : inc.data || []);
        setPermits(Array.isArray(per) ? per : per.data || []);
        setTraining(Array.isArray(tr) ? tr : tr.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const handleCreateIncident = async () => {
    if (!user?.token || !incidentForm.type) return;
    setSavingIncident(true);
    try {
      const res = await fetch(buildApiUrl(`safety/incidents`), {
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
      const res = await fetch(buildApiUrl(`safety/permits`), {
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

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.SAFETY_VIEW, PERMISSIONS.SAFETY_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        <HelpTab module="safety" user={user} />
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>🦺 Seguridad e Higiene</h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button onClick={() => setTab('incidents')} style={{ background: tab === 'incidents' ? 'var(--primary)' : 'var(--bg-secondary)', color: tab === 'incidents' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 500, cursor: 'pointer' }}>Incidentes</button>
            <button onClick={() => setTab('permits')} style={{ background: tab === 'permits' ? 'var(--primary)' : 'var(--bg-secondary)', color: tab === 'permits' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 500, cursor: 'pointer' }}>Permisos</button>
            <button onClick={() => setTab('training')} style={{ background: tab === 'training' ? 'var(--primary)' : 'var(--bg-secondary)', color: tab === 'training' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 500, cursor: 'pointer' }}>Capacitación</button>
          </div>
        </div>
        {tab === 'incidents' ? (
          <>
            {showIncidentForm && (
              <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--primary)' }}>
                <h3 style={{ marginBottom: 12 }}>Nuevo Incidente</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <input type="text" placeholder="Tipo (Lesión, Cuasi-accidente...)" value={incidentForm.type} onChange={(e) => setIncidentForm({ ...incidentForm, type: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <select value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }}>
                    <option value="LOW">Baja severidad</option>
                    <option value="MEDIUM">Severidad media</option>
                    <option value="HIGH">Alta severidad</option>
                  </select>
                  <input type="text" placeholder="Ubicación" value={incidentForm.location} onChange={(e) => setIncidentForm({ ...incidentForm, location: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                </div>
                <textarea placeholder="Descripción del incidente" value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, minHeight: 80, marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateIncident} disabled={savingIncident} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                    {savingIncident ? 'Guardando...' : 'Crear Incidente'}
                  </button>
                  <button onClick={() => setShowIncidentForm(false)} style={{ padding: '8px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Cancelar</button>
                </div>
              </div>
            )}
            {!showIncidentForm && (
              <button onClick={() => setShowIncidentForm(true)} style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>+ Nuevo Incidente</button>
            )}
            {loading ? (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p>Cargando incidentes...</p>
              </div>
            ) : incidents.length === 0 ? (
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
            )}
          </>
        ) : tab === "permits" ? (
          <>
            {showPermitForm && (
              <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--success)' }}>
                <h3 style={{ marginBottom: 12 }}>Nuevo Permiso de Trabajo</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <select value={permitForm.type} onChange={(e) => setPermitForm({ ...permitForm, type: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }}>
                    <option value="APT">APT - Arbejdstilladelse</option>
                    <option value="TATM">TATM - Trabajo en Altura</option>
                    <option value="CONFINED">Espacios Confinados</option>
                    <option value="ENERGY">Bloqueo de Energía</option>
                  </select>
                  <input type="text" placeholder="Ubicación" value={permitForm.location} onChange={(e) => setPermitForm({ ...permitForm, location: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <input type="number" placeholder="Válido por (días)" value={permitForm.validDays} onChange={(e) => setPermitForm({ ...permitForm, validDays: parseInt(e.target.value) || 30 })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                </div>
                <textarea placeholder="Descripción del trabajo" value={permitForm.description} onChange={(e) => setPermitForm({ ...permitForm, description: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, minHeight: 80, marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreatePermit} disabled={savingPermit} style={{ padding: '8px 16px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                    {savingPermit ? 'Guardando...' : 'Crear Permiso'}
                  </button>
                  <button onClick={() => setShowPermitForm(false)} style={{ padding: '8px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Cancelar</button>
                </div>
              </div>
            )}
            {!showPermitForm && (
              <button onClick={() => setShowPermitForm(true)} style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>+ Nuevo Permiso</button>
            )}
            {loading ? (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p>Cargando permisos...</p>
              </div>
            ) : permits.length === 0 ? (
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
            )}
          </>
        ) : (
          loading ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p>Cargando capacitaciones...</p>
            </div>
          ) : training.length === 0 ? (
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

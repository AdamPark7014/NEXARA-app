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

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
      .then(([inc, per, tr]) => {
        setIncidents(Array.isArray(inc) ? inc : inc.data || []);
        setPermits(Array.isArray(per) ? per : per.data || []);
        setTraining(Array.isArray(tr) ? tr : tr.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
              )
            )}
          </div>
        </RoleGuard>
      );
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

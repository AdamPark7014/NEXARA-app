"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function AccountingPage() {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"chart" | "journals" | "periods">("chart");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/accounting/accounts`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/journal-entries`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/accounts/fiscal-periods`, { headers }).then((r) => r.json()),
    ])
      .then(([acc, je, fp]) => {
        setAccounts(Array.isArray(acc) ? acc : acc.data || []);
        setJournals(Array.isArray(je) ? je : je.data || []);
        setPeriods(Array.isArray(fp) ? fp : fp.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

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
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📒 Contabilidad General</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Plan de cuentas, pólizas contables y períodos fiscales.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("chart")} style={tabStyle("chart")}>📊 Plan de Cuentas</button>
          <button onClick={() => setTab("journals")} style={tabStyle("journals")}>📝 Pólizas</button>
          <button onClick={() => setTab("periods")} style={tabStyle("periods")}>📅 Períodos Fiscales</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "chart" ? (
          accounts.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay cuentas contables.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Naturaleza</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a: any) => (
                    <tr key={a.id}>
                      <td><strong>{a.code}</strong></td>
                      <td style={{ paddingLeft: (a.level || 0) * 16 }}>{a.name}</td>
                      <td><span className="badge">{a.type}</span></td>
                      <td>{a.nature}</td>
                      <td>
                        <span className={a.isActive ? "status-active" : "status-inactive"}>
                          {a.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "journals" ? (
          journals.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay pólizas contables.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Póliza #</th>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th>Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((j: any) => (
                    <tr key={j.id}>
                      <td><strong>POL-{j.id}</strong></td>
                      <td>{new Date(j.date).toLocaleDateString("es-MX")}</td>
                      <td>{j.description}</td>
                      <td>${Number(j.totalDebit || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={j.status === "POSTED" ? "status-active" : j.status === "REVERSED" ? "status-inactive" : "status-pending"}>
                          {j.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          periods.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay períodos fiscales.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p: any) => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{new Date(p.startDate).toLocaleDateString("es-MX")}</td>
                      <td>{new Date(p.endDate).toLocaleDateString("es-MX")}</td>
                      <td>
                        <span className={p.isClosed ? "status-inactive" : "status-active"}>
                          {p.isClosed ? "Cerrado" : "Abierto"}
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

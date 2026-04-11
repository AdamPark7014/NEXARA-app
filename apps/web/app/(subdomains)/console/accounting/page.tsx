"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import HelpTab from '@/components/HelpTab';
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

export default function AccountingPage() {
  const { user } = useUser();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"chart" | "journals" | "periods">("chart");
  const [accountForm, setAccountForm] = useState({
    code: '',
    name: '',
    type: 'ASSET',
    currency: 'MXN',
    parentId: '',
    description: '',
  });
  const [periodForm, setPeriodForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
  });

  const loadData = () => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    setLoading(true);
    Promise.all([
      fetch(buildApiUrl(`accounting/accounts`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`accounting/journal-entries`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`accounting/accounts/fiscal-periods`), { headers }).then((r) => r.json()),
    ])
      .then(([acc, je, fp]) => {
        setAccounts(Array.isArray(acc) ? acc : acc.data || []);
        setJournals(Array.isArray(je) ? je : je.data || []);
        setPeriods(Array.isArray(fp) ? fp : fp.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [user?.token]);

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;
    if (!accountForm.code || !accountForm.name || !accountForm.type) {
      alert('Completa codigo, nombre y tipo de cuenta.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`accounting/accounts`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: accountForm.code,
          name: accountForm.name,
          type: accountForm.type,
          currency: accountForm.currency || 'MXN',
          parentId: accountForm.parentId ? Number(accountForm.parentId) : undefined,
          description: accountForm.description || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAccountForm({ code: '', name: '', type: 'ASSET', currency: 'MXN', parentId: '', description: '' });
      loadData();
    } catch (error: any) {
      alert(error?.message || 'No se pudo crear la cuenta contable.');
    } finally {
      setSaving(false);
    }
  };

  const submitPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;
    if (!periodForm.name || !periodForm.startDate || !periodForm.endDate) {
      alert('Completa nombre e intervalo del periodo fiscal.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`accounting/accounts/fiscal-periods`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(periodForm),
      });
      if (!res.ok) throw new Error(await res.text());
      setPeriodForm({ name: '', startDate: '', endDate: '' });
      loadData();
    } catch (error: any) {
      alert(error?.message || 'No se pudo crear el periodo fiscal.');
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
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="accounting" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📒 Contabilidad General</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Plan de cuentas, pólizas contables y períodos fiscales.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 10, color: 'var(--primary)' }}>Nueva cuenta contable</h3>
            <form onSubmit={submitAccount} style={{ display: 'grid', gap: 8 }}>
              <input type="text" placeholder="Codigo (ej. 1101)" value={accountForm.code} onChange={(e) => setAccountForm((p) => ({ ...p, code: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="text" placeholder="Nombre" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <select value={accountForm.type} onChange={(e) => setAccountForm((p) => ({ ...p, type: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <option value="ASSET">Activo</option>
                <option value="LIABILITY">Pasivo</option>
                <option value="EQUITY">Capital</option>
                <option value="REVENUE">Ingreso</option>
                <option value="EXPENSE">Gasto</option>
              </select>
              <input type="text" placeholder="Moneda (MXN)" value={accountForm.currency} onChange={(e) => setAccountForm((p) => ({ ...p, currency: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="number" placeholder="Parent ID (opcional)" value={accountForm.parentId} onChange={(e) => setAccountForm((p) => ({ ...p, parentId: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="text" placeholder="Descripcion" value={accountForm.description} onChange={(e) => setAccountForm((p) => ({ ...p, description: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="submit" disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Crear cuenta'}
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 10, color: 'var(--primary)' }}>Nuevo periodo fiscal</h3>
            <form onSubmit={submitPeriod} style={{ display: 'grid', gap: 8 }}>
              <input type="text" placeholder="Nombre del periodo" value={periodForm.name} onChange={(e) => setPeriodForm((p) => ({ ...p, name: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm((p) => ({ ...p, startDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm((p) => ({ ...p, endDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="submit" disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Crear periodo'}
              </button>
            </form>
          </div>
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

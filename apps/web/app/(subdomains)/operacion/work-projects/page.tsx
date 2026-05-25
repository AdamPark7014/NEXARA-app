"use client";
import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

interface WorkProject {
  id: number;
  title: string;
  description?: string;
  status?: string;
  budgetTotal?: number;
  budgetUsed?: number;
  startDate?: string;
  endDate?: string;
  clientName?: string;
  managerName?: string;
  progress?: number;
  expenses?: Array<{ id: number; category: string; amount: number; incurredAt?: string; note?: string }>;
  payroll?: Array<{ id: number; employee: string; amount: number; paidAt?: string; note?: string }>;
  logs?: Array<{ id: number; label: string; progress: number; note?: string; createdAt: string }>;
  createdAt: string;
}

interface BaseProject {
  id: number;
  title: string;
  summary?: string;
  sector?: string;
}

export default function WorkProjectsPage() {
  const { user } = useUser();
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [baseProjects, setBaseProjects] = useState<BaseProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedWorkProjectId, setSelectedWorkProjectId] = useState<number | null>(null);
  const [newProject, setNewProject] = useState({
    baseProjectId: '',
    title: '',
    clientName: '',
    managerName: '',
    budgetTotal: '',
    startDate: '',
    endDate: '',
    status: 'IN_PROGRESS',
    description: '',
  });
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: '', incurredAt: '', note: '' });
  const [payrollForm, setPayrollForm] = useState({ employee: '', amount: '', paidAt: '', note: '' });
  const [logForm, setLogForm] = useState({ label: '', progress: '', note: '' });

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('work-projects'), {
        headers: { Authorization: `Bearer ${user?.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = Array.isArray(data) ? data : data?.data || [];
        setProjects(parsed);
        if (!selectedWorkProjectId && parsed.length) {
          setSelectedWorkProjectId(parsed[0].id);
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const loadBaseProjects = async () => {
    if (!user?.token) return;
    try {
      const res = await fetch(buildApiUrl('projects?limit=100'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setBaseProjects(Array.isArray(data) ? data : data?.data || []);
    } catch {
      setBaseProjects([]);
    }
  };

  useEffect(() => {
    if (user?.token) {
      loadProjects();
      loadBaseProjects();
    }
  }, [user?.token]);

  const totalPresupuesto = projects.reduce((acc, p) => acc + Number(p.budgetTotal || 0), 0);
  const totalCosto = projects.reduce((acc, p) => acc + Number(p.budgetUsed || 0), 0);
  const activos = projects.filter(p => (p.status || '').toUpperCase() === 'IN_PROGRESS').length;

  const statusColor = (estado?: string) => {
    if (estado === 'COMPLETED') return 'var(--success, #22c55e)';
    if (estado === 'CANCELLED') return 'var(--danger, #ef4444)';
    if (estado === 'IN_PROGRESS') return 'var(--info, #3b82f6)';
    return 'var(--warning, #f59e0b)';
  };

  const selectedProject = projects.find((p) => p.id === selectedWorkProjectId) || null;

  const applyBaseProject = (id: string) => {
    setNewProject((prev) => ({ ...prev, baseProjectId: id }));
    const base = baseProjects.find((p) => p.id === Number(id));
    if (!base) return;
    setNewProject((prev) => ({
      ...prev,
      baseProjectId: id,
      title: prev.title || base.title,
      description: prev.description || [base.summary, base.sector].filter(Boolean).join(' | '),
      clientName: prev.clientName || base.sector || '',
    }));
  };

  const createWorkProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;
    if (!newProject.title.trim()) {
      alert('Define el titulo del proyecto de obra.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl('work-projects'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newProject.title,
          clientName: newProject.clientName || undefined,
          managerName: newProject.managerName || undefined,
          status: newProject.status,
          startDate: newProject.startDate || undefined,
          endDate: newProject.endDate || undefined,
          budgetTotal: newProject.budgetTotal || undefined,
          description: newProject.description || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewProject({
        baseProjectId: '',
        title: '',
        clientName: '',
        managerName: '',
        budgetTotal: '',
        startDate: '',
        endDate: '',
        status: 'IN_PROGRESS',
        description: '',
      });
      await loadProjects();
    } catch (error: any) {
      alert(error?.message || 'No se pudo crear el proyecto de obra.');
    } finally {
      setSaving(false);
    }
  };

  const addCostRecord = async (type: 'expenses' | 'payroll' | 'logs') => {
    if (!user?.token || !selectedProject) return;

    let payload: any = null;
    if (type === 'expenses') {
      const amount = Number(expenseForm.amount || 0);
      if (!expenseForm.category || amount <= 0) {
        alert('Captura categoria y monto de gasto.');
        return;
      }
      payload = {
        category: expenseForm.category,
        amount: String(amount),
        incurredAt: expenseForm.incurredAt || undefined,
        note: expenseForm.note || undefined,
      };
    }
    if (type === 'payroll') {
      const amount = Number(payrollForm.amount || 0);
      if (!payrollForm.employee || amount <= 0) {
        alert('Captura empleado y monto de nomina.');
        return;
      }
      payload = {
        employee: payrollForm.employee,
        amount: String(amount),
        paidAt: payrollForm.paidAt || undefined,
        note: payrollForm.note || undefined,
      };
    }
    if (type === 'logs') {
      const progress = Number(logForm.progress || 0);
      if (!logForm.label) {
        alert('Captura el concepto de avance.');
        return;
      }
      payload = {
        label: logForm.label,
        progress: Number.isNaN(progress) ? undefined : progress,
        note: logForm.note || undefined,
      };
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`work-projects/${selectedProject.id}/${type}`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      setExpenseForm({ category: '', amount: '', incurredAt: '', note: '' });
      setPayrollForm({ employee: '', amount: '', paidAt: '', note: '' });
      setLogForm({ label: '', progress: '', note: '' });
      await loadProjects();
    } catch (error: any) {
      alert(error?.message || 'No se pudo guardar el costo personalizado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="work-projects" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Crear proyecto de obra desde Proyectos</h3>
          <form onSubmit={createWorkProject} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <select value={newProject.baseProjectId} onChange={(e) => applyBaseProject(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="">Selecciona proyecto base</option>
              {baseProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <input type="text" placeholder="Titulo obra" value={newProject.title} onChange={(e) => setNewProject((prev) => ({ ...prev, title: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Cliente" value={newProject.clientName} onChange={(e) => setNewProject((prev) => ({ ...prev, clientName: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Responsable" value={newProject.managerName} onChange={(e) => setNewProject((prev) => ({ ...prev, managerName: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="number" min={0} step="0.01" placeholder="Presupuesto total" value={newProject.budgetTotal} onChange={(e) => setNewProject((prev) => ({ ...prev, budgetTotal: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="date" value={newProject.startDate} onChange={(e) => setNewProject((prev) => ({ ...prev, startDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="date" value={newProject.endDate} onChange={(e) => setNewProject((prev) => ({ ...prev, endDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <select value={newProject.status} onChange={(e) => setNewProject((prev) => ({ ...prev, status: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="IN_PROGRESS">En progreso</option>
              <option value="ON_HOLD">En pausa</option>
              <option value="COMPLETED">Completado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
            <input type="text" placeholder="Descripcion" value={newProject.description} onChange={(e) => setNewProject((prev) => ({ ...prev, description: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <button type="submit" disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando...' : 'Crear proyecto de obra'}
            </button>
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Customizacion de costos de obra</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <select value={selectedWorkProjectId || ''} onChange={(e) => setSelectedWorkProjectId(Number(e.target.value))} style={{ maxWidth: 420, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="">Selecciona proyecto de obra</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <input type="text" placeholder="Categoria gasto" value={expenseForm.category} onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="number" min={0} step="0.01" placeholder="Monto gasto" value={expenseForm.amount} onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="date" value={expenseForm.incurredAt} onChange={(e) => setExpenseForm((prev) => ({ ...prev, incurredAt: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="text" placeholder="Nota gasto" value={expenseForm.note} onChange={(e) => setExpenseForm((prev) => ({ ...prev, note: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="button" disabled={saving || !selectedProject} onClick={() => addCostRecord('expenses')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>Agregar gasto</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <input type="text" placeholder="Empleado" value={payrollForm.employee} onChange={(e) => setPayrollForm((prev) => ({ ...prev, employee: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="number" min={0} step="0.01" placeholder="Monto nomina" value={payrollForm.amount} onChange={(e) => setPayrollForm((prev) => ({ ...prev, amount: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="date" value={payrollForm.paidAt} onChange={(e) => setPayrollForm((prev) => ({ ...prev, paidAt: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="text" placeholder="Nota nomina" value={payrollForm.note} onChange={(e) => setPayrollForm((prev) => ({ ...prev, note: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="button" disabled={saving || !selectedProject} onClick={() => addCostRecord('payroll')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>Agregar nomina</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <input type="text" placeholder="Hito / avance" value={logForm.label} onChange={(e) => setLogForm((prev) => ({ ...prev, label: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="number" min={0} max={100} placeholder="Progreso %" value={logForm.progress} onChange={(e) => setLogForm((prev) => ({ ...prev, progress: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <input type="text" placeholder="Nota avance" value={logForm.note} onChange={(e) => setLogForm((prev) => ({ ...prev, note: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="button" disabled={saving || !selectedProject} onClick={() => addCostRecord('logs')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>Registrar avance</button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{projects.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Proyectos totales</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--info, #3b82f6)' }}>{activos}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>En progreso</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>
              ${totalPresupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Presupuesto total</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: totalCosto > totalPresupuesto ? 'var(--danger, #ef4444)' : 'var(--warning, #f59e0b)' }}>
              ${totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Costo real acumulado</div>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>🏗️ Proyectos de Obra</h2>
          {loading ? (
            <p>Cargando proyectos...</p>
          ) : projects.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay proyectos registrados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Proyecto</th>
                  <th style={{ padding: '8px 6px' }}>Cliente</th>
                  <th style={{ padding: '8px 6px' }}>Presupuesto</th>
                  <th style={{ padding: '8px 6px' }}>Costo real</th>
                  <th style={{ padding: '8px 6px' }}>Avance</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Inicio</th>
                  <th style={{ padding: '8px 6px' }}>Fin</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{p.id}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.title}</td>
                    <td style={{ padding: '8px 6px' }}>{p.clientName || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>${Number(p.budgetTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>${Number(p.budgetUsed || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>{Number(p.progress || 0)}%</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${statusColor(p.status)}22`, color: statusColor(p.status) }}>
                        {p.status || 'IN_PROGRESS'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{p.startDate ? new Date(p.startDate).toLocaleDateString('es-MX') : '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{p.endDate ? new Date(p.endDate).toLocaleDateString('es-MX') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}

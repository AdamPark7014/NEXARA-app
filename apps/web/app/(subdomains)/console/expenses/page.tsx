"use client";
import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

interface Expense {
  id: number;
  concepto: string;
  monto: number;
  categoria?: string;
  estado?: string;
  fecha?: string;
  userId: number;
  user?: { nombre: string };
}

function statusColor(status?: string) {
  switch (status) {
    case 'aprobado': return '#22c55e';
    case 'pendiente': return '#f59e0b';
    case 'rechazado': return '#ef4444';
    default: return 'var(--text-secondary)';
  }
}

export default function ExpensesPage() {
  const { user } = useUser();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    actividadId: '',
    montoSolicitado: '',
    razonGasto: '',
  });

  const loadExpenses = () => {
    setLoading(true);
    fetch(buildApiUrl('expenses'), { headers: { Authorization: user?.token ? `Bearer ${user.token}` : '' } })
      .then(res => res.json())
      .then(data => setExpenses(Array.isArray(data) ? data : data.data || []))
      .catch(() => setExpenses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadExpenses();
  }, [user]);

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !user?.id) return;

    const actividadId = Number(form.actividadId || 0);
    const montoSolicitado = Number(form.montoSolicitado || 0);
    if (!actividadId || montoSolicitado <= 0) {
      alert('Ingresa actividad y monto valido.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl('expenses'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actividadId,
          usuarioId: Number(user.id),
          montoSolicitado,
          razonGasto: form.razonGasto || undefined,
          estatusPago: 'pendiente',
          fechaSolicitud: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => 'Error al crear gasto.');
        throw new Error(msg || 'Error al crear gasto.');
      }

      setForm({ actividadId: '', montoSolicitado: '', razonGasto: '' });
      loadExpenses();
    } catch (error: any) {
      alert(error?.message || 'No se pudo registrar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  const total = expenses.reduce((acc, e) => acc + (e.monto || 0), 0);
  const pendientes = expenses.filter(e => e.estado === 'pendiente').length;
  const aprobados = expenses.filter(e => e.estado === 'aprobado').length;

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="expenses" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Registrar gasto operativo</h3>
          <form onSubmit={submitExpense} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <input
              type="number"
              min={1}
              placeholder="ID actividad"
              value={form.actividadId}
              onChange={(e) => setForm((prev) => ({ ...prev, actividadId: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Monto solicitado"
              value={form.montoSolicitado}
              onChange={(e) => setForm((prev) => ({ ...prev, montoSolicitado: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="text"
              placeholder="Razon del gasto"
              value={form.razonGasto}
              onChange={(e) => setForm((prev) => ({ ...prev, razonGasto: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'Crear gasto'}
            </button>
          </form>
        </div>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{expenses.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total gastos</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>
              ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Monto acumulado</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>{pendientes}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Pendientes</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{aprobados}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aprobados</div>
          </div>
        </div>
        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>📊 Control de Gastos Operativos</h2>
          {loading ? (
            <p>Cargando gastos...</p>
          ) : expenses.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron gastos registrados.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Solicitante</th>
                  <th style={{ padding: '8px 6px' }}>Concepto</th>
                  <th style={{ padding: '8px 6px' }}>Categoría</th>
                  <th style={{ padding: '8px 6px' }}>Monto</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{e.id}</td>
                    <td style={{ padding: '8px 6px' }}>{e.user?.nombre || `User #${e.userId}`}</td>
                    <td style={{ padding: '8px 6px' }}>{e.concepto}</td>
                    <td style={{ padding: '8px 6px' }}>{e.categoria || '—'}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>${(e.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${statusColor(e.estado)}22`, color: statusColor(e.estado) }}>
                        {e.estado || 'pendiente'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{e.fecha ? new Date(e.fecha).toLocaleDateString('es-MX') : '—'}</td>
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

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
  notas?: string;
  createdAt: string;
}

export default function ExpensesPage() {
  const { user } = useUser();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('expenses'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExpenses(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadExpenses();
  }, [user?.token]);

  const total = expenses.reduce((acc, e) => acc + (e.monto || 0), 0);
  const pendientes = expenses.filter(e => e.estado === 'pendiente' || !e.estado).length;
  const aprobados = expenses.filter(e => e.estado === 'aprobado').length;

  const statusColor = (estado?: string) => {
    if (estado === 'aprobado') return 'var(--success, #22c55e)';
    if (estado === 'rechazado') return 'var(--danger, #ef4444)';
    return 'var(--warning, #f59e0b)';
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="expenses" user={user} />
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
                {expenses.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{e.id}</td>
                    <td style={{ padding: '8px 6px' }}>{e.user?.nombre || `User #${e.userId}`}</td>
                    <td style={{ padding: '8px 6px' }}>{e.concepto}</td>
                    <td style={{ padding: '8px 6px' }}>{e.categoria || '—'}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>${(e.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${statusColor(e.estado)}22`, color: statusColor(e.estado) }}>
                        {e.estado || 'pendiente'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{e.fecha ? new Date(e.fecha).toLocaleDateString('es-MX') : e.createdAt ? new Date(e.createdAt).toLocaleDateString('es-MX') : '—'}</td>
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

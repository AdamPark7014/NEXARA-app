"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface Payment {
  id: number;
  userId: number;
  user?: { nombre: string; email: string };
  concepto?: string;
  monto: number;
  fecha: string;
  tipo?: string;
  referencia?: string;
  notas?: string;
  createdAt: string;
}

export default function EmployeePaymentsPage() {
  const { user } = useUser();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const loadPayments = async () => {
    setLoading(true);
    try {
      let url = 'employee-payments';
      const params = new URLSearchParams();
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      const res = await fetch(buildApiUrl(url), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadPayments();
  }, [user?.token, filterFrom, filterTo]);

  const totalMonto = payments.reduce((acc, p) => acc + (p.monto || 0), 0);

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="employee-payments" user={user} />
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{payments.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Pagos registrados</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>
              ${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total pagado</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>
              {payments.length > 0 ? `$${(totalMonto / payments.length).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '$0.00'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Promedio por pago</div>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>Desde:</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
          <label style={{ fontSize: 13 }}>Hasta:</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
          <button onClick={loadPayments} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Filtrar
          </button>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>💰 Registro de Pagos a Empleados</h2>
          {loading ? (
            <p>Cargando pagos...</p>
          ) : payments.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron pagos en el periodo seleccionado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Empleado</th>
                  <th style={{ padding: '8px 6px' }}>Concepto</th>
                  <th style={{ padding: '8px 6px' }}>Monto</th>
                  <th style={{ padding: '8px 6px' }}>Tipo</th>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{p.id}</td>
                    <td style={{ padding: '8px 6px' }}>{p.user?.nombre || `User #${p.userId}`}</td>
                    <td style={{ padding: '8px 6px' }}>{p.concepto || '—'}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>${(p.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px' }}>{p.tipo || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX') : '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{p.referencia || '—'}</td>
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

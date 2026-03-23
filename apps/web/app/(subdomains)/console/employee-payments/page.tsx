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
    if (!user?.token) {
      setPayments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let url = 'employee-payments';
      const params = new URLSearchParams();
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      const response = await fetch(buildApiUrl(url), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) {
        setPayments([]);
        return;
      }
      const data = await response.json();
      setPayments(Array.isArray(data) ? data : data?.data || []);
    } catch (error) {
      console.error('Error loading payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [user?.token, filterFrom, filterTo]);

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="employee-payments" user={user} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p>loading...</p>
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <h2>Employee Payments</h2>
              <table style={{ border: '1px solid var(--border)', width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 6px' }}>ID</th>
                    <th style={{ padding: '8px 6px' }}>User</th>
                    <th style={{ padding: '8px 6px' }}>Concepto</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600 }}>
                      Monto
                    </th>
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
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}

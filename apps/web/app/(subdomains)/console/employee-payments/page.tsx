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
      // ...existing code...
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

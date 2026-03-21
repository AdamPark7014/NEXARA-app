"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';
import { useUser } from '@/components/UserContext';

export default function ClientsPage() {
  const { user } = useUser();
  const [clients, setClients] = useState<any[]>([]);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const fetchClients = () => {
    if (!user?.token) return;
    fetch(buildApiUrl('service-clients'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setClients(Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [])))
      .catch(() => setClients([]));
  };

  useEffect(() => {
    fetchClients();
  }, [user?.token]);

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ color: 'var(--primary)' }}>Clientes</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>{client.name}</td>
                <td>{client.contactName || '-'}</td>
                <td>{client.contactEmail || '-'}</td>
                <td>{client.contactPhone || '-'}</td>
                <td>{client.isActive ? 'Si' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RoleGuard>
  );
}

"use client";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '@/components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';
import { useUser } from '@/components/UserContext';
import ClientCreationForm from '@/components/ClientCreationForm';

export default function ClientsPage() {
  const { user } = useUser();
  const [clients, setClients] = useState<any[]>([]);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getLogoUrl = (logoPath?: string) => {
    if (!logoPath) return null;
    // Si ya tiene el dominio completo, devolverlo tal cual
    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
      return logoPath;
    }
    // Construir URL completa del API para el logo
    return `${API_URL.replace(/\/api\/?$/, '')}${logoPath}`;
  };

  const fetchClients = () => {
    if (!user?.token) return;
    fetch(buildApiUrl('service-clients'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]));
  };

  useEffect(() => {
    fetchClients();
  }, [user?.token]);

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Formulario de creación */}
        <ClientCreationForm onClientCreated={fetchClients} />
        
        {/* Lista de clientes */}
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ color: 'var(--primary)' }}>Clientes Registrados</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Portal</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                    No hay clientes registrados
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const logoUrl = getLogoUrl(client.logoUrl);
                  return (
                    <tr key={client.id}>
                      <td>
                        {logoUrl ? (
                          <img 
                            src={logoUrl} 
                            alt={`Logo ${client.name}`}
                            style={{ 
                              width: 40, 
                              height: 40, 
                              objectFit: 'contain',
                              borderRadius: 8,
                              border: '1px solid rgba(0,0,0,0.1)'
                            }}
                            onError={(e) => {
                              // Si falla cargar la imagen, mostrar placeholder
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div style={{ 
                            width: 40, 
                            height: 40, 
                            borderRadius: 8, 
                            background: 'var(--surface-variant)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            color: 'var(--text-secondary)'
                          }}>
                            -
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{client.name}</td>
                      <td>{client.contactName || '-'}</td>
                      <td>{client.contactEmail || '-'}</td>
                      <td>{client.contactPhone || '-'}</td>
                      <td>
                        {client.branches?.length > 0 ? (
                          <span style={{ color: 'var(--accent)' }}>
                            {client.branches.length} {client.branches.length === 1 ? 'sucursal' : 'sucursales'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>Sin sucursales</span>
                        )}
                      </td>
                      <td>
                        <span style={{ 
                          color: client.isActive ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: 600
                        }}>
                          {client.isActive ? '✓ Sí' : '✗ No'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </RoleGuard>
  );
}

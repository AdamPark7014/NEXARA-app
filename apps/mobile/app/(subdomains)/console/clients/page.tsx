"use client";
import React, { useEffect, useRef, useState } from 'react';
import { RoleGuard } from '@/components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';
import { useUser } from '@/components/UserContext';
import ClientCreationForm from '@/components/ClientCreationForm';
import { ClientTicketsPanel } from '../client-tickets/ClientTicketsPanel';
import HelpTab from '@/components/HelpTab';

export default function ClientsPage() {
  const { user } = useUser();
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'tickets'>('clients');
  const [clients, setClients] = useState<any[]>([]);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    id: 0,
    name: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    accountCode: '',
    portalEmail: '',
    portalPassword: '',
    isActive: true,
    logoUrl: '',
  });
  const [editLogo, setEditLogo] = useState<File | null>(null);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [editLogoDragging, setEditLogoDragging] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editLogoInputRef = useRef<HTMLInputElement>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getLogoUrl = (logoPath?: string) => {
    if (!logoPath) return null;
    // Si ya tiene el dominio completo, devolverlo tal cual
    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
      return logoPath;
    }
    // Construir URL completa - el logo está en /uploads/clients que se sirve desde la raíz
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    // Asegurar que logoPath comience con /
    const normalizedPath = logoPath.startsWith('/') ? logoPath : `/${logoPath}`;
    return `${baseUrl}${normalizedPath}`;
  };

  const getClientBranchCount = (client: any) => {
    if (Array.isArray(client?.branches)) return client.branches.length;
    if (typeof client?.branchCount === 'number') return client.branchCount;
    if (typeof client?._count?.branches === 'number') return client._count.branches;
    return 0;
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

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleTabChange = (tab: 'clients' | 'tickets') => {
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!editLogo) {
      setEditLogoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(editLogo);
    setEditLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editLogo]);

  const startEdit = (client: any) => {
    setEditingClient(client);
    setEditMessage(null);
    setEditLogo(null);
    setEditLogoPreview(null);
    setShowEditPassword(false);
    setEditForm({
      id: client.id,
      name: client.name || '',
      contactName: client.contactName || '',
      contactEmail: client.contactEmail || '',
      contactPhone: client.contactPhone || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || '',
      accountCode: client.accountCode || '',
      portalEmail: client.portalEmail || '',
      portalPassword: '',
      isActive: client.isActive !== false,
      logoUrl: client.logoUrl || '',
    });
  };

  const handleEditLogoSelect = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setEditLogo(file);
  };

  const handleEditLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setEditLogoDragging(false);
    const file = event.dataTransfer.files?.[0];
    handleEditLogoSelect(file);
  };

  const submitEdit = async () => {
    if (!user?.token || !editingClient) return;
    if (!editForm.name) {
      setEditMessage('Nombre del cliente es requerido');
      return;
    }
    setIsSaving(true);
    setEditMessage(null);

    const useMultipart = Boolean(editLogo);
    const endpoint = buildApiUrl(`service-clients/${editingClient.id}`);

    if (useMultipart) {
      const formData = new FormData();
      formData.append('name', editForm.name);
      formData.append('contactName', editForm.contactName);
      formData.append('contactEmail', editForm.contactEmail);
      formData.append('contactPhone', editForm.contactPhone);
      formData.append('address', editForm.address);
      formData.append('city', editForm.city);
      formData.append('state', editForm.state);
      formData.append('country', editForm.country);
      formData.append('accountCode', editForm.accountCode);
      formData.append('portalEmail', editForm.portalEmail);
      formData.append('isActive', String(editForm.isActive));
      if (editForm.portalPassword) formData.append('portalPassword', editForm.portalPassword);
      if (editLogo) formData.append('logo', editLogo);

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditMessage(data?.message || 'No se pudo actualizar el cliente');
        setIsSaving(false);
        return;
      }
    } else {
      const payload: any = {
        name: editForm.name,
        contactName: editForm.contactName,
        contactEmail: editForm.contactEmail,
        contactPhone: editForm.contactPhone,
        address: editForm.address,
        city: editForm.city,
        state: editForm.state,
        country: editForm.country,
        accountCode: editForm.accountCode,
        portalEmail: editForm.portalEmail,
        isActive: editForm.isActive,
      };
      if (editForm.portalPassword) payload.portalPassword = editForm.portalPassword;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditMessage(data?.message || 'No se pudo actualizar el cliente');
        setIsSaving(false);
        return;
      }
    }

    setEditMessage('Cliente actualizado');
    setIsSaving(false);
    setEditingClient(null);
    fetchClients();
  };

  return (
    <>
      <HelpTab module="clients" user={user} />
      <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
        <div style={{ display: 'grid', gap: 16, maxWidth: 1440, margin: '0 auto', width: '100%' }}>
          <div className="card" style={{ display: 'grid', gap: 14 }}>
            <div>
              <h1 style={{ margin: 0, color: 'var(--primary)', fontSize: isMobile ? 24 : 30 }}>🤝 Clientes corporativos</h1>
              <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: isMobile ? 13 : 14 }}>
                Administra cuentas corporativas y su operación de tickets desde un solo lugar.
              </p>
            </div>
            <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr' : undefined, gap: 10 }}>
              <button
                type="button"
                className={activeTab === 'clients' ? 'button-primary' : 'button-secondary'}
                onClick={() => handleTabChange('clients')}
                style={{ width: isMobile ? '100%' : undefined }}
              >
                🧾 Gestión de clientes
              </button>
              <button
                type="button"
                className={activeTab === 'tickets' ? 'button-primary' : 'button-secondary'}
                onClick={() => handleTabChange('tickets')}
                style={{ width: isMobile ? '100%' : undefined }}
              >
                🎫 Tickets de clientes
              </button>
            </div>
          </div>

          {activeTab === 'clients' && (
            <>
              {/* Formulario de creación */}
              <ClientCreationForm onClientCreated={fetchClients} />

              {/* Formulario de edición */}
              {editingClient && (
                <div className="card" style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <h2 style={{ color: 'var(--primary)' }}>Editar cliente</h2>
                    <button className="button-secondary" onClick={() => setEditingClient(null)}>Cancelar</button>
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <input className="input" placeholder="Nombre del cliente" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                      <input className="input" placeholder="Contacto" value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} />
                      <input className="input" placeholder="Email contacto" value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })} />
                      <input className="input" placeholder="Teléfono" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} />
                      <input className="input" placeholder="Dirección" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                      <input className="input" placeholder="Ciudad" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                      <input className="input" placeholder="Estado" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                      <input className="input" placeholder="País" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                      <input className="input" placeholder="Codigo de cuenta" value={editForm.accountCode} onChange={(e) => setEditForm({ ...editForm, accountCode: e.target.value })} />
                      <input className="input" placeholder="Email portal" value={editForm.portalEmail} onChange={(e) => setEditForm({ ...editForm, portalEmail: e.target.value })} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          className="input"
                          type={showEditPassword ? 'text' : 'password'}
                          placeholder="Password portal (opcional)"
                          value={editForm.portalPassword}
                          onChange={(e) => setEditForm({ ...editForm, portalPassword: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <button className="button-secondary" type="button" onClick={() => setShowEditPassword((prev) => !prev)}>
                          {showEditPassword ? 'Ocultar' : 'Ver'}
                        </button>
                      </div>
                    </div>

                    {/* Cliente activo toggle */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 16, 
                      padding: '16px 20px', 
                      borderRadius: 12, 
                      background: 'linear-gradient(135deg, rgba(31,107,186,0.08), rgba(18,133,98,0.08))',
                      border: '1px solid rgba(31,107,186,0.2)',
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>Estado del cliente</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                          {editForm.isActive ? '✓ Cliente activo - Puede acceder a servicios' : '○ Cliente inactivo - Sin acceso a servicios'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 8,
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          background: editForm.isActive 
                            ? 'linear-gradient(135deg, #1f6bba 0%, #128562 100%)'
                            : 'rgba(255,255,255,0.1)',
                          color: editForm.isActive ? '#fff' : 'var(--text-secondary)',
                          transform: 'translateZ(0)',
                          boxShadow: editForm.isActive
                            ? '0 4px 12px rgba(31,107,186,0.3)'
                            : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (editForm.isActive) {
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(31,107,186,0.4)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px) translateZ(0)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (editForm.isActive) {
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(31,107,186,0.3)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateZ(0)';
                          }
                        }}
                      >
                        {editForm.isActive ? '✓ Activo' : '○ Inactivo'}
                      </button>
                    </div>

                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setEditLogoDragging(true);
                      }}
                      onDragLeave={() => setEditLogoDragging(false)}
                      onDrop={handleEditLogoDrop}
                      style={{
                        borderRadius: 16,
                        padding: 16,
                        border: `2px dashed ${editLogoDragging ? 'rgba(31,107,186,0.8)' : 'rgba(31,107,186,0.4)'}`,
                        background: editLogoDragging
                          ? 'linear-gradient(135deg, rgba(31,107,186,0.2), rgba(18,133,98,0.18))'
                          : 'linear-gradient(135deg, rgba(31,107,186,0.12), rgba(18,133,98,0.12))',
                        display: 'grid',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Logo del cliente</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Arrastra la imagen aquí o súbela manualmente.</div>
                        </div>
                        <button className="button-secondary" type="button" onClick={() => editLogoInputRef.current?.click()}>
                          Seleccionar imagen
                        </button>
                      </div>
                      <input
                        ref={editLogoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleEditLogoSelect(e.target.files?.[0] || null)}
                        style={{ display: 'none' }}
                      />
                      {(editLogoPreview || editForm.logoUrl) ? (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div style={{ position: 'relative', width: 72, height: 72 }}>
                            <img
                              src={editLogoPreview || (getLogoUrl(editForm.logoUrl) || '')}
                              alt="Preview logo"
                              style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.1)' }}
                              onError={(e) => {
                                console.error('Logo non-load error:', (e.target as HTMLImageElement).src);
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{editLogo?.name || 'Logo actual'}</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No hay logo seleccionado.</div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="button-primary" onClick={submitEdit} disabled={isSaving}>
                        {isSaving ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                      {editMessage && (
                        <span style={{ color: editMessage.startsWith('No') ? 'var(--danger)' : 'var(--accent)' }}>
                          {editMessage}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                          No hay clientes registrados
                        </td>
                      </tr>
                    ) : (
                      clients.map((client) => {
                        const logoUrl = getLogoUrl(client.logoUrl);
                        const branchCount = getClientBranchCount(client);
                        return (
                          <tr key={client.id}>
                            <td>
                              {logoUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}>
                                  <img 
                                    src={logoUrl} 
                                    alt={`Logo ${client.name}`}
                                    style={{ 
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'contain',
                                      borderRadius: 8,
                                      border: '1px solid rgba(0,0,0,0.1)',
                                      padding: '2px',
                                      background: 'rgba(255,255,255,0.5)'
                                    }}
                                    onError={(e) => {
                                      console.error(`Failed to load logo for client ${client.name} from:`, logoUrl);
                                      // Mostrar placeholder en caso de error
                                      const img = e.target as HTMLImageElement;
                                      img.style.display = 'none';
                                      const parent = img.parentElement;
                                      if (parent) {
                                        const placeholder = document.createElement('div');
                                        placeholder.style.cssText = `
                                          width: 40px;
                                          height: 40px;
                                          borderRadius: 8px;
                                          background: var(--surface-variant);
                                          display: flex;
                                          alignItems: center;
                                          justifyContent: center;
                                          fontSize: 12px;
                                          color: var(--text-secondary);
                                          border: 1px solid rgba(0,0,0,0.1);
                                        `;
                                        placeholder.textContent = '❌';
                                        parent.appendChild(placeholder);
                                      }
                                    }}
                                  />
                                </div>
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
                                  color: 'var(--text-secondary)',
                                  border: '1px solid rgba(0,0,0,0.1)'
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
                              {branchCount > 0 ? (
                                <span style={{ color: 'var(--accent)' }}>
                                  {branchCount} {branchCount === 1 ? 'sucursal' : 'sucursales'}
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
                            <td>
                              <button className="button-secondary" onClick={() => startEdit(client)}>
                                Editar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'tickets' && <ClientTicketsPanel embedded />}
        </div>
      </RoleGuard>
    </>
  );
}


"use client";
import React, { useEffect, useRef, useState } from 'react';
import { RoleGuard } from '@/components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';
import { useUser } from '@/components/UserContext';
import ClientCreationForm from '@/components/ClientCreationForm';

export default function ClientsPage() {
  const { user } = useUser();
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
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 16 }}>
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
                <input className="input" placeholder="Telefono" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} />
                <input className="input" placeholder="Direccion" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                <input className="input" placeholder="Ciudad" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                <input className="input" placeholder="Estado" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                <input className="input" placeholder="Pais" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  />
                  Cliente activo
                </label>
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
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Arrastra la imagen aqui o subela manualmente.</div>
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
                    <img
                      src={editLogoPreview || (getLogoUrl(editForm.logoUrl) || '')}
                      alt="Preview logo"
                      style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.4)' }}
                    />
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
      </div>
    </RoleGuard>
  );
}

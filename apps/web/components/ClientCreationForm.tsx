"use client";
import React, { useRef, useState, useEffect } from 'react';
import { useUser } from './UserContext';

interface ClientCreationFormProps {
  onClientCreated?: () => void;
}

export default function ClientCreationForm({ onClientCreated }: ClientCreationFormProps) {
  const { user } = useUser();
  const clientLogoInputRef = useRef<HTMLInputElement>(null);
  
  const [newClient, setNewClient] = useState({
    name: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    portalEmail: '',
    portalPassword: '',
  });
  
  const [clientLogo, setClientLogo] = useState<File | null>(null);
  const [clientLogoPreview, setClientLogoPreview] = useState<string | null>(null);
  const [clientLogoDragging, setClientLogoDragging] = useState(false);
  const [showClientPassword, setShowClientPassword] = useState(false);
  const [clientFormMessage, setClientFormMessage] = useState<string | null>(null);
  const [createdClientCredentials, setCreatedClientCredentials] = useState<{
    email?: string;
    password?: string;
  } | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  useEffect(() => {
    if (!clientLogo) {
      setClientLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(clientLogo);
    setClientLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [clientLogo]);

  const handleLogoSelect = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setClientLogo(file);
  };

  const handleLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setClientLogoDragging(false);
    const file = event.dataTransfer.files?.[0];
    handleLogoSelect(file);
  };

  const handleCreateClient = async () => {
    if (!user?.token) return;
    setClientFormMessage(null);
    setCreatedClientCredentials(null);
    
    if (!newClient.name) {
      setClientFormMessage('Nombre del cliente es requerido');
      return;
    }

    const formData = new FormData();
    formData.append('name', newClient.name);
    if (newClient.contactName) formData.append('contactName', newClient.contactName);
    if (newClient.contactEmail) formData.append('contactEmail', newClient.contactEmail);
    if (newClient.contactPhone) formData.append('contactPhone', newClient.contactPhone);
    if (newClient.portalEmail) formData.append('portalEmail', newClient.portalEmail);
    if (newClient.portalPassword) formData.append('portalPassword', newClient.portalPassword);
    if (clientLogo) formData.append('logo', clientLogo);

    const res = await fetch(buildApiUrl('service-clients'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setClientFormMessage(data?.message || 'No se pudo crear el cliente');
      return;
    }

    const credentials = data?.credentials;
    setCreatedClientCredentials(credentials || null);
    if (credentials?.email || credentials?.password) {
      const parts = [
        credentials.email ? `Email: ${credentials.email}` : null,
        credentials.password ? `Password: ${credentials.password}` : null,
      ].filter(Boolean);
      setClientFormMessage(`Cliente creado exitosamente. ${parts.join(' | ')}`);
    } else {
      setClientFormMessage('Cliente creado exitosamente');
    }
    
    // Reset form
    setNewClient({
      name: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      portalEmail: '',
      portalPassword: '',
    });
    setClientLogo(null);
    setClientLogoPreview(null);
    setShowClientPassword(false);
    
    // Callback to refresh client list
    if (onClientCreated) {
      setTimeout(onClientCreated, 500);
    }
  };

  const formCardStyle: React.CSSProperties = {
    background: 'linear-gradient(140deg, rgba(31,137,252,0.22), rgba(20,162,133,0.18)), var(--surface)',
    border: '1px solid rgba(31,137,252,0.22)',
    borderRadius: 16,
    padding: 18,
    display: 'grid',
    gap: 12,
    boxShadow: '0 14px 24px rgba(15,106,214,0.16)',
  };

  const helperTextStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: 12,
  };

  const formGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  };

  const formFooterStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  };

  return (
    <div style={formCardStyle}>
      <div style={{ display: 'grid', gap: 12, padding: 12, borderRadius: 12, background: 'rgba(15, 106, 214, 0.08)', border: '1px dashed rgba(15, 106, 214, 0.3)' }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>Crear nuevo cliente</h3>
          <div style={helperTextStyle}>Completa la información del cliente y su acceso al portal de tickets.</div>
        </div>
        
        <div style={formGridStyle}>
          <input 
            className="input" 
            placeholder="Nombre del cliente *" 
            value={newClient.name} 
            onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} 
          />
          <input 
            className="input" 
            placeholder="Nombre de contacto" 
            value={newClient.contactName} 
            onChange={(e) => setNewClient({ ...newClient, contactName: e.target.value })} 
          />
          <input 
            className="input" 
            placeholder="Email de contacto" 
            type="email"
            value={newClient.contactEmail} 
            onChange={(e) => setNewClient({ ...newClient, contactEmail: e.target.value })} 
          />
          <input 
            className="input" 
            placeholder="Teléfono" 
            value={newClient.contactPhone} 
            onChange={(e) => setNewClient({ ...newClient, contactPhone: e.target.value })} 
          />
          <input 
            className="input" 
            placeholder="Email para portal de tickets" 
            type="email"
            value={newClient.portalEmail} 
            onChange={(e) => setNewClient({ ...newClient, portalEmail: e.target.value })} 
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="input"
              type={showClientPassword ? 'text' : 'password'}
              placeholder="Contraseña para portal"
              value={newClient.portalPassword}
              onChange={(e) => setNewClient({ ...newClient, portalPassword: e.target.value })}
              style={{ flex: 1 }}
            />
            <button
              className="button-secondary"
              type="button"
              onClick={() => setShowClientPassword((prev) => !prev)}
            >
              {showClientPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          
          {/* Logo Upload */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setClientLogoDragging(true);
            }}
            onDragLeave={() => setClientLogoDragging(false)}
            onDrop={handleLogoDrop}
            style={{
              gridColumn: '1 / -1',
              borderRadius: 16,
              padding: 16,
              border: `2px dashed ${clientLogoDragging ? 'rgba(31,107,186,0.8)' : 'rgba(31,107,186,0.4)'}`,
              background: clientLogoDragging
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
                <div style={helperTextStyle}>Arrastra la imagen aquí o súbela manualmente. Se mostrará en el portal de tickets.</div>
              </div>
              <button
                className="button-secondary"
                type="button"
                onClick={() => clientLogoInputRef.current?.click()}
              >
                Seleccionar imagen
              </button>
            </div>
            <input
              ref={clientLogoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleLogoSelect(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            {clientLogoPreview ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img
                  src={clientLogoPreview}
                  alt="Preview logo"
                  style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.4)' }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{clientLogo?.name}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No hay logo seleccionado.</div>
            )}
          </div>
        </div>
        
        {/* Credentials Display */}
        {createdClientCredentials && (createdClientCredentials.email || createdClientCredentials.password) && (
          <div style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(31,107,186,0.25)',
            background: 'rgba(31,107,186,0.08)',
            display: 'grid',
            gap: 6,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>✅ Credenciales del portal de tickets</div>
            {createdClientCredentials.email && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📧 Usuario: {createdClientCredentials.email}</div>
            )}
            {createdClientCredentials.password && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🔑 Contraseña: {createdClientCredentials.password}</div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              ⚠️ Guarda estas credenciales. El cliente las usará en tickets.nexara.com.mx
            </div>
          </div>
        )}
        
        {/* Submit Button */}
        <div style={formFooterStyle}>
          <button className="button-primary" onClick={handleCreateClient}>
            Crear cliente
          </button>
          {clientFormMessage && (
            <span style={{ 
              color: clientFormMessage.includes('exitosamente') ? 'var(--accent)' : 'var(--danger)',
              fontSize: 14,
            }}>
              {clientFormMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

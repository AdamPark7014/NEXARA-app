"use client";
import React, { useRef, useState, useEffect } from 'react';
import { useUser } from './UserContext';
import styles from './ClientCreationForm.module.css';
import { io, Socket } from 'socket.io-client';

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

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = API_URL.replace(/\/+api\/?$/, '');
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        onClientCreated?.();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ServiceClient', 'Client'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, API_URL, onClientCreated]);

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

  return (
    <div className={styles.outerCard}>
      <div className={styles.panel}>
        <div>
          <h3 className={styles.panelTitle}>Crear nuevo cliente</h3>
          <div className={styles.helperText}>Completa la información del cliente y su acceso al portal de tickets.</div>
        </div>
        
        <div className={styles.grid}>
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
          <div className={styles.passwordRow}>
            <input
              className={`input ${styles.passwordInput}`}
              type={showClientPassword ? 'text' : 'password'}
              placeholder="Contraseña para portal"
              value={newClient.portalPassword}
              onChange={(e) => setNewClient({ ...newClient, portalPassword: e.target.value })}
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
            className={`${styles.logoDropzone} ${clientLogoDragging ? styles.logoDropzoneActive : ''}`}
          >
            <div className={styles.logoTop}>
              <div>
                <div className={styles.logoTitle}>Logo del cliente</div>
                <div className={styles.logoHint}>Arrastra la imagen aquí o súbela manualmente. Se mostrará en el portal de tickets.</div>
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
              className={styles.hiddenInput}
            />
            {clientLogoPreview ? (
              <div className={styles.logoPreview}>
                <img
                  src={clientLogoPreview}
                  alt="Preview logo"
                  className={styles.logoImage}
                />
                <div className={styles.logoName}>{clientLogo?.name}</div>
              </div>
            ) : (
              <div className={styles.logoEmpty}>No hay logo seleccionado.</div>
            )}
          </div>
        </div>
        
        {/* Credentials Display */}
        {createdClientCredentials && (createdClientCredentials.email || createdClientCredentials.password) && (
          <div className={styles.credentialsCard}>
            <div className={styles.credentialTitle}>✅ Credenciales del portal de tickets</div>
            {createdClientCredentials.email && (
              <div className={styles.credentialMeta}>📧 Usuario: {createdClientCredentials.email}</div>
            )}
            {createdClientCredentials.password && (
              <div className={styles.credentialMeta}>🔑 Contraseña: {createdClientCredentials.password}</div>
            )}
            <div className={styles.credentialNote}>
              ⚠️ Guarda estas credenciales. El cliente las usará en tickets.nexara.com.mx
            </div>
          </div>
        )}
        
        {/* Submit Button */}
        <div className={styles.footer}>
          <button className="button-primary" onClick={handleCreateClient}>
            Crear cliente
          </button>
          {clientFormMessage && (
            <span className={`${styles.message} ${clientFormMessage.includes('exitosamente') ? styles.messageSuccess : styles.messageError}`}>
              {clientFormMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';

interface ToolRequestFormProps {
  onSuccess?: () => void;
}

interface InventoryOption {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED';
}

const ToolRequestForm: React.FC<ToolRequestFormProps> = ({ onSuccess }) => {
  const { user } = useUser();
  const [toolName, setToolName] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryOption | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [generalPhoto, setGeneralPhoto] = useState<File | null>(null);
  const [specificationsPhoto, setSpecificationsPhoto] = useState<File | null>(null);
  const [generalPhotoPreview, setGeneralPhotoPreview] = useState<string | null>(null);
  const [specificationsPhotoPreview, setSpecificationsPhotoPreview] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<'general' | 'specifications' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    return () => {
      if (generalPhotoPreview) URL.revokeObjectURL(generalPhotoPreview);
      if (specificationsPhotoPreview) URL.revokeObjectURL(specificationsPhotoPreview);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [generalPhotoPreview, specificationsPhotoPreview]);

  useEffect(() => {
    if (!user?.token || inventoryQuery.trim().length < 2) {
      setInventoryOptions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setInventoryLoading(true);
        const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
        const params = new URLSearchParams({ q: inventoryQuery.trim() });
        const response = await fetch(`${API_URL}/tool-requests/inventory/search?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });

        if (!response.ok) {
          setInventoryOptions([]);
          return;
        }

        const payload = await response.json();
        setInventoryOptions(Array.isArray(payload) ? payload : []);
      } finally {
        setInventoryLoading(false);
      }
    }, 280);

    return () => clearTimeout(timeout);
  }, [inventoryQuery, user?.token]);

  const validate = () => {
    if (!toolName || toolName.length < 3) {
      setError('El nombre de la herramienta debe tener al menos 3 caracteres');
      return false;
    }
    if (!model || model.length < 2) {
      setError('El modelo es requerido');
      return false;
    }
    if (!serialNumber || serialNumber.length < 2) {
      setError('El número de serie es requerido');
      return false;
    }
    if (!reason || reason.length < 10) {
      setError('La razón debe tener al menos 10 caracteres');
      return false;
    }
    if (!startDate) {
      setError('La fecha de inicio es requerida');
      return false;
    }
    if (!expectedReturnDate) {
      setError('La fecha de devolución esperada es requerida');
      return false;
    }
    if (new Date(expectedReturnDate) <= new Date(startDate)) {
      setError('La fecha de devolución debe ser posterior a la fecha de inicio');
      return false;
    }
    if (!generalPhoto) {
      setError('Debes adjuntar la foto panorámica');
      return false;
    }
    if (!specificationsPhoto) {
      setError('Debes adjuntar la foto de especificaciones');
      return false;
    }
    setError(null);
    return true;
  };

  const startCamera = async (type: 'general' | 'specifications', facingMode: 'environment' | 'user' = 'environment') => {
    setError(null);
    setPhotoStep(type);
    setCameraFacing(facingMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setPhotoStep(null);
      setError('No se pudo acceder a la cámara. Verifica permisos del navegador.');
    }
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const flipCamera = async () => {
    stopCameraStream();
    const newFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(newFacing);
    if (photoStep) {
      await new Promise(resolve => setTimeout(resolve, 100));
      startCamera(photoStep, newFacing);
    }
  };

  const stopCamera = () => {
    stopCameraStream();
    setPhotoStep(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !photoStep) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('No se pudo capturar la foto. Intenta nuevamente.');
        return;
      }

      const fileName = `${photoStep}-${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      const preview = URL.createObjectURL(file);

      if (photoStep === 'general') {
        if (generalPhotoPreview) URL.revokeObjectURL(generalPhotoPreview);
        setGeneralPhoto(file);
        setGeneralPhotoPreview(preview);
      } else {
        if (specificationsPhotoPreview) URL.revokeObjectURL(specificationsPhotoPreview);
        setSpecificationsPhoto(file);
        setSpecificationsPhotoPreview(preview);
      }

      stopCamera();
      setError(null);
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);

    if (!user) {
      setError('Usuario no autenticado');
      return;
    }

    if (!validate()) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('usuarioId', String(user.id));
      formData.append('toolName', toolName);
      formData.append('model', model);
      formData.append('serialNumber', serialNumber);
      if (selectedInventoryItem) {
        formData.append('inventoryItemId', String(selectedInventoryItem.id));
      }
      formData.append('reason', reason);
      formData.append('startDate', new Date(startDate).toISOString());
      formData.append('expectedReturnDate', new Date(expectedReturnDate).toISOString());
      formData.append('generalPhoto', generalPhoto!);
      formData.append('specificationsPhoto', specificationsPhoto!);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tool-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al solicitar herramienta');
      }

      setSuccess('Solicitud de herramienta realizada correctamente');
      setToolName('');
      setModel('');
      setSerialNumber('');
      setSelectedInventoryItem(null);
      setInventoryQuery('');
      setInventoryOptions([]);
      setReason('');
      setStartDate('');
      setExpectedReturnDate('');
      setGeneralPhoto(null);
      setSpecificationsPhoto(null);
      if (generalPhotoPreview) URL.revokeObjectURL(generalPhotoPreview);
      if (specificationsPhotoPreview) URL.revokeObjectURL(specificationsPhotoPreview);
      setGeneralPhotoPreview(null);
      setSpecificationsPhotoPreview(null);

      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 900, display: 'grid', gap: 20 }}>
      <div>
        <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>Solicitar Herramienta</h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Completa todos los campos y adjunta fotos de la herramienta.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Herramienta del inventario *
          <input
            className="input"
            type="text"
            value={inventoryQuery}
            onChange={(e) => {
              setToolName(e.target.value);
              setInventoryQuery(e.target.value);
              if (selectedInventoryItem) {
                setSelectedInventoryItem(null);
                setToolName('');
                setModel('');
                setSerialNumber('');
              }
            }}
            placeholder="Busca por nombre, modelo o serie"
          />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {selectedInventoryItem
              ? `Seleccionada: ${selectedInventoryItem.toolName} · ${selectedInventoryItem.model} · ${selectedInventoryItem.serialNumber}`
              : 'Empieza a escribir para filtrar herramientas disponibles'}
          </div>
          {inventoryLoading && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Buscando herramientas...</div>
          )}
          {!selectedInventoryItem && inventoryOptions.length > 0 && (
            <div
              style={{
                border: '1px solid var(--muted)',
                borderRadius: 10,
                maxHeight: 180,
                overflow: 'auto',
                background: 'var(--surface-light)',
              }}
            >
              {inventoryOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedInventoryItem(option);
                    setToolName(option.toolName);
                    setModel(option.model);
                    setSerialNumber(option.serialNumber);
                    setInventoryQuery(`${option.toolName} · ${option.model} · ${option.serialNumber}`);
                    setInventoryOptions([]);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 10px',
                    border: 'none',
                    borderBottom: '1px solid var(--muted)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {option.toolName} · {option.model} · {option.serialNumber}
                </button>
              ))}
            </div>
          )}
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Modelo *
          <input
            className="input"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Ej. BOSCH GSR 120-LI"
            readOnly={Boolean(selectedInventoryItem)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Número de Serie *
          <input
            className="input"
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Ej. SN123456789"
            readOnly={Boolean(selectedInventoryItem)}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
        Motivo del uso *
        <textarea
          className="input"
          style={{ minHeight: 100, resize: 'vertical' }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe el motivo por el cual solicitas esta herramienta..."
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Fecha de inicio *
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Fecha de devolución esperada *
          <input
            className="input"
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Foto Panorámica *</div>
          <div
            style={{
              border: '1px dashed var(--muted)',
              borderRadius: 12,
              padding: 16,
              background: 'var(--surface-light)',
              display: 'grid',
              gap: 6,
              textAlign: 'center',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              Vista general de la herramienta
            </div>
            <button
              className="button-secondary"
              type="button"
              onClick={() => startCamera('general')}
              style={{ justifySelf: 'center' }}
              disabled={!!photoStep}
            >
              {generalPhoto ? '📷 Retomar foto' : '📷 Tomar foto'}
            </button>
          </div>
          {generalPhotoPreview && (
            <div
              style={{
                width: '100%',
                height: 200,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={generalPhotoPreview}
                alt="Vista panorámica"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Foto de Especificaciones *</div>
          <div
            style={{
              border: '1px dashed var(--muted)',
              borderRadius: 12,
              padding: 16,
              background: 'var(--surface-light)',
              display: 'grid',
              gap: 6,
              textAlign: 'center',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              Modelo, serie y detalles visibles
            </div>
            <button
              className="button-secondary"
              type="button"
              onClick={() => startCamera('specifications')}
              style={{ justifySelf: 'center' }}
              disabled={!!photoStep}
            >
              {specificationsPhoto ? '📷 Retomar foto' : '📷 Tomar foto'}
            </button>
          </div>
          {specificationsPhotoPreview && (
            <div
              style={{
                width: '100%',
                height: 200,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={specificationsPhotoPreview}
                alt="Especificaciones"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="button-primary" type="submit" disabled={loading || !!photoStep}>
          {loading ? 'Enviando...' : '✓ Solicitar Herramienta'}
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            setToolName('');
            setModel('');
            setSerialNumber('');
            setReason('');
            setStartDate('');
            setExpectedReturnDate('');
            setGeneralPhoto(null);
            setSpecificationsPhoto(null);
            if (generalPhotoPreview) URL.revokeObjectURL(generalPhotoPreview);
            if (specificationsPhotoPreview) URL.revokeObjectURL(specificationsPhotoPreview);
            setGeneralPhotoPreview(null);
            setSpecificationsPhotoPreview(null);
            stopCamera();
            setError(null);
            setSuccess(null);
          }}
          disabled={!!photoStep}
        >
          Limpiar
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        {success && <span style={{ color: 'var(--accent)' }}>{success}</span>}
      </div>

      {photoStep && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '8px 12px',
            backdropFilter: 'blur(6px)',
            animation: 'fadeInOverlay 0.3s ease-out',
          }}
          onClick={stopCamera}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '100vw',
              maxHeight: 'calc(100dvh - 16px)',
              background: 'linear-gradient(135deg, rgba(20,26,38,0.98), rgba(11,16,28,0.98))',
              border: '2px solid rgba(31,137,252,0.35)',
              borderRadius: '20px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 30px 60px rgba(0,0,0,0.6), 0 0 80px rgba(31,137,252,0.15)',
              animation: 'slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(31,137,252,0.2)',
                background: 'linear-gradient(135deg, rgba(31,137,252,0.12), rgba(20,162,133,0.08))',
                minHeight: '56px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: 'white', fontSize: 'clamp(16px, 4vw, 20px)', fontWeight: 700 }}>
                  📸 {photoStep === 'general' ? 'Foto Panorámica' : 'Especificaciones'}
                </h3>
                <p style={{ margin: '4px 0 0 0', color: 'rgba(207,224,255,0.7)', fontSize: '12px' }}>
                  {photoStep === 'general' ? '(Vista completa de la herramienta)' : '(Modelo, serie y detalles)'}
                </p>
              </div>
              <button 
                className="button-secondary" 
                type="button" 
                onClick={stopCamera}
                style={{ 
                  padding: '10px 14px', 
                  borderRadius: 12, 
                  fontSize: 18,
                  minWidth: 'auto',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Video Container */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 12, minHeight: 0 }}>
              <div 
                style={{ 
                  flex: 1, 
                  position: 'relative', 
                  borderRadius: 16, 
                  overflow: 'hidden', 
                  background: '#000',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 'min(56vh, 380px)',
                }}
              >
                {/* Grid overlay for composition */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: 'linear-gradient(90deg, transparent 33%, rgba(31,137,252,0.08) 33%, rgba(31,137,252,0.08) 66%, transparent 66%), linear-gradient(0deg, transparent 33%, rgba(31,137,252,0.08) 33%, rgba(31,137,252,0.08) 66%, transparent 66%)',
                  backgroundSize: '33.33% 33.33%',
                  pointerEvents: 'none',
                  zIndex: 1,
                }} />
                
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Button Container */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <button 
                  className="button-secondary" 
                  type="button" 
                  onClick={flipCamera}
                  style={{ 
                    padding: '14px 12px', 
                    borderRadius: 12, 
                    fontSize: 15,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, rgba(31,137,252,0.15), rgba(20,162,133,0.1))',
                    border: '1px solid rgba(31,137,252,0.3)',
                    color: 'rgba(207,224,255,0.95)',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    minHeight: 52,
                    touchAction: 'manipulation',
                    WebkitAppearance: 'none',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = 'translateY(-2px) scale(1.05)';
                    el.style.boxShadow = '0 8px 16px rgba(31,137,252,0.25)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = 'translateY(0) scale(1)';
                    el.style.boxShadow = 'none';
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  🔄 Voltear
                </button>
                <button 
                  className="button-secondary" 
                  type="button" 
                  onClick={stopCamera}
                  style={{ 
                    padding: '14px 12px', 
                    borderRadius: 12, 
                    fontSize: 15,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(207,224,255,0.9)',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    minHeight: 52,
                    touchAction: 'manipulation',
                    WebkitAppearance: 'none',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = 'rgba(255,255,255,0.09)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  ✕ Cancelar
                </button>
                <button 
                  className="button-primary" 
                  type="button" 
                  onClick={capturePhoto}
                  style={{ 
                    padding: '14px 12px', 
                    borderRadius: 12, 
                    fontSize: 15,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, rgb(31,137,252), rgb(20,162,133))',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    gridColumn: window.innerWidth < 480 ? 'span 2' : 'span 1',
                    minHeight: 52,
                    touchAction: 'manipulation',
                    WebkitAppearance: 'none',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = 'translateY(-3px) scale(1.08)';
                    el.style.boxShadow = '0 12px 24px rgba(31,137,252,0.35)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = 'translateY(0) scale(1)';
                    el.style.boxShadow = 'none';
                  }}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  📷 Capturar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default ToolRequestForm;

"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';

interface ToolRequestFormProps {
  onSuccess?: () => void;
}

const ToolRequestForm: React.FC<ToolRequestFormProps> = ({ onSuccess }) => {
  const { user } = useUser();
  const [toolName, setToolName] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
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

  useEffect(() => {
    return () => {
      if (generalPhotoPreview) URL.revokeObjectURL(generalPhotoPreview);
      if (specificationsPhotoPreview) URL.revokeObjectURL(specificationsPhotoPreview);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [generalPhotoPreview, specificationsPhotoPreview]);

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

  const startCamera = async (type: 'general' | 'specifications') => {
    setError(null);
    setPhotoStep(type);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
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

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
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
          Nombre de la herramienta *
          <input
            className="input"
            type="text"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            placeholder="Ej. Taladro, Destornillador, Sierra"
          />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Modelo *
          <input
            className="input"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Ej. BOSCH GSR 120-LI"
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
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(900px, 100%)',
              background: 'var(--surface)',
              border: '1px solid var(--muted)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--muted)',
              }}
            >
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                {photoStep === 'general'
                  ? '📸 Toma una foto panorámica de la herramienta'
                  : '📸 Toma una foto del modelo y número de serie'}
              </h3>
              <button className="button-secondary" type="button" onClick={stopCamera}>✕</button>
            </div>

            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', maxHeight: '65vh', borderRadius: 10, background: '#000' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="button-secondary" type="button" onClick={stopCamera}>Cancelar</button>
                <button className="button-primary" type="button" onClick={capturePhoto}>📷 Capturar foto</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default ToolRequestForm;

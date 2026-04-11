"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './ToolRequestForm.module.css';
import { io, Socket } from 'socket.io-client';

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
  const generalFileInputRef = useRef<HTMLInputElement>(null);
  const specificationsFileInputRef = useRef<HTMLInputElement>(null);
  const fallbackCameraInputRef = useRef<HTMLInputElement>(null);
  const pendingFallbackTypeRef = useRef<'general' | 'specifications' | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [dragOverPhoto, setDragOverPhoto] = useState<'general' | 'specifications' | null>(null);

  const searchInventory = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!user?.token || query.length < 2) {
      setInventoryOptions([]);
      return;
    }

    try {
      setInventoryLoading(true);
      const params = new URLSearchParams({ q: query });
      const response = await fetch(buildApiUrl(`tool-requests/inventory/search?${params.toString()}`), {
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
  }, [user?.token]);

  const applyPhotoFile = (type: 'general' | 'specifications', file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (type === 'general') {
      if (generalPhotoPreview) URL.revokeObjectURL(generalPhotoPreview);
      setGeneralPhoto(file);
      setGeneralPhotoPreview(preview);
    } else {
      if (specificationsPhotoPreview) URL.revokeObjectURL(specificationsPhotoPreview);
      setSpecificationsPhoto(file);
      setSpecificationsPhotoPreview(preview);
    }

    setError(null);
  };

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
    if (!photoStep) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopCamera();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [photoStep]);

  useEffect(() => {
    if (inventoryQuery.trim().length < 2) {
      setInventoryOptions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      searchInventory(inventoryQuery);
    }, 280);

    return () => clearTimeout(timeout);
  }, [inventoryQuery, searchInventory]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (inventoryQuery.trim().length >= 2) {
          searchInventory(inventoryQuery);
        }
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolInventoryItem', 'Inventory', 'Herramienta'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, inventoryQuery, searchInventory]);

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
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      pendingFallbackTypeRef.current = type;
      fallbackCameraInputRef.current?.click();
      return;
    }
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
      pendingFallbackTypeRef.current = type;
      fallbackCameraInputRef.current?.click();
      setPhotoStep(null);
    }
  };

  const handleFallbackCameraFile = (file?: File | null) => {
    const pendingType = pendingFallbackTypeRef.current;
    pendingFallbackTypeRef.current = null;
    if (!file || !pendingType) return;
    applyPhotoFile(pendingType, file);
    setError(null);
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
      applyPhotoFile(photoStep, file);

      stopCamera();
      setError(null);
    }, 'image/jpeg', 0.9);
  };

  const handleDropPhoto = (type: 'general' | 'specifications', e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverPhoto(null);
    const file = e.dataTransfer.files?.[0];
    if (file) applyPhotoFile(type, file);
  };

  const handleFileChange = (type: 'general' | 'specifications', file?: File | null) => {
    if (file) applyPhotoFile(type, file);
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

      const res = await fetch(buildApiUrl('tool-requests'), {
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
    <form className={`card ${styles.form}`} onSubmit={handleSubmit}>
      <input
        ref={fallbackCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        onChange={(e) => {
          handleFallbackCameraFile(e.target.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      <div>
        <h3 className={styles.headerTitle}>Solicitar Herramienta</h3>
        <div className={styles.headerText}>
          Completa todos los campos y adjunta fotos de la herramienta.
        </div>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.fieldLabel}>
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
          <div className={styles.inventoryHint}>
            {selectedInventoryItem
              ? `Seleccionada: ${selectedInventoryItem.toolName} · ${selectedInventoryItem.model} · ${selectedInventoryItem.serialNumber}`
              : 'Empieza a escribir para filtrar herramientas disponibles'}
          </div>
          {inventoryLoading && (
            <div className={styles.inventoryLoading}>Buscando herramientas...</div>
          )}
          {!selectedInventoryItem && inventoryOptions.length > 0 && (
            <div className={styles.inventoryOptions}>
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
                  className={styles.inventoryOptionButton}
                >
                  {option.toolName} · {option.model} · {option.serialNumber}
                </button>
              ))}
            </div>
          )}
        </label>
        <label className={styles.fieldLabel}>
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
        <label className={styles.fieldLabel}>
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

      <label className={styles.fieldLabel}>
        Motivo del uso *
        <textarea
          className={`input ${styles.reasonInput}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe el motivo por el cual solicitas esta herramienta..."
        />
      </label>

      <div className={styles.dateGrid}>
        <label className={styles.fieldLabel}>
          Fecha de inicio *
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className={styles.fieldLabel}>
          Fecha de devolución esperada *
          <input
            className="input"
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.photoGrid}>
        <div className={styles.photoCard}>
          <div className={styles.photoTitle}>Foto Panorámica *</div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPhoto('general');
            }}
            onDragLeave={() => setDragOverPhoto((current) => (current === 'general' ? null : current))}
            onDrop={(e) => handleDropPhoto('general', e)}
            onClick={() => generalFileInputRef.current?.click()}
            className={`${styles.dropzone} ${dragOverPhoto === 'general' ? styles.dropzoneActive : ''}`}
          >
            <div className={styles.dropzoneText}>
              📸 Foto panorámica — arrastra una imagen o haz click para seleccionarla
            </div>
            <input
              ref={generalFileInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => handleFileChange('general', e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                generalFileInputRef.current?.click();
              }}
              className={`button-secondary ${styles.smallButton}`}
              disabled={!!photoStep}
            >
              Seleccionar imagen
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startCamera('general');
              }}
              className={`button-secondary ${styles.smallButton}`}
              disabled={!!photoStep}
            >
              {generalPhoto ? '📷 Retomar foto' : '📷 Tomar foto'}
            </button>
            {generalPhoto && (
              <div className={styles.fileName}>
                Archivo: {generalPhoto.name}
              </div>
            )}
          </div>
          {generalPhotoPreview && (
            <div className={styles.previewBox}>
              <img
                src={generalPhotoPreview}
                alt="Vista panorámica"
                className={styles.previewImage}
              />
            </div>
          )}
        </div>

        <div className={styles.photoCard}>
          <div className={styles.photoTitle}>Foto de Especificaciones *</div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPhoto('specifications');
            }}
            onDragLeave={() => setDragOverPhoto((current) => (current === 'specifications' ? null : current))}
            onDrop={(e) => handleDropPhoto('specifications', e)}
            onClick={() => specificationsFileInputRef.current?.click()}
            className={`${styles.dropzone} ${dragOverPhoto === 'specifications' ? styles.dropzoneActive : ''}`}
          >
            <div className={styles.dropzoneText}>
              🔎 Foto de serie/modelo — arrastra una imagen o haz click para seleccionarla
            </div>
            <input
              ref={specificationsFileInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => handleFileChange('specifications', e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                specificationsFileInputRef.current?.click();
              }}
              className={`button-secondary ${styles.smallButton}`}
              disabled={!!photoStep}
            >
              Seleccionar imagen
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startCamera('specifications');
              }}
              className={`button-secondary ${styles.smallButton}`}
              disabled={!!photoStep}
            >
              {specificationsPhoto ? '📷 Retomar foto' : '📷 Tomar foto'}
            </button>
            {specificationsPhoto && (
              <div className={styles.fileName}>
                Archivo: {specificationsPhoto.name}
              </div>
            )}
          </div>
          {specificationsPhotoPreview && (
            <div className={styles.previewBox}>
              <img
                src={specificationsPhotoPreview}
                alt="Especificaciones"
                className={styles.previewImage}
              />
            </div>
          )}
        </div>
      </div>

      <div className={styles.actionsRow}>
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
            if (generalFileInputRef.current) generalFileInputRef.current.value = '';
            if (specificationsFileInputRef.current) specificationsFileInputRef.current.value = '';
            stopCamera();
            setError(null);
            setSuccess(null);
          }}
          disabled={!!photoStep}
        >
          Limpiar
        </button>
        {error && <span className={styles.feedbackError}>{error}</span>}
        {success && <span className={styles.feedbackSuccess}>{success}</span>}
      </div>

      {photoStep && (
        <div className={styles.cameraOverlay} onClick={stopCamera} aria-hidden="true">
          <div
            className={styles.cameraModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={photoStep === 'general' ? 'Capturar foto panorámica de herramienta' : 'Capturar foto de especificaciones de herramienta'}
          >
            {/* Header */}
            <div className={styles.cameraHeader}>
              <div>
                <h3 className={styles.cameraHeaderTitle}>
                  📸 {photoStep === 'general' ? 'Foto Panorámica' : 'Especificaciones'}
                </h3>
                <p className={styles.cameraHeaderHint}>
                  {photoStep === 'general' ? '(Vista completa de la herramienta)' : '(Modelo, serie y detalles)'}
                </p>
              </div>
              <button 
                className={`button-secondary ${styles.cameraClose}`}
                type="button" 
                onClick={stopCamera}
              >
                ✕
              </button>
            </div>

            {/* Video Container */}
            <div className={styles.cameraBody}>
              <div className={styles.cameraFrame}>
                {/* Grid overlay for composition */}
                <div className={styles.cameraGridOverlay} />
                
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className={styles.cameraVideo}
                />
              </div>

              <canvas ref={canvasRef} className={styles.cameraCanvas} />

              {/* Button Container */}
              <div className={styles.cameraActions}>
                <button 
                  className={`button-secondary ${styles.cameraActionBtn}`}
                  type="button" 
                  onClick={flipCamera}
                >
                  🔄 Voltear
                </button>
                <button 
                  className={`button-secondary ${styles.cameraActionBtn}`}
                  type="button" 
                  onClick={stopCamera}
                >
                  ✕ Cancelar
                </button>
                <button 
                  className={`button-primary ${styles.cameraActionBtn} ${styles.captureBtn}`}
                  type="button" 
                  onClick={capturePhoto}
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

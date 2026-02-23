"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';
import { createPortal } from 'react-dom';

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
}

interface EvidenceFlowData {
  activityId: number;
  step: 'ENTRY_PHOTO' | 'EVIDENCE_PHOTOS' | 'SERVICE_SHEET_PDF' | 'SERVICE_SHEET_DATA' | 'EXIT_PHOTO' | 'COMPLETED';
  entryPhotoUrl?: string;
  entryLatitude?: number;
  entryLongitude?: number;
  evidencePhotos: string[];
  serviceSheetPdfUrl?: string;
  serviceSheetData?: any;
  exitPhotoUrl?: string;
  exitLatitude?: number;
  exitLongitude?: number;
}

const ActivityEvidenceFlow = () => {
  const { user } = useUser();
  const [actividades, setActividades] = useState<ActivityOption[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<number | ''>('');
  const [flowData, setFlowData] = useState<EvidenceFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/\.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  // Cargar actividades
  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActividades(Array.isArray(data) ? data : []))
      .catch(() => setActividades([]));
  }, [user?.token]);

  // Cuando selecciona una actividad
  const handleActivitySelect = async (activityId: number) => {
    setSelectedActivityId(activityId);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${activityId}`), {
        headers: { Authorization: `Bearer ${user!.token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setFlowData({
          activityId,
          step: data.status,
          entryPhotoUrl: data.entryPhotoUrl,
          entryLatitude: data.entryLatitude,
          entryLongitude: data.entryLongitude,
          evidencePhotos: data.evidencePhotos || [],
          serviceSheetPdfUrl: data.serviceSheetPdfUrl,
          serviceSheetData: data.serviceSheetData,
          exitPhotoUrl: data.exitPhotoUrl,
          exitLatitude: data.exitLatitude,
          exitLongitude: data.exitLongitude,
        });
      } else {
        // Crear nuevo flujo
        setFlowData({
          activityId,
          step: 'ENTRY_PHOTO',
          evidencePhotos: [],
        });
      }
    } catch (err) {
      setError('Error al cargar evidencias');
    } finally {
      setLoading(false);
    }
  };

  // Paso 1: Foto de entrada
  const handleEntryPhoto = async () => {
    if (!flowData || !cameraActive) return;

    try {
      // Capturar foto
      const photoUrl = await capturePhoto();

      // Obtener geolocalización
      const { latitude, longitude } = await getGeolocation();

      // Guardar en backend
      const res = await fetch(buildApiUrl(`activity-evidence/${flowData.activityId}/entry-photo`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify({
          photoUrl,
          latitude,
          longitude,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setFlowData({
          ...flowData,
          step: 'EVIDENCE_PHOTOS',
          entryPhotoUrl: photoUrl,
          entryLatitude: latitude,
          entryLongitude: longitude,
        });
        setSuccessMsg('✅ Foto de entrada guardada. Siguiente: Evidencias (4-8 fotos)');
        setCameraActive(false);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar foto de entrada');
      }
    } catch (err) {
      setError('Error al capturar foto');
    }
  };

  // Paso 2: Fotos de evidencia
  const handleAddEvidencePhoto = async () => {
    if (!flowData) return;

    try {
      const photoUrl = await capturePhoto();

      const updatedPhotos = [...(flowData.evidencePhotos || []), photoUrl];

      if (updatedPhotos.length >= 4 && updatedPhotos.length <= 8) {
        setFlowData({ ...flowData, evidencePhotos: updatedPhotos });
      }
    } catch (err) {
      setError('Error al capturar foto de evidencia');
    }
  };

  const handleRemoveEvidencePhoto = (index: number) => {
    if (!flowData) return;
    const updatedPhotos = flowData.evidencePhotos.filter((_, i) => i !== index);
    setFlowData({ ...flowData, evidencePhotos: updatedPhotos });
  };

  const handleSaveEvidencePhotos = async () => {
    if (!flowData || flowData.evidencePhotos.length < 4) {
      setError('Mínimo 4 fotos de evidencia requeridas');
      return;
    }

    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${flowData.activityId}/evidence-photos`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify({ photoUrls: flowData.evidencePhotos }),
      });

      if (res.ok) {
        const updated = await res.json();
        setFlowData({ ...flowData, step: 'SERVICE_SHEET_PDF' });
        setSuccessMsg('✅ Evidencias guardadas. Siguiente: Hoja de servicio PDF');
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar evidencias');
      }
    } catch (err) {
      setError('Error al guardar evidencias');
    }
  };

  // Paso 3: Hoja de servicio PDF
  const handleServiceSheetPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !flowData) return;

    try {
      // En producción, subir a storage y obtener URL
      const pdfUrl = await uploadFileToStorage(file);

      const res = await fetch(buildApiUrl(`activity-evidence/${flowData.activityId}/service-sheet-pdf`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify({ pdfUrl }),
      });

      if (res.ok) {
        setFlowData({ ...flowData, step: 'SERVICE_SHEET_DATA', serviceSheetPdfUrl: pdfUrl });
        setSuccessMsg('✅ PDF guardado. Siguiente: Completa la plantilla interna');
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar PDF');
      }
    } catch (err) {
      setError('Error al cargar PDF');
    }
  };

  // Paso 4: Plantilla de hoja de servicio
  const handleServiceSheetDataSubmit = async (data: any) => {
    if (!flowData) return;

    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${flowData.activityId}/service-sheet-data`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setFlowData({ ...flowData, step: 'EXIT_PHOTO', serviceSheetData: data });
        setSuccessMsg('✅ Plantilla completada. Siguiente: Foto de salida');
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar plantilla');
      }
    } catch (err) {
      setError('Error al guardar plantilla');
    }
  };

  // Paso 5: Foto de salida
  const handleExitPhoto = async () => {
    if (!flowData || !cameraActive) return;

    try {
      const photoUrl = await capturePhoto();
      const { latitude, longitude } = await getGeolocation();

      const res = await fetch(buildApiUrl(`activity-evidence/${flowData.activityId}/exit-photo`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify({ photoUrl, latitude, longitude }),
      });

      if (res.ok) {
        setFlowData({
          ...flowData,
          step: 'COMPLETED',
          exitPhotoUrl: photoUrl,
          exitLatitude: latitude,
          exitLongitude: longitude,
        });
        setSuccessMsg('🎉 ¡Asignación completada exitosamente!');
        setCameraActive(false);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar foto de salida');
      }
    } catch (err) {
      setError('Error al capturar foto de salida');
    }
  };

  // Utilidades
  const capturePhoto = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        .then((stream) => {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(video.videoWidth, 640);
            canvas.height = Math.min(video.videoHeight, 480);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const photoUrl = canvas.toDataURL('image/jpeg', 0.4);
              stream.getTracks().forEach((track) => track.stop());
              resolve(photoUrl);
            } else {
              reject('Error al capturar foto');
            }
          };
        })
        .catch(() => reject('Error al acceder a cámara'));
    });
  };

  const getGeolocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => reject('Error al obtener ubicación'),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });
  };

  const uploadFileToStorage = async (file: File): Promise<string> => {
    // Implementar carga a storage (S3, Cloudinary, etc)
    // Por ahora, retornar un placeholder
    return `data:application/pdf;base64,${await fileToBase64(file)}`;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject('Error al leer archivo');
      reader.readAsDataURL(file);
    });
  };

  if (!user) return <div>Cargando...</div>;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Flujo de Evidencias - 5 Pasos</h2>

      {error && (
        <div style={{ padding: 12, backgroundColor: '#fee', color: '#c00', borderRadius: 4, marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: 12, backgroundColor: '#efe', color: '#060', borderRadius: 4, marginBottom: 12 }}>
          {successMsg}
        </div>
      )}

      {/* Selector de actividad */}
      {!flowData && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            Selecciona una actividad:
          </label>
          <select
            value={selectedActivityId}
            onChange={(e) => handleActivitySelect(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 4,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">-- Selecciona una actividad --</option>
            {actividades.map((act) => (
              <option key={act.id} value={act.id}>
                {act.anNumber} - {act.titulo}
              </option>
            ))}
          </select>
        </div>
      )}

      {flowData && (
        <div>
          <div style={{ marginBottom: 20, padding: 12, backgroundColor: 'var(--bg-secondary)', borderRadius: 4 }}>
            <strong>Actividad:</strong> {actividades.find((a) => a.id === flowData.activityId)?.anNumber}
          </div>

          {/* Paso 1: Foto de entrada */}
          {flowData.step === 'ENTRY_PHOTO' && (
            <div style={{ padding: 16, border: '2px solid var(--primary)', borderRadius: 4, marginBottom: 16 }}>
              <h3>Paso 1: Foto de Entrada</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Toma una foto de entrada con tu cámara. Se guardará automáticamente con tu ubicación.
              </p>
              <button
                onClick={() => setCameraActive(!cameraActive)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: cameraActive ? '#f00' : 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  marginRight: 10,
                  marginBottom: 10,
                }}
              >
                {cameraActive ? '🔴 Detener Cámara' : '📷 Abrir Cámara'}
              </button>
              {cameraActive && (
                <button
                  onClick={handleEntryPhoto}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    marginBottom: 10,
                  }}
                >
                  ✓ Guardar Foto de Entrada
                </button>
              )}
            </div>
          )}

          {/* Paso 2: Fotos de evidencia */}
          {flowData.step === 'EVIDENCE_PHOTOS' && (
            <div style={{ padding: 16, border: '2px solid var(--accent)', borderRadius: 4, marginBottom: 16 }}>
              <h3>Paso 2: Evidencias (4-8 fotos)</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Toma fotos de evidencia. Mínimo 4, máximo 8.
              </p>
              <button
                onClick={() => setCameraActive(!cameraActive)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: cameraActive ? '#f00' : 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  marginRight: 10,
                  marginBottom: 10,
                }}
              >
                {cameraActive ? '🔴 Detener' : '📷 Capturar'}
              </button>
              {cameraActive && (
                <button
                  onClick={handleAddEvidencePhoto}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    marginRight: 10,
                    marginBottom: 10,
                  }}
                >
                  ✓ Agregar Foto
                </button>
              )}
              <div style={{ marginBottom: 12 }}>
                <strong>Fotos ({flowData.evidencePhotos.length}/8):</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
                  {flowData.evidencePhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '100%',
                        paddingBottom: '100%',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={photo}
                        alt={`evidencia ${idx + 1}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      <button
                        onClick={() => handleRemoveEvidencePhoto(idx)}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          width: 24,
                          height: 24,
                          padding: 0,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {flowData.evidencePhotos.length >= 4 && (
                <button
                  onClick={handleSaveEvidencePhotos}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--success)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  ✓ Guardar Evidencias →
                </button>
              )}
            </div>
          )}

          {/* Paso 3: Hoja de servicio PDF */}
          {flowData.step === 'SERVICE_SHEET_PDF' && (
            <div style={{ padding: 16, border: '2px solid #f90', borderRadius: 4, marginBottom: 16 }}>
              <h3>Paso 3: Hoja de Servicio (PDF)</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Sube el PDF de la hoja de servicio. Este es obligatorio.
              </p>
              <input
                type="file"
                accept=".pdf"
                onChange={handleServiceSheetPdfUpload}
                style={{
                  display: 'block',
                  marginBottom: 10,
                  padding: '8px 0',
                }}
              />
              {flowData.serviceSheetPdfUrl && (
                <a
                  href={flowData.serviceSheetPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                >
                  📄 Ver PDF
                </a>
              )}
            </div>
          )}

          {/* Paso 4: Plantilla de hoja de servicio */}
          {flowData.step === 'SERVICE_SHEET_DATA' && (
            <div style={{ padding: 16, border: '2px solid #060', borderRadius: 4, marginBottom: 16 }}>
              <h3>Paso 4: Plantilla Interna</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Completa los datos de la plantilla interna de hoja de servicio.
              </p>
              <ServiceSheetInternalForm
                onSubmit={handleServiceSheetDataSubmit}
              />
            </div>
          )}

          {/* Paso 5: Foto de salida */}
          {flowData.step === 'EXIT_PHOTO' && (
            <div style={{ padding: 16, border: '2px solid #c00', borderRadius: 4, marginBottom: 16 }}>
              <h3>Paso 5: Foto de Salida</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Toma la foto de salida. Debe ser capturada en el momento.
              </p>
              <button
                onClick={() => setCameraActive(!cameraActive)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: cameraActive ? '#f00' : 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  marginRight: 10,
                  marginBottom: 10,
                }}
              >
                {cameraActive ? '🔴 Detener Cámara' : '📷 Abrir Cámara'}
              </button>
              {cameraActive && (
                <button
                  onClick={handleExitPhoto}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--success)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  ✓ Guardar Foto de Salida
                </button>
              )}
            </div>
          )}

          {/* Completado */}
          {flowData.step === 'COMPLETED' && (
            <div
              style={{
                padding: 20,
                backgroundColor: '#efe',
                border: '2px solid #060',
                borderRadius: 4,
                textAlign: 'center',
              }}
            >
              <h3 style={{ color: '#060', marginBottom: 12 }}>🎉 ¡Asignación Completada Exitosamente!</h3>
              <p>Todos los pasos han sido completados correctamente.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Componente para la plantilla interna
const ServiceSheetInternalForm = ({ onSubmit }: { onSubmit: (data: any) => void }) => {
  const [formData, setFormData] = useState({
    managerName: '',
    managerRole: '',
    workSummary: '',
    observations: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <input
        type="text"
        placeholder="Nombre del Gerente"
        value={formData.managerName}
        onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
        }}
      />
      <input
        type="text"
        placeholder="Cargo"
        value={formData.managerRole}
        onChange={(e) => setFormData({ ...formData, managerRole: e.target.value })}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
        }}
      />
      <textarea
        placeholder="Resumen del trabajo realizado"
        value={formData.workSummary}
        onChange={(e) => setFormData({ ...formData, workSummary: e.target.value })}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          minHeight: 100,
          fontFamily: 'inherit',
        }}
      />
      <textarea
        placeholder="Observaciones"
        value={formData.observations}
        onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          minHeight: 100,
          fontFamily: 'inherit',
        }}
      />
      <button
        type="submit"
        style={{
          padding: '10px 20px',
          backgroundColor: 'var(--primary)',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        ✓ Completar Plantilla →
      </button>
    </form>
  );
};

export default ActivityEvidenceFlow;

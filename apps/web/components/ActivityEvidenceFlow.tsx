"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
  workType?: 'ISSUE' | 'PREVENTIVE_INVENTORY';
}

interface EvidenceFlowData {
  activityId: number;
  step: 'ENTRY_PHOTO' | 'EVIDENCE_PHOTOS' | 'SERVICE_SHEET_PDF' | 'SERVICE_SHEET_DATA' | 'EXIT_PHOTO' | 'COMPLETED';
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectedStep?: string;
  reviewNotes?: string;
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

interface InventoryDraftItem {
  sectionName: string;
  groupName: string;
  equipmentName: string;
  serialNumber: string;
  model: string;
  panoramicPhotoUrl: string;
  closeupPhotoUrl: string;
  stickerPhotoUrl: string;
  serialBefore: string;
  serialAfter: string;
  modelBefore: string;
  modelAfter: string;
  beforePanoramicPhotoUrl: string;
  beforeCloseupPhotoUrl: string;
  afterPanoramicPhotoUrl: string;
  afterCloseupPhotoUrl: string;
  maintenanceStickerPhotoUrl: string;
  maintenanceActions: string;
  maintenanceComments: string;
  itemStatus: string;
  notes: string;
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
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [inventoryItems, setInventoryItems] = useState<InventoryDraftItem[]>([]);
  const [inventoryNotes, setInventoryNotes] = useState('');
  const [inventoryPreviousCount, setInventoryPreviousCount] = useState(0);
  const [inventoryUploadingKey, setInventoryUploadingKey] = useState<string | null>(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const inventoryFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/\.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const isCorrection = flowData?.reviewStatus === 'REJECTED';
  const selectedActivity = actividades.find((activity) => activity.id === Number(selectedActivityId || flowData?.activityId));
  const isInventoryFlow = selectedActivity?.workType === 'PREVENTIVE_INVENTORY';
  const actionGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    width: '100%',
  };
  const actionPrimaryStyle: React.CSSProperties = {
    minHeight: 52,
    padding: '14px 12px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 'bold',
    touchAction: 'manipulation',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  };
  const actionSecondaryStyle: React.CSSProperties = {
    minHeight: 52,
    padding: '14px 12px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 'bold',
    touchAction: 'manipulation',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  };

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
    setSuccessMsg(null);
    setInventoryItems([]);
    setInventoryNotes('');
    setInventoryPreviousCount(0);

    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${activityId}`), {
        headers: { Authorization: `Bearer ${user!.token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setFlowData({
          activityId,
          step: data.status,
          reviewStatus: data.reviewStatus,
          rejectedStep: data.rejectedStep,
          reviewNotes: data.reviewNotes,
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

        if ((data.activity?.workType || selectedActivity?.workType) === 'PREVENTIVE_INVENTORY') {
          const invRes = await fetch(buildApiUrl(`inventories/activity/${activityId}`), {
            headers: { Authorization: `Bearer ${user!.token}` },
          });
          const invData = invRes.ok ? await invRes.json() : null;
          const incoming = Array.isArray(invData?.items) ? invData.items : [];
          setInventoryItems(
            incoming.map((item: any) => ({
              sectionName: item.sectionName || '',
              groupName: item.groupName || 'GENERAL',
              equipmentName: item.equipmentName || '',
              serialNumber: item.serialAfter || item.serialNumber || item.serialBefore || '',
              model: item.modelAfter || item.model || item.modelBefore || '',
              panoramicPhotoUrl: item.afterPanoramicPhotoUrl || item.panoramicPhotoUrl || item.beforePanoramicPhotoUrl || '',
              closeupPhotoUrl: item.afterCloseupPhotoUrl || item.closeupPhotoUrl || item.beforeCloseupPhotoUrl || '',
              stickerPhotoUrl: item.maintenanceStickerPhotoUrl || item.stickerPhotoUrl || '',
              serialBefore: item.serialBefore || item.serialNumber || '',
              serialAfter: item.serialAfter || item.serialNumber || '',
              modelBefore: item.modelBefore || item.model || '',
              modelAfter: item.modelAfter || item.model || '',
              beforePanoramicPhotoUrl: item.beforePanoramicPhotoUrl || item.panoramicPhotoUrl || '',
              beforeCloseupPhotoUrl: item.beforeCloseupPhotoUrl || item.closeupPhotoUrl || '',
              afterPanoramicPhotoUrl: item.afterPanoramicPhotoUrl || item.panoramicPhotoUrl || '',
              afterCloseupPhotoUrl: item.afterCloseupPhotoUrl || item.closeupPhotoUrl || '',
              maintenanceStickerPhotoUrl: item.maintenanceStickerPhotoUrl || item.stickerPhotoUrl || '',
              maintenanceActions: item.maintenanceActions || '',
              maintenanceComments: item.maintenanceComments || '',
              itemStatus: item.itemStatus || 'ACTIVE',
              notes: item.notes || '',
            })),
          );
          setInventoryNotes(invData?.notes || '');
          setInventoryPreviousCount(Number(invData?.previousCount || 0));
        }
      } else {
        // Crear nuevo flujo
        setFlowData({
          activityId,
          step: 'ENTRY_PHOTO',
          evidencePhotos: [],
        });
        setInventoryItems([]);
        setInventoryNotes('');
        setInventoryPreviousCount(0);
      }
    } catch (err) {
      setError('Error al cargar evidencias');
    } finally {
      setLoading(false);
    }
  };

  // Capturar foto desde cámara
  const capturePhoto = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: cameraFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        .then((stream) => {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            setTimeout(() => {
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
            }, 100);
          };
        })
        .catch(() => reject('Error al acceder a cámara'));
    });
  };

  // Obtener ubicación
  const getGeolocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => reject('Error al obtener ubicación'),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });
  };

  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = API_URL.replace(/\/+api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const uploadInventoryImage = async (file: File) => {
    const formData = new FormData();
    formData.append('files', file);
    const res = await fetch(buildApiUrl('inventories/upload'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user!.token}` },
      body: formData,
    });
    if (!res.ok) throw new Error('No se pudo subir la imagen de inventario');
    const payload = await res.json().catch(() => ({}));
    const url = Array.isArray(payload?.urls) ? payload.urls[0] : null;
    if (!url) throw new Error('No se recibió URL de imagen');
    return url as string;
  };

  const setInventoryImageField = async (
    index: number,
    field:
      | 'beforePanoramicPhotoUrl'
      | 'beforeCloseupPhotoUrl'
      | 'afterPanoramicPhotoUrl'
      | 'afterCloseupPhotoUrl'
      | 'maintenanceStickerPhotoUrl',
    file?: File | null,
  ) => {
    if (!file || !file.type.startsWith('image/')) return;
    setInventoryUploadingKey(`${index}-${field}`);
    setError(null);
    try {
      const url = await uploadInventoryImage(file);
      setInventoryItems((prev) =>
        prev.map((current, itemIndex) => {
          if (itemIndex !== index) return current;
          if (field === 'afterPanoramicPhotoUrl') {
            return { ...current, afterPanoramicPhotoUrl: url, panoramicPhotoUrl: url };
          }
          if (field === 'afterCloseupPhotoUrl') {
            return { ...current, afterCloseupPhotoUrl: url, closeupPhotoUrl: url };
          }
          if (field === 'maintenanceStickerPhotoUrl') {
            return { ...current, maintenanceStickerPhotoUrl: url, stickerPhotoUrl: url };
          }
          return { ...current, [field]: url };
        }),
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir imagen');
    } finally {
      setInventoryUploadingKey(null);
    }
  };

  // Paso 1: Foto de entrada
  const handleEntryPhoto = async () => {
    if (!flowData) return;
    setLoading(true);
    setError(null);

    try {
      const photoUrl = await capturePhoto();
      const { latitude, longitude } = await getGeolocation();

      const endpoint = isCorrection 
        ? `activity-evidence/${flowData.activityId}/resubmit`
        : `activity-evidence/${flowData.activityId}/entry-photo`;

      const body = isCorrection
        ? { step: 'ENTRY_PHOTO', data: { photoUrl, latitude, longitude } }
        : { photoUrl, latitude, longitude };

      const res = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = await res.json();
        setFlowData({
          ...flowData,
          step: 'EVIDENCE_PHOTOS',
          entryPhotoUrl: photoUrl,
          entryLatitude: latitude,
          entryLongitude: longitude,
          reviewStatus: isCorrection ? 'PENDING' : flowData.reviewStatus,
          rejectedStep: undefined,
        });
        setSuccessMsg(isCorrection 
          ? '✅ Corrección enviada. Siguiente: Tomar evidencias (4-8 fotos)' 
          : '✅ Foto de entrada guardada. Siguiente: Tomar evidencias (4-8 fotos)');
        setCameraActive(false);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar foto');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al capturar foto');
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: Agregar foto de evidencia
  const handleAddEvidencePhoto = async () => {
    if (!flowData) return;
    setLoading(true);
    setError(null);

    try {
      const photoUrl = await capturePhoto();
      const updatedPhotos = [...flowData.evidencePhotos, photoUrl];
      setFlowData({ ...flowData, evidencePhotos: updatedPhotos });
      
      if (updatedPhotos.length === 1) {
        setSuccessMsg(`📷 Foto agregada (1/${updatedPhotos.length})`);
      } else {
        setSuccessMsg(`📷 Foto agregada (${updatedPhotos.length} de 4-8)`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al capturar foto');
    } finally {
      setLoading(false);
    }
  };

  // Remover foto de evidencia
  const handleRemoveEvidencePhoto = (index: number) => {
    if (!flowData) return;
    const updatedPhotos = flowData.evidencePhotos.filter((_, i) => i !== index);
    setFlowData({ ...flowData, evidencePhotos: updatedPhotos });
    setError(null);
  };

  // Guardar todas las fotos de evidencia y avanzar
  const handleSaveEvidencePhotos = async () => {
    if (!flowData) return;
    if (!isInventoryFlow && flowData.evidencePhotos.length < 4) {
      setError(`Mínimo 4 fotos requeridas (tienes ${flowData?.evidencePhotos.length || 0})`);
      return;
    }
    if (isInventoryFlow && flowData.evidencePhotos.length < 1) {
      setError('Para mantenimiento e inventario se requiere al menos 1 evidencia visual');
      return;
    }
    if (isInventoryFlow && inventoryItems.length < 1) {
      setError('Captura al menos 1 equipo en el inventario comparativo');
      return;
    }
    if (isInventoryFlow) {
      const invalidIndex = inventoryItems.findIndex((item) => {
        const hasCore = item.equipmentName.trim() && item.groupName.trim();
        const hasBefore = item.serialBefore.trim() && item.modelBefore.trim() && item.beforePanoramicPhotoUrl.trim() && item.beforeCloseupPhotoUrl.trim();
        const hasAfter = item.serialAfter.trim() && item.modelAfter.trim() && item.afterPanoramicPhotoUrl.trim() && item.afterCloseupPhotoUrl.trim();
        const hasMaintenance = item.maintenanceStickerPhotoUrl.trim() && item.maintenanceComments.trim();
        return !(hasCore && hasBefore && hasAfter && hasMaintenance);
      });
      if (invalidIndex >= 0) {
        setError(`Completa datos antes/después y comentario de mantenimiento en el equipo #${invalidIndex + 1}`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      if (isInventoryFlow) {
        await fetch(buildApiUrl(`inventories/activity/${flowData.activityId}/sync`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user!.token}`,
          },
          body: JSON.stringify({
            title: `Inventario comparativo ${selectedActivity?.anNumber || flowData.activityId}`,
            notes: inventoryNotes,
            completed: false,
            items: inventoryItems,
          }),
        });
      }

      const endpoint = isCorrection
        ? `activity-evidence/${flowData.activityId}/resubmit`
        : `activity-evidence/${flowData.activityId}/evidence-photos`;

      const body = isCorrection
        ? { step: 'EVIDENCE_PHOTOS', data: { photoUrls: flowData.evidencePhotos } }
        : { photoUrls: flowData.evidencePhotos };

      const res = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setFlowData({ 
          ...flowData, 
          step: 'SERVICE_SHEET_PDF',
          reviewStatus: isCorrection ? 'PENDING' : flowData.reviewStatus,
          rejectedStep: undefined,
        });
        setSuccessMsg(isCorrection 
          ? '✅ Corrección enviada. Siguiente: Carga hoja de servicio PDF' 
          : '✅ Evidencias guardadas. Siguiente: Carga hoja de servicio PDF');
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar evidencias');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  // Paso 3: Cargar PDF
  const handleServiceSheetPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    await handleServiceSheetPdfFile(file);
  };

  const handleServiceSheetPdfFile = async (file?: File | null) => {
    if (!file || !flowData) return;
    if (file.type !== 'application/pdf') {
      setError('Solo se permite archivo PDF');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convertir PDF a base64
      const reader = new FileReader();
      reader.onload = async () => {
        const pdfUrl = reader.result as string;

        const endpoint = isCorrection
          ? `activity-evidence/${flowData.activityId}/resubmit`
          : `activity-evidence/${flowData.activityId}/service-sheet-pdf`;

        const body = isCorrection
          ? { step: 'SERVICE_SHEET_PDF', data: { pdfUrl } }
          : { pdfUrl };

        const res = await fetch(buildApiUrl(endpoint), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user!.token}`,
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          setFlowData({ 
            ...flowData, 
            step: 'SERVICE_SHEET_DATA', 
            serviceSheetPdfUrl: pdfUrl,
            reviewStatus: isCorrection ? 'PENDING' : flowData.reviewStatus,
            rejectedStep: undefined,
          });
          setSuccessMsg(isCorrection 
            ? '✅ Corrección enviada. Siguiente: Completa la plantilla interna' 
            : '✅ PDF guardado. Siguiente: Completa la plantilla interna');
        } else {
          const errorData = await res.json();
          setError(errorData.message || 'Error al cargar PDF');
        }
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar PDF');
      setLoading(false);
    }
  };

  // Paso 4: Guardar plantilla interna
  const handleServiceSheetFormSubmit = async (data: any) => {
    if (!flowData) return;
    setLoading(true);
    setError(null);

    try {
      const endpoint = isCorrection
        ? `activity-evidence/${flowData.activityId}/resubmit`
        : `activity-evidence/${flowData.activityId}/service-sheet-data`;

      const body = isCorrection
        ? { step: 'SERVICE_SHEET_DATA', data: { formData: data } }
        : data;

      const res = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setFlowData({ 
          ...flowData, 
          step: 'EXIT_PHOTO', 
          serviceSheetData: data,
          reviewStatus: isCorrection ? 'PENDING' : flowData.reviewStatus,
          rejectedStep: undefined,
        });
        setSuccessMsg(isCorrection 
          ? '✅ Corrección enviada. Siguiente: Toma foto de salida' 
          : '✅ Plantilla completada. Siguiente: Toma foto de salida');
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar plantilla');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  // Paso 5: Foto de salida
  const handleExitPhoto = async () => {
    if (!flowData) return;
    setLoading(true);
    setError(null);

    try {
      if (isInventoryFlow) {
        const delta = inventoryItems.length - inventoryPreviousCount;
        if (delta !== 0) {
          const proceed = window.confirm(
            `Se detectaron ${Math.abs(delta)} equipos ${delta > 0 ? 'de más' : 'de menos'} vs inventario previo. ¿Deseas guardar de todos modos?`,
          );
          if (!proceed) {
            setLoading(false);
            return;
          }
        }

        const syncRes = await fetch(buildApiUrl(`inventories/activity/${flowData.activityId}/sync`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user!.token}`,
          },
          body: JSON.stringify({
            title: `Inventario comparativo ${selectedActivity?.anNumber || flowData.activityId}`,
            notes: inventoryNotes,
            completed: true,
            confirmDifference: true,
            items: inventoryItems,
          }),
        });

        if (!syncRes.ok) {
          const syncError = await syncRes.json().catch(() => ({}));
          setError(syncError.message || 'No se pudo guardar el inventario final');
          setLoading(false);
          return;
        }
      }

      const photoUrl = await capturePhoto();
      const { latitude, longitude } = await getGeolocation();

      const endpoint = isCorrection
        ? `activity-evidence/${flowData.activityId}/resubmit`
        : `activity-evidence/${flowData.activityId}/exit-photo`;

      const body = isCorrection
        ? { step: 'EXIT_PHOTO', data: { photoUrl, latitude, longitude } }
        : { photoUrl, latitude, longitude };

      const res = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setFlowData({
          ...flowData,
          step: 'COMPLETED',
          exitPhotoUrl: photoUrl,
          exitLatitude: latitude,
          exitLongitude: longitude,
          reviewStatus: isCorrection ? 'PENDING' : flowData.reviewStatus,
          rejectedStep: undefined,
        });
        setSuccessMsg(isCorrection 
          ? '🎉 ¡Corrección enviada exitosamente! Tu evidencia será revisada nuevamente.' 
          : '🎉 ¡Asignación completada exitosamente!');
        setCameraActive(false);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar foto');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al capturar foto');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div>Cargando...</div>;

  // Si no ha seleccionado actividad, mostrar selector
  if (!flowData) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Selecciona una Actividad</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          Elige la actividad para comenzar el flujo de evidencias.
        </p>
        <select
          value={selectedActivityId}
          onChange={(e) => handleActivitySelect(parseInt(e.target.value))}
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 4,
            border: '2px solid var(--primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: 16,
            cursor: loading ? 'wait' : 'pointer',
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
    );
  }

  // Mostrar paso actual
  return (
    <div className="card" style={{ marginBottom: 24 }}>
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

      {/* Banner de Rechazo */}
      {flowData.reviewStatus === 'REJECTED' && flowData.rejectedStep && flowData.reviewNotes && (
        <div
          style={{
            padding: 20,
            backgroundColor: '#fee2e2',
            border: '3px solid #ef4444',
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            Tu evidencia fue rechazada
          </h3>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: '#dc2626' }}>Paso rechazado:</strong>{' '}
            <span style={{ color: '#991b1b' }}>
              {flowData.rejectedStep === 'ENTRY_PHOTO' && '📸 Paso 1: Foto de Entrada'}
              {flowData.rejectedStep === 'EVIDENCE_PHOTOS' && '📷 Paso 2: Fotos de Evidencia'}
              {flowData.rejectedStep === 'SERVICE_SHEET_PDF' && '📄 Paso 3: PDF Hoja de Servicio'}
              {flowData.rejectedStep === 'SERVICE_SHEET_DATA' && '📝 Paso 4: Plantilla Interna'}
              {flowData.rejectedStep === 'EXIT_PHOTO' && '🚪 Paso 5: Foto de Salida'}
            </span>
          </div>
          <div>
            <strong style={{ color: '#dc2626' }}>Observaciones del revisor:</strong>
            <p
              style={{
                margin: '8px 0 0 0',
                padding: 12,
                backgroundColor: 'rgba(255,255,255,0.7)',
                borderRadius: 4,
                color: '#374151',
              }}
            >
              {flowData.reviewNotes}
            </p>
          </div>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: 'rgba(254, 243, 199, 0.5)',
              borderRadius: 4,
              fontSize: 14,
              color: '#92400e',
            }}
          >
            💡 <strong>Instrucciones:</strong> Completa nuevamente el paso rechazado para enviar la corrección.
          </div>
        </div>
      )}

      {/* Barra de progreso */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Actividad: <strong>{actividades.find((a) => a.id === flowData.activityId)?.anNumber}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ProgressStep step={1} active={flowData.step === 'ENTRY_PHOTO'} completed={flowData.entryPhotoUrl ? true : false} label="Entrada" />
          <div style={{ flex: 1, height: 2, backgroundColor: 'var(--border)' }} />
          <ProgressStep step={2} active={flowData.step === 'EVIDENCE_PHOTOS'} completed={flowData.evidencePhotos.length > 0} label="Evidencias" />
          <div style={{ flex: 1, height: 2, backgroundColor: 'var(--border)' }} />
          <ProgressStep step={3} active={flowData.step === 'SERVICE_SHEET_PDF'} completed={flowData.serviceSheetPdfUrl ? true : false} label="PDF" />
          <div style={{ flex: 1, height: 2, backgroundColor: 'var(--border)' }} />
          <ProgressStep step={4} active={flowData.step === 'SERVICE_SHEET_DATA'} completed={flowData.serviceSheetData ? true : false} label="Plantilla" />
          <div style={{ flex: 1, height: 2, backgroundColor: 'var(--border)' }} />
          <ProgressStep step={5} active={flowData.step === 'EXIT_PHOTO'} completed={flowData.exitPhotoUrl ? true : false} label="Salida" />
        </div>
      </div>

      {/* PASO 1: Foto de Entrada */}
      {flowData.step === 'ENTRY_PHOTO' && (
        <div style={{ padding: 20, border: '2px solid var(--primary)', borderRadius: 8 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>📸 Paso 1: Foto de Entrada</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            Toma una foto de entrada. Se guardará automáticamente con tu ubicación.
          </p>
          <div style={actionGridStyle}>
            <button
              onClick={handleEntryPhoto}
              disabled={loading || cameraActive}
              style={{
                ...actionPrimaryStyle,
                backgroundColor: 'var(--primary)',
                color: 'white',
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                gridColumn: window.innerWidth < 480 ? 'span 2' : 'span 1',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {loading ? '⏳ Capturando...' : '📷 Entrada'}
            </button>
            <button
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              disabled={loading}
              style={{
                ...actionSecondaryStyle,
                backgroundColor: 'var(--surface-light)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: Fotos de Evidencia */}
      {flowData.step === 'EVIDENCE_PHOTOS' && (
        <div style={{ padding: 20, border: '2px solid var(--accent)', borderRadius: 8 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--accent)' }}>
            {isInventoryFlow
              ? `🗂️ Paso 2: Inventario comparativo + evidencias (${flowData.evidencePhotos.length} foto${flowData.evidencePhotos.length === 1 ? '' : 's'})`
              : `📷 Paso 2: Evidencias (${flowData.evidencePhotos.length}/4-8)`}
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            {isInventoryFlow
              ? 'Actualiza equipos por grupo, serie, modelo y al menos una foto de evidencia/sticker por mantenimiento.'
              : 'Toma fotos de evidencia. Mínimo 4, máximo 8 fotos.'}
          </p>

          {isInventoryFlow && (
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong>Equipos de sucursal ({inventoryItems.length})</strong>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() =>
                    setInventoryItems((prev) => [
                      ...prev,
                      {
                        sectionName: '',
                        groupName: 'GENERAL',
                        equipmentName: '',
                        serialNumber: '',
                        model: '',
                        panoramicPhotoUrl: '',
                        closeupPhotoUrl: '',
                        stickerPhotoUrl: '',
                        serialBefore: '',
                        serialAfter: '',
                        modelBefore: '',
                        modelAfter: '',
                        beforePanoramicPhotoUrl: '',
                        beforeCloseupPhotoUrl: '',
                        afterPanoramicPhotoUrl: '',
                        afterCloseupPhotoUrl: '',
                        maintenanceStickerPhotoUrl: '',
                        maintenanceActions: '',
                        maintenanceComments: '',
                        itemStatus: 'ACTIVE',
                        notes: '',
                      },
                    ])
                  }
                >
                  + Agregar equipo
                </button>
              </div>

              {inventoryItems.map((item, index) => (
                <div key={`${item.equipmentName}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <input className="input" placeholder="Apartado" value={item.sectionName} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, sectionName: e.target.value } : current))} />
                    <input className="input" placeholder="Grupo (servidores, scanner, impresora...)" value={item.groupName} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, groupName: e.target.value } : current))} />
                    <input className="input" placeholder="Nombre equipo" value={item.equipmentName} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, equipmentName: e.target.value } : current))} />
                    <input className="input" placeholder="Serie ANTES" value={item.serialBefore} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, serialBefore: e.target.value, serialNumber: e.target.value } : current))} />
                    <input className="input" placeholder="Modelo ANTES" value={item.modelBefore} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, modelBefore: e.target.value, model: e.target.value } : current))} />
                    <input className="input" placeholder="Serie DESPUÉS" value={item.serialAfter} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, serialAfter: e.target.value, serialNumber: e.target.value } : current))} />
                    <input className="input" placeholder="Modelo DESPUÉS" value={item.modelAfter} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, modelAfter: e.target.value, model: e.target.value } : current))} />
                    <input className="input" placeholder="¿Qué se le hizo al equipo?" value={item.maintenanceActions} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, maintenanceActions: e.target.value } : current))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    {[
                      ['beforePanoramicPhotoUrl', 'Panorámica ANTES'],
                      ['beforeCloseupPhotoUrl', 'Serie/modelo ANTES'],
                      ['afterPanoramicPhotoUrl', 'Panorámica DESPUÉS'],
                      ['afterCloseupPhotoUrl', 'Serie/modelo DESPUÉS'],
                      ['maintenanceStickerPhotoUrl', 'Sticker mantenimiento'],
                    ].map(([fieldName, label]) => {
                      const field = fieldName as
                        | 'beforePanoramicPhotoUrl'
                        | 'beforeCloseupPhotoUrl'
                        | 'afterPanoramicPhotoUrl'
                        | 'afterCloseupPhotoUrl'
                        | 'maintenanceStickerPhotoUrl';
                      const fileKey = `${index}-${field}`;
                      const imageUrl = item[field];
                      return (
                        <div
                          key={fileKey}
                          style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            setInventoryImageField(index, field, event.dataTransfer.files?.[0]);
                          }}
                        >
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
                          <input
                            ref={(element) => {
                              inventoryFileRefs.current[fileKey] = element;
                            }}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(event) => setInventoryImageField(index, field, event.target.files?.[0])}
                          />
                          <button type="button" className="button-secondary" onClick={() => inventoryFileRefs.current[fileKey]?.click()}>
                            {inventoryUploadingKey === fileKey ? 'Subiendo...' : 'Cargar / arrastrar imagen'}
                          </button>
                          {imageUrl ? (
                            <img src={getAssetUrl(imageUrl)} alt={label} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} />
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sin imagen</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <input className="input" placeholder="Comentario técnico de mantenimiento" value={item.maintenanceComments} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, maintenanceComments: e.target.value, notes: e.target.value } : current))} />
                    <button type="button" className="button-secondary" onClick={() => setInventoryItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}

              <textarea className="input" rows={2} placeholder="Notas globales del inventario y mantenimiento" value={inventoryNotes} onChange={(e) => setInventoryNotes(e.target.value)} />
            </div>
          )}

          {/* Grid de fotos */}
          {flowData.evidencePhotos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                {flowData.evidencePhotos.map((photo, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      width: '100%',
                      paddingBottom: '100%',
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '2px solid var(--border)',
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
                        width: 28,
                        height: 28,
                        padding: 0,
                        backgroundColor: 'rgba(255,0,0,0.8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: 16,
                        fontWeight: 'bold',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...actionGridStyle, marginBottom: 20 }}>
            <button
              onClick={handleAddEvidencePhoto}
              disabled={loading || (!isInventoryFlow && flowData.evidencePhotos.length >= 8)}
              style={{
                ...actionPrimaryStyle,
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                cursor: loading || (!isInventoryFlow && flowData.evidencePhotos.length >= 8) ? 'not-allowed' : 'pointer',
                opacity: loading || (!isInventoryFlow && flowData.evidencePhotos.length >= 8) ? 0.5 : 1,
                gridColumn: window.innerWidth < 480 ? 'span 2' : 'span 1',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {loading ? '⏳ Capturando...' : '📷 Agregar'}
            </button>
            <button
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              disabled={loading}
              style={{
                ...actionSecondaryStyle,
                backgroundColor: 'var(--surface-light)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
            {(isInventoryFlow ? flowData.evidencePhotos.length >= 1 : flowData.evidencePhotos.length >= 4) && (
              <button
                onClick={handleSaveEvidencePhotos}
                disabled={loading}
                style={{
                  ...actionPrimaryStyle,
                  backgroundColor: 'var(--success)',
                  color: 'white',
                  border: 'none',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* PASO 3: PDF */}
      {flowData.step === 'SERVICE_SHEET_PDF' && (
        <div style={{ padding: 20, border: '2px solid #f90', borderRadius: 8 }}>
          <h3 style={{ marginBottom: 12, color: '#f90' }}>📄 Paso 3: Hoja de Servicio (PDF)</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            Carga el PDF de la hoja de servicio con arrastrar y soltar o selección manual.
          </p>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setPdfDragging(true);
            }}
            onDragLeave={() => setPdfDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setPdfDragging(false);
              handleServiceSheetPdfFile(event.dataTransfer.files?.[0]);
            }}
            style={{
              border: `2px dashed ${pdfDragging ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              background: pdfDragging ? 'rgba(15, 106, 214, 0.08)' : 'transparent',
            }}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleServiceSheetPdfUpload}
              disabled={loading}
              style={{
                display: 'block',
                marginBottom: 8,
                cursor: loading ? 'wait' : 'pointer',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Arrastra el PDF aquí para cargarlo con preview embebido.
            </div>
          </div>
          {flowData.serviceSheetPdfUrl && (
            <div style={{ padding: 12, backgroundColor: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 16, display: 'grid', gap: 8 }}>
              <div>✅ PDF cargado correctamente</div>
              <object data={flowData.serviceSheetPdfUrl} type="application/pdf" width="100%" height="280">
                <embed src={flowData.serviceSheetPdfUrl} type="application/pdf" />
              </object>
            </div>
          )}
        </div>
      )}

      {/* PASO 4: Plantilla Interna */}
      {flowData.step === 'SERVICE_SHEET_DATA' && (
        <div style={{ padding: 20, border: '2px solid #060', borderRadius: 8 }}>
          <h3 style={{ marginBottom: 12, color: '#060' }}>📝 Paso 4: Plantilla Interna</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            Completa los datos requeridos de la hoja de servicio.
          </p>
          <ServiceSheetForm onSubmit={handleServiceSheetFormSubmit} loading={loading} />
        </div>
      )}

      {/* PASO 5: Foto de Salida */}
      {flowData.step === 'EXIT_PHOTO' && (
        <div style={{ padding: 20, border: '2px solid #c00', borderRadius: 8 }}>
          <h3 style={{ marginBottom: 12, color: '#c00' }}>🚪 Paso 5: Foto de Salida</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            Toma la foto de salida. Debe ser capturada en el momento actual.
          </p>
          <div style={actionGridStyle}>
            <button
              onClick={handleExitPhoto}
              disabled={loading}
              style={{
                ...actionPrimaryStyle,
                backgroundColor: '#c00',
                color: 'white',
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                gridColumn: window.innerWidth < 480 ? 'span 2' : 'span 1',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {loading ? '⏳ Capturando...' : '📷 Salida'}
            </button>
            <button
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              disabled={loading}
              style={{
                ...actionSecondaryStyle,
                backgroundColor: 'var(--surface-light)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
          </div>
        </div>
      )}

      {/* COMPLETADO */}
      {flowData.step === 'COMPLETED' && (
        <div
          style={{
            padding: 24,
            backgroundColor: '#efe',
            border: '3px solid #060',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#060', marginBottom: 12 }}>🎉 ¡Asignación Completada Exitosamente!</h2>
          <p style={{ color: '#060', marginBottom: 20 }}>
            Todos los pasos han sido completados correctamente. Los 5 pasos se encuentran guardados en el sistema.
          </p>
          <button
            onClick={() => {
              setFlowData(null);
              setSelectedActivityId('');
              setSuccessMsg(null);
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#060',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 'bold',
            }}
          >
            ↻ Seleccionar Otra Actividad
          </button>
        </div>
      )}
    </div>
  );
};

// Componente para paso de progreso
const ProgressStep = ({ step, active, completed, label }: { step: number; active: boolean; completed: boolean; label: string }) => (
  <div style={{ textAlign: 'center' }}>
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? 'var(--primary)' : completed ? 'var(--success)' : 'var(--border)',
        color: 'white',
        fontWeight: 'bold',
        margin: '0 auto 4px',
      }}
    >
      {completed ? '✓' : step}
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
  </div>
);

// Formulario de plantilla interna
const ServiceSheetForm = ({ onSubmit, loading }: { onSubmit: (data: any) => void; loading: boolean }) => {
  const [data, setData] = useState({
    managerName: '',
    managerRole: '',
    workSummary: '',
    observations: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <input
        type="text"
        placeholder="Nombre del Gerente"
        value={data.managerName}
        onChange={(e) => setData({ ...data, managerName: e.target.value })}
        required
        disabled={loading}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          cursor: loading ? 'wait' : 'text',
        }}
      />
      <input
        type="text"
        placeholder="Cargo del Gerente"
        value={data.managerRole}
        onChange={(e) => setData({ ...data, managerRole: e.target.value })}
        required
        disabled={loading}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          cursor: loading ? 'wait' : 'text',
        }}
      />
      <textarea
        placeholder="Resumen del trabajo realizado"
        value={data.workSummary}
        onChange={(e) => setData({ ...data, workSummary: e.target.value })}
        required
        disabled={loading}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          minHeight: 100,
          fontFamily: 'inherit',
          cursor: loading ? 'wait' : 'text',
        }}
      />
      <textarea
        placeholder="Observaciones"
        value={data.observations}
        onChange={(e) => setData({ ...data, observations: e.target.value })}
        disabled={loading}
        style={{
          padding: 10,
          borderRadius: 4,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          minHeight: 100,
          fontFamily: 'inherit',
          cursor: loading ? 'wait' : 'text',
        }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '12px 24px',
          backgroundColor: '#060',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: 16,
          fontWeight: 'bold',
        }}
      >
        {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
      </button>
    </form>
  );
};

export default ActivityEvidenceFlow;

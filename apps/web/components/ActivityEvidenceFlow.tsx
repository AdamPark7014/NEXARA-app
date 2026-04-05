"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';
import styles from './ActivityEvidenceFlow.module.css';
import { io, Socket } from 'socket.io-client';

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
  estatus?: string;
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

type ServiceSheetFormData = {
  technicianName: string;
  serviceDate: string;
  clientCompany: string;
  clientPhone: string;
  managerName: string;
  managerRole: string;
  workSummary: string;
  materialsUsed: string;
  hoursWorked: string;
  observations: string;
  managerSignature: string | null;
};

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
  const [requestedActivityId, setRequestedActivityId] = useState<number | null>(null);
  const inventoryFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/\.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const isCorrection = flowData?.reviewStatus === 'REJECTED';
  const selectedActivity = actividades.find((activity) => activity.id === Number(selectedActivityId || flowData?.activityId));
  const isInventoryFlow = selectedActivity?.workType === 'PREVENTIVE_INVENTORY';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rawActivityId = params.get('activityId');
    const parsedActivityId = rawActivityId ? Number(rawActivityId) : NaN;
    if (Number.isFinite(parsedActivityId) && parsedActivityId > 0) {
      setRequestedActivityId(parsedActivityId);
    }
  }, []);

  // Cargar actividades
  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        const available = rows.filter((activity: ActivityOption) => {
          const status = (activity?.estatus || '').trim().toLowerCase();
          return status !== 'aprobada';
        });
        setActividades(available);
      })
      .catch(() => setActividades([]));
  }, [user?.token]);

  useEffect(() => {
    if (!requestedActivityId || loading || flowData?.activityId === requestedActivityId) return;
    if (!actividades.some((activity) => activity.id === requestedActivityId)) return;
    handleActivitySelect(requestedActivityId);
  }, [requestedActivityId, actividades, flowData?.activityId]);

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
        const currentActivity = actividades.find((activity) => activity.id === activityId);
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

        if ((data.activity?.workType || currentActivity?.workType) === 'PREVENTIVE_INVENTORY') {
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

  useEffect(() => {
    if (!user?.token || !selectedActivityId) return;

    const socketUrl = API_URL.replace(/\/+api\/?$/, '');
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        handleActivitySelect(Number(selectedActivityId));
      }, 350);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ActivityEvidence', 'Inventory', 'Activity'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, API_URL, selectedActivityId]);

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
    const raw = url.trim();
    if (!raw) return '';
    if (/^(data:|blob:|\/\/)/i.test(raw)) return raw;

    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (!/^\/(uploads|activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(parsed.pathname)) {
          return raw;
        }
      } catch {
        return raw;
      }
    }

    const base = API_URL.replace(/\/+api\/?$/, '');
    const normalizedPath = raw
      .replace(/\\+/g, '/')
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/api(?=\/uploads\/)/i, '')
      .replace(/^\/?uploads\//i, '')
      .replace(/^\/+/, '');
    const normalized = `/uploads/${normalizedPath}`.replace(/\/uploads\/+/i, '/uploads/');
    return `${base}${encodeURI(normalized)}`;
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
      <div className={`card ${styles.flowCard}`}>
        <h2 className={styles.flowTitle}>Selecciona una Actividad</h2>
        <p className={styles.flowSubtitle}>
          Elige la actividad para comenzar el flujo de evidencias.
        </p>
        <select
          className={`input ${styles.activitySelect}`}
          value={selectedActivityId}
          onChange={(e) => handleActivitySelect(parseInt(e.target.value))}
          disabled={loading}
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
    <div className={`card ${styles.flowCard}`}>
      {error && (
        <div className={styles.alertError}>
          ❌ {error}
        </div>
      )}

      {successMsg && (
        <div className={styles.alertSuccess}>
          {successMsg}
        </div>
      )}

      {/* Banner de Rechazo */}
      {flowData.reviewStatus === 'REJECTED' && flowData.rejectedStep && flowData.reviewNotes && (
        <div className={styles.rejectedBanner}>
          <h3 className={styles.rejectedTitle}>
            <span className={styles.rejectedEmoji}>⚠️</span>
            Tu evidencia fue rechazada
          </h3>
          <div className={styles.rejectedStepRow}>
            <strong className={styles.rejectedStrong}>Paso rechazado:</strong>{' '}
            <span className={styles.rejectedStepText}>
              {flowData.rejectedStep === 'ENTRY_PHOTO' && '📸 Paso 1: Foto de Entrada'}
              {flowData.rejectedStep === 'EVIDENCE_PHOTOS' && '📷 Paso 2: Fotos de Evidencia'}
              {flowData.rejectedStep === 'SERVICE_SHEET_PDF' && '📄 Paso 3: PDF Hoja de Servicio'}
              {flowData.rejectedStep === 'SERVICE_SHEET_DATA' && '📝 Paso 4: Plantilla Interna'}
              {flowData.rejectedStep === 'EXIT_PHOTO' && '🚪 Paso 5: Foto de Salida'}
            </span>
          </div>
          <div>
            <strong className={styles.rejectedStrong}>Observaciones del revisor:</strong>
            <p className={styles.rejectedNotes}>
              {flowData.reviewNotes}
            </p>
          </div>
          <div className={styles.rejectedHint}>
            💡 <strong>Instrucciones:</strong> Completa nuevamente el paso rechazado para enviar la corrección.
          </div>
        </div>
      )}

      {/* Barra de progreso */}
      <div className={styles.progressWrap}>
        <div className={styles.progressMeta}>
          Actividad: <strong>{actividades.find((a) => a.id === flowData.activityId)?.anNumber}</strong>
        </div>
        <div className={styles.progressRow}>
          <ProgressStep step={1} active={flowData.step === 'ENTRY_PHOTO'} completed={flowData.entryPhotoUrl ? true : false} label="Entrada" />
          <div className={styles.progressDivider} />
          <ProgressStep step={2} active={flowData.step === 'EVIDENCE_PHOTOS'} completed={flowData.evidencePhotos.length > 0} label="Evidencias" />
          <div className={styles.progressDivider} />
          <ProgressStep step={3} active={flowData.step === 'SERVICE_SHEET_PDF'} completed={flowData.serviceSheetPdfUrl ? true : false} label="PDF" />
          <div className={styles.progressDivider} />
          <ProgressStep step={4} active={flowData.step === 'SERVICE_SHEET_DATA'} completed={flowData.serviceSheetData ? true : false} label="Plantilla" />
          <div className={styles.progressDivider} />
          <ProgressStep step={5} active={flowData.step === 'EXIT_PHOTO'} completed={flowData.exitPhotoUrl ? true : false} label="Salida" />
        </div>
      </div>

      {/* PASO 1: Foto de Entrada */}
      {flowData.step === 'ENTRY_PHOTO' && (
        <div className={`${styles.stepCard} ${styles.stepEntry}`}>
          <h3 className={styles.stepTitle}>📸 Paso 1: Foto de Entrada</h3>
          <p className={styles.stepDescription}>
            Toma una foto de entrada. Se guardará automáticamente con tu ubicación.
          </p>
          <div className={styles.actionGrid}>
            <button
              className={`${styles.actionButton} ${styles.actionPrimary} ${styles.actionEntry}`}
              onClick={handleEntryPhoto}
              disabled={loading || cameraActive}
            >
              {loading ? '⏳ Capturando...' : '📷 Entrada'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.actionSecondary}`}
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              disabled={loading}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: Fotos de Evidencia */}
      {flowData.step === 'EVIDENCE_PHOTOS' && (
        <div className={`${styles.stepCard} ${styles.stepEvidence}`}>
          <h3 className={styles.stepTitle}>
            {isInventoryFlow
              ? `🗂️ Paso 2: Inventario comparativo + evidencias (${flowData.evidencePhotos.length} foto${flowData.evidencePhotos.length === 1 ? '' : 's'})`
              : `📷 Paso 2: Evidencias (${flowData.evidencePhotos.length}/4-8)`}
          </h3>
          <p className={styles.stepDescription}>
            {isInventoryFlow
              ? 'Actualiza equipos por grupo, serie, modelo y al menos una foto de evidencia/sticker por mantenimiento.'
              : 'Toma fotos de evidencia. Mínimo 4, máximo 8 fotos.'}
          </p>

          {isInventoryFlow && (
            <div className={styles.inventorySection}>
              <div className={styles.inventoryHeaderRow}>
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
                <div key={`${item.equipmentName}-${index}`} className={styles.inventoryItemCard}>
                  <div className={styles.inventoryFieldsGrid}>
                    <input className="input" placeholder="Apartado" value={item.sectionName} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, sectionName: e.target.value } : current))} />
                    <input className="input" placeholder="Grupo (servidores, scanner, impresora...)" value={item.groupName} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, groupName: e.target.value } : current))} />
                    <input className="input" placeholder="Nombre equipo" value={item.equipmentName} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, equipmentName: e.target.value } : current))} />
                    <input className="input" placeholder="Serie ANTES" value={item.serialBefore} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, serialBefore: e.target.value, serialNumber: e.target.value } : current))} />
                    <input className="input" placeholder="Modelo ANTES" value={item.modelBefore} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, modelBefore: e.target.value, model: e.target.value } : current))} />
                    <input className="input" placeholder="Serie DESPUÉS" value={item.serialAfter} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, serialAfter: e.target.value, serialNumber: e.target.value } : current))} />
                    <input className="input" placeholder="Modelo DESPUÉS" value={item.modelAfter} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, modelAfter: e.target.value, model: e.target.value } : current))} />
                    <input className="input" placeholder="¿Qué se le hizo al equipo?" value={item.maintenanceActions} onChange={(e) => setInventoryItems((prev) => prev.map((current, itemIndex) => itemIndex === index ? { ...current, maintenanceActions: e.target.value } : current))} />
                  </div>
                  <div className={styles.inventoryFieldsGrid}>
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
                          className={styles.inventoryDropzone}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            setInventoryImageField(index, field, event.dataTransfer.files?.[0]);
                          }}
                        >
                          <div className={styles.inventoryDropLabel}>{label}</div>
                          <input
                            ref={(element) => {
                              inventoryFileRefs.current[fileKey] = element;
                            }}
                            type="file"
                            accept="image/*"
                            className={styles.hiddenInput}
                            onChange={(event) => setInventoryImageField(index, field, event.target.files?.[0])}
                          />
                          <button type="button" className="button-secondary" onClick={() => inventoryFileRefs.current[fileKey]?.click()}>
                            {inventoryUploadingKey === fileKey ? 'Subiendo...' : 'Cargar / arrastrar imagen'}
                          </button>
                          {imageUrl ? (
                            <img src={getAssetUrl(imageUrl)} alt={label} className={styles.inventoryPreviewImage} />
                          ) : (
                            <div className={styles.inventoryDropLabel}>Sin imagen</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.inventoryFooterRow}>
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
            <div className={styles.evidenceGalleryWrap}>
              <div className={styles.evidenceGalleryGrid}>
                {flowData.evidencePhotos.map((photo, idx) => (
                  <div
                    key={idx}
                    className={styles.evidencePhotoTile}
                    onClick={() => handleRemoveEvidencePhoto(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleRemoveEvidencePhoto(idx);
                      }
                    }}
                    title="Quitar esta evidencia"
                  >
                    <img
                      src={getAssetUrl(photo)}
                      alt={`evidencia ${idx + 1}`}
                      className={styles.evidencePhotoImg}
                    />
                    <button
                      className={styles.removePhotoButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveEvidencePhoto(idx);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`${styles.actionGrid} ${styles.actionGridBottom}`}>
            <button
              className={`${styles.actionButton} ${styles.actionPrimary} ${styles.actionEvidence}`}
              onClick={handleAddEvidencePhoto}
              disabled={loading || (!isInventoryFlow && flowData.evidencePhotos.length >= 8)}
            >
              {loading ? '⏳ Capturando...' : '📷 Agregar'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.actionSecondary}`}
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              disabled={loading}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
            {(isInventoryFlow ? flowData.evidencePhotos.length >= 1 : flowData.evidencePhotos.length >= 4) && (
              <button
                className={`${styles.actionButton} ${styles.actionPrimary} ${styles.actionSuccess}`}
                onClick={handleSaveEvidencePhotos}
                disabled={loading}
              >
                {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* PASO 3: PDF */}
      {flowData.step === 'SERVICE_SHEET_PDF' && (
        <div className={`${styles.stepCard} ${styles.stepPdf}`}>
          <h3 className={styles.stepTitle}>📄 Paso 3: Hoja de Servicio (PDF)</h3>
          <p className={styles.stepDescription}>
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
              border: `2px dashed ${pdfDragging ? '#0f6ad6' : '#d1d5db'}`,
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              background: pdfDragging ? 'rgba(15, 106, 214, 0.08)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              ref={(ref) => {
                if (ref) (window as any).pdfInputRef = ref;
              }}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleServiceSheetPdfUpload}
              disabled={loading}
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
            />
            <div
              onClick={() => {
                const input = (window as any).pdfInputRef;
                if (input && !loading) input.click();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                padding: '24px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(249, 144, 0, 0.05) 0%, rgba(249, 144, 0, 0.02) 100%)',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as any).style.background = 'linear-gradient(135deg, rgba(249, 144, 0, 0.12) 0%, rgba(249, 144, 0, 0.08) 100%)';
                  (e.currentTarget as any).style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as any).style.background = 'linear-gradient(135deg, rgba(249, 144, 0, 0.05) 0%, rgba(249, 144, 0, 0.02) 100%)';
                (e.currentTarget as any).style.transform = 'translateY(0)';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  background: 'rgba(249, 144, 0, 0.15)',
                  fontSize: '32px',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                📄
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
                  Seleccionar PDF
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  o arrastra aquí
                </div>
              </div>
            </div>
          </div>
          {flowData.serviceSheetPdfUrl && (
            <div className={styles.pdfPreviewCard}>
              <div>✅ PDF cargado correctamente</div>
              <object data={getAssetUrl(flowData.serviceSheetPdfUrl)} type="application/pdf" width="100%" height="280">
                <embed src={getAssetUrl(flowData.serviceSheetPdfUrl)} type="application/pdf" />
              </object>
            </div>
          )}
        </div>
      )}

      {/* PASO 4: Plantilla Interna */}
      {flowData.step === 'SERVICE_SHEET_DATA' && (
        <div className={`${styles.stepCard} ${styles.stepData}`}>
          <h3 className={styles.stepTitle}>📝 Paso 4: Plantilla Interna</h3>
          <p className={styles.stepDescription}>
            Completa los datos requeridos de la hoja de servicio.
          </p>
          <ServiceSheetForm onSubmit={handleServiceSheetFormSubmit} loading={loading} initialData={flowData.serviceSheetData} />
        </div>
      )}

      {/* PASO 5: Foto de Salida */}
      {flowData.step === 'EXIT_PHOTO' && (
        <div className={`${styles.stepCard} ${styles.stepExit}`}>
          <h3 className={styles.stepTitle}>🚪 Paso 5: Foto de Salida</h3>
          <p className={styles.stepDescription}>
            Toma la foto de salida. Debe ser capturada en el momento actual.
          </p>
          <div className={styles.actionGrid}>
            <button
              className={`${styles.actionButton} ${styles.actionPrimary} ${styles.actionExit}`}
              onClick={handleExitPhoto}
              disabled={loading}
            >
              {loading ? '⏳ Capturando...' : '📷 Salida'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.actionSecondary}`}
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              disabled={loading}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
          </div>
        </div>
      )}

      {/* COMPLETADO */}
      {flowData.step === 'COMPLETED' && (
        <div className={styles.completedCard}>
          <h2 className={styles.completedTitle}>🎉 ¡Asignación Completada Exitosamente!</h2>
          <p className={styles.completedText}>
            Todos los pasos han sido completados correctamente. Los 5 pasos se encuentran guardados en el sistema.
          </p>
          <button
            className={styles.completedButton}
            onClick={() => {
              setFlowData(null);
              setSelectedActivityId('');
              setSuccessMsg(null);
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
  <div className={styles.progressStep}>
    <div className={`${styles.progressCircle} ${active ? styles.progressCircleActive : ''} ${completed ? styles.progressCircleCompleted : ''}`}>
      {completed ? '✓' : step}
    </div>
    <div className={styles.progressLabel}>{label}</div>
  </div>
);

// Formulario de plantilla interna
// Pad de firma digital (mouse + touch)
const SignaturePad = ({ onSignature, disabled, initialValue }: { onSignature: (dataUrl: string | null) => void; disabled: boolean; initialValue?: string | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const onSigRef = useRef(onSignature);
  const disabledRef = useRef(disabled);
  useEffect(() => { onSigRef.current = onSignature; });
  useEffect(() => { disabledRef.current = disabled; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e && e.touches.length > 0) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      }
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
    };

    const onStart = (e: MouseEvent | TouchEvent) => {
      if (disabledRef.current) return;
      e.preventDefault();
      isDrawing.current = true;
      lastPos.current = getPos(e);
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const ctx = canvas.getContext('2d')!;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#1a2e4a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastPos.current = pos;
      onSigRef.current(canvas.toDataURL('image/png'));
    };

    const onEnd = () => { isDrawing.current = false; };

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
    canvas.addEventListener('mouseleave', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);

    return () => {
      canvas.removeEventListener('mousedown', onStart);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onEnd);
      canvas.removeEventListener('mouseleave', onEnd);
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!initialValue) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const ratio = Math.min(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      const offsetX = (canvas.width - width) / 2;
      const offsetY = (canvas.height - height) / 2;
      context.drawImage(image, offsetX, offsetY, width, height);
    };
    image.src = initialValue;
  }, [initialValue]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onSigRef.current(null);
  };

  return (
    <div style={{ marginTop: '4px' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '150px',
          border: '1.5px dashed #9ca3af',
          borderRadius: '10px',
          background: '#f9fafb',
          cursor: disabled ? 'not-allowed' : 'crosshair',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>✍️ Firmar con el dedo o el mouse</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: '2px 8px' }}
        >
          🗑️ Limpiar
        </button>
      </div>
    </div>
  );
};

const buildInitialServiceSheetFormData = (initialData?: Partial<ServiceSheetFormData> | null): ServiceSheetFormData => ({
  technicianName: initialData?.technicianName || '',
  serviceDate: initialData?.serviceDate || new Date().toISOString().split('T')[0],
  clientCompany: initialData?.clientCompany || '',
  clientPhone: initialData?.clientPhone || '',
  managerName: initialData?.managerName || '',
  managerRole: initialData?.managerRole || '',
  workSummary: initialData?.workSummary || '',
  materialsUsed: initialData?.materialsUsed || '',
  hoursWorked: initialData?.hoursWorked || '',
  observations: initialData?.observations || '',
  managerSignature: initialData?.managerSignature || null,
});

const ServiceSheetForm = ({ onSubmit, loading, initialData }: { onSubmit: (data: any) => void; loading: boolean; initialData?: Partial<ServiceSheetFormData> | null }) => {
  const [data, setData] = useState<ServiceSheetFormData>(() => buildInitialServiceSheetFormData(initialData));

  useEffect(() => {
    setData(buildInitialServiceSheetFormData(initialData));
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.managerSignature) {
      alert('La firma del gerente es obligatoria');
      return;
    }
    onSubmit(data);
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: '1.5px solid #d1d5db', fontSize: '14px', background: '#fff',
    outline: 'none', boxSizing: 'border-box', marginBottom: '10px',
  };
  const lbl: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block',
  };
  const sec: React.CSSProperties = {
    background: '#f8fafc', border: '1px solid #e5e7eb',
    borderRadius: '10px', padding: '14px', marginBottom: '14px',
  };
  const secTitle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 700, color: '#374151',
    marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb',
  };

  return (
    <form onSubmit={handleSubmit} className={styles.serviceForm}>

      {/* Datos del Servicio */}
      <div style={sec}>
        <div style={secTitle}>📋 Datos del Servicio</div>
        <label style={lbl}>Nombre del Técnico</label>
        <input type="text" style={inp} placeholder="Nombre completo del técnico"
          value={data.technicianName} onChange={(e) => setData({ ...data, technicianName: e.target.value })}
          required disabled={loading} />
        <label style={lbl}>Fecha del Servicio</label>
        <input type="date" style={inp} value={data.serviceDate}
          onChange={(e) => setData({ ...data, serviceDate: e.target.value })}
          required disabled={loading} />
      </div>

      {/* Datos del Cliente */}
      <div style={sec}>
        <div style={secTitle}>🏢 Datos del Cliente</div>
        <label style={lbl}>Empresa / Organización</label>
        <input type="text" style={inp} placeholder="Nombre de la empresa o cliente"
          value={data.clientCompany} onChange={(e) => setData({ ...data, clientCompany: e.target.value })}
          required disabled={loading} />
        <label style={lbl}>Teléfono de Contacto</label>
        <input type="tel" style={inp} placeholder="Número de teléfono"
          value={data.clientPhone} onChange={(e) => setData({ ...data, clientPhone: e.target.value })}
          disabled={loading} />
      </div>

      {/* Trabajo Realizado */}
      <div style={sec}>
        <div style={secTitle}>🔧 Trabajo Realizado</div>
        <label style={lbl}>Resumen del trabajo realizado</label>
        <textarea style={{ ...inp, minHeight: '90px', resize: 'vertical' } as React.CSSProperties}
          placeholder="Describe el trabajo realizado..."
          value={data.workSummary} onChange={(e) => setData({ ...data, workSummary: e.target.value })}
          required disabled={loading} />
        <label style={lbl}>Materiales / Equipos utilizados</label>
        <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' } as React.CSSProperties}
          placeholder="Lista de materiales o equipos utilizados"
          value={data.materialsUsed} onChange={(e) => setData({ ...data, materialsUsed: e.target.value })}
          disabled={loading} />
        <label style={lbl}>Horas trabajadas</label>
        <input type="number" style={{ ...inp, width: '140px' }} placeholder="ej. 4.5"
          min="0" step="0.5" value={data.hoursWorked}
          onChange={(e) => setData({ ...data, hoursWorked: e.target.value })}
          disabled={loading} />
        <label style={lbl}>Observaciones</label>
        <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' } as React.CSSProperties}
          placeholder="Observaciones adicionales"
          value={data.observations} onChange={(e) => setData({ ...data, observations: e.target.value })}
          disabled={loading} />
      </div>

      {/* Conformidad del Gerente */}
      <div style={{ ...sec, borderColor: data.managerSignature ? '#10b981' : '#e5e7eb' }}>
        <div style={{ ...secTitle, color: data.managerSignature ? '#059669' : '#374151' }}>
          ✅ Conformidad del Gerente / Representante
        </div>
        <label style={lbl}>Nombre del Gerente / Representante</label>
        <input type="text" style={inp} placeholder="Nombre completo"
          value={data.managerName} onChange={(e) => setData({ ...data, managerName: e.target.value })}
          required disabled={loading} />
        <label style={lbl}>Cargo</label>
        <input type="text" style={inp} placeholder="Cargo del gerente o representante"
          value={data.managerRole} onChange={(e) => setData({ ...data, managerRole: e.target.value })}
          required disabled={loading} />
        <label style={{ ...lbl, marginTop: '4px' }}>
          Firma Digital <span style={{ color: '#ef4444' }}>*</span>
        </label>
        {data.managerSignature && (
          <div style={{ marginBottom: '8px', padding: '6px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '12px', color: '#059669' }}>
            ✓ Firma capturada correctamente
          </div>
        )}
        <SignaturePad
          onSignature={(sig) => setData((prev) => ({ ...prev, managerSignature: sig }))}
          disabled={loading}
          initialValue={data.managerSignature}
        />
      </div>

      <button
        type="submit"
        className={`button-primary ${styles.serviceSubmit}`}
        disabled={loading}
      >
        {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
      </button>
    </form>
  );
};

export default ActivityEvidenceFlow;

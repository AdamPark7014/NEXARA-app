'use client';
import { toast } from '@/components/Toast';
import { buildApiUrl, getApiAssetOrigin, getSocketBaseUrl } from '@/lib/api-base';
import { evidenceStepLabel, isEvidenceLocked, rejectedStepsList } from '@/lib/evidence-lock';
import {
  digitalFormLabels,
  emptyDigitalForm,
  evidenceStepsForKind,
  isPdfUrl,
  requiresServiceSheetPdf,
  type DigitalFormFields,
  type EvidenceStep,
} from '@/lib/evidence-flow-helpers';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from './UserContext';
import styles from './ActivityEvidenceFlow.module.css';
import { Socket } from 'socket.io-client';
import ConfirmDialog, { type ConfirmState } from '@/components/ui/ConfirmDialog';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import PhoneField from '@/components/PhoneField';
import UbicacionActividadCard, { AvisoFueraDeZona, useGeocerca } from '@/components/ops/UbicacionActividad';
import {
  RADIO_ACTIVIDAD_M,
  distanciaM,
  mensajeSalidaFueraDeZona,
  puntoReal,
  type PuntoGeo,
} from '@/lib/activity-geofence';

type EvidenceBootstrap = {
  status?: string;
  reviewStatus?: string;
  rejectedStep?: string | null;
  rejectedSteps?: string[] | null;
  userId?: number;
};

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
  estatus?: string;
  responsableId?: number;
  responsable?: { id?: number };
  workType?: 'ISSUE' | 'PREVENTIVE_INVENTORY';
  coreKind?: string;
  indicaciones?: string | null;
  activityEvidence?: EvidenceBootstrap | null;
  activityEvidences?: EvidenceBootstrap[] | null;
}

const pickActivityEvidence = (
  activity: ActivityOption,
  userId?: number | string | null,
): EvidenceBootstrap | null | undefined => {
  const list = activity.activityEvidences;
  if (Array.isArray(list) && list.length > 0) {
    const uid = Number(userId);
    const mine = Number.isFinite(uid) ? list.find((e) => Number(e.userId) === uid) : undefined;
    return mine ?? list[0];
  }
  return activity.activityEvidence;
};

const EVIDENCE_STEP_LABELS: Record<Exclude<EvidenceStep, 'COMPLETED'>, string> = {
  ENTRY_PHOTO: 'Entrada',
  EVIDENCE_PHOTOS: 'Evidencias',
  SERVICE_SHEET_PDF: 'PDF',
  SERVICE_SHEET_DATA: 'Formulario',
  EXIT_PHOTO: 'Salida',
};

const normalizeActivitiesPayload = (data: unknown): ActivityOption[] => {
  if (Array.isArray(data)) return data as ActivityOption[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: ActivityOption[] }).data;
  }
  return [];
};

interface EvidenceFlowData {
  activityId: number;
  step:
    | 'ENTRY_PHOTO'
    | 'EVIDENCE_PHOTOS'
    | 'SERVICE_SHEET_PDF'
    | 'SERVICE_SHEET_DATA'
    | 'EXIT_PHOTO'
    | 'COMPLETED';
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectedStep?: string;
  rejectedSteps?: string[];
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
  coreKind?: string;
  evidencePhotoRequired?: number;
  indicaciones?: string | null;
  assigneeIndicaciones?: string | null;
  progressPct?: number;
  stepsForKind?: EvidenceStep[];
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
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
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

  const isCorrection = flowData?.reviewStatus === 'REJECTED';
  const isFlowLocked = Boolean(flowData && isEvidenceLocked(flowData));
  const rejectedList = flowData ? rejectedStepsList(flowData) : [];

  // Geocerca: desde la foto de entrada, la persona debe quedarse a ≤ 100 m del punto de inicio.
  const actividadIniciada = Boolean(
    flowData && (flowData.entryPhotoUrl || flowData.step !== 'ENTRY_PHOTO'),
  );
  const geocerca = useGeocerca(user?.token, flowData?.activityId ?? null, actividadIniciada);
  const recargarGeocercaRef = useRef(geocerca.recargar);
  recargarGeocercaRef.current = geocerca.recargar;
  /** Foto de salida bloqueada por estar fuera del radio (validación local o 400 de la API). */
  const [zonaSalidaError, setZonaSalidaError] = useState<string | null>(null);

  useEffect(() => {
    setZonaSalidaError(null);
  }, [flowData?.activityId]);

  /** Punto donde inició (el de la API; si aún no carga, el GPS de la foto de entrada). */
  const origenActividad = (): PuntoGeo | null => {
    const o = geocerca.estado?.origen;
    return (
      (o ? puntoReal(o.latitude, o.longitude) : null) ??
      puntoReal(flowData?.entryLatitude, flowData?.entryLongitude)
    );
  };

  /** Mensaje de bloqueo si `punto` queda fuera del radio del inicio; `null` si puede registrar la salida. */
  const bloqueoPorZona = (punto: PuntoGeo | null): string | null => {
    const origen = origenActividad();
    const aqui = punto ? puntoReal(punto.latitude, punto.longitude) : null;
    if (!origen || !aqui) return null;
    const radio = geocerca.estado?.radioM ?? RADIO_ACTIVIDAD_M;
    const distancia = distanciaM(origen, aqui);
    return distancia > radio ? mensajeSalidaFueraDeZona(distancia, radio) : null;
  };

  const syncFlowFromSaved = (saved: Record<string, unknown>, local?: Partial<EvidenceFlowData>) => {
    if (!flowData) return;
    setFlowData({
      ...flowData,
      ...local,
      step: (saved.status as EvidenceFlowData['step']) ?? flowData.step,
      reviewStatus:
        (saved.reviewStatus as EvidenceFlowData['reviewStatus']) ?? flowData.reviewStatus,
      rejectedStep: (saved.rejectedStep as string | null) ?? undefined,
      rejectedSteps: Array.isArray(saved.rejectedSteps)
        ? (saved.rejectedSteps as string[])
        : undefined,
      entryPhotoUrl: (saved.entryPhotoUrl as string | undefined) ?? flowData.entryPhotoUrl,
      entryLatitude:
        saved.entryLatitude != null ? Number(saved.entryLatitude) : flowData.entryLatitude,
      entryLongitude:
        saved.entryLongitude != null ? Number(saved.entryLongitude) : flowData.entryLongitude,
      evidencePhotos: Array.isArray(saved.evidencePhotos)
        ? (saved.evidencePhotos as string[])
        : flowData.evidencePhotos,
      serviceSheetPdfUrl:
        (saved.serviceSheetPdfUrl as string | undefined) ?? flowData.serviceSheetPdfUrl,
      serviceSheetData: saved.serviceSheetData ?? flowData.serviceSheetData,
      exitPhotoUrl: (saved.exitPhotoUrl as string | undefined) ?? flowData.exitPhotoUrl,
      exitLatitude: saved.exitLatitude != null ? Number(saved.exitLatitude) : flowData.exitLatitude,
      exitLongitude:
        saved.exitLongitude != null ? Number(saved.exitLongitude) : flowData.exitLongitude,
      coreKind:
        (saved.coreKind as string | undefined) ??
        ((saved.activity as { coreKind?: string } | undefined)?.coreKind) ??
        flowData.coreKind,
      evidencePhotoRequired:
        saved.evidencePhotoRequired != null
          ? Number(saved.evidencePhotoRequired)
          : flowData.evidencePhotoRequired,
      indicaciones:
        (saved.indicaciones as string | null | undefined) ?? flowData.indicaciones,
      assigneeIndicaciones:
        (saved.assigneeIndicaciones as string | null | undefined) ?? flowData.assigneeIndicaciones,
      progressPct:
        saved.progressPct != null ? Number(saved.progressPct) : flowData.progressPct,
      stepsForKind: Array.isArray(saved.stepsForKind)
        ? (saved.stepsForKind as EvidenceStep[])
        : flowData.stepsForKind,
    });
  };

  const correctionSuccessMessage = (saved: Record<string, unknown>, fallback: string) => {
    if (saved.status === 'COMPLETED') {
      return '🎉 ¡Corrección enviada! Tu evidencia será revisada nuevamente.';
    }
    if (typeof saved.status === 'string') {
      return `✅ Paso corregido. Siguiente: ${evidenceStepLabel(saved.status)}`;
    }
    return fallback;
  };
  const selectedActivity = actividades.find(
    (activity) => activity.id === Number(selectedActivityId || flowData?.activityId),
  );
  const isInventoryFlow = selectedActivity?.workType === 'PREVENTIVE_INVENTORY';
  const photoRequired = Math.max(1, Number(flowData?.evidencePhotoRequired) || 4);
  const needsServiceSheetPdf = requiresServiceSheetPdf(flowData?.coreKind);
  const visibleSteps = (
    Array.isArray(flowData?.stepsForKind) && flowData.stepsForKind.length > 0
      ? flowData.stepsForKind
      : evidenceStepsForKind(flowData?.coreKind)
  ).filter((step): step is Exclude<EvidenceStep, 'COMPLETED'> => step !== 'COMPLETED');

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
    const loadActivities = async () => {
      try {
        const mineRes = await fetch(buildApiUrl('activities?scope=mine'), {
          headers: { Authorization: `Bearer ${user.token}` },
        });

        if (!mineRes.ok) {
          if (mineRes.status === 401 || mineRes.status === 403) {
            throw new Error('No tienes permisos para consultar tus actividades.');
          }
          throw new Error('No se pudieron cargar tus actividades.');
        }

        const mineData = await mineRes.json();
        let rows = normalizeActivitiesPayload(mineData);

        // Fallback when scope=mine returns empty but user has assigned activities.
        if (rows.length === 0 && user?.id) {
          const allRes = await fetch(buildApiUrl('activities'), {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          const allData = allRes.ok ? await allRes.json().catch(() => null) : null;
          const allRows = normalizeActivitiesPayload(allData);
          rows = allRows.filter((activity) => {
            const responsibleId = activity.responsable?.id ?? activity.responsableId;
            return Number(responsibleId) === Number(user.id);
          });
        }

        const available = rows.filter((activity: ActivityOption) => {
          const status = (activity?.estatus || '').trim().toLowerCase();
          if (status === 'aprobada') return false;
          const ev = pickActivityEvidence(activity, user?.id);
          if (ev?.status === 'COMPLETED' && ev?.reviewStatus !== 'REJECTED') return false;
          return true;
        });
        setActividades(available);
        setError(null);
      } catch (err) {
        setActividades([]);
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus actividades.');
      }
    };

    void loadActivities();
  }, [user?.token]);

  useEffect(() => {
    if (!requestedActivityId || loading || flowData?.activityId === requestedActivityId) return;
    handleActivitySelect(requestedActivityId);
  }, [requestedActivityId, loading, flowData?.activityId]);

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
        const coreKind =
          data.coreKind || data.activity?.coreKind || currentActivity?.coreKind || undefined;
        // El número de fotos vive en la actividad (la API lo manda en data.activity); antes se caía a 4
        // aunque la actividad pidiera 2 y la API rechazaba el paso por no ser exactamente 2.
        const evidencePhotoRequired =
          Number(
            data.evidencePhotoRequired ??
              data.activity?.evidencePhotoRequired ??
              (currentActivity as { evidencePhotoRequired?: number } | undefined)?.evidencePhotoRequired,
          ) || 4;
        setFlowData({
          activityId,
          step: data.status,
          reviewStatus: data.reviewStatus,
          rejectedStep: data.rejectedStep,
          rejectedSteps: Array.isArray(data.rejectedSteps) ? data.rejectedSteps : undefined,
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
          coreKind,
          evidencePhotoRequired,
          indicaciones: data.indicaciones ?? data.activity?.indicaciones ?? null,
          assigneeIndicaciones: data.assigneeIndicaciones ?? null,
          progressPct: data.progressPct != null ? Number(data.progressPct) : undefined,
          stepsForKind: Array.isArray(data.stepsForKind) ? data.stepsForKind : undefined,
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
              panoramicPhotoUrl:
                item.afterPanoramicPhotoUrl ||
                item.panoramicPhotoUrl ||
                item.beforePanoramicPhotoUrl ||
                '',
              closeupPhotoUrl:
                item.afterCloseupPhotoUrl ||
                item.closeupPhotoUrl ||
                item.beforeCloseupPhotoUrl ||
                '',
              stickerPhotoUrl: item.maintenanceStickerPhotoUrl || item.stickerPhotoUrl || '',
              serialBefore: item.serialBefore || item.serialNumber || '',
              serialAfter: item.serialAfter || item.serialNumber || '',
              modelBefore: item.modelBefore || item.model || '',
              modelAfter: item.modelAfter || item.model || '',
              beforePanoramicPhotoUrl: item.beforePanoramicPhotoUrl || item.panoramicPhotoUrl || '',
              beforeCloseupPhotoUrl: item.beforeCloseupPhotoUrl || item.closeupPhotoUrl || '',
              afterPanoramicPhotoUrl: item.afterPanoramicPhotoUrl || item.panoramicPhotoUrl || '',
              afterCloseupPhotoUrl: item.afterCloseupPhotoUrl || item.closeupPhotoUrl || '',
              maintenanceStickerPhotoUrl:
                item.maintenanceStickerPhotoUrl || item.stickerPhotoUrl || '',
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
        const currentActivity = actividades.find((activity) => activity.id === activityId);
        setFlowData({
          activityId,
          step: 'ENTRY_PHOTO',
          evidencePhotos: [],
          coreKind: currentActivity?.coreKind,
          evidencePhotoRequired:
            Number(
              (currentActivity as { evidencePhotoRequired?: number } | undefined)?.evidencePhotoRequired,
            ) || 4,
          indicaciones: currentActivity?.indicaciones ?? null,
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

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, {
      transports: ['polling', 'websocket'],
    });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        handleActivitySelect(Number(selectedActivityId));
        void recargarGeocercaRef.current();
      }, 350);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ActivityEvidence', 'Inventory', 'Activity'].includes(payload.model)) {
        scheduleRefresh();
      } else if (payload.model === 'ActivityGeofenceAlert') {
        void recargarGeocercaRef.current();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, selectedActivityId]);

  // Toma un cuadro de la cámara en vivo, cuando el usuario ya se acomodó (antes disparaba sola a los 100 ms).
  const grabFrame = (video: HTMLVideoElement): string | null => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 1280 / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  };

  // Obtener ubicación
  const getGeolocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => reject('No se pudo obtener tu ubicación: activa el GPS y da permiso de ubicación al navegador'),
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
        if (
          !/^\/(uploads|activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(
            parsed.pathname,
          )
        ) {
          return raw;
        }
      } catch {
        return raw;
      }
    }

    const base = getApiAssetOrigin();
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

  // Foto recién tomada esperando que el usuario la vea y decida (como en Asistencias).
  type PendingPhoto = {
    kind: 'entry' | 'evidence' | 'exit';
    dataUrl: string;
    latitude: number;
    longitude: number;
    capturedAt: string;
  };
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  /** Ubicación de cada foto de evidencia (mismo orden que flowData.evidencePhotos). */
  const [evidenceGeo, setEvidenceGeo] = useState<
    Array<{ latitude: number; longitude: number; capturedAt: string } | null>
  >([]);

  /** Cámara en vivo (como en Asistencias): el usuario se acomoda y toca «Tomar foto». */
  const [liveKind, setLiveKind] = useState<PendingPhoto['kind'] | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveGeoRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const stopLiveStream = useCallback(() => {
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveStreamRef.current = null;
    setLiveReady(false);
  }, []);

  // Abre la cámara al entrar en vivo y la reabre al cambiar frontal/trasera.
  useEffect(() => {
    if (!liveKind) {
      stopLiveStream();
      return;
    }
    let cancelled = false;
    // Algunos teléfonos no abren una segunda cámara si la anterior sigue activa.
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveStreamRef.current = null;
    setLiveError(null);
    setLiveReady(false);
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: cameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        liveStreamRef.current = stream;
        const video = liveVideoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setLiveError('No se pudo abrir la cámara: revisa el permiso de cámara del navegador');
      });
    return () => {
      cancelled = true;
    };
  }, [liveKind, cameraFacing, stopLiveStream]);

  // Al salir de la pantalla, apaga la cámara.
  useEffect(() => () => stopLiveStream(), [stopLiveStream]);

  const openCamera = (kind: PendingPhoto['kind']) => {
    setError(null);
    if (kind === 'exit') setZonaSalidaError(null);
    setPendingPhoto(null);
    liveGeoRef.current = null;
    // La ubicación se busca desde que abre la cámara para tenerla lista al tomar la foto.
    getGeolocation()
      .then((geo) => {
        liveGeoRef.current = geo;
      })
      .catch(() => undefined);
    setLiveKind(kind);
  };

  const closeCamera = () => {
    setLiveKind(null);
    setLiveError(null);
  };

  /** «Tomar foto»: congela el cuadro actual y pasa a la vista previa con ubicación. */
  const shootLive = async () => {
    const video = liveVideoRef.current;
    if (!liveKind || !video) return;
    const dataUrl = grabFrame(video);
    if (!dataUrl) {
      setLiveError('La cámara aún no está lista; espera un segundo');
      return;
    }
    const kind = liveKind;
    setLoading(true);
    setLiveError(null);
    try {
      const geo = liveGeoRef.current ?? (await getGeolocation());
      setPendingPhoto({
        kind,
        dataUrl,
        latitude: geo.latitude,
        longitude: geo.longitude,
        capturedAt: new Date().toISOString(),
      });
      setLiveKind(null);
    } catch (err) {
      setLiveError(photoErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  const photoErrorText = (err: unknown) =>
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error al capturar foto';

  // Paso 1: Foto de entrada — abre la cámara en vivo; se envía al confirmar la vista previa.
  const handleEntryPhoto = async () => {
    if (!flowData) return;
    openCamera('entry');
  };

  const sendEntryPhoto = async (photo: PendingPhoto): Promise<boolean> => {
    if (!flowData) return false;
    setLoading(true);
    setError(null);

    try {
      // Misma ubicación que se mostró en la vista previa.
      const { dataUrl: photoUrl, latitude, longitude } = photo;

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
        syncFlowFromSaved(updated, {
          entryPhotoUrl: photoUrl,
          entryLatitude: latitude,
          entryLongitude: longitude,
        });
        setSuccessMsg(
          isCorrection
            ? correctionSuccessMessage(updated, '✅ Corrección enviada.')
            : `✅ Foto de entrada guardada. Siguiente: Tomar evidencias (${photoRequired} fotos)`,
        );
        setCameraActive(false);
        return true;
      }
      const errorData = await res.json().catch(() => ({}));
      setError(errorData.message || 'Error al guardar foto');
      return false;
    } catch (err) {
      setError(photoErrorText(err));
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: Foto de evidencia — abre la cámara en vivo; se agrega al confirmar la vista previa.
  const handleAddEvidencePhoto = async () => {
    if (!flowData) return;
    openCamera('evidence');
  };

  const addEvidencePhoto = (photo: PendingPhoto) => {
    if (!flowData) return;
    const previas = flowData.evidencePhotos.length;
    const updatedPhotos = [...flowData.evidencePhotos, photo.dataUrl];
    setFlowData({ ...flowData, evidencePhotos: updatedPhotos });
    setEvidenceGeo((prev) => {
      const alineadas = prev.slice(0, previas);
      while (alineadas.length < previas) alineadas.push(null);
      return [
        ...alineadas,
        { latitude: photo.latitude, longitude: photo.longitude, capturedAt: photo.capturedAt },
      ];
    });
    setSuccessMsg(`📷 Foto agregada (${updatedPhotos.length} de ${photoRequired})`);
  };

  /** «Enviar/Usar esta foto» en la vista previa. */
  const confirmPendingPhoto = async () => {
    if (!pendingPhoto) return;
    const { kind } = pendingPhoto;
    if (kind === 'evidence') {
      addEvidencePhoto(pendingPhoto);
      setPendingPhoto(null);
      return;
    }
    const ok =
      kind === 'entry' ? await sendEntryPhoto(pendingPhoto) : await sendExitPhoto(pendingPhoto);
    if (ok) setPendingPhoto(null);
  };

  /** «Tomar otra»: vuelve a la cámara en vivo del mismo paso. */
  const retakePendingPhoto = async () => {
    if (!pendingPhoto) return;
    openCamera(pendingPhoto.kind);
  };

  // Remover foto de evidencia
  const handleRemoveEvidencePhoto = (index: number) => {
    if (!flowData) return;
    const updatedPhotos = flowData.evidencePhotos.filter((_, i) => i !== index);
    setFlowData({ ...flowData, evidencePhotos: updatedPhotos });
    setEvidenceGeo((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  // Guardar todas las fotos de evidencia y avanzar
  const handleSaveEvidencePhotos = async () => {
    if (!flowData) return;
    if (!isInventoryFlow && flowData.evidencePhotos.length < photoRequired) {
      setError(
        `Se requieren ${photoRequired} fotos (tienes ${flowData?.evidencePhotos.length || 0})`,
      );
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
        const hasBefore =
          item.serialBefore.trim() &&
          item.modelBefore.trim() &&
          item.beforePanoramicPhotoUrl.trim() &&
          item.beforeCloseupPhotoUrl.trim();
        const hasAfter =
          item.serialAfter.trim() &&
          item.modelAfter.trim() &&
          item.afterPanoramicPhotoUrl.trim() &&
          item.afterCloseupPhotoUrl.trim();
        const hasMaintenance =
          item.maintenanceStickerPhotoUrl.trim() && item.maintenanceComments.trim();
        return !(hasCore && hasBefore && hasAfter && hasMaintenance);
      });
      if (invalidIndex >= 0) {
        setError(
          `Completa datos antes/después y comentario de mantenimiento en el equipo #${invalidIndex + 1}`,
        );
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

      // Cada foto viaja con la ubicación donde se tomó (null si es una foto previa sin GPS).
      const photoGeo = flowData.evidencePhotos.map((_, i) => evidenceGeo[i] ?? null);
      const body = isCorrection
        ? { step: 'EVIDENCE_PHOTOS', data: { photoUrls: flowData.evidencePhotos, photoGeo } }
        : { photoUrls: flowData.evidencePhotos, photoGeo };

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
        syncFlowFromSaved(updated);
        setSuccessMsg(
          isCorrection
            ? correctionSuccessMessage(updated, '✅ Corrección enviada.')
            : needsServiceSheetPdf
              ? '✅ Evidencias guardadas. Siguiente: Carga hoja de servicio PDF'
              : '✅ Evidencias guardadas. Siguiente: Completa el formulario',
        );
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
      setError('Solo se permite PDF');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convertir PDF a base64
      const reader = new FileReader();
      reader.onload = async () => {
        const pdfUrl = reader.result as string;
        if (!isPdfUrl(pdfUrl)) {
          setError('Solo se permite PDF');
          setLoading(false);
          return;
        }

        const endpoint = isCorrection
          ? `activity-evidence/${flowData.activityId}/resubmit`
          : `activity-evidence/${flowData.activityId}/service-sheet-pdf`;

        const body = isCorrection ? { step: 'SERVICE_SHEET_PDF', data: { pdfUrl } } : { pdfUrl };

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
          syncFlowFromSaved(updated, { serviceSheetPdfUrl: pdfUrl });
          setSuccessMsg(
            isCorrection
              ? correctionSuccessMessage(updated, '✅ Corrección enviada.')
              : '✅ PDF guardado. Siguiente: Completa la plantilla interna',
          );
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

      const body = isCorrection ? { step: 'SERVICE_SHEET_DATA', data: { formData: data } } : data;

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
        syncFlowFromSaved(updated, { serviceSheetData: data });
        setSuccessMsg(
          isCorrection
            ? correctionSuccessMessage(updated, '✅ Corrección enviada.')
            : '✅ Plantilla completada. Siguiente: Toma foto de salida',
        );
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
  const handleExitPhoto = async (forceInventoryConfirmed = false) => {
    if (!flowData) return;
    setLoading(true);
    setError(null);
    setZonaSalidaError(null);

    try {
      // Antes de abrir la cámara (y de cerrar el inventario): la salida solo se acepta dentro del radio.
      if (
        !forceInventoryConfirmed &&
        typeof navigator !== 'undefined' &&
        'geolocation' in navigator &&
        origenActividad()
      ) {
        const aqui = await getGeolocation().catch(() => null);
        const bloqueo = bloqueoPorZona(aqui);
        if (bloqueo) {
          setZonaSalidaError(bloqueo);
          void geocerca.recargar();
          return;
        }
      }

      if (isInventoryFlow) {
        const delta = inventoryItems.length - inventoryPreviousCount;
        if (delta !== 0 && !forceInventoryConfirmed) {
          setLoading(false);
          setConfirmState({
            message: `Se detectaron ${Math.abs(delta)} equipos ${delta > 0 ? 'de más' : 'de menos'} vs inventario previo. ¿Deseas guardar de todos modos?`,
            fn: async () => {
              await handleExitPhoto(true);
            },
          });
          return;
        }

        const syncRes = await fetch(
          buildApiUrl(`inventories/activity/${flowData.activityId}/sync`),
          {
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
          },
        );

        if (!syncRes.ok) {
          const syncError = await syncRes.json().catch(() => ({}));
          setError(syncError.message || 'No se pudo guardar el inventario final');
          setLoading(false);
          return;
        }
      }

      // Abre la cámara en vivo; se envía cuando el usuario confirma la vista previa.
      openCamera('exit');
    } catch (err) {
      setError(photoErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  // Paso 5 (confirmado): enviar la foto de salida que el usuario ya vio.
  const sendExitPhoto = async (photo: PendingPhoto): Promise<boolean> => {
    if (!flowData) return false;
    setLoading(true);
    setError(null);

    try {
      // Misma ubicación que se mostró en la vista previa.
      const { dataUrl: photoUrl, latitude, longitude } = photo;

      // Misma regla que la API: fuera del radio del punto de inicio no se envía.
      const bloqueo = bloqueoPorZona({ latitude, longitude });
      if (bloqueo) {
        setZonaSalidaError(bloqueo);
        void geocerca.recargar();
        return false;
      }
      setZonaSalidaError(null);

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
        const saved = await res.json();
        syncFlowFromSaved(saved, {
          exitPhotoUrl: saved.exitPhotoUrl || photoUrl,
          exitLatitude: saved.exitLatitude ?? latitude,
          exitLongitude: saved.exitLongitude ?? longitude,
        });
        if (saved.status === 'COMPLETED') {
          setSuccessMsg(
            isCorrection
              ? '🎉 ¡Corrección enviada exitosamente! Tu evidencia será revisada nuevamente.'
              : '🎉 ¡Asignación completada! Queda en revisión administrativa.',
          );
        } else if (isCorrection) {
          setSuccessMsg(correctionSuccessMessage(saved, '✅ Paso corregido.'));
        }
        setCameraActive(false);
        void geocerca.recargar();
        return true;
      }
      const errorData: { message?: unknown } = await res.json().catch(() => ({}));
      const apiMessage = Array.isArray(errorData.message)
        ? errorData.message.filter((m): m is string => typeof m === 'string').join('. ')
        : typeof errorData.message === 'string'
          ? errorData.message
          : '';
      if (res.status === 400 && /iniciaste la actividad|punto de inicio/i.test(apiMessage)) {
        // La API rechazó la salida por la geocerca: se muestra tal cual, destacado.
        setZonaSalidaError(apiMessage);
        void geocerca.recargar();
      } else {
        setError(apiMessage || 'Error al guardar foto');
      }
      return false;
    } catch (err) {
      setError(photoErrorText(err));
      return false;
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
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      {/* Portal a body: dentro de la tarjeta la capa quedaba atrapada y se encimaba con la página. */}
      {pendingPhoto && typeof document !== 'undefined' ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Revisa tu foto"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--surface)',
              color: 'inherit',
              border: '1px solid var(--border)',
              borderRadius: 18,
              padding: 18,
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                {pendingPhoto.kind === 'entry'
                  ? 'Tu foto de entrada'
                  : pendingPhoto.kind === 'exit'
                    ? 'Tu foto de salida'
                    : `Foto de evidencia ${flowData.evidencePhotos.length + 1} de ${photoRequired}`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                ¿Se ve bien? Si salió oscura o movida, toma otra.
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingPhoto.dataUrl}
              alt="Foto que tomaste"
              style={{
                width: '100%',
                maxHeight: '55vh',
                objectFit: 'contain',
                borderRadius: 12,
                background: '#000',
              }}
            />
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              📍 Ubicación capturada: {pendingPhoto.latitude.toFixed(5)}, {pendingPhoto.longitude.toFixed(5)} ·{' '}
              <a
                href={`https://www.google.com/maps?q=${pendingPhoto.latitude},${pendingPhoto.longitude}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--primary)', fontWeight: 650 }}
              >
                Ver en mapa
              </a>
            </div>
            {pendingPhoto.kind === 'exit' && zonaSalidaError ? (
              <AvisoFueraDeZona mensaje={zonaSalidaError} />
            ) : null}
            {error ? <div style={{ fontSize: 13, color: '#b91c1c' }}>❌ {error}</div> : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void confirmPendingPhoto()}
                disabled={loading}
                style={{
                  flex: '1 1 160px',
                  minHeight: 48,
                  border: 'none',
                  borderRadius: 12,
                  background: 'var(--primary)',
                  color: '#fff',
                  fontWeight: 750,
                  fontSize: 15,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading
                  ? '⏳ Enviando…'
                  : pendingPhoto.kind === 'evidence'
                    ? '✓ Usar esta foto'
                    : '✓ Enviar esta foto'}
              </button>
              <button
                type="button"
                onClick={() => void retakePendingPhoto()}
                disabled={loading}
                style={{
                  flex: '1 1 120px',
                  minHeight: 48,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'inherit',
                  fontWeight: 650,
                  fontSize: 15,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                📷 Tomar otra
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPhoto(null);
                  setError(null);
                }}
                disabled={loading}
                style={{
                  minHeight: 48,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontWeight: 650,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {liveKind && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Cámara"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                background: 'rgba(15, 23, 42, 0.75)',
                display: 'grid',
                placeItems: 'center',
                padding: 16,
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 560,
                  background: 'var(--surface)',
                  color: 'inherit',
                  border: '1px solid var(--border)',
                  borderRadius: 18,
                  padding: 18,
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>
                    {liveKind === 'entry'
                      ? 'Foto de entrada'
                      : liveKind === 'exit'
                        ? 'Foto de salida'
                        : `Foto de evidencia ${flowData.evidencePhotos.length + 1} de ${photoRequired}`}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Acomódate o encuadra bien y toca «Tomar foto».
                  </div>
                </div>
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#000',
                    minHeight: 220,
                  }}
                >
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedData={() => setLiveReady(true)}
                    style={{
                      width: '100%',
                      maxHeight: '55vh',
                      display: 'block',
                      objectFit: 'contain',
                      // Frontal en espejo, como un espejo real; la foto se guarda sin espejo.
                      transform: cameraFacing === 'user' ? 'scaleX(-1)' : undefined,
                    }}
                  />
                  {!liveReady && !liveError ? (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        fontSize: 14,
                      }}
                    >
                      Abriendo cámara…
                    </div>
                  ) : null}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  📍 Al tomar la foto se guarda tu ubicación.
                </div>
                {liveError ? <div style={{ fontSize: 13, color: '#b91c1c' }}>❌ {liveError}</div> : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void shootLive()}
                    disabled={!liveReady || loading}
                    style={{
                      flex: '1 1 160px',
                      minHeight: 52,
                      border: 'none',
                      borderRadius: 12,
                      background: 'var(--primary)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 16,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity: !liveReady || loading ? 0.6 : 1,
                    }}
                  >
                    {loading ? '⏳ Ubicando…' : '📸 Tomar foto'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    disabled={loading}
                    style={{
                      flex: '1 1 120px',
                      minHeight: 52,
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'inherit',
                      fontWeight: 650,
                      fontSize: 15,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    🔄 {cameraFacing === 'environment' ? 'Usar frontal' : 'Usar trasera'}
                  </button>
                  <button
                    type="button"
                    onClick={closeCamera}
                    disabled={loading}
                    style={{
                      minHeight: 52,
                      padding: '0 14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontWeight: 650,
                      fontSize: 14,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {error && <div className={styles.alertError}>❌ {error}</div>}

      {successMsg && <div className={styles.alertSuccess}>{successMsg}</div>}

      {(flowData.indicaciones || flowData.assigneeIndicaciones) && (
        <div className={styles.stepCard} style={{ marginBottom: 12 }}>
          {flowData.indicaciones ? (
            <div style={{ marginBottom: flowData.assigneeIndicaciones ? 10 : 0 }}>
              <strong className={styles.stepTitle} style={{ fontSize: 14 }}>
                Indicaciones generales
              </strong>
              <p className={styles.stepDescription} style={{ marginBottom: 0 }}>
                {flowData.indicaciones}
              </p>
            </div>
          ) : null}
          {flowData.assigneeIndicaciones ? (
            <div>
              <strong className={styles.stepTitle} style={{ fontSize: 14 }}>
                Indicaciones para ti
              </strong>
              <p className={styles.stepDescription} style={{ marginBottom: 0 }}>
                {flowData.assigneeIndicaciones}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Banner de Rechazo */}
      {flowData.reviewStatus === 'REJECTED' &&
        (rejectedList.length > 0 || flowData.reviewNotes) && (
          <div className={styles.rejectedBanner}>
            <h3 className={styles.rejectedTitle}>
              <span className={styles.rejectedEmoji}>⚠️</span>
              Tu evidencia fue rechazada
            </h3>
            {rejectedList.length > 0 && (
              <div className={styles.rejectedStepRow}>
                <strong className={styles.rejectedStrong}>
                  {rejectedList.length > 1 ? 'Pasos a corregir:' : 'Paso rechazado:'}
                </strong>{' '}
                <span className={styles.rejectedStepText}>
                  {rejectedList.map((step) => evidenceStepLabel(step)).join(' · ')}
                </span>
              </div>
            )}
            <div>
              <strong className={styles.rejectedStrong}>Observaciones del revisor:</strong>
              <p className={styles.rejectedNotes}>
                {(flowData.reviewNotes || '').trim() || 'Sin observaciones registradas.'}
              </p>
            </div>
            <div className={styles.rejectedHint}>
              💡 <strong>Instrucciones:</strong> Corrige el paso actual.{' '}
              {rejectedList.length > 1
                ? 'Luego podrás corregir los demás pasos indicados.'
                : 'Al terminar, se enviará nuevamente a revisión.'}
            </div>
          </div>
        )}

      {/* Barra de progreso */}
      <div className={styles.progressWrap}>
        <div className={styles.progressMeta}>
          Actividad:{' '}
          <strong>{actividades.find((a) => a.id === flowData.activityId)?.anNumber}</strong>
          {flowData.progressPct != null ? (
            <span style={{ marginLeft: 8, color: '#6b7280' }}>{flowData.progressPct}%</span>
          ) : null}
        </div>
        <div className={styles.progressRow}>
          {visibleSteps.map((stepKey, index) => {
            const completed =
              stepKey === 'ENTRY_PHOTO'
                ? Boolean(flowData.entryPhotoUrl)
                : stepKey === 'EVIDENCE_PHOTOS'
                  ? flowData.evidencePhotos.length > 0
                  : stepKey === 'SERVICE_SHEET_PDF'
                    ? Boolean(flowData.serviceSheetPdfUrl)
                    : stepKey === 'SERVICE_SHEET_DATA'
                      ? Boolean(flowData.serviceSheetData)
                      : Boolean(flowData.exitPhotoUrl);
            return (
              <React.Fragment key={stepKey}>
                {index > 0 ? <div className={styles.progressDivider} /> : null}
                <ProgressStep
                  step={index + 1}
                  active={flowData.step === stepKey}
                  completed={completed}
                  label={EVIDENCE_STEP_LABELS[stepKey]}
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Geocerca: punto de inicio, recorrido y salidas de zona por justificar */}
      {actividadIniciada ? (
        <UbicacionActividadCard activityId={flowData.activityId} token={user.token} geocerca={geocerca} />
      ) : null}

      {/* PASO 1: Foto de Entrada */}
      {flowData.step === 'ENTRY_PHOTO' && !isFlowLocked && (
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
              onClick={() =>
                setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              disabled={loading}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: Fotos de Evidencia */}
      {flowData.step === 'EVIDENCE_PHOTOS' && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepEvidence}`}>
          <h3 className={styles.stepTitle}>
            {isInventoryFlow
              ? `🗂️ Paso 2: Inventario comparativo + evidencias (${flowData.evidencePhotos.length} foto${flowData.evidencePhotos.length === 1 ? '' : 's'})`
              : `📷 Paso 2: Evidencias (${flowData.evidencePhotos.length}/${photoRequired})`}
          </h3>
          <p className={styles.stepDescription}>
            {isInventoryFlow
              ? 'Actualiza equipos por grupo, serie, modelo y al menos una foto de evidencia/sticker por mantenimiento.'
              : `Toma ${photoRequired} fotos de evidencia.`}
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
                    <input
                      className="input"
                      placeholder="Apartado"
                      value={item.sectionName}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, sectionName: e.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="Grupo (servidores, scanner, impresora...)"
                      value={item.groupName}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, groupName: e.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="Nombre equipo"
                      value={item.equipmentName}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, equipmentName: e.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="Serie ANTES"
                      value={item.serialBefore}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...current,
                                  serialBefore: e.target.value,
                                  serialNumber: e.target.value,
                                }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="Modelo ANTES"
                      value={item.modelBefore}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, modelBefore: e.target.value, model: e.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="Serie DESPUÉS"
                      value={item.serialAfter}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...current,
                                  serialAfter: e.target.value,
                                  serialNumber: e.target.value,
                                }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="Modelo DESPUÉS"
                      value={item.modelAfter}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, modelAfter: e.target.value, model: e.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      placeholder="¿Qué se le hizo al equipo?"
                      value={item.maintenanceActions}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, maintenanceActions: e.target.value }
                              : current,
                          ),
                        )
                      }
                    />
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
                            onChange={(event) =>
                              setInventoryImageField(index, field, event.target.files?.[0])
                            }
                          />
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => inventoryFileRefs.current[fileKey]?.click()}
                          >
                            {inventoryUploadingKey === fileKey
                              ? 'Subiendo...'
                              : 'Cargar / arrastrar imagen'}
                          </button>
                          {imageUrl ? (
                            <img
                              src={getAssetUrl(imageUrl)}
                              alt={label}
                              className={styles.inventoryPreviewImage}
                            />
                          ) : (
                            <div className={styles.inventoryDropLabel}>Sin imagen</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.inventoryFooterRow}>
                    <input
                      className="input"
                      placeholder="Comentario técnico de mantenimiento"
                      value={item.maintenanceComments}
                      onChange={(e) =>
                        setInventoryItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...current,
                                  maintenanceComments: e.target.value,
                                  notes: e.target.value,
                                }
                              : current,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() =>
                        setInventoryItems((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}

              <textarea
                className="input"
                rows={2}
                placeholder="Notas globales del inventario y mantenimiento"
                value={inventoryNotes}
                onChange={(e) => setInventoryNotes(e.target.value)}
              />
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
              disabled={loading || (!isInventoryFlow && flowData.evidencePhotos.length >= photoRequired)}
            >
              {loading ? '⏳ Capturando...' : '📷 Agregar'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.actionSecondary}`}
              onClick={() =>
                setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              disabled={loading}
            >
              🔄 {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
            {(isInventoryFlow
              ? flowData.evidencePhotos.length >= 1
              : flowData.evidencePhotos.length >= photoRequired) && (
              <button
                className={`${styles.actionButton} ${styles.actionPrimary} ${styles.actionSuccess}`}
                onClick={handleSaveEvidencePhotos}
                disabled={loading}
              >
                {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
              </button>
            )}
          </div>
          {/* El aviso de arriba queda fuera de vista con 4 fotos: se repite junto al botón. */}
          {error ? (
            <div className={styles.alertError} role="alert" style={{ marginTop: 12 }}>
              ❌ {error}
            </div>
          ) : null}
        </div>
      )}

      {/* PASO 3: PDF (solo servicio) */}
      {flowData.step === 'SERVICE_SHEET_PDF' && needsServiceSheetPdf && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepPdf}`}>
          <h3 className={styles.stepTitle}>📄 Paso: Hoja de Servicio (PDF)</h3>
          <p className={styles.stepDescription}>
            Carga el PDF de la hoja de servicio con arrastrar y soltar o selección manual. Solo PDF.
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
              accept="application/pdf"
              onChange={handleServiceSheetPdfUpload}
              disabled={loading}
              style={{
                position: 'absolute',
                width: 0,
                height: 0,
                opacity: 0,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
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
                background:
                  'linear-gradient(135deg, rgba(249, 144, 0, 0.05) 0%, rgba(249, 144, 0, 0.02) 100%)',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as any).style.background =
                    'linear-gradient(135deg, rgba(249, 144, 0, 0.12) 0%, rgba(249, 144, 0, 0.08) 100%)';
                  (e.currentTarget as any).style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as any).style.background =
                  'linear-gradient(135deg, rgba(249, 144, 0, 0.05) 0%, rgba(249, 144, 0, 0.02) 100%)';
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
                <div style={{ fontSize: '13px', color: '#6b7280' }}>o arrastra aquí</div>
              </div>
            </div>
          </div>
          {flowData.serviceSheetPdfUrl && (
            <div className={styles.pdfPreviewCard}>
              <div>✅ PDF cargado correctamente</div>
              <object
                data={getAssetUrl(flowData.serviceSheetPdfUrl)}
                type="application/pdf"
                width="100%"
                height="280"
              >
                <embed src={getAssetUrl(flowData.serviceSheetPdfUrl)} type="application/pdf" />
              </object>
            </div>
          )}
        </div>
      )}

      {/* PASO: Formulario digital por coreKind */}
      {flowData.step === 'SERVICE_SHEET_DATA' && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepData}`}>
          <h3 className={styles.stepTitle}>📝 Paso: Formulario</h3>
          <p className={styles.stepDescription}>
            Completa los datos requeridos para esta actividad.
          </p>
          <DigitalEvidenceForm
            coreKind={flowData.coreKind}
            onSubmit={handleServiceSheetFormSubmit}
            loading={loading}
            initialData={flowData.serviceSheetData}
          />
        </div>
      )}

      {/* PASO 5: Foto de Salida */}
      {flowData.step === 'EXIT_PHOTO' && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepExit}`}>
          <h3 className={styles.stepTitle}>🚪 Paso 5: Foto de Salida</h3>
          <p className={styles.stepDescription}>
            Toma la foto de salida en el sitio. Se capturará automáticamente tu ubicación GPS — es
            obligatoria para cerrar la actividad.
          </p>
          <p className={styles.stepDescription}>
            Debe tomarse a no más de {geocerca.estado?.radioM ?? RADIO_ACTIVIDAD_M} m del punto donde
            iniciaste la actividad.
          </p>
          {zonaSalidaError && !pendingPhoto ? (
            <div style={{ marginBottom: 12 }}>
              <AvisoFueraDeZona mensaje={zonaSalidaError} />
            </div>
          ) : null}
          {flowData.exitLatitude != null && flowData.exitLongitude != null && (
            <p className={styles.stepDescription}>
              📍 Última ubicación registrada: {Number(flowData.exitLatitude).toFixed(5)},{' '}
              {Number(flowData.exitLongitude).toFixed(5)}
            </p>
          )}
          <div className={styles.actionGrid}>
            <button
              className={`${styles.actionButton} ${styles.actionPrimary} ${styles.actionExit}`}
              onClick={() => void handleExitPhoto()}
              disabled={loading}
            >
              {loading ? '⏳ Capturando...' : '📷 Salida'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.actionSecondary}`}
              onClick={() =>
                setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
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
          <h2 className={styles.completedTitle}>
            {isFlowLocked
              ? '⏳ Evidencias enviadas a revisión'
              : '🎉 ¡Asignación Completada Exitosamente!'}
          </h2>
          <p className={styles.completedText}>
            {isFlowLocked
              ? 'Los pasos están guardados. Un administrador debe aprobar o rechazar antes de que puedas modificar algo.'
              : 'Todos los pasos han sido completados correctamente y se encuentran guardados en el sistema.'}
          </p>
          {!isFlowLocked && (
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
          )}
        </div>
      )}
    </div>
  );
};

// Componente para paso de progreso
const ProgressStep = ({
  step,
  active,
  completed,
  label,
}: {
  step: number;
  active: boolean;
  completed: boolean;
  label: string;
}) => (
  <div className={styles.progressStep}>
    <div
      className={`${styles.progressCircle} ${active ? styles.progressCircleActive : ''} ${completed ? styles.progressCircleCompleted : ''}`}
    >
      {completed ? '✓' : step}
    </div>
    <div className={styles.progressLabel}>{label}</div>
  </div>
);

// Formulario digital por coreKind (serviceSheetData JSON)
const buildInitialDigitalForm = (
  coreKind?: string | null,
  initialData?: Record<string, unknown> | null,
): DigitalFormFields => {
  const base = emptyDigitalForm(coreKind);
  if (!initialData || typeof initialData !== 'object' || Array.isArray(initialData)) {
    return base;
  }
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    const value = initialData[key];
    if (typeof value === 'string') merged[key] = value;
    else if (value != null) merged[key] = String(value);
  }
  return merged;
};

const DigitalEvidenceForm = ({
  coreKind,
  onSubmit,
  loading,
  initialData,
}: {
  coreKind?: string | null;
  onSubmit: (data: DigitalFormFields) => void;
  loading: boolean;
  initialData?: Record<string, unknown> | null;
}) => {
  const fields = digitalFormLabels(coreKind);
  const [data, setData] = useState<DigitalFormFields>(() =>
    buildInitialDigitalForm(coreKind, initialData),
  );

  useEffect(() => {
    setData(buildInitialDigitalForm(coreKind, initialData));
  }, [coreKind, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data);
  };

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1.5px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '10px',
  };
  const lbl: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <form onSubmit={handleSubmit} className={styles.serviceForm}>
      {fields.map(({ key, label }) => {
        const multiline = /que|observ|hiciste|hizo/i.test(key) || /observ/i.test(label);
        return (
          <div key={key}>
            <label style={lbl}>{label}</label>
            {multiline ? (
              <textarea
                style={{ ...inp, minHeight: '90px', resize: 'vertical' } as React.CSSProperties}
                value={data[key] || ''}
                onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}
                required
                disabled={loading}
              />
            ) : (
              <input
                type="text"
                style={inp}
                value={data[key] || ''}
                onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}
                required
                disabled={loading}
              />
            )}
          </div>
        );
      })}
      <button type="submit" className={`button-primary ${styles.serviceSubmit}`} disabled={loading}>
        {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
      </button>
    </form>
  );
};

// Formulario legacy de plantilla interna (conservado; UI usa DigitalEvidenceForm)
// Pad de firma digital (mouse + touch + stylus)
const SignaturePad = ({
  onSignature,
  disabled,
  initialValue,
}: {
  onSignature: (dataUrl: string | null) => void;
  disabled: boolean;
  initialValue?: string | null;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const savedDataUrl = useRef<string | null>(initialValue ?? null);
  const onSigRef = useRef(onSignature);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    onSigRef.current = onSignature;
  });
  useEffect(() => {
    disabledRef.current = disabled;
  });

  const syncCanvasSize = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#1a2e4a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { ctx, rect };
  }, []);

  const paintImage = useCallback(
    (dataUrl: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const setup = syncCanvasSize(canvas);
      if (!setup) return;
      const { ctx } = setup;
      const image = new Image();
      image.onload = () => {
        if (isDrawing.current) return;
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        const ratio = Math.min(rect.width / image.width, rect.height / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        const offsetX = (rect.width - width) / 2;
        const offsetY = (rect.height - height) / 2;
        ctx.drawImage(image, offsetX, offsetY, width, height);
      };
      image.src = dataUrl;
    },
    [syncCanvasSize],
  );

  // Solo hidratar firma externa al montar o cuando cambia desde fuera (no durante el trazo)
  useEffect(() => {
    if (isDrawing.current) return;
    if (!initialValue) return;
    if (initialValue === savedDataUrl.current) return;
    savedDataUrl.current = initialValue;
    paintImage(initialValue);
  }, [initialValue, paintImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    syncCanvasSize(canvas);
    if (savedDataUrl.current) paintImage(savedDataUrl.current);

    const getPos = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const emitSignature = () => {
      const dataUrl = canvas.toDataURL('image/png');
      savedDataUrl.current = dataUrl;
      onSigRef.current(dataUrl);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (disabledRef.current) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      const pos = getPos(e.clientX, e.clientY);
      lastPos.current = pos;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getPos(e.clientX, e.clientY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
    };

    const endStroke = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      emitSignature();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);

    const onResize = () => {
      if (isDrawing.current) return;
      syncCanvasSize(canvas);
      if (savedDataUrl.current) paintImage(savedDataUrl.current);
    };
    window.addEventListener('resize', onResize);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endStroke);
      canvas.removeEventListener('pointercancel', endStroke);
      window.removeEventListener('resize', onResize);
    };
  }, [paintImage, syncCanvasSize]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.getContext('2d')!.clearRect(0, 0, rect.width, rect.height);
    savedDataUrl.current = null;
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
        }}
      >
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>✍️ Firmar con el dedo o el mouse</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          style={{
            fontSize: '12px',
            color: '#ef4444',
            background: 'none',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: '2px 8px',
          }}
        >
          🗑️ Limpiar
        </button>
      </div>
    </div>
  );
};

const buildInitialServiceSheetFormData = (
  initialData?: Partial<ServiceSheetFormData> | null,
): ServiceSheetFormData => ({
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

const ServiceSheetForm = ({
  onSubmit,
  loading,
  initialData,
}: {
  onSubmit: (data: any) => void;
  loading: boolean;
  initialData?: Partial<ServiceSheetFormData> | null;
}) => {
  const [data, setData] = useState<ServiceSheetFormData>(() =>
    buildInitialServiceSheetFormData(initialData),
  );

  useEffect(() => {
    setData(buildInitialServiceSheetFormData(initialData));
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.managerSignature) {
      toast.error('La firma del gerente es obligatoria');
      return;
    }
    onSubmit(data);
  };

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1.5px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '10px',
  };
  const lbl: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
    display: 'block',
  };
  const sec: React.CSSProperties = {
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '14px',
    marginBottom: '14px',
  };
  const secTitle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    color: '#374151',
    marginBottom: '12px',
    paddingBottom: '6px',
    borderBottom: '1px solid #e5e7eb',
  };

  return (
    <form onSubmit={handleSubmit} className={styles.serviceForm}>
      {/* Datos del Servicio */}
      <div style={sec}>
        <div style={secTitle}>📋 Datos del Servicio</div>
        <label style={lbl}>Nombre del Técnico</label>
        <input
          type="text"
          style={inp}
          placeholder="Nombre completo del técnico"
          value={data.technicianName}
          onChange={(e) => setData({ ...data, technicianName: e.target.value })}
          required
          disabled={loading}
        />
        <label style={lbl}>Fecha del Servicio</label>
        <input
          type="date"
          style={inp}
          value={data.serviceDate}
          onChange={(e) => setData({ ...data, serviceDate: e.target.value })}
          required
          disabled={loading}
        />
      </div>

      {/* Datos del Cliente */}
      <div style={sec}>
        <div style={secTitle}>🏢 Datos del Cliente</div>
        <label style={lbl}>Empresa / Organización</label>
        <input
          type="text"
          style={inp}
          placeholder="Nombre de la empresa o cliente"
          value={data.clientCompany}
          onChange={(e) => setData({ ...data, clientCompany: e.target.value })}
          required
          disabled={loading}
        />
        <label style={lbl}>Teléfono de Contacto</label>
        <PhoneField
          style={inp}
          placeholder="Número de teléfono"
          value={data.clientPhone}
          onChange={(clientPhone) => setData({ ...data, clientPhone })}
          disabled={loading}
        />
      </div>

      {/* Trabajo Realizado */}
      <div style={sec}>
        <div style={secTitle}>🔧 Trabajo Realizado</div>
        <label style={lbl}>Resumen del trabajo realizado</label>
        <textarea
          style={{ ...inp, minHeight: '90px', resize: 'vertical' } as React.CSSProperties}
          placeholder="Describe el trabajo realizado..."
          value={data.workSummary}
          onChange={(e) => setData({ ...data, workSummary: e.target.value })}
          required
          disabled={loading}
        />
        <label style={lbl}>Materiales / Equipos utilizados</label>
        <textarea
          style={{ ...inp, minHeight: '70px', resize: 'vertical' } as React.CSSProperties}
          placeholder="Lista de materiales o equipos utilizados"
          value={data.materialsUsed}
          onChange={(e) => setData({ ...data, materialsUsed: e.target.value })}
          disabled={loading}
        />
        <label style={lbl}>Horas trabajadas</label>
        <input
          type="number"
          style={{ ...inp, width: '140px' }}
          placeholder="ej. 4.5"
          min="0"
          step="0.5"
          value={data.hoursWorked}
          onChange={(e) => setData({ ...data, hoursWorked: e.target.value })}
          disabled={loading}
        />
        <label style={lbl}>Observaciones</label>
        <textarea
          style={{ ...inp, minHeight: '70px', resize: 'vertical' } as React.CSSProperties}
          placeholder="Observaciones adicionales"
          value={data.observations}
          onChange={(e) => setData({ ...data, observations: e.target.value })}
          disabled={loading}
        />
      </div>

      {/* Conformidad del Gerente */}
      <div style={{ ...sec, borderColor: data.managerSignature ? '#10b981' : '#e5e7eb' }}>
        <div style={{ ...secTitle, color: data.managerSignature ? '#059669' : '#374151' }}>
          ✅ Conformidad del Gerente / Representante
        </div>
        <label style={lbl}>Nombre del Gerente / Representante</label>
        <input
          type="text"
          style={inp}
          placeholder="Nombre completo"
          value={data.managerName}
          onChange={(e) => setData({ ...data, managerName: e.target.value })}
          required
          disabled={loading}
        />
        <label style={lbl}>Cargo</label>
        <input
          type="text"
          style={inp}
          placeholder="Cargo del gerente o representante"
          value={data.managerRole}
          onChange={(e) => setData({ ...data, managerRole: e.target.value })}
          required
          disabled={loading}
        />
        <label style={{ ...lbl, marginTop: '4px' }}>
          Firma Digital <span style={{ color: '#ef4444' }}>*</span>
        </label>
        {data.managerSignature && (
          <div
            style={{
              marginBottom: '8px',
              padding: '6px',
              background: '#ecfdf5',
              borderRadius: '6px',
              border: '1px solid #a7f3d0',
              fontSize: '12px',
              color: '#059669',
            }}
          >
            ✓ Firma capturada correctamente
          </div>
        )}
        <SignaturePad
          onSignature={(sig) => setData((prev) => ({ ...prev, managerSignature: sig }))}
          disabled={loading}
          initialValue={initialData?.managerSignature}
        />
      </div>

      <button type="submit" className={`button-primary ${styles.serviceSubmit}`} disabled={loading}>
        {loading ? '⏳ Guardando...' : '✓ Siguiente Paso →'}
      </button>
    </form>
  );
};

export default ActivityEvidenceFlow;

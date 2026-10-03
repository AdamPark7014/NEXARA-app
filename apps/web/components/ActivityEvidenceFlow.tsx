'use client';
import { toast } from '@/components/Toast';
import { formatApiError } from '@/lib/erp-api';
import { buildApiUrl, getApiAssetOrigin, getSocketBaseUrl } from '@/lib/api-base';
import { evidenceStepLabel, isEvidenceLocked, rejectedStepsList } from '@/lib/evidence-lock';
import {
  claveDeFormulario,
  digitalFormLabels,
  emptyDigitalForm,
  evidenceStepsForKind,
  isPdfUrl,
  requiresServiceSheetPdf,
  textosDeInicioYCierre,
  type DigitalFormFields,
  type EvidenceStep,
} from '@/lib/evidence-flow-helpers';
import {
  MOMENTOS,
  MOMENTO_LABEL,
  faltanFotosDeCampos,
  guardarFotoDeCampo,
  progresoDeCampos,
  quitarFotoDeCampo,
  type CampoEvidencia,
  type Momento,
} from '@/lib/evidencia-campos';
import {
  dataUrlDeImagen,
  mensajeAdjuntoInvalido,
  primerArchivo,
  puntoDeFoto,
} from '@/lib/evidencia-adjunto';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from './UserContext';
import styles from './ActivityEvidenceFlow.module.css';
import { Socket } from 'socket.io-client';
import ConfirmDialog, { type ConfirmState } from '@/components/ui/ConfirmDialog';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import { geoDeFotosGuardadas, mensajeFotoNoGuardada, type GeoDeFoto } from '@/lib/evidencia-fotos';
import PhoneField from '@/components/PhoneField';
import UbicacionActividadCard, { AvisoFueraDeZona, useGeocerca } from '@/components/ops/UbicacionActividad';
import {
  RADIO_ACTIVIDAD_M,
  distanciaM,
  mensajeSalidaFueraDeZona,
  puntoReal,
  type PuntoGeo,
} from '@/lib/activity-geofence';
import dynamic from 'next/dynamic';
import { Alert, Badge, Button, DateInput, Field, Input, Select, Textarea } from '@/components/base';

const VisorPdf = dynamic(
  () => import('@/components/ops/EquipoEvidencias').then((m) => m.VisorPdf),
  { ssr: false, loading: () => <p className={styles.muted}>Cargando vista previa PDF…</p> },
);

/* Iconos de trazo de los botones del flujo (sustituyen a los emojis de antes). */
const trazo = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const IcoCamara = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z" {...trazo} />
    <circle cx="8" cy="8.8" r="2.1" {...trazo} />
  </svg>
);
const IcoGirar = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M13 5.5A5.5 5.5 0 0 0 3.2 6M3 10.5A5.5 5.5 0 0 0 12.8 10M13 2.5v3h-3M3 13.5v-3h3" {...trazo} />
  </svg>
);
const IcoClip = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M10.8 4.6 5.6 9.8a1.6 1.6 0 0 0 2.3 2.3l5.4-5.4a3 3 0 0 0-4.3-4.3L3.6 7.8a4.4 4.4 0 0 0 6.2 6.2l3.6-3.6" {...trazo} />
  </svg>
);
const IcoCheck = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M3.5 8.4l3 3 6-6.6" {...trazo} strokeWidth={2} />
  </svg>
);
const IcoFlecha = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M3 8h10M9 4l4 4-4 4" {...trazo} />
  </svg>
);
const IcoPin = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M8 14s4.6-4.1 4.6-7.6A4.6 4.6 0 0 0 3.4 6.4C3.4 9.9 8 14 8 14z" {...trazo} />
    <circle cx="8" cy="6.4" r="1.7" {...trazo} />
  </svg>
);
const IcoDoc = () => (
  <svg width="26" height="26" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M4 1.8h5.2L12.4 5v9.2H4z" {...trazo} strokeWidth={1.3} />
    <path d="M9 1.8V5h3.4M6 8.2h4.2M6 10.6h4.2" {...trazo} strokeWidth={1.3} />
  </svg>
);
const IcoForm = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <rect x="2.8" y="2" width="10.4" height="12" rx="1.8" {...trazo} />
    <path d="M5.3 5.6l1 1 1.8-2M9.6 5.8h1.6M5.3 9.6l1 1 1.8-2M9.6 9.8h1.6" {...trazo} />
  </svg>
);
const IcoSalida = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6.5" {...trazo} />
  </svg>
);
const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M4 4l8 8M12 4l-8 8" {...trazo} strokeWidth={2} />
  </svg>
);
const IcoReloj = () => (
  <svg width="26" height="26" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6" {...trazo} strokeWidth={1.4} />
    <path d="M8 4.8V8l2.2 1.4" {...trazo} strokeWidth={1.4} />
  </svg>
);
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
  /** «Avance anterior de <nombre>»: lo que dejó quien la tenía antes (solo lectura). */
  avancesAnteriores?: AvanceAnterior[];
  /** Excepción puntual y con vencimiento: entrada/salida se pueden adjuntar, no solo cámara. */
  allowAttach?: boolean;
}

type AvanceAnterior = {
  userId: number;
  nombre: string;
  titulo: string;
  motivo: string | null;
  reasignadaAt: string;
  movidaPor: string | null;
  progressPct: number;
  evidence: {
    status: string;
    entryPhotoUrl: string | null;
    evidencePhotos: string[];
    serviceSheetPdfUrl: string | null;
    serviceSheetData: unknown;
    exitPhotoUrl: string | null;
  } | null;
};

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
  /** Campos de evidencia (qué fotografiar × momento). Vacío = flujo viejo de N fotos libres. */
  const [camposEvidencia, setCamposEvidencia] = useState<CampoEvidencia[]>([]);
  /** Hueco (campo × momento) al que va la próxima captura de evidencia. */
  const [campoTarget, setCampoTarget] = useState<{ fieldId: number; momento: Momento } | null>(null);
  /** Lightbox de la galería de fotos libres (índice); null = cerrado. */
  const [galleryLightbox, setGalleryLightbox] = useState<number | null>(null);
  const inventoryFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isCorrection = flowData?.reviewStatus === 'REJECTED';
  const isFlowLocked = Boolean(flowData && isEvidenceLocked(flowData));
  const rejectedList = flowData ? rejectedStepsList(flowData) : [];
  const porCampos = camposEvidencia.length > 0;
  const camposFaltan = porCampos ? faltanFotosDeCampos(camposEvidencia) : 0;
  const camposProgreso = porCampos ? progresoDeCampos(camposEvidencia) : { requeridas: 0, cumplidas: 0 };

  // Geocerca: desde la foto de entrada, la persona se mide contra el radio (500 m) del punto de inicio.
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
    // Sin la bandera del API (o en false) no se pre-bloquea: la regla depende del tipo de actividad.
    if (geocerca.estado?.exigeMismaUbicacion !== true) return null;
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
      return `✅ Paso corregido. Siguiente: ${evidenceStepLabel(saved.status, flowData?.coreKind)}`;
    }
    return fallback;
  };
  const selectedActivity = actividades.find(
    (activity) => activity.id === Number(selectedActivityId || flowData?.activityId),
  );
  const isInventoryFlow = selectedActivity?.workType === 'PREVENTIVE_INVENTORY';
  const photoRequired = Math.max(1, Number(flowData?.evidencePhotoRequired) || 4);
  const needsServiceSheetPdf = requiresServiceSheetPdf(flowData?.coreKind);
  // En comercial no hay «entrada» ni «salida»: inicio y conclusión de actividad.
  const textos = textosDeInicioYCierre(flowData?.coreKind);
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
        setError(formatApiError(err, 'No se pudieron cargar tus actividades.'));
      }
    };

    void loadActivities();
  }, [user?.token]);

  useEffect(() => {
    if (!requestedActivityId || loading || flowData?.activityId === requestedActivityId) return;
    handleActivitySelect(requestedActivityId);
  }, [requestedActivityId, loading, flowData?.activityId]);

  // Al volver a la pestaña (salió a otra pantalla / app y regresó): rehidrata fotos
  // ya guardadas para no enseñar la lista vacía y forzar a empezar de cero.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!flowData?.activityId || loading) return;
      void handleActivitySelect(flowData.activityId, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [flowData?.activityId, loading]);

  // Cuando selecciona una actividad
  /**
   * `refresh`: relectura de la misma actividad por un aviso en tiempo real. No toca `loading`
   * (liberaría los botones con una foto aún subiendo) ni lo que la persona tiene abierto: campo
   * elegido, foto en grande o inventario sin sincronizar.
   */
  const handleActivitySelect = async (activityId: number, refresh = false) => {
    setSelectedActivityId(activityId);
    if (!refresh) {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      setInventoryItems([]);
      setInventoryNotes('');
      setInventoryPreviousCount(0);
      setCamposEvidencia([]);
      setCampoTarget(null);
      setGalleryLightbox(null);
      setEvidenceGeo([]);
    }

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
        setCamposEvidencia(Array.isArray(data.campos) ? (data.campos as CampoEvidencia[]) : []);
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
          avancesAnteriores: Array.isArray(data.avancesAnteriores) ? data.avancesAnteriores : [],
          allowAttach: data.allowAttach === true,
        });
        // Sin la ubicación de las fotos ya guardadas, el envío final mandaría `null` por cada foto
        // de un intento anterior y el servidor sobrescribiría su ubicación.
        setEvidenceGeo(geoDeFotosGuardadas(data.evidencePhotosGeo, (data.evidencePhotos || []).length));

        if (
          !refresh &&
          (data.activity?.workType || currentActivity?.workType) === 'PREVENTIVE_INVENTORY'
        ) {
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
      } else if (res.status !== 404) {
        // Solo «no existe» abre un flujo nuevo: con un 500 o un proxy caído la pantalla volvía a
        // «foto de entrada» sin fotos, como si se hubiera perdido todo lo capturado.
        const errorData = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(errorData ?? {}));
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
      if (!refresh) {
        setError(
          formatApiError(err, 'No se pudieron cargar tus evidencias. Revisa tu conexión e intenta de nuevo.'),
        );
        // Nunca subir fotos a la actividad anterior mientras se ve otra seleccionada.
        setFlowData((prev) => (prev && prev.activityId !== activityId ? null : prev));
        // Sin esto el efecto de `?activityId=` reintentaría sin fin al bajar `loading`.
        setRequestedActivityId((prev) => (prev === activityId ? null : prev));
      }
    } finally {
      if (!refresh) setLoading(false);
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
        handleActivitySelect(Number(selectedActivityId), true);
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
      setError(formatApiError(uploadError, 'No se pudo subir la foto. Intenta de nuevo.'));
    } finally {
      setInventoryUploadingKey(null);
    }
  };

  // Foto recién tomada esperando que el usuario la vea y decida (como en Asistencias).
  type PendingPhoto = {
    kind: 'entry' | 'evidence' | 'exit';
    dataUrl: string;
    /** La entrada y la salida siempre traen GPS. Una evidencia adjunta puede ir sin él. */
    latitude: number | null;
    longitude: number | null;
    capturedAt: string;
  };
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  /** Ubicación de cada foto de evidencia (mismo orden que flowData.evidencePhotos). */
  const [evidenceGeo, setEvidenceGeo] = useState<Array<GeoDeFoto | null>>([]);
  /**
   * Una foto libre a la vez (agregar o quitar): el servidor reescribe la lista completa, así que
   * dos envíos cruzados pueden perder una foto, y quitar es por posición.
   */
  const fotoEnCursoRef = useRef(false);

  /** Cámara en vivo (como en Asistencias): el usuario se acomoda y toca «Tomar foto». */
  const [liveKind, setLiveKind] = useState<PendingPhoto['kind'] | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveGeoRef = useRef<{ latitude: number; longitude: number } | null>(null);
  /** Input de archivo de evidencia (fotos libres y de campo). Sin `capture`: abre galería o explorador. */
  const adjuntoRef = useRef<HTMLInputElement | null>(null);
  /** Hueco de campo al que va el archivo que se está eligiendo. `null` = foto libre. */
  const adjuntoCampoRef = useRef<{ fieldId: number; momento: Momento } | null>(null);
  /** Excepción puntual (`flowData.allowAttach`): adjuntar entrada o salida en vez de cámara. */
  const adjuntoEntradaRef = useRef<HTMLInputElement | null>(null);
  const adjuntoSalidaRef = useRef<HTMLInputElement | null>(null);

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
      // Misma ubicación que se mostró en la vista previa. La entrada sigue exigiendo GPS.
      const { dataUrl: photoUrl } = photo;
      const punto = puntoDeFoto(photo.latitude, photo.longitude);
      if (!punto) {
        setError(textos.inicio.sinGps);
        setLoading(false);
        return false;
      }
      const { latitude, longitude } = punto;

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
            : `✅ ${textos.inicio.guardado} Siguiente: Tomar evidencias (${photoRequired} fotos)`,
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
    setCampoTarget(null);
    openCamera('evidence');
  };

  const handleCaptureCampoPhoto = (fieldId: number, momento: Momento) => {
    if (!flowData) return;
    setCampoTarget({ fieldId, momento });
    openCamera('evidence');
  };

  /** Ubicación si el navegador la da pronto. Si no, la evidencia adjunta sigue. */
  const ubicacionOpcional = (): Promise<{ latitude: number; longitude: number } | null> =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = (punto: { latitude: number; longitude: number } | null) => {
        if (settled) return;
        settled = true;
        resolve(puntoDeFoto(punto?.latitude, punto?.longitude));
      };
      const timer = setTimeout(() => finish(null), 2500);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 60_000 },
      );
    });

  const abrirAdjuntoLibre = () => {
    if (!flowData) return;
    adjuntoCampoRef.current = null;
    setCampoTarget(null);
    setError(null);
    adjuntoRef.current?.click();
  };

  const abrirAdjuntoCampo = (fieldId: number, momento: Momento) => {
    if (!flowData) return;
    adjuntoCampoRef.current = { fieldId, momento };
    setCampoTarget({ fieldId, momento });
    setError(null);
    adjuntoRef.current?.click();
  };

  /**
   * Archivo de evidencia (galería, explorador, captura, pegar, arrastrar).
   * Pasa por la misma vista previa que la cámara. No toca entrada ni salida.
   */
  const adjuntarEvidencia = async (file: File) => {
    if (!flowData) return;
    if (flowData.step !== 'EVIDENCE_PHOTOS') return;
    // Pegar o soltar mientras sube otra: al terminar se cerraría la vista previa de la nueva.
    if (fotoEnCursoRef.current) {
      setError('Espera a que termine de subir la foto anterior.');
      return;
    }
    const aviso = mensajeAdjuntoInvalido(file);
    if (aviso) {
      setError(aviso);
      return;
    }
    if (!porCampos && !isInventoryFlow && flowData.evidencePhotos.length >= photoRequired) {
      setError(`Ya tienes las ${photoRequired} fotos de evidencia.`);
      return;
    }
    const destino = adjuntoCampoRef.current;
    setLoading(true);
    setError(null);
    try {
      const dataUrl = await dataUrlDeImagen(file);
      const geo = await ubicacionOpcional();
      if (destino) setCampoTarget(destino);
      setPendingPhoto({
        kind: 'evidence',
        dataUrl,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        capturedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(photoErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Excepción puntual (`flowData.allowAttach`, con vencimiento): adjuntar la entrada o la salida
   * en vez de tomarla con la cámara. La ubicación sigue siendo la de ahora mismo (de donde sea que
   * se adjunte) — solo se salta la cámara, no el GPS.
   */
  const attachEntryOrExitPhoto = async (kind: 'entry' | 'exit', file: File) => {
    if (!flowData?.allowAttach) return;
    const aviso = mensajeAdjuntoInvalido(file);
    if (aviso) {
      setError(aviso);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const dataUrl = await dataUrlDeImagen(file);
      const geo = await getGeolocation();
      setPendingPhoto({ kind, dataUrl, latitude: geo.latitude, longitude: geo.longitude, capturedAt: new Date().toISOString() });
    } catch (err) {
      setError(photoErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Manda la foto libre de inmediato (igual que las fotos por campo): así nada se pierde si
   * la persona sale de la pantalla antes de tocar «enviar». El envío final solo valida el
   * mínimo y avanza el paso; las fotos ya están guardadas desde que se tomaron.
   */
  const addEvidencePhoto = async (photo: PendingPhoto): Promise<boolean> => {
    if (!flowData || !user?.token) return false;
    if (fotoEnCursoRef.current) return false;
    fotoEnCursoRef.current = true;
    const activityId = flowData.activityId;
    const previas = flowData.evidencePhotos.length;
    const punto = puntoDeFoto(photo.latitude, photo.longitude);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`activity-evidence/${flowData.activityId}/evidence-photos/draft`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          photoUrl: photo.dataUrl,
          photoGeo: punto ? { ...punto, capturedAt: photo.capturedAt } : null,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError(
          formatApiError(new Error(JSON.stringify(errorData ?? {})), 'No se pudo guardar la foto. Intenta de nuevo.'),
        );
        return false;
      }
      const updated = await res.json().catch(() => null);
      const delServidor = Array.isArray(updated?.evidencePhotos);
      const updatedPhotos: string[] = delServidor
        ? updated.evidencePhotos
        : [...flowData.evidencePhotos, photo.dataUrl];
      setFlowData((prev) =>
        prev && prev.activityId === activityId ? { ...prev, evidencePhotos: updatedPhotos } : prev,
      );
      setEvidenceGeo((prev) => {
        if (delServidor) return geoDeFotosGuardadas(updated.evidencePhotosGeo, updatedPhotos.length);
        const alineadas = prev.slice(0, previas);
        while (alineadas.length < previas) alineadas.push(null);
        return [...alineadas, punto ? { ...punto, capturedAt: photo.capturedAt } : null];
      });
      setSuccessMsg(`📷 Foto agregada (${updatedPhotos.length} de ${photoRequired})`);
      return true;
    } catch (err) {
      setError(mensajeFotoNoGuardada(err, 'No se pudo guardar la foto. Intenta de nuevo.'));
      return false;
    } finally {
      fotoEnCursoRef.current = false;
      setLoading(false);
    }
  };

  const sendCampoPhoto = async (photo: PendingPhoto): Promise<boolean> => {
    if (!flowData || !campoTarget || !user?.token) return false;
    setLoading(true);
    setError(null);
    try {
      const punto = puntoDeFoto(photo.latitude, photo.longitude);
      const lista = await guardarFotoDeCampo(user.token, flowData.activityId, campoTarget.fieldId, {
        momento: campoTarget.momento,
        photoUrl: photo.dataUrl,
        latitude: punto?.latitude,
        longitude: punto?.longitude,
        capturedAt: photo.capturedAt,
      });
      setCamposEvidencia(lista);
      setSuccessMsg(`📷 ${MOMENTO_LABEL[campoTarget.momento]} guardada`);
      setCampoTarget(null);
      return true;
    } catch (err) {
      setError(photoErrorText(err));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleQuitarCampoPhoto = async (fieldId: number, momento: Momento) => {
    if (!flowData || !user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const lista = await quitarFotoDeCampo(user.token, flowData.activityId, fieldId, momento);
      setCamposEvidencia(lista);
      setSuccessMsg('Foto del campo quitada');
    } catch (err) {
      setError(photoErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  /** «Enviar/Usar esta foto» en la vista previa. */
  const confirmPendingPhoto = async () => {
    if (!pendingPhoto) return;
    const { kind } = pendingPhoto;
    if (kind === 'evidence') {
      if (campoTarget) {
        const ok = await sendCampoPhoto(pendingPhoto);
        if (ok) setPendingPhoto(null);
        return;
      }
      const agregada = await addEvidencePhoto(pendingPhoto);
      if (agregada) setPendingPhoto(null);
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

  // Remover foto de evidencia — ya está guardada en el servidor, hay que avisarle también.
  const handleRemoveEvidencePhoto = async (index: number) => {
    if (!flowData || !user?.token) return;
    if (fotoEnCursoRef.current) return;
    fotoEnCursoRef.current = true;
    const activityId = flowData.activityId;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildApiUrl(`activity-evidence/${activityId}/evidence-photo/${index}/remove`),
        { method: 'POST', headers: { Authorization: `Bearer ${user.token}` } },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError(formatApiError(new Error(JSON.stringify(errorData ?? {})), 'No se pudo quitar la foto.'));
        return;
      }
      const updated = await res.json().catch(() => null);
      if (Array.isArray(updated?.evidencePhotos)) {
        const fotos: string[] = updated.evidencePhotos;
        setFlowData((prev) =>
          prev && prev.activityId === activityId ? { ...prev, evidencePhotos: fotos } : prev,
        );
        setEvidenceGeo(geoDeFotosGuardadas(updated.evidencePhotosGeo, fotos.length));
      } else {
        setFlowData((prev) =>
          prev && prev.activityId === activityId
            ? { ...prev, evidencePhotos: prev.evidencePhotos.filter((_, i) => i !== index) }
            : prev,
        );
        setEvidenceGeo((prev) => prev.filter((_, i) => i !== index));
      }
    } catch (err) {
      setError(mensajeFotoNoGuardada(err, 'No se pudo quitar la foto.', 'quitar'));
    } finally {
      fotoEnCursoRef.current = false;
      setLoading(false);
    }
  };

  // Guardar todas las fotos de evidencia y avanzar
  const handleSaveEvidencePhotos = async () => {
    if (!flowData) return;
    if (porCampos) {
      if (camposFaltan > 0) {
        setError(
          camposFaltan === 1
            ? 'Falta 1 foto por campo.'
            : `Faltan ${camposFaltan} fotos por campo.`,
        );
        return;
      }
    } else if (!isInventoryFlow && flowData.evidencePhotos.length < photoRequired) {
      setError(
        `Se requieren ${photoRequired} fotos (tienes ${flowData?.evidencePhotos.length || 0})`,
      );
      return;
    }
    if (!porCampos && isInventoryFlow && flowData.evidencePhotos.length < 1) {
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

      // Con campos las fotos ya viajaron una a una: mandar [] evita duplicarlas como libres en el ZIP.
      const photoUrls = porCampos ? [] : flowData.evidencePhotos;
      const photoGeo = porCampos
        ? []
        : flowData.evidencePhotos.map((_, i) => evidenceGeo[i] ?? null);
      const body = isCorrection
        ? { step: 'EVIDENCE_PHOTOS', data: { photoUrls, photoGeo } }
        : { photoUrls, photoGeo };

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
      setError(formatApiError(err, 'No se pudo guardar. Intenta de nuevo.'));
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
      setError(formatApiError(err, 'No se pudo preparar la hoja de servicio. Intenta de nuevo.'));
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
            : `✅ Plantilla completada. Siguiente: ${textos.cierre.siguiente}`,
        );
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar plantilla');
      }
    } catch (err) {
      setError(formatApiError(err, 'No se pudo guardar. Intenta de nuevo.'));
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
      // Misma ubicación que se mostró en la vista previa. La salida sigue exigiendo GPS.
      const { dataUrl: photoUrl } = photo;
      const punto = puntoDeFoto(photo.latitude, photo.longitude);
      if (!punto) {
        setError(textos.cierre.sinGps);
        setLoading(false);
        return false;
      }
      const { latitude, longitude } = punto;

      // Misma regla que la API: fuera del radio del punto de inicio no se envía.
      const bloqueo = bloqueoPorZona(punto);
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

  // Pegar (Ctrl+V) una captura en el paso de evidencias. No corre en un campo de texto.
  useEffect(() => {
    if (flowData?.step !== 'EVIDENCE_PHOTOS' || isFlowLocked) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      const file = primerArchivo(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      if (!porCampos) {
        adjuntoCampoRef.current = null;
      } else if (!adjuntoCampoRef.current) {
        const vacios: Array<{ fieldId: number; momento: Momento }> = [];
        for (const campo of camposEvidencia) {
          for (const momento of MOMENTOS) {
            if (!campo.momentos.includes(momento) || campo.fotos?.[momento]) continue;
            vacios.push({ fieldId: campo.id, momento });
          }
        }
        if (vacios.length !== 1) {
          setError('Pega la imagen sobre el campo, o usa Adjuntar en ese hueco.');
          return;
        }
        adjuntoCampoRef.current = vacios[0];
      }
      void adjuntarEvidencia(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [flowData?.step, isFlowLocked, porCampos, camposEvidencia, adjuntarEvidencia]);

  if (!user) return <p className={styles.muted} role="status">Cargando…</p>;

  // Si no ha seleccionado actividad, mostrar selector
  if (!flowData) {
    return (
      <div className={styles.flowCard}>
        <div>
          <h2 className={styles.flowTitle}>Selecciona una Actividad</h2>
          <p className={styles.flowSubtitle}>Elige la actividad para comenzar el flujo de evidencias.</p>
        </div>
        <Field label="Actividad">
          <Select
            controlSize="lg"
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
          </Select>
        </Field>
      </div>
    );
  }

  // Mostrar paso actual
  return (
    <div className={styles.flowCard}>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      {/* Portal a body: dentro de la tarjeta la capa quedaba atrapada y se encimaba con la página. */}
      {pendingPhoto && typeof document !== 'undefined' ? createPortal(
        <div role="dialog" aria-modal="true" aria-label="Revisa tu foto" className={styles.overlay}>
          <div className={styles.dialog}>
            <div>
              <p className={styles.dialogTitle}>
                {pendingPhoto.kind === 'entry'
                  ? textos.inicio.vistaPrevia
                  : pendingPhoto.kind === 'exit'
                    ? textos.cierre.vistaPrevia
                    : campoTarget
                      ? `${MOMENTO_LABEL[campoTarget.momento]} · campo`
                      : `Foto de evidencia ${flowData.evidencePhotos.length + 1} de ${photoRequired}`}
              </p>
              <p className={styles.dialogSub}>¿Se ve bien? Si salió oscura o movida, toma otra.</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingPhoto.dataUrl} alt="Foto que tomaste" className={styles.previewImg} />
            <div className={styles.dialogMeta}>
              {(() => {
                const punto = puntoDeFoto(pendingPhoto.latitude, pendingPhoto.longitude);
                if (!punto) return <>Sin ubicación GPS. La evidencia se guarda igual.</>;
                return (
                  <>
                    Ubicación capturada: {punto.latitude.toFixed(5)}, {punto.longitude.toFixed(5)} ·{' '}
                    <a
                      href={`https://www.google.com/maps?q=${punto.latitude},${punto.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver en mapa
                    </a>
                  </>
                );
              })()}
            </div>
            {pendingPhoto.kind === 'exit' && zonaSalidaError ? (
              <AvisoFueraDeZona mensaje={zonaSalidaError} />
            ) : null}
            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Button
                variant="primary"
                size="lg"
                className={`${styles.tap} ${styles.grow}`}
                onClick={() => void confirmPendingPhoto()}
                loading={loading}
                iconStart={<IcoCheck />}
              >
                {loading
                  ? 'Enviando…'
                  : pendingPhoto.kind === 'evidence'
                    ? 'Usar esta foto'
                    : 'Enviar esta foto'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className={`${styles.tap} ${styles.growSm}`}
                onClick={() => void retakePendingPhoto()}
                disabled={loading}
                iconStart={<IcoCamara />}
              >
                Tomar otra
              </Button>
              <Button
                variant="tertiary"
                size="lg"
                className={styles.tap}
                onClick={() => {
                  setPendingPhoto(null);
                  setError(null);
                }}
                disabled={loading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {liveKind && typeof document !== 'undefined'
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label="Cámara" className={styles.overlay}>
              <div className={`${styles.dialog} ${styles.dialogWide}`}>
                <div>
                  <p className={styles.dialogTitle}>
                    {liveKind === 'entry'
                      ? textos.inicio.nombre
                      : liveKind === 'exit'
                        ? textos.cierre.nombre
                        : campoTarget
                          ? `${MOMENTO_LABEL[campoTarget.momento]} · campo`
                          : `Foto de evidencia ${flowData.evidencePhotos.length + 1} de ${photoRequired}`}
                  </p>
                  <p className={styles.dialogSub}>Acomódate o encuadra bien y toca «Tomar foto».</p>
                </div>
                <div className={styles.videoBox}>
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedData={() => setLiveReady(true)}
                    className={`${styles.video} ${cameraFacing === 'user' ? styles.videoMirror : ''}`}
                  />
                  {!liveReady && !liveError ? <div className={styles.videoWait}>Abriendo cámara…</div> : null}
                </div>
                <div className={styles.dialogMeta}>Al tomar la foto se guarda tu ubicación.</div>
                {liveError ? (
                  <p className={styles.dialogError} role="alert">
                    {liveError}
                  </p>
                ) : null}
                <div className={styles.dialogActions}>
                  <Button
                    variant="primary"
                    size="lg"
                    className={`${styles.tap} ${styles.grow}`}
                    onClick={() => void shootLive()}
                    disabled={!liveReady || loading}
                    loading={loading}
                    iconStart={<IcoCamara />}
                  >
                    {loading ? 'Ubicando…' : 'Tomar foto'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className={`${styles.tap} ${styles.growSm}`}
                    onClick={() =>
                      setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    disabled={loading}
                    iconStart={<IcoGirar />}
                  >
                    {cameraFacing === 'environment' ? 'Usar frontal' : 'Usar trasera'}
                  </Button>
                  <Button variant="tertiary" size="lg" className={styles.tap} onClick={closeCamera} disabled={loading}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {error ? (
        <Alert tone="danger" role="alert" srLabel="Error">
          {error}
        </Alert>
      ) : null}

      {successMsg ? (
        <Alert tone="success" role="status">
          {successMsg}
        </Alert>
      ) : null}

      {(flowData.indicaciones || flowData.assigneeIndicaciones) && (
        <div className={styles.infoCard}>
          {flowData.indicaciones ? (
            <div>
              <strong className={styles.infoTitle}>Indicaciones generales</strong>
              <p className={styles.infoText}>{flowData.indicaciones}</p>
            </div>
          ) : null}
          {flowData.assigneeIndicaciones ? (
            <div>
              <strong className={styles.infoTitle}>Indicaciones para ti</strong>
              <p className={styles.infoText}>{flowData.assigneeIndicaciones}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Avance de quien la tenía antes: solo lectura; esta persona toma su propia entrada y salida. */}
      {(flowData.avancesAnteriores ?? []).map((av) => {
        const ev = av.evidence;
        const fotos = [ev?.entryPhotoUrl, ...(ev?.evidencePhotos ?? []), ev?.exitPhotoUrl].filter(
          (u): u is string => Boolean(u),
        );
        const campos =
          ev?.serviceSheetData && typeof ev.serviceSheetData === 'object'
            ? Object.entries(ev.serviceSheetData as Record<string, unknown>).filter(
                ([, v]) => typeof v === 'string' && v.trim() && !String(v).startsWith('data:'),
              )
            : [];
        return (
          <div key={`avance-${av.userId}`} className={styles.infoCard}>
            <div>
              <strong className={styles.infoTitle}>{av.titulo}</strong>
              <p className={styles.stepDescription}>
                Solo lectura · {av.progressPct}% avanzado
                {av.movidaPor ? ` · ${av.movidaPor} te la pasó` : ''}
                {av.motivo ? ` · Motivo: ${av.motivo}` : ''}. {textos.relevo}
              </p>
            </div>
            {fotos.length > 0 ? (
              <div className={styles.thumbs}>
                {fotos.map((url) => (
                  <a key={url} href={getAssetUrl(url)} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getAssetUrl(url)} alt={`Evidencia de ${av.nombre}`} className={styles.thumb} />
                  </a>
                ))}
              </div>
            ) : (
              <p className={styles.stepDescription}>No alcanzó a subir fotos.</p>
            )}
            {ev?.serviceSheetPdfUrl ? (
              <a href={getAssetUrl(ev.serviceSheetPdfUrl)} target="_blank" rel="noreferrer" className={styles.link}>
                Ver hoja de servicio que subió
              </a>
            ) : null}
            {campos.length > 0 ? (
              <dl className={styles.prevList}>
                {campos.slice(0, 12).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>
                      {digitalFormLabels(flowData.coreKind).find((f) => f.key === k)?.label ?? k}
                    </dt>
                    <dd>{String(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : null}
          </div>
        );
      })}

      {/* Aviso de rechazo */}
      {flowData.reviewStatus === 'REJECTED' &&
        (rejectedList.length > 0 || flowData.reviewNotes) && (
          <Alert tone="danger" role="alert" title="Tu evidencia fue rechazada">
            <span className={styles.rejectedBody}>
              {rejectedList.length > 0 && (
                <span>
                  <strong className={styles.rejectedStrong}>
                    {rejectedList.length > 1 ? 'Pasos a corregir:' : 'Paso rechazado:'}
                  </strong>{' '}
                  {rejectedList.map((step) => evidenceStepLabel(step, flowData.coreKind)).join(' · ')}
                </span>
              )}
              <span>
                <strong className={styles.rejectedStrong}>Observaciones del revisor:</strong>
                <span className={styles.rejectedNotes}>
                  {(flowData.reviewNotes || '').trim() || 'Sin observaciones registradas.'}
                </span>
              </span>
              <span className={styles.rejectedHint}>
                <strong>Instrucciones:</strong> Corrige el paso actual.{' '}
                {rejectedList.length > 1
                  ? 'Luego podrás corregir los demás pasos indicados.'
                  : 'Al terminar, se enviará nuevamente a revisión.'}
              </span>
            </span>
          </Alert>
        )}

      {/* Pasos del flujo */}
      <div className={styles.progressWrap}>
        <div className={styles.progressMeta}>
          Actividad <strong>{actividades.find((a) => a.id === flowData.activityId)?.anNumber}</strong>
          {flowData.progressPct != null ? (
            <Badge tone={flowData.progressPct >= 100 ? 'success' : 'brand'} size="sm">
              {flowData.progressPct}%
            </Badge>
          ) : null}
        </div>
        <ol className={styles.progressRow} aria-label="Pasos de la evidencia">
          {visibleSteps.map((stepKey, index) => {
            const completed =
              stepKey === 'ENTRY_PHOTO'
                ? Boolean(flowData.entryPhotoUrl)
                : stepKey === 'EVIDENCE_PHOTOS'
                  ? porCampos
                    ? camposFaltan === 0 && camposProgreso.requeridas > 0
                    : flowData.evidencePhotos.length > 0
                  : stepKey === 'SERVICE_SHEET_PDF'
                    ? Boolean(flowData.serviceSheetPdfUrl)
                    : stepKey === 'SERVICE_SHEET_DATA'
                      ? Boolean(flowData.serviceSheetData)
                      : Boolean(flowData.exitPhotoUrl);
            return (
              <React.Fragment key={stepKey}>
                {index > 0 ? <li aria-hidden="true" className={styles.progressDivider} /> : null}
                <ProgressStep
                  step={index + 1}
                  active={flowData.step === stepKey}
                  completed={completed}
                  label={
                    stepKey === 'ENTRY_PHOTO'
                      ? textos.inicio.corto
                      : stepKey === 'EXIT_PHOTO'
                        ? textos.cierre.corto
                        : EVIDENCE_STEP_LABELS[stepKey]
                  }
                />
              </React.Fragment>
            );
          })}
        </ol>
      </div>

      {/* Geocerca: punto de inicio, recorrido y salidas de zona por justificar */}
      {actividadIniciada ? (
        <UbicacionActividadCard activityId={flowData.activityId} token={user.token} geocerca={geocerca} />
      ) : null}

      {/* PASO 1: Foto de Entrada */}
      {flowData.step === 'ENTRY_PHOTO' && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepEntry}`}>
          <h3 className={styles.stepTitle}>
            <span className={styles.stepIco}>
              <IcoCamara />
            </span>
            {textos.inicio.paso}
          </h3>
          <p className={styles.stepDescription}>{textos.inicio.descripcion}</p>
          <div className={styles.actionGrid}>
            <Button
              variant="primary"
              size="lg"
              className={styles.tap}
              onClick={handleEntryPhoto}
              disabled={loading || cameraActive}
              loading={loading}
              iconStart={<IcoCamara />}
            >
              {loading ? 'Capturando...' : textos.inicio.boton}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={styles.tap}
              onClick={() =>
                setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              disabled={loading}
              iconStart={<IcoGirar />}
            >
              {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </Button>
            {flowData.allowAttach ? (
              <>
                <input
                  ref={adjuntoEntradaRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void attachEntryOrExitPhoto('entry', file);
                  }}
                />
                <Button
                  variant="tertiary"
                  size="lg"
                  className={styles.tap}
                  onClick={() => adjuntoEntradaRef.current?.click()}
                  disabled={loading || cameraActive}
                  title="Excepción puntual: adjunta una foto que ya tienes, en vez de tomarla ahora"
                  iconStart={<IcoClip />}
                >
                  Adjuntar (excepción)
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* PASO 2: Fotos de Evidencia */}
      {flowData.step === 'EVIDENCE_PHOTOS' && !isFlowLocked && (
        <div
          className={`${styles.stepCard} ${styles.stepEvidence}`}
          onDragOver={(event) => {
            if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            const destino = (event.target as HTMLElement).closest?.('[data-inventory-drop]');
            if (destino) return;
            event.preventDefault();
            const file = primerArchivo(event.dataTransfer?.files);
            if (!file) return;
            const slot = (event.target as HTMLElement).closest?.('[data-campo-slot]');
            if (slot) {
              const fieldId = Number(slot.getAttribute('data-field-id'));
              const momento = slot.getAttribute('data-momento') as Momento | null;
              if (!fieldId || !momento) return;
              adjuntoCampoRef.current = { fieldId, momento };
            } else if (!porCampos) {
              adjuntoCampoRef.current = null;
            } else {
              setError('Suelta la imagen sobre el campo, o usa Adjuntar en ese hueco.');
              return;
            }
            void adjuntarEvidencia(file);
          }}
        >
          <h3 className={styles.stepTitle}>
            <span className={styles.stepIco}>
              <IcoCamara />
            </span>
            {isInventoryFlow
              ? `Paso 2: Inventario comparativo + evidencias (${flowData.evidencePhotos.length} foto${flowData.evidencePhotos.length === 1 ? '' : 's'})`
              : porCampos
                ? `Paso 2: Fotos por campo (${camposProgreso.cumplidas}/${camposProgreso.requeridas})`
                : `Paso 2: Evidencias (${flowData.evidencePhotos.length}/${photoRequired})`}
          </h3>
          <p className={styles.stepDescription}>
            {isInventoryFlow
              ? 'Actualiza equipos por grupo, serie, modelo y al menos una foto de evidencia/sticker por mantenimiento.'
              : porCampos
                ? camposFaltan === 0
                  ? 'Ya documentaste todos los campos. Continúa al siguiente paso.'
                  : 'Toma la foto con la cámara o adjunta una imagen que ya tengas (galería, archivo, captura). En el escritorio también puedes arrastrarla o pegarla con Ctrl+V.'
                : `Toma o adjunta ${photoRequired} fotos de evidencia. En el escritorio puedes arrastrarlas o pegarlas con Ctrl+V.`}
          </p>

          {porCampos ? (
            <div className={styles.campoList}>
              {camposEvidencia.map((campo) => {
                const momentos = MOMENTOS.filter((m) => campo.momentos.includes(m));
                return (
                  <div key={campo.id} className={styles.campoCard}>
                    <div className={styles.campoHead}>
                      <strong className={styles.campoName}>{campo.nombre}</strong>
                      {campo.completo ? (
                        <Badge tone="success" size="sm" dot>
                          Listo
                        </Badge>
                      ) : (
                        <Badge tone="warning" size="sm" dot>
                          Faltan {campo.pendientes?.length ?? momentos.filter((m) => !campo.fotos?.[m]).length}
                        </Badge>
                      )}
                    </div>
                    {campo.notas ? <p className={styles.campoNote}>{campo.notas}</p> : null}
                    <div className={styles.momentos} data-cols={Math.min(Math.max(momentos.length, 1), 3)}>
                      {momentos.map((m) => {
                        const foto = campo.fotos?.[m] ?? null;
                        return (
                          <div
                            key={m}
                            data-campo-slot=""
                            data-field-id={campo.id}
                            data-momento={m}
                            className={styles.momento}
                          >
                            <span className={styles.momentoLabel}>{MOMENTO_LABEL[m]}</span>
                            {foto ? (
                              <>
                                <div className={styles.campoFoto}>
                                  {/* La miniatura es el botón «volver a tomar»: imagen a sangre, no cabe en Button. */}
                                  <button
                                    type="button"
                                    onClick={() => handleCaptureCampoPhoto(campo.id, m)}
                                    disabled={loading}
                                    title="Volver a tomar"
                                    className={styles.campoFotoBtn}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={getAssetUrl(foto.photoUrl)}
                                      alt={`${campo.nombre} ${MOMENTO_LABEL[m]}`}
                                      className={styles.campoFotoImg}
                                    />
                                  </button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    icon
                                    className={styles.removePhotoButton}
                                    aria-label={`Quitar foto ${MOMENTO_LABEL[m]} de ${campo.nombre}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleQuitarCampoPhoto(campo.id, m);
                                    }}
                                    disabled={loading}
                                  >
                                    <IcoX />
                                  </Button>
                                </div>
                                <Button size="sm" fullWidth onClick={() => abrirAdjuntoCampo(campo.id, m)} disabled={loading}>
                                  Adjuntar
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  fullWidth
                                  className={styles.campoTomar}
                                  onClick={() => handleCaptureCampoPhoto(campo.id, m)}
                                  disabled={loading}
                                  iconStart={<IcoCamara />}
                                >
                                  Tomar
                                </Button>
                                <Button size="sm" fullWidth onClick={() => abrirAdjuntoCampo(campo.id, m)} disabled={loading}>
                                  Adjuntar
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className={`${styles.actionGrid} ${styles.actionGridBottom}`}>
                <Button
                  variant="secondary"
                  size="lg"
                  className={styles.tap}
                  onClick={() =>
                    setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
                  }
                  disabled={loading}
                  iconStart={<IcoGirar />}
                >
                  {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
                </Button>
                {camposFaltan === 0 ? (
                  <Button
                    variant="primary"
                    size="lg"
                    className={styles.tap}
                    onClick={() => void handleSaveEvidencePhotos()}
                    loading={loading}
                    iconEnd={<IcoFlecha />}
                  >
                    {loading ? 'Guardando...' : 'Siguiente Paso'}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!porCampos && isInventoryFlow && (
            <div className={styles.inventorySection}>
              <div className={styles.inventoryHeaderRow}>
                <strong className={styles.campoName}>Equipos de sucursal ({inventoryItems.length})</strong>
                <Button
                  size="sm"
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
                </Button>
              </div>

              {inventoryItems.map((item, index) => (
                <div key={`${item.equipmentName}-${index}`} className={styles.inventoryItemCard}>
                  <div className={styles.inventoryFieldsGrid}>
                    <Input
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
                    <Input
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
                    <Input
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
                    <Input
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
                    <Input
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
                    <Input
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
                    <Input
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
                    <Input
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
                          data-inventory-drop=""
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
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
                          <Button
                            size="sm"
                            fullWidth
                            onClick={() => inventoryFileRefs.current[fileKey]?.click()}
                            loading={inventoryUploadingKey === fileKey}
                          >
                            {inventoryUploadingKey === fileKey
                              ? 'Subiendo...'
                              : 'Cargar / arrastrar imagen'}
                          </Button>
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
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
                    <Input
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
                    <Button
                      variant="danger-ghost"
                      onClick={() =>
                        setInventoryItems((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}

              <Textarea
                rows={2}
                placeholder="Notas globales del inventario y mantenimiento"
                value={inventoryNotes}
                onChange={(e) => setInventoryNotes(e.target.value)}
              />
            </div>
          )}

          {/* Grid de fotos libres (flujo sin campos) */}
          {!porCampos && flowData.evidencePhotos.length > 0 && (
            <div className={styles.evidenceGalleryWrap}>
              <div className={styles.evidenceGalleryGrid}>
                {flowData.evidencePhotos.map((photo, idx) => (
                  <div
                    key={idx}
                    className={styles.evidencePhotoTile}
                    onClick={() => setGalleryLightbox(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setGalleryLightbox(idx);
                      }
                    }}
                    title="Ver en grande"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getAssetUrl(photo)}
                      alt={`evidencia ${idx + 1}`}
                      className={styles.evidencePhotoImg}
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      icon
                      className={styles.removePhotoButton}
                      aria-label={`Quitar evidencia ${idx + 1}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveEvidencePhoto(idx);
                      }}
                    >
                      <IcoX />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!porCampos ? (
            <div className={`${styles.actionGrid} ${styles.actionGridBottom}`}>
              <Button
                variant={
                  (isInventoryFlow ? flowData.evidencePhotos.length >= 1 : flowData.evidencePhotos.length >= photoRequired)
                    ? 'secondary'
                    : 'primary'
                }
                size="lg"
                className={styles.tap}
                onClick={handleAddEvidencePhoto}
                disabled={loading || (!isInventoryFlow && flowData.evidencePhotos.length >= photoRequired)}
                iconStart={<IcoCamara />}
              >
                {loading ? 'Capturando...' : 'Tomar foto'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className={styles.tap}
                onClick={abrirAdjuntoLibre}
                disabled={loading || (!isInventoryFlow && flowData.evidencePhotos.length >= photoRequired)}
                iconStart={<IcoClip />}
              >
                Adjuntar
              </Button>
              <Button
                variant="tertiary"
                size="lg"
                className={styles.tap}
                onClick={() =>
                  setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                disabled={loading}
                iconStart={<IcoGirar />}
              >
                {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
              </Button>
              {(isInventoryFlow
                ? flowData.evidencePhotos.length >= 1
                : flowData.evidencePhotos.length >= photoRequired) && (
                <Button
                  variant="primary"
                  size="lg"
                  className={styles.tap}
                  onClick={() => void handleSaveEvidencePhotos()}
                  loading={loading}
                  iconEnd={<IcoFlecha />}
                >
                  {loading ? 'Guardando...' : 'Siguiente Paso'}
                </Button>
              )}
            </div>
          ) : null}
          {/* El aviso de arriba queda fuera de vista con 4 fotos: se repite junto al botón. */}
          {error ? (
            <Alert tone="danger" role="alert" srLabel="Error">
              {error}
            </Alert>
          ) : null}
          <input
            ref={adjuntoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
            className={styles.hiddenInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void adjuntarEvidencia(file);
            }}
          />
        </div>
      )}

      {galleryLightbox != null &&
      flowData?.evidencePhotos[galleryLightbox] &&
      typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Evidencia ${galleryLightbox + 1}`}
              onClick={() => setGalleryLightbox(null)}
              className={styles.overlay}
            >
              <div onClick={(e) => e.stopPropagation()} className={`${styles.dialog} ${styles.dialogXl}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getAssetUrl(flowData.evidencePhotos[galleryLightbox])}
                  alt={`Evidencia ${galleryLightbox + 1}`}
                  className={`${styles.previewImg} ${styles.lightboxImg}`}
                />
                <div className={styles.dialogActions}>
                  {galleryLightbox > 0 ? (
                    <Button
                      size="lg"
                      aria-label="Foto anterior"
                      onClick={() => setGalleryLightbox((i) => (i != null ? i - 1 : i))}
                    >
                      ←
                    </Button>
                  ) : null}
                  {galleryLightbox < flowData.evidencePhotos.length - 1 ? (
                    <Button
                      size="lg"
                      aria-label="Foto siguiente"
                      onClick={() => setGalleryLightbox((i) => (i != null ? i + 1 : i))}
                    >
                      →
                    </Button>
                  ) : null}
                  <Button
                    variant="danger-ghost"
                    size="lg"
                    className={styles.growSm}
                    onClick={() => {
                      const idx = galleryLightbox;
                      setGalleryLightbox(null);
                      handleRemoveEvidencePhoto(idx);
                    }}
                  >
                    Quitar foto
                  </Button>
                  <Button variant="secondary" size="lg" className={styles.growSm} onClick={() => setGalleryLightbox(null)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* PASO 3: PDF (solo servicio) */}
      {flowData.step === 'SERVICE_SHEET_PDF' && needsServiceSheetPdf && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepPdf}`}>
          <h3 className={styles.stepTitle}>
            <span className={styles.stepIco}>
              <IcoForm />
            </span>
            Paso: Hoja de Servicio (PDF)
          </h3>
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
            className={`${styles.pdfDropzone} ${pdfDragging ? styles.pdfDropzoneDragging : ''}`}
          >
            <input
              ref={(ref) => {
                if (ref) (window as any).pdfInputRef = ref;
              }}
              type="file"
              accept="application/pdf"
              onChange={handleServiceSheetPdfUpload}
              disabled={loading}
              className={styles.pdfInputHidden}
            />
            <div
              role="button"
              tabIndex={loading ? -1 : 0}
              aria-disabled={loading ? 'true' : undefined}
              onClick={() => {
                const input = (window as any).pdfInputRef;
                if (input && !loading) input.click();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const input = (window as any).pdfInputRef;
                if (input && !loading) input.click();
              }}
              className={styles.pdfInputLabel}
            >
              <div className={styles.pdfIconContainer}>
                <IcoDoc />
              </div>
              <div className={styles.pdfLabelText}>
                <div className={styles.pdfLabelMain}>Seleccionar PDF</div>
                <div className={styles.pdfLabelHint}>o arrastra aquí</div>
              </div>
            </div>
          </div>
          {flowData.serviceSheetPdfUrl && (
            <div className={styles.pdfPreviewCard}>
              <Alert tone="success" dense>
                PDF cargado correctamente
              </Alert>
              {/* Mismo VisorPdf/pdf.js que EquipoEvidencias (CSP bloquea object/embed). Altura mayor. */}
              <VisorPdf url={flowData.serviceSheetPdfUrl} alto="700px" />
            </div>
          )}
        </div>
      )}

      {/* PASO: Formulario digital por coreKind */}
      {flowData.step === 'SERVICE_SHEET_DATA' && !isFlowLocked && (
        <div className={`${styles.stepCard} ${styles.stepData}`}>
          <h3 className={styles.stepTitle}>
            <span className={styles.stepIco}>
              <IcoForm />
            </span>
            Paso: Formulario
          </h3>
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
          <h3 className={styles.stepTitle}>
            <span className={styles.stepIco}>
              <IcoSalida />
            </span>
            {textos.cierre.paso}
          </h3>
          <p className={styles.stepDescription}>{textos.cierre.descripcion}</p>
          {geocerca.estado?.exigeMismaUbicacion === true ? (
            <p className={styles.stepDescription}>
              Debe tomarse a no más de {geocerca.estado?.radioM ?? RADIO_ACTIVIDAD_M} m del punto donde
              iniciaste la actividad.
            </p>
          ) : (
            <p className={styles.stepDescription}>{textos.cierre.sinMismoLugar}</p>
          )}
          {zonaSalidaError && !pendingPhoto ? <AvisoFueraDeZona mensaje={zonaSalidaError} /> : null}
          {flowData.exitLatitude != null && flowData.exitLongitude != null && (
            <p className={styles.dialogMeta}>
              <IcoPin /> Última ubicación registrada: {Number(flowData.exitLatitude).toFixed(5)},{' '}
              {Number(flowData.exitLongitude).toFixed(5)}
            </p>
          )}
          <div className={styles.actionGrid}>
            <Button
              variant="primary"
              size="lg"
              className={styles.tap}
              onClick={() => void handleExitPhoto()}
              disabled={loading}
              loading={loading}
              iconStart={<IcoCamara />}
            >
              {loading ? 'Capturando...' : textos.cierre.boton}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={styles.tap}
              onClick={() =>
                setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              disabled={loading}
              iconStart={<IcoGirar />}
            >
              {cameraFacing === 'environment' ? 'Trasera' : 'Frontal'}
            </Button>
            {flowData.allowAttach ? (
              <>
                <input
                  ref={adjuntoSalidaRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void attachEntryOrExitPhoto('exit', file);
                  }}
                />
                <Button
                  variant="tertiary"
                  size="lg"
                  className={styles.tap}
                  onClick={() => adjuntoSalidaRef.current?.click()}
                  disabled={loading}
                  title="Excepción puntual: adjunta una foto que ya tienes, en vez de tomarla ahora"
                  iconStart={<IcoClip />}
                >
                  Adjuntar (excepción)
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* COMPLETADO */}
      {flowData.step === 'COMPLETED' && (
        <div className={styles.completedCard} data-locked={isFlowLocked ? 'true' : undefined}>
          <span className={styles.completedIco} aria-hidden="true">
            {isFlowLocked ? <IcoReloj /> : <IcoCheck />}
          </span>
          <h2 className={styles.completedTitle}>
            {isFlowLocked
              ? 'Evidencias enviadas a revisión'
              : '¡Asignación Completada Exitosamente!'}
          </h2>
          <p className={styles.completedText}>
            {isFlowLocked
              ? 'Los pasos están guardados. Un administrador debe aprobar o rechazar antes de que puedas modificar algo.'
              : 'Todos los pasos han sido completados correctamente y se encuentran guardados en el sistema.'}
          </p>
          {!isFlowLocked && (
            <Button
              variant="secondary"
              size="lg"
              className={styles.tap}
              onClick={() => {
                setFlowData(null);
                setSelectedActivityId('');
                setSuccessMsg(null);
              }}
              iconStart={<IcoGirar />}
            >
              Seleccionar Otra Actividad
            </Button>
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
  <li
    className={`${styles.progressStep} ${active ? styles.progressStepActive : ''}`}
    aria-current={active ? 'step' : undefined}
  >
    <span
      className={`${styles.progressCircle} ${active ? styles.progressCircleActive : ''} ${completed ? styles.progressCircleCompleted : ''}`}
      aria-hidden="true"
    >
      {completed ? <IcoCheck /> : step}
    </span>
    <span className={styles.progressLabel}>
      {label}
      <span className="ui-sr-only">{completed ? ', hecho' : active ? ', en curso' : ', pendiente'}</span>
    </span>
  </li>
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

export const DigitalEvidenceForm = ({
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

  // Se compara por contenido, no por identidad: cada relectura (volver a la pestaña, aviso en
  // tiempo real) trae un objeto nuevo con lo mismo guardado, y al corregir el formulario eso
  // borraba lo que la persona llevaba escrito.
  const guardado = claveDeFormulario(initialData);
  useEffect(() => {
    setData(buildInitialDigitalForm(coreKind, initialData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreKind, guardado]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.serviceForm}>
      {fields.map(({ key, label }) => {
        const multiline = /que|observ|hiciste|hizo/i.test(key) || /observ/i.test(label);
        return (
          <Field key={key} label={label} required>
            {multiline ? (
              <Textarea
                rows={4}
                value={data[key] || ''}
                onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}
                required
                disabled={loading}
              />
            ) : (
              <Input
                type="text"
                value={data[key] || ''}
                onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}
                required
                disabled={loading}
              />
            )}
          </Field>
        );
      })}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className={`${styles.tap} ${styles.serviceSubmit}`}
        loading={loading}
        iconEnd={<IcoFlecha />}
      >
        {loading ? 'Guardando...' : 'Siguiente Paso'}
      </Button>
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
    <div>
      <canvas ref={canvasRef} className={styles.sigCanvas} data-disabled={disabled ? 'true' : undefined} />
      <div className={styles.sigFoot}>
        <span className={styles.sigHint}>Firmar con el dedo o el mouse</span>
        <Button variant="danger-ghost" size="sm" onClick={clear} disabled={disabled}>
          Limpiar
        </Button>
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

  return (
    <form onSubmit={handleSubmit} className={styles.serviceForm}>
      {/* Datos del Servicio */}
      <section className={styles.sec}>
        <h4 className={styles.secTitle}>Datos del Servicio</h4>
        <Field label="Nombre del Técnico" required>
          <Input
            type="text"
            placeholder="Nombre completo del técnico"
            value={data.technicianName}
            onChange={(e) => setData({ ...data, technicianName: e.target.value })}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Fecha del Servicio" required>
          <DateInput
            value={data.serviceDate}
            onChange={(e) => setData({ ...data, serviceDate: e.target.value })}
            required
            disabled={loading}
          />
        </Field>
      </section>

      {/* Datos del Cliente */}
      <section className={styles.sec}>
        <h4 className={styles.secTitle}>Datos del Cliente</h4>
        <Field label="Empresa / Organización" required>
          <Input
            type="text"
            placeholder="Nombre de la empresa o cliente"
            value={data.clientCompany}
            onChange={(e) => setData({ ...data, clientCompany: e.target.value })}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Teléfono de Contacto">
          <PhoneField
            placeholder="Número de teléfono"
            value={data.clientPhone}
            onChange={(clientPhone) => setData({ ...data, clientPhone })}
            disabled={loading}
          />
        </Field>
      </section>

      {/* Trabajo Realizado */}
      <section className={styles.sec}>
        <h4 className={styles.secTitle}>Trabajo Realizado</h4>
        <Field label="Resumen del trabajo realizado" required>
          <Textarea
            rows={4}
            placeholder="Describe el trabajo realizado..."
            value={data.workSummary}
            onChange={(e) => setData({ ...data, workSummary: e.target.value })}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Materiales / Equipos utilizados">
          <Textarea
            rows={3}
            placeholder="Lista de materiales o equipos utilizados"
            value={data.materialsUsed}
            onChange={(e) => setData({ ...data, materialsUsed: e.target.value })}
            disabled={loading}
          />
        </Field>
        <Field label="Horas trabajadas">
          <Input
            type="number"
            wrapperClassName={styles.narrow}
            className={styles.narrow}
            placeholder="ej. 4.5"
            min="0"
            step="0.5"
            value={data.hoursWorked}
            onChange={(e) => setData({ ...data, hoursWorked: e.target.value })}
            disabled={loading}
          />
        </Field>
        <Field label="Observaciones">
          <Textarea
            rows={3}
            placeholder="Observaciones adicionales"
            value={data.observations}
            onChange={(e) => setData({ ...data, observations: e.target.value })}
            disabled={loading}
          />
        </Field>
      </section>

      {/* Conformidad del Gerente */}
      <section className={`${styles.sec} ${data.managerSignature ? styles.secOk : ''}`}>
        <h4 className={styles.secTitle}>Conformidad del Gerente / Representante</h4>
        <Field label="Nombre del Gerente / Representante" required>
          <Input
            type="text"
            placeholder="Nombre completo"
            value={data.managerName}
            onChange={(e) => setData({ ...data, managerName: e.target.value })}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Cargo" required>
          <Input
            type="text"
            placeholder="Cargo del gerente o representante"
            value={data.managerRole}
            onChange={(e) => setData({ ...data, managerRole: e.target.value })}
            required
            disabled={loading}
          />
        </Field>
        <div>
          <span className={styles.momentoLabel}>
            Firma Digital <span aria-hidden="true">*</span>
          </span>
          {data.managerSignature ? (
            <Alert tone="success" dense>
              Firma capturada correctamente
            </Alert>
          ) : null}
          <SignaturePad
            onSignature={(sig) => setData((prev) => ({ ...prev, managerSignature: sig }))}
            disabled={loading}
            initialValue={initialData?.managerSignature}
          />
        </div>
      </section>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className={`${styles.tap} ${styles.serviceSubmit}`}
        loading={loading}
        iconEnd={<IcoFlecha />}
      >
        {loading ? 'Guardando...' : 'Siguiente Paso'}
      </Button>
    </form>
  );
};

export default ActivityEvidenceFlow;

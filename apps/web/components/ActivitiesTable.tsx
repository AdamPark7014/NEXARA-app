"use client";
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import ExcelDownloadModal from './ExcelDownloadModal';

const humanizeEvidenceKey = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const flattenEvidenceFields = (value: unknown, prefix = ''): Array<{ label: string; value: string; imageUrl?: string | null }> => {
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (/^data:image\//i.test(trimmed)) {
      return [{ label: prefix || 'Imagen', value: 'Imagen capturada', imageUrl: trimmed }];
    }
    return [{ label: prefix || 'Valor', value: trimmed }];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [{ label: prefix || 'Valor', value: String(value) }];
  }
  if (Array.isArray(value)) {
    if (!value.length) return [];
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      return [{ label: prefix || 'Valores', value: value.join(', ') }];
    }
    return value.flatMap((item, index) => flattenEvidenceFields(item, prefix ? `${prefix} ${index + 1}` : `Elemento ${index + 1}`));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      flattenEvidenceFields(nested, prefix ? `${prefix} / ${humanizeEvidenceKey(key)}` : humanizeEvidenceKey(key)),
    );
  }
  return [];
};

const ActivitiesTable: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
  const [excelPreparing, setExcelPreparing] = useState(false);
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null);

  // Filtros y paginación
  const [estatus, setEstatus] = useState<string>('');
  const [responsable, setResponsable] = useState<string>('');
  const [prioridad, setPrioridad] = useState<string>('');
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const estatusList = ['Pendiente', 'Aprobada', 'En proceso', 'Finalizada'];
  const prioridadList = ['Baja', 'Media', 'Alta'];

  // Simulación de datos de actividades (reemplazar con fetch real)
  interface Activity {
    id: number;
    anNumber: string;
    titulo: string;
    estatus: string;
    prioridad: string;
    ticketType?: string;
    ticketTypeCustom?: string | null;
    workType?: 'ISSUE' | 'PREVENTIVE_INVENTORY';
    client?: { id: number; name: string; logoUrl?: string | null } | null;
    branchName?: string;
    branchNumber?: string;
    branchCity?: string;
    branchState?: string;
    branchAddress?: string;
    descripcion?: string;
    indicaciones?: string;
    tiempoEstimadoMin?: number;
    tiempoMaximoMin?: number;
    fechaAsignacion?: string;
    fechaInicio?: string;
    fechaMaxima?: string;
    fechaEntregaEsperada?: string;
    responsable?: { nombre: string };
    activityEvidence?: {
      id: number;
      status: string;
      reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
      reviewedBy?: { id: number; nombre: string } | null;
      entryPhotoUrl?: string;
      entryPhotoUploadedAt?: string;
      entryLatitude?: number;
      entryLongitude?: number;
      evidencePhotos: string[];
      evidencePhotosUploadedAt?: string;
      serviceSheetPdfUrl?: string;
      serviceSheetUploadedAt?: string;
      serviceSheetData?: unknown;
      serviceSheetCompletedAt?: string;
      exitPhotoUrl?: string;
      exitPhotoUploadedAt?: string;
      exitLatitude?: number;
      exitLongitude?: number;
      completedAt?: string;
      createdAt?: string;
      updatedAt?: string;
    } | null;
    // Agrega más campos según tu modelo real
  }
  interface ClientTicketRequest {
    id: number;
    description: string;
    urgency: string;
    status: string;
    dueAt?: string | null;
    branchName?: string | null;
    branchNumber?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    client?: { id: number; name: string } | null;
    latitud?: number | null;
    longitud?: number | null;
    activityId?: number | null;
    requestType?: 'ISSUE' | 'PREVENTIVE_INVENTORY';
  }
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ticketRequests, setTicketRequests] = useState<ClientTicketRequest[]>([]);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');
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
    let normalizedPath = raw
      .replace(/\\+/g, '/')
      .replace(/^https?:\/\/[^/]+/i, '');
    normalizedPath = `${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;

    // Compatibilidad con rutas legacy guardadas como /activities/* sin prefijo /uploads.
    if (
      !normalizedPath.startsWith('/uploads/') &&
      !normalizedPath.startsWith('/api/uploads/') &&
      /^\/(activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(normalizedPath)
    ) {
      normalizedPath = `/uploads${normalizedPath}`;
    }

    return `${base}${normalizedPath}`;
  };

  const closeExcelModal = () => {
    if (excelUrl) {
      window.URL.revokeObjectURL(excelUrl);
    }
    setExcelUrl(null);
    setExcelBlob(null);
  };

  const handlePrepareExcelExport = async () => {
    if (excelPreparing) return;
    setExcelPreparing(true);
    try {
      const res = await fetch(buildApiUrl('export/activity'));
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (excelUrl) {
        window.URL.revokeObjectURL(excelUrl);
      }
      setExcelUrl(url);
      setExcelBlob(blob);
    } catch {
      alert('Error al exportar');
    } finally {
      setExcelPreparing(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!excelUrl) return;
    const a = document.createElement('a');
    a.href = excelUrl;
    a.download = 'actividades.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    closeExcelModal();
  };

  useEffect(() => {
    return () => {
      if (excelUrl) {
        window.URL.revokeObjectURL(excelUrl);
      }
    };
  }, [excelUrl]);

  const fetchActivities = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('No autorizado');
        return res.json();
      })
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  };

  const [assignableUsers, setAssignableUsers] = useState<{ id: number; nombre: string; role?: { nombre: string } }[]>([]);
  const [clients, setClients] = useState<{ id: number; name: string; logoUrl?: string | null }[]>([]);
  const [operationalProjects, setOperationalProjects] = useState<{ id: number; title: string; status: string; client: { id: number; name: string } }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [nextAn, setNextAn] = useState<string>('');
  const [showOtroModal, setShowOtroModal] = useState(false);
  const [otroModalInput, setOtroModalInput] = useState('');
  const [newActivity, setNewActivity] = useState({
    titulo: '',
    descripcion: '',
    indicaciones: '',
    prioridad: 'Media',
    responsableId: '',
    tiempoEstimadoMin: '',
    tiempoMaximoMin: '',
    fechaInicio: '',
    fechaMaxima: '',
    fechaEntregaEsperada: '',
    activityType: 'CLIENT' as 'CLIENT' | 'INTERNAL',
    clientId: '',
    projectId: '',
    ticketType: 'PREVENTIVO',
    ticketTypeCustom: '',
    workType: 'ISSUE',
    branchName: '',
    branchNumber: '',
    branchCity: '',
    branchState: '',
    branchAddress: '',
  });

  const fetchAssignableUsers = () => {
    if (!user?.token || !hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE)) return;
    fetch(buildApiUrl('users/assignable'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAssignableUsers(Array.isArray(data) ? data : []))
      .catch(() => setAssignableUsers([]));
  };

  const fetchClients = () => {
    if (!user?.token) return;
    fetch(buildApiUrl('service-clients'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setClients(Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [])))
      .catch(() => setClients([]));
  };

  const fetchOperationalProjects = () => {
    if (!user?.token) return;
    fetch(buildApiUrl('operational-projects'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setOperationalProjects(Array.isArray(data) ? data : []))
      .catch(() => setOperationalProjects([]));
  };

  const fetchTicketRequests = () => {
    if (!user?.token || !hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) return;
    fetch(buildApiUrl('client-ticket-requests?status=APPROVED'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setTicketRequests(Array.isArray(data) ? data : []))
      .catch(() => setTicketRequests([]));
  };

  const fetchNextAn = () => {
    if (!user?.token || !hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE)) return;
    fetch(buildApiUrl('activities/next-an'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setNextAn(data?.next || ''))
      .catch(() => setNextAn(''));
  };

  const normalizeText = (value?: string | null) => (value || '').toLowerCase().trim();

  const smartTokenMatch = (needle: string, chunks: Array<string | null | undefined>) => {
    const tokens = normalizeText(needle).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const haystack = chunks.map((chunk) => normalizeText(chunk)).filter(Boolean).join(' ');
    return tokens.every((token) => haystack.includes(token));
  };

  // Filtrado
  const filtered = activities.filter(a =>
    (estatus ? a.estatus === estatus : true) &&
    (activitySearch ? smartTokenMatch(activitySearch, [
      a.anNumber,
      a.titulo,
      a.descripcion,
      a.indicaciones,
      a.branchName,
      a.branchNumber,
      a.branchCity,
      a.branchState,
      a.branchAddress,
      a.client?.name,
      a.responsable?.nombre,
      a.ticketType,
      a.workType,
    ]) : true) &&
    (responsable ? a.responsable?.nombre?.toLowerCase().includes(responsable.toLowerCase()) : true) &&
    (prioridad ? a.prioridad === prioridad : true)
  );
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [estatus, activitySearch, responsable, prioridad]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);


  // Importar actividades
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(buildApiUrl('activities/import'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      setImportMsg('Error al importar actividades');
      return;
    }
    const data = await res.json();
    setImportMsg(data.message + (data.count ? ` (${data.count})` : ''));
    fetchActivities();
  };

  useEffect(() => {
    if (!user?.token) return;
    fetchActivities();
    fetchNextAn();
    fetchClients();
    fetchOperationalProjects();
    fetchTicketRequests();
  }, [user?.token]);

  useEffect(() => {
    fetchAssignableUsers();
    fetchNextAn();
    fetchClients();
    fetchOperationalProjects();
    fetchTicketRequests();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'Activity') {
        fetchActivities();
        fetchNextAn();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
      setIsSmallMobile(window.innerWidth <= 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const formatDateTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasCoordinates = (latitude?: number | null, longitude?: number | null) => latitude != null && longitude != null;

  const formatCoordinates = (latitude?: number | null, longitude?: number | null) => {
    if (!hasCoordinates(latitude, longitude)) return '-';
    return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
  };

  const getArrivalTime = (activity: Activity) => {
    return activity.activityEvidence?.entryPhotoUploadedAt || activity.activityEvidence?.createdAt || undefined;
  };

  const getDepartureTime = (activity: Activity) => {
    return activity.activityEvidence?.exitPhotoUploadedAt || activity.activityEvidence?.completedAt || undefined;
  };

  const buildActivityEvidenceFiles = (activity: Activity) => {
    const files: Array<{ label: string; type: 'image' | 'pdf'; url: string }> = [];
    const pushFile = (label: string, type: 'image' | 'pdf', value?: string | null) => {
      const resolved = getAssetUrl(value);
      if (!resolved) return;
      if (files.some((file) => file.url === resolved)) return;
      files.push({ label, type, url: resolved });
    };

    pushFile('Entrada', 'image', activity.activityEvidence?.entryPhotoUrl);
    (activity.activityEvidence?.evidencePhotos || []).forEach((photoUrl, index) => {
      pushFile(`Evidencia ${index + 1}`, 'image', photoUrl);
    });
    pushFile('PDF', 'pdf', activity.activityEvidence?.serviceSheetPdfUrl);
    pushFile('Salida', 'image', activity.activityEvidence?.exitPhotoUrl);
    return files;
  };

  const detailFormFields = flattenEvidenceFields(detailActivity?.activityEvidence?.serviceSheetData);

  const getMapsUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return '';
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  const getStaticMapPreviewUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return '';
    if (GOOGLE_MAPS_API_KEY) {
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=1200x420&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    }
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=1200x420&markers=${lat},${lng},red-pushpin`;
  };

  const prefillFromRequest = (request: ClientTicketRequest) => {
    const isPreventiveInventory = request.requestType === 'PREVENTIVE_INVENTORY';
    setPendingRequestId(request.id);
    setNewActivity((prev) => ({
      ...prev,
      activityType: 'CLIENT',
      titulo: request.branchName
        ? `${isPreventiveInventory ? 'Mantenimiento e inventario' : 'Ticket'} ${request.branchName}`
        : isPreventiveInventory
          ? 'Mantenimiento e inventario cliente'
          : 'Ticket cliente',
      descripcion: request.description || prev.descripcion,
      prioridad: request.urgency === 'HIGH' ? 'Alta' : request.urgency === 'LOW' ? 'Baja' : 'Media',
      clientId: request.client?.id ? String(request.client.id) : prev.clientId,
      branchName: request.branchName || prev.branchName,
      branchNumber: request.branchNumber || prev.branchNumber,
      branchCity: request.city || prev.branchCity,
      branchState: request.state || prev.branchState,
      branchAddress: request.address || prev.branchAddress,
      ticketType: isPreventiveInventory ? 'PREVENTIVO' : 'CORRECTIVO',
      workType: isPreventiveInventory ? 'PREVENTIVE_INVENTORY' : 'ISSUE',
    }));
    setFormSuccess('Solicitud precargada en el formulario');
  };

  const handleCloseRequest = async (id: number) => {
    if (!user?.token) return;
    await fetch(buildApiUrl(`client-ticket-requests/${id}/status`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ status: 'CLOSED' }),
    }).catch(() => null);
    fetchTicketRequests();
  };

  const handleAssign = async () => {
    if (!user?.token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!newActivity.titulo || !newActivity.responsableId) {
      setFormError('Titulo y responsable son obligatorios');
      return;
    }

    const payload: any = {
      titulo: newActivity.titulo,
      descripcion: newActivity.descripcion || undefined,
      indicaciones: newActivity.indicaciones || undefined,
      prioridad: newActivity.prioridad,
      estatus: 'Pendiente',
      activityType: newActivity.activityType,
      ticketType: newActivity.ticketType === 'INVENTARIO' ? 'PREVENTIVO' : newActivity.ticketType,
      ticketTypeCustom: newActivity.ticketType === 'OTRO' ? (newActivity.ticketTypeCustom || undefined) : undefined,
      workType: newActivity.activityType === 'INTERNAL' ? 'ISSUE' : (newActivity.ticketType === 'INVENTARIO' ? 'PREVENTIVE_INVENTORY' : 'ISSUE'),
      clientId: newActivity.activityType === 'CLIENT' && newActivity.clientId ? Number(newActivity.clientId) : undefined,
      projectId: newActivity.activityType === 'INTERNAL' && newActivity.projectId ? Number(newActivity.projectId) : undefined,
      branchName: newActivity.branchName || undefined,
      branchNumber: newActivity.branchNumber || undefined,
      branchCity: newActivity.branchCity || undefined,
      branchState: newActivity.branchState || undefined,
      branchAddress: newActivity.branchAddress || undefined,
      creadoPorId: user.id,
      responsableId: Number(newActivity.responsableId),
      tiempoEstimadoMin: newActivity.tiempoEstimadoMin ? Number(newActivity.tiempoEstimadoMin) : undefined,
      tiempoMaximoMin: newActivity.tiempoMaximoMin ? Number(newActivity.tiempoMaximoMin) : undefined,
      fechaInicio: newActivity.fechaInicio ? new Date(newActivity.fechaInicio).toISOString() : undefined,
      fechaMaxima: newActivity.fechaMaxima ? new Date(newActivity.fechaMaxima).toISOString() : undefined,
      fechaEntregaEsperada: newActivity.fechaEntregaEsperada ? new Date(newActivity.fechaEntregaEsperada).toISOString() : undefined,
    };

    const res = await fetch(buildApiUrl('activities'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(data.message || 'Error al asignar actividad');
      return;
    }

    if (pendingRequestId && data?.id) {
      await fetch(buildApiUrl(`client-ticket-requests/${pendingRequestId}/assign`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ activityId: data.id }),
      }).catch(() => null);
      setPendingRequestId(null);
      fetchTicketRequests();
    }

    setFormSuccess('Actividad asignada');
    setNewActivity({
      titulo: '',
      descripcion: '',
      indicaciones: '',
      prioridad: 'Media',
      responsableId: '',
      tiempoEstimadoMin: '',
      tiempoMaximoMin: '',
      fechaInicio: '',
      fechaMaxima: '',
      fechaEntregaEsperada: '',
      activityType: 'CLIENT',
      clientId: '',
      projectId: '',
      ticketType: 'PREVENTIVO',
      ticketTypeCustom: '',
      workType: 'ISSUE',
      branchName: '',
      branchNumber: '',
      branchCity: '',
      branchState: '',
      branchAddress: '',
    });
    fetchActivities();
    fetchNextAn();
  };

  if (loading) {
    return (
      <div className="activities-hero activities-loading-card">
        <h2 className="activities-title">Panel de actividades</h2>
        <div className="activities-helper">Cargando actividades...</div>
      </div>
    );
  }

  return (
    <div className="activities-shell">
      <div className="activities-main">
        {hasPermission(user, PERMISSIONS.CONSOLE_ADMIN) && (
          <div className="activities-requests-card">
            <div className="activities-requests-head">
              <div>
                <h3 className="activities-subtitle">Tickets levantados por clientes</h3>
                <div className="activities-helper">Solicitudes nuevas para asignar al equipo.</div>
              </div>
              <div className="activities-top-chip">Pendientes: {ticketRequests.filter((req) => req.status === 'NEW').length}</div>
            </div>
            {ticketRequests.length === 0 && (
              <div className="activities-empty-state">
                <div className="activities-empty-title">Sin solicitudes pendientes</div>
                <div className="activities-helper">Cuando un cliente levante un ticket aprobado, aparecerá aquí para asignarlo rápidamente.</div>
              </div>
            )}
            <div className="activities-request-list">
              {ticketRequests.map((request) => (
                <div key={request.id} className="activities-request-item">
                  <div className="activities-request-top">
                    <div className="activities-request-title">
                      {request.client?.name || 'Cliente'} · {request.branchName || 'Sucursal'}
                    </div>
                    <span className="badge">{request.status}</span>
                  </div>
                  <div className="activities-helper">{request.description}</div>
                  <div className="activities-helper">
                    Urgencia: {request.urgency} · Limite: {formatDateTime(request.dueAt || undefined)}
                  </div>
                  <div className="activities-helper">
                    Flujo: {request.requestType === 'PREVENTIVE_INVENTORY' ? 'Mantenimiento e inventario' : 'Ticket por problema'}
                  </div>
                  <div className="activities-helper">
                    {request.address || '-'} {request.city || ''} {request.state || ''}
                  </div>
                  {hasCoordinates(request.latitud, request.longitud) && (
                    <div className="activities-map-embed">
                      <a href={getMapsUrl(request.latitud, request.longitud)} target="_blank" rel="noreferrer">
                        <img
                          className="activities-map-iframe"
                          src={getStaticMapPreviewUrl(request.latitud, request.longitud)}
                          loading="lazy"
                          alt={`Mapa ${request.branchName || 'sucursal'}`}
                        />
                      </a>
                    </div>
                  )}
                  <div className="activities-request-actions">
                    {hasCoordinates(request.latitud, request.longitud) && (
                      <a className="button-secondary" href={getMapsUrl(request.latitud, request.longitud)} target="_blank" rel="noreferrer">Ver mapa</a>
                    )}
                    <button className="button-primary" type="button" onClick={() => prefillFromRequest(request)}>Precargar en actividad</button>
                    {request.status !== 'CLOSED' && (
                      <button className="button-secondary" type="button" onClick={() => handleCloseRequest(request.id)}>Cerrar solicitud</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
          <>
          {showOtroModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, padding: '28px 32px', minWidth: 320, maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Por favor especifique</h3>
                <p style={{ margin: '0 0 16px', color: 'var(--text-secondary, #888)', fontSize: 14 }}>Describe el tipo de actividad personalizado.</p>
                <input
                  className="input"
                  autoFocus
                  placeholder="Ej: Auditoría de red, Soporte presencial..."
                  value={otroModalInput}
                  onChange={(e) => setOtroModalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && otroModalInput.trim()) { setNewActivity({ ...newActivity, ticketTypeCustom: otroModalInput.trim() }); setShowOtroModal(false); } }}
                  style={{ width: '100%', marginBottom: 20 }}
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="button-secondary" onClick={() => { setNewActivity({ ...newActivity, ticketType: 'PREVENTIVO', ticketTypeCustom: '' }); setShowOtroModal(false); }}>Cancelar</button>
                  <button className="button-primary" disabled={!otroModalInput.trim()} onClick={() => { setNewActivity({ ...newActivity, ticketTypeCustom: otroModalInput.trim() }); setShowOtroModal(false); }}>Confirmar</button>
                </div>
              </div>
            </div>
          )}
          <div className="activities-form-card">
            <div className="activities-form-head">
              <div>
                <h3 className="activities-subtitle">Asignar actividad</h3>
                <div className="activities-helper">Completa los campos clave para crear la actividad.</div>
              </div>
              <div className="activities-top-chip">AN sugerido: {nextAn || 'Calculando...'}</div>
            </div>
            <div className={`activities-form-grid ${isMobile ? 'is-mobile' : ''}`}>
              <input className="input" placeholder="AN (auto)" value={nextAn || 'Calculando...'} disabled />
              <input className="input" placeholder="Titulo" value={newActivity.titulo} onChange={(e) => setNewActivity({ ...newActivity, titulo: e.target.value })} />
              <select className="input" value={newActivity.activityType} onChange={(e) => setNewActivity({ ...newActivity, activityType: e.target.value as 'CLIENT' | 'INTERNAL', ticketType: 'PREVENTIVO', workType: 'ISSUE' })}>
                <option value="CLIENT">Actividad para Cliente</option>
                <option value="INTERNAL">Actividad Interna (Proyecto)</option>
              </select>
              {newActivity.activityType === 'CLIENT' ? (
                <>
                  <select className="input" value={newActivity.ticketType} onChange={(e) => { const t = e.target.value; if (t === 'OTRO') { setNewActivity({ ...newActivity, ticketType: 'OTRO', workType: 'ISSUE' }); setOtroModalInput(newActivity.ticketTypeCustom || ''); setShowOtroModal(true); } else { setNewActivity({ ...newActivity, ticketType: t, ticketTypeCustom: '', workType: t === 'INVENTARIO' ? 'PREVENTIVE_INVENTORY' : 'ISSUE' }); } }}>
                    <option value="PREVENTIVO">Tipo: Preventivo</option>
                    <option value="CORRECTIVO">Tipo: Correctivo</option>
                    <option value="EMERGENCIA">Tipo: Emergencia</option>
                    <option value="INSTALACION">Tipo: Instalacion</option>
                    <option value="INVENTARIO">Tipo: Inventario</option>
                    <option value="OTRO">Tipo: Otro</option>
                  </select>
                  <select className="input" value={newActivity.clientId} onChange={(e) => setNewActivity({ ...newActivity, clientId: e.target.value })}>
                    <option value="">Seleccionar cliente...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <select className="input" value={newActivity.projectId} onChange={(e) => setNewActivity({ ...newActivity, projectId: e.target.value })}>
                    <option value="">Seleccionar proyecto...</option>
                    {operationalProjects.filter(p => p.status === 'ACTIVE').map((project) => (
                      <option key={project.id} value={project.id}>{project.title} ({project.client.name})</option>
                    ))}
                  </select>
                  <select className="input" value={newActivity.ticketType} onChange={(e) => { const t = e.target.value; if (t === 'OTRO') { setNewActivity({ ...newActivity, ticketType: 'OTRO', workType: 'ISSUE' }); setOtroModalInput(newActivity.ticketTypeCustom || ''); setShowOtroModal(true); } else { setNewActivity({ ...newActivity, ticketType: t, ticketTypeCustom: '', workType: 'ISSUE' }); } }}>
                    <option value="PREVENTIVO">Tipo: Preventivo</option>
                    <option value="CORRECTIVO">Tipo: Correctivo</option>
                    <option value="EMERGENCIA">Tipo: Emergencia</option>
                    <option value="INSTALACION">Tipo: Instalacion</option>
                    <option value="OTRO">Tipo: Otro</option>
                  </select>
                </>
              )}
              <select className="input" value={newActivity.responsableId} onChange={(e) => setNewActivity({ ...newActivity, responsableId: e.target.value })}>
                <option value="">Responsable</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} {u.role?.nombre ? `(${u.role?.nombre})` : ''}
                  </option>
                ))}
              </select>
              <select className="input" value={newActivity.prioridad} onChange={(e) => setNewActivity({ ...newActivity, prioridad: e.target.value })}>
                {prioridadList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {newActivity.activityType === 'CLIENT' && (
                <>
                  <input className="input" placeholder="Sucursal" value={newActivity.branchName} onChange={(e) => setNewActivity({ ...newActivity, branchName: e.target.value })} />
                  <input className="input" placeholder="Número sucursal" value={newActivity.branchNumber} onChange={(e) => setNewActivity({ ...newActivity, branchNumber: e.target.value })} />
                  <input className="input" placeholder="Ciudad" value={newActivity.branchCity} onChange={(e) => setNewActivity({ ...newActivity, branchCity: e.target.value })} />
                  <input className="input" placeholder="Estado" value={newActivity.branchState} onChange={(e) => setNewActivity({ ...newActivity, branchState: e.target.value })} />
                  <input className="input" placeholder="Dirección sucursal" value={newActivity.branchAddress} onChange={(e) => setNewActivity({ ...newActivity, branchAddress: e.target.value })} />
                </>
              )}
              <input className="input" type="number" placeholder="Tiempo estimado (min)" value={newActivity.tiempoEstimadoMin} onChange={(e) => setNewActivity({ ...newActivity, tiempoEstimadoMin: e.target.value })} />
              <input className="input" type="number" placeholder="Tiempo maximo (min)" value={newActivity.tiempoMaximoMin} onChange={(e) => setNewActivity({ ...newActivity, tiempoMaximoMin: e.target.value })} />
              <div>
                <label className="activities-input-label">Fecha inicio</label>
                <input className="input" type="datetime-local" value={newActivity.fechaInicio} onChange={(e) => setNewActivity({ ...newActivity, fechaInicio: e.target.value })} />
              </div>
              <div>
                <label className="activities-input-label">Fecha maxima</label>
                <input className="input" type="datetime-local" value={newActivity.fechaMaxima} onChange={(e) => setNewActivity({ ...newActivity, fechaMaxima: e.target.value })} />
              </div>
              <div>
                <label className="activities-input-label">Entrega esperada</label>
                <input className="input" type="datetime-local" value={newActivity.fechaEntregaEsperada} onChange={(e) => setNewActivity({ ...newActivity, fechaEntregaEsperada: e.target.value })} />
              </div>
              <input className="input" placeholder="Descripción" value={newActivity.descripcion} onChange={(e) => setNewActivity({ ...newActivity, descripcion: e.target.value })} />
              <input className="input" placeholder="Indicaciones" value={newActivity.indicaciones} onChange={(e) => setNewActivity({ ...newActivity, indicaciones: e.target.value })} />
            </div>
            <div className="activities-form-footer">
              <button className="button-primary" onClick={handleAssign}>Asignar</button>
              {formError && <span className="activities-feedback-error">{formError}</span>}
              {formSuccess && <span className="activities-feedback-success">{formSuccess}</span>}
            </div>
          </div>
          </>
        )}

        <div className="activities-toolbar">
          <div className="activities-toolbar-meta">
            <span className="activities-top-chip">Total visibles: {filtered.length}</span>
          </div>
          <div className={`activities-filters-row ${isMobile ? 'is-mobile' : ''}`}>
            <select className="input" value={estatus} onChange={e => setEstatus(e.target.value)}>
              <option value="">Todos los estatus</option>
              {estatusList.map((e: string) => <option key={e} value={e}>{e}</option>)}
            </select>
            <input
              className="input"
              placeholder="Buscar actividad, AN, sucursal o cliente"
              value={activitySearch}
              onChange={e => setActivitySearch(e.target.value)}
            />
            <input
              className="input"
              placeholder="Responsable"
              value={responsable}
              onChange={e => setResponsable(e.target.value)}
            />
            <select className="input" value={prioridad} onChange={e => setPrioridad(e.target.value)}>
              <option value="">Todas las prioridades</option>
              {prioridadList.map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="activities-actions-row">
            <div className="activities-helper">{importMsg && <span className={importMsg.startsWith('Error') ? 'activities-feedback-error' : 'activities-feedback-success'}>{importMsg}</span>}</div>
            {hasPermission(user, PERMISSIONS.ACTIVITIES_EXPORT) && (
              <div className="activities-export-actions">
                <button
                  className="button-secondary"
                  onClick={handlePrepareExcelExport}
                  disabled={excelPreparing}
                >
                  {excelPreparing ? 'Preparando...' : 'Exportar Excel'}
                </button>
              </div>
            )}
          </div>
        </div>

        <ExcelDownloadModal
          isOpen={Boolean(excelUrl)}
          fileName="actividades.xlsx"
          excelBlob={excelBlob}
          isPreparing={excelPreparing}
          onClose={closeExcelModal}
          onDownload={handleDownloadExcel}
        />

        <div className="activities-table-wrap">
          {!isMobile && (
            <table className="activities-data-table">
              <thead>
                <tr>
                  <th>AN</th>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Sucursal</th>
                  <th>Tipo</th>
                  <th>Flujo</th>
                  <th>Estatus</th>
                  <th>Responsable</th>
                  <th>Prioridad</th>
                  <th>Evidencias</th>
                  <th>Llegada</th>
                  <th>Salida</th>
                  <th>Ubic. llegada</th>
                  <th>Ubic. salida</th>
                  <th>Inicio</th>
                  <th>Entrega</th>
                  <th>Estimado/Max</th>
                  <th>Indicaciones</th>
                  {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginated.map((a: Activity) => {
                  const getEvidenceStatus = (activity: Activity) => {
                    if (!activity.activityEvidence) return 'Sin iniciar';
                    const evidence = activity.activityEvidence;
                    const reviewerName = evidence.reviewedBy?.nombre || 'Administración';

                    if (evidence.reviewStatus === 'APPROVED') {
                      return `✅ Aprobado por ${reviewerName}`;
                    }

                    if (evidence.reviewStatus === 'REJECTED') {
                      return `❌ Desaprobado por ${reviewerName}`;
                    }

                    const status = evidence.status;
                    const statusMap: Record<string, string> = {
                      'ENTRY_PHOTO': '📸 Entrada',
                      'EVIDENCE_PHOTOS': '📷 Evidencias',
                      'SERVICE_SHEET_PDF': '📄 PDF',
                      'SERVICE_SHEET_DATA': '📝 Plantilla',
                      'EXIT_PHOTO': '🚪 Salida',
                      'COMPLETED': '✅ Completado',
                    };
                    return statusMap[status] || status;
                  };
                  return (
                    <tr key={a.id}>
                      <td>{a.anNumber}</td>
                      <td>{a.titulo}</td>
                      <td>{a.client?.name || 'Interna'}</td>
                      <td>{a.branchName || '-'}</td>
                      <td>{a.ticketType === 'OTRO' && a.ticketTypeCustom ? `Otro: ${a.ticketTypeCustom}` : (a.ticketType || '-')}</td>
                      <td>{a.workType === 'PREVENTIVE_INVENTORY' ? 'Inventario/Mantenimiento' : 'Problema'}</td>
                      <td><span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>{a.estatus}</span></td>
                      <td>{a.responsable?.nombre}</td>
                      <td>{a.prioridad}</td>
                      <td>
                        <span className={`activities-evidence-pill ${a.activityEvidence?.status === 'COMPLETED' ? 'is-completed' : ''}`}>
                          {getEvidenceStatus(a)}
                        </span>
                        {(a.activityEvidence?.entryLatitude && a.activityEvidence?.entryLongitude) && (
                          <div className="activities-link-row mt-6">
                            <a href={getMapsUrl(a.activityEvidence.entryLatitude, a.activityEvidence.entryLongitude)} target="_blank" rel="noreferrer" className="activities-link-sm">
                              Ubicación entrada
                            </a>
                          </div>
                        )}
                        {(a.activityEvidence?.exitLatitude && a.activityEvidence?.exitLongitude) && (
                          <div className="activities-link-row mt-4">
                            <a href={getMapsUrl(a.activityEvidence.exitLatitude, a.activityEvidence.exitLongitude)} target="_blank" rel="noreferrer" className="activities-link-sm">
                              Ubicación salida
                            </a>
                          </div>
                        )}
                        <div className="activities-thumb-row">
                          {a.activityEvidence?.entryPhotoUrl && (
                            <img
                              src={getAssetUrl(a.activityEvidence.entryPhotoUrl)}
                              alt="entrada"
                              className="activities-thumb"
                            />
                          )}
                          {a.activityEvidence?.exitPhotoUrl && (
                            <img
                              src={getAssetUrl(a.activityEvidence.exitPhotoUrl)}
                              alt="salida"
                              className="activities-thumb"
                            />
                          )}
                        </div>
                        {a.activityEvidence && (
                          <div className="activities-link-row mt-6">
                            <button type="button" className="button-secondary activities-detail-btn" onClick={() => setDetailActivity(a)}>
                              Detalle evidencia
                            </button>
                          </div>
                        )}
                      </td>
                      <td>{formatDateTime(getArrivalTime(a))}</td>
                      <td>{formatDateTime(getDepartureTime(a))}</td>
                      <td>
                        {hasCoordinates(a.activityEvidence?.entryLatitude, a.activityEvidence?.entryLongitude) ? (
                          <div className="activities-location-stack">
                            <span className="activities-location-text">{formatCoordinates(a.activityEvidence?.entryLatitude, a.activityEvidence?.entryLongitude)}</span>
                            <a href={getMapsUrl(a.activityEvidence?.entryLatitude as number, a.activityEvidence?.entryLongitude as number)} target="_blank" rel="noreferrer" className="activities-link-sm">
                              Ver mapa
                            </a>
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        {hasCoordinates(a.activityEvidence?.exitLatitude, a.activityEvidence?.exitLongitude) ? (
                          <div className="activities-location-stack">
                            <span className="activities-location-text">{formatCoordinates(a.activityEvidence?.exitLatitude, a.activityEvidence?.exitLongitude)}</span>
                            <a href={getMapsUrl(a.activityEvidence?.exitLatitude as number, a.activityEvidence?.exitLongitude as number)} target="_blank" rel="noreferrer" className="activities-link-sm">
                              Ver mapa
                            </a>
                          </div>
                        ) : '-'}
                      </td>
                      <td>{formatDateTime(a.fechaInicio)}</td>
                      <td>{formatDateTime(a.fechaEntregaEsperada)}</td>
                      <td>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0}</td>
                      <td>{a.indicaciones || '-'}</td>
                      {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
                        <td>
                          <div className="activities-row-actions">
                            <button className="button-secondary">Editar</button>
                            <button className="button-primary">Borrar</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {isMobile && (
            <div className="activities-mobile-list">
              {paginated.map((a: Activity) => {
                const getEvidenceStatus = (activity: Activity) => {
                  if (!activity.activityEvidence) return 'Sin iniciar';
                  const evidence = activity.activityEvidence;
                  const reviewerName = evidence.reviewedBy?.nombre || 'Administración';

                  if (evidence.reviewStatus === 'APPROVED') {
                    return `✅ Aprobado por ${reviewerName}`;
                  }

                  if (evidence.reviewStatus === 'REJECTED') {
                    return `❌ Desaprobado por ${reviewerName}`;
                  }

                  const status = evidence.status;
                  const statusMap: Record<string, string> = {
                    'ENTRY_PHOTO': '📸 Entrada',
                    'EVIDENCE_PHOTOS': '📷 Evidencias',
                    'SERVICE_SHEET_PDF': '📄 PDF',
                    'SERVICE_SHEET_DATA': '📝 Plantilla',
                    'EXIT_PHOTO': '🚪 Salida',
                    'COMPLETED': '✅ Completado',
                  };
                  return statusMap[status] || status;
                };

                return (
                  <article key={a.id} className="activities-mobile-card">
                    <div className="activities-mobile-head">
                      <div className="activities-mobile-title-wrap">
                        <div className="activities-mobile-an">AN {a.anNumber}</div>
                        <div className="activities-mobile-title">{a.titulo}</div>
                      </div>
                      <span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''} activities-mobile-badge`}>{a.estatus}</span>
                    </div>

                    <div className={`activities-mobile-meta-grid ${isSmallMobile ? 'is-small' : ''}`}>
                      <div className="activities-mobile-meta-item"><strong>Cliente:</strong> {a.client?.name || 'Interna'}</div>
                      <div className="activities-mobile-meta-item"><strong>Sucursal:</strong> {a.branchName || '-'}</div>
                      <div className="activities-mobile-meta-item"><strong>Tipo:</strong> {a.ticketType === 'OTRO' && a.ticketTypeCustom ? `Otro: ${a.ticketTypeCustom}` : (a.ticketType || '-')}</div>
                      <div className="activities-mobile-meta-item"><strong>Flujo:</strong> {a.workType === 'PREVENTIVE_INVENTORY' ? 'Inventario/Mantenimiento' : 'Problema'}</div>
                      <div className="activities-mobile-meta-item"><strong>Prioridad:</strong> {a.prioridad}</div>
                      <div className="activities-mobile-meta-item"><strong>Responsable:</strong> {a.responsable?.nombre || '-'}</div>
                      <div className="activities-mobile-meta-item"><strong>Llegada:</strong> {formatDateTime(getArrivalTime(a))}</div>
                      <div className="activities-mobile-meta-item"><strong>Salida:</strong> {formatDateTime(getDepartureTime(a))}</div>
                      <div className="activities-mobile-meta-item"><strong>Estimado/Max:</strong> {a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0} min</div>
                      <div className="activities-mobile-meta-item"><strong>Inicio:</strong> {formatDateTime(a.fechaInicio)}</div>
                      <div className="activities-mobile-meta-item"><strong>Entrega:</strong> {formatDateTime(a.fechaEntregaEsperada)}</div>
                    </div>

                    <div className="activities-mobile-locations">
                      <div className="activities-mobile-location-item">
                        <strong>Ubicación llegada:</strong>{' '}
                        {hasCoordinates(a.activityEvidence?.entryLatitude, a.activityEvidence?.entryLongitude) ? (
                          <>
                            <span className="activities-location-text">{formatCoordinates(a.activityEvidence?.entryLatitude, a.activityEvidence?.entryLongitude)}</span>{' '}
                            <a href={getMapsUrl(a.activityEvidence?.entryLatitude as number, a.activityEvidence?.entryLongitude as number)} target="_blank" rel="noreferrer" className="activities-link-sm">
                              Ver mapa
                            </a>
                          </>
                        ) : '-'}
                      </div>
                      <div className="activities-mobile-location-item">
                        <strong>Ubicación salida:</strong>{' '}
                        {hasCoordinates(a.activityEvidence?.exitLatitude, a.activityEvidence?.exitLongitude) ? (
                          <>
                            <span className="activities-location-text">{formatCoordinates(a.activityEvidence?.exitLatitude, a.activityEvidence?.exitLongitude)}</span>{' '}
                            <a href={getMapsUrl(a.activityEvidence?.exitLatitude as number, a.activityEvidence?.exitLongitude as number)} target="_blank" rel="noreferrer" className="activities-link-sm">
                              Ver mapa
                            </a>
                          </>
                        ) : '-'}
                      </div>
                    </div>

                    <div className="activities-mobile-evidence-wrap">
                      <span className={`activities-evidence-pill activities-mobile-evidence ${a.activityEvidence?.status === 'COMPLETED' ? 'is-completed' : ''}`}>
                        Evidencias: {getEvidenceStatus(a)}
                      </span>
                      {(a.activityEvidence?.entryLatitude && a.activityEvidence?.entryLongitude) && (
                        <div className="activities-link-row mt-6">
                          <a href={getMapsUrl(a.activityEvidence.entryLatitude, a.activityEvidence.entryLongitude)} target="_blank" rel="noreferrer" className="activities-link-sm">
                            Ver ubicación entrada
                          </a>
                        </div>
                      )}
                      <div className="activities-thumb-row">
                        {a.activityEvidence?.entryPhotoUrl && (
                          <img
                            src={getAssetUrl(a.activityEvidence.entryPhotoUrl)}
                            alt="entrada"
                            className="activities-thumb activities-thumb-mobile"
                          />
                        )}
                        {a.activityEvidence?.exitPhotoUrl && (
                          <img
                            src={getAssetUrl(a.activityEvidence.exitPhotoUrl)}
                            alt="salida"
                            className="activities-thumb activities-thumb-mobile"
                          />
                        )}
                      </div>
                      {a.activityEvidence && (
                        <button type="button" className="button-secondary activities-detail-btn" onClick={() => setDetailActivity(a)}>
                          Detalle evidencia
                        </button>
                      )}
                    </div>

                    <div className="activities-mobile-notes">
                      <strong>Indicaciones:</strong> {a.indicaciones || '-'}
                    </div>

                    {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
                      <div className="activities-mobile-actions">
                        <button className="button-secondary activities-mobile-action-btn">Editar</button>
                        <button className="button-primary activities-mobile-action-btn">Borrar</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="activities-pagination">
          <div className={`activities-pagination-buttons ${isMobile ? 'is-mobile' : ''}`}>
            <button className={`button-secondary activities-pagination-btn ${isMobile ? 'is-mobile' : ''}`} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
            <button className={`button-secondary activities-pagination-btn ${isMobile ? 'is-mobile' : ''}`} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
          </div>
          <span className="activities-helper">Página {page} de {totalPages || 1}</span>
        </div>

        {detailActivity && (
          <div className="activities-detail-overlay" onClick={() => setDetailActivity(null)} aria-hidden="true">
            <div className="activities-detail-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Detalle de evidencia de actividad">
              <div className="activities-detail-head">
                <div>
                  <h3 className="activities-detail-title">Detalle de evidencia</h3>
                  <div className="activities-helper">{detailActivity.anNumber} · {detailActivity.titulo}</div>
                </div>
                <button type="button" className="button-secondary activities-detail-btn" onClick={() => setDetailActivity(null)}>
                  Cerrar
                </button>
              </div>

              <div className="activities-detail-body">
                <section className="activities-detail-section">
                  <h4 className="activities-detail-section-title">Flujo</h4>
                  <div className="activities-detail-grid">
                    <div><strong>Llegada:</strong> {formatDateTime(getArrivalTime(detailActivity))}</div>
                    <div><strong>Salida:</strong> {formatDateTime(getDepartureTime(detailActivity))}</div>
                    <div>
                      <strong>Ubicación llegada:</strong> {formatCoordinates(detailActivity.activityEvidence?.entryLatitude, detailActivity.activityEvidence?.entryLongitude)}
                      {hasCoordinates(detailActivity.activityEvidence?.entryLatitude, detailActivity.activityEvidence?.entryLongitude) && (
                        <a href={getMapsUrl(detailActivity.activityEvidence?.entryLatitude as number, detailActivity.activityEvidence?.entryLongitude as number)} target="_blank" rel="noreferrer" className="activities-link-sm activities-detail-link">
                          Ver mapa
                        </a>
                      )}
                    </div>
                    <div>
                      <strong>Ubicación salida:</strong> {formatCoordinates(detailActivity.activityEvidence?.exitLatitude, detailActivity.activityEvidence?.exitLongitude)}
                      {hasCoordinates(detailActivity.activityEvidence?.exitLatitude, detailActivity.activityEvidence?.exitLongitude) && (
                        <a href={getMapsUrl(detailActivity.activityEvidence?.exitLatitude as number, detailActivity.activityEvidence?.exitLongitude as number)} target="_blank" rel="noreferrer" className="activities-link-sm activities-detail-link">
                          Ver mapa
                        </a>
                      )}
                    </div>
                    <div><strong>PDF cargado:</strong> {formatDateTime(detailActivity.activityEvidence?.serviceSheetUploadedAt)}</div>
                    <div><strong>Formulario digital:</strong> {formatDateTime(detailActivity.activityEvidence?.serviceSheetCompletedAt)}</div>
                  </div>
                </section>

                <section className="activities-detail-section">
                  <h4 className="activities-detail-section-title">Archivos</h4>
                  <div className="activities-detail-files">
                    {buildActivityEvidenceFiles(detailActivity).map((file) => (
                      <a key={`${file.label}-${file.url}`} href={file.url} target="_blank" rel="noreferrer" className="activities-detail-file">
                        {file.label}
                      </a>
                    ))}
                    {!buildActivityEvidenceFiles(detailActivity).length && <span className="activities-helper">Sin archivos adjuntos.</span>}
                  </div>
                </section>

                <section className="activities-detail-section">
                  <h4 className="activities-detail-section-title">Formulario digital</h4>
                  {detailFormFields.length > 0 ? (
                    <div className="activities-detail-form-grid">
                      {detailFormFields.map((field, index) => (
                        <div key={`${field.label}-${index}`} className="activities-detail-field-card">
                          <div className="activities-detail-field-label">{field.label}</div>
                          {field.imageUrl ? (
                            <img src={field.imageUrl} alt={field.label} className="activities-detail-field-image" />
                          ) : (
                            <div className="activities-detail-field-value">{field.value}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="activities-helper">No hay datos digitales capturados.</div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .activities-shell {
            display: grid;
            gap: 18px;
          }
            min-width: 0;
            width: 100%;
            max-width: 100%;

          .activities-loading-card,
          .activities-hero,
          .activities-main,
          .activities-requests-card,
            min-width: 0;
            width: 100%;
            max-width: 100%;
          .activities-form-card,
          .activities-mobile-card {
            border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
            background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 94%, transparent));
            box-shadow: 0 10px 26px rgba(10, 18, 30, 0.08);
          }

          .activities-hero {
            padding: clamp(16px, 2vw, 22px);
            border-radius: 16px;
            background:
              radial-gradient(1200px 220px at 100% -20%, color-mix(in srgb, var(--secondary) 16%, transparent), transparent 52%),
              radial-gradient(800px 180px at 0% -30%, color-mix(in srgb, var(--primary) 13%, transparent), transparent 56%),
            min-width: 0;
              linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 94%, transparent));
          }

          .activities-hero-head,
          .activities-requests-head,
          .activities-form-head,
            width: 100%;
            max-width: 100%;
          .activities-actions-row,
          .activities-request-top,
          .activities-mobile-head,
          .activities-pagination {
            display: flex;

          .activities-pagination > *,
          .activities-actions-row > *,
          .activities-toolbar-meta > * {
            min-width: 0;
          }
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }

          .activities-hero-head {
            align-items: center;
          }

          .activities-title,
          .activities-subtitle {
            margin: 0;
            color: var(--foreground);
            font-family: var(--font-heading);
            letter-spacing: 0.01em;
          }

          .activities-title {
            font-size: clamp(1.35rem, 1.9vw, 1.7rem);
            line-height: 1.2;
          }

          .activities-subtitle {
            font-size: clamp(1.3rem, 1.6vw, 1.75rem);
          }

          .activities-helper,
          .activities-input-label,
          .activities-mobile-meta-item,
          .activities-mobile-notes {
            color: var(--text-secondary);
            font-size: 13px;
            line-height: 1.45;
          }

          .activities-input-label {
            display: inline-block;
            margin-bottom: 6px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            color: var(--text-tertiary);
          }

          .activities-main {
            display: grid;
            grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
            gap: 16px;
            padding: 16px;
            border-radius: 16px;
            align-items: stretch;
            min-width: 0;
          }

          .activities-toolbar-meta {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 8px;
            min-width: 0;
          }

          .activities-requests-card,
          .activities-form-card {
            display: grid;
            gap: 14px;
            padding: 16px;
            border-radius: 16px;
            min-width: 0;
            box-shadow: 0 8px 18px rgba(11, 20, 34, 0.06);
          }

          .activities-requests-card {
            grid-column: 1;
            align-content: start;
            min-height: 500px;
          }

          .activities-form-card {
            grid-column: 2;
            align-content: start;
          }

          .activities-toolbar,
          .activities-table-wrap,
          .activities-pagination {
            grid-column: 1 / -1;
          }

          .activities-request-list,
          .activities-mobile-list {
            display: grid;
            gap: 14px;
          }

          .activities-empty-state {
            min-height: 220px;
            border-radius: 14px;
            border: 1px dashed color-mix(in srgb, var(--border) 84%, transparent);
            background: color-mix(in srgb, var(--surface-2) 68%, transparent);
            display: grid;
            align-content: center;
            justify-items: center;
            text-align: center;
            gap: 8px;
            padding: 18px;
          }

          .activities-empty-title {
            margin: 0;
            font-size: 1rem;
            font-weight: 700;
            color: var(--foreground);
          }

          .activities-request-item,
          .activities-mobile-card {
            display: grid;
            gap: 10px;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
            background: color-mix(in srgb, var(--surface) 97%, transparent);
          }

          .activities-request-title,
          .activities-mobile-title,
          .activities-mobile-an {
            color: var(--foreground);
            font-weight: 700;
          }

          .activities-mobile-an {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: var(--text-tertiary);
          }

          .activities-map-embed {
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            background: var(--surface-2);
          }

          .activities-map-iframe {
            width: 100%;
            min-height: 220px;
            border: 0;
            display: block;
          }

          .activities-map-preview-placeholder {
            border: 1px dashed var(--border);
            border-radius: 10px;
            background: var(--surface-2);
            color: var(--text-secondary);
            font-size: 12px;
            line-height: 1.4;
            padding: 10px 12px;
          }

          .activities-request-actions,
          .activities-row-actions,
          .activities-export-actions,
          .activities-mobile-actions,
          .activities-thumb-row,
          .activities-link-row,
          .activities-pagination-buttons {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
          }

          .activities-form-grid,
          .activities-filters-row,
          .activities-mobile-meta-grid {
            display: grid;
            gap: 10px;
          }

          .activities-form-grid > *,
          .activities-filters-row > *,
          .activities-mobile-meta-grid > * {
            min-width: 0;
          }

          .activities-form-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-content: start;
          }

          .activities-form-grid.is-mobile,
          .activities-filters-row.is-mobile,
          .activities-mobile-meta-grid.is-small {
            grid-template-columns: 1fr;
          }

          .activities-filters-row {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            align-items: end;
          }

          .activities-mobile-meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .activities-form-footer {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            padding-top: 4px;
          }

          .activities-feedback-error,
          .activities-feedback-success,
          .activities-evidence-pill {
            display: inline-flex;
            align-items: center;
            min-height: 32px;
            padding: 0 12px;
            border-radius: 999px;
            border: 1px solid var(--border);
            font-size: 12px;
            font-weight: 700;
          }

          .activities-top-chip {
            display: inline-flex;
            align-items: center;
            min-height: 32px;
            padding: 0 12px;
            border-radius: 999px;
            border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
            background: color-mix(in srgb, var(--primary) 10%, var(--surface));
            color: color-mix(in srgb, var(--foreground) 85%, var(--primary));
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.02em;
            max-width: 100%;
            white-space: normal;
            overflow-wrap: anywhere;
          }

          .activities-feedback-error {
            color: var(--state-danger-text);
            background: var(--state-danger-bg);
            border-color: var(--state-danger-border);
          }

          .activities-feedback-success,
          .activities-evidence-pill.is-completed {
            color: var(--state-success-text);
            background: var(--state-success-bg);
            border-color: var(--state-success-border);
          }

          .activities-evidence-pill {
            color: var(--state-info-text);
            background: var(--state-info-bg);
            border-color: var(--state-info-border);
          }

          .activities-table-wrap {
            min-width: 0;
            overflow-x: auto;
            overflow-y: hidden;
            border: 1px solid var(--border);
            border-radius: 14px;
            background: color-mix(in srgb, var(--surface) 96%, transparent);
            -webkit-overflow-scrolling: touch;
          }

          .activities-data-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
            min-width: 1480px;
          }

          .activities-data-table th,
          .activities-data-table td {
            padding: 10px 10px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
            vertical-align: top;
          }

          .activities-data-table th {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            white-space: nowrap;
          }

          .activities-data-table td {
            font-size: 0.9rem;
            color: var(--text-primary);
            white-space: nowrap;
          }

          .activities-data-table td:nth-child(2),
          .activities-data-table td:nth-child(8),
          .activities-data-table td:nth-child(14) {
            white-space: normal;
            min-width: 170px;
            line-height: 1.35;
          }

          .activities-data-table td:nth-child(10) {
            min-width: 180px;
          }

          .activities-data-table td:nth-child(11),
          .activities-data-table td:nth-child(12),
          .activities-data-table td:nth-child(13) {
            white-space: nowrap;
            min-width: 88px;
          }

          .activities-table-wrap :global(thead th),
          .activities-data-table thead th {
            background: color-mix(in srgb, var(--surface-2) 84%, var(--primary) 16%);
            color: var(--foreground);
            font-size: 0.7rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }

          .activities-table-wrap :global(tbody tr:nth-child(even) td) {
            background: color-mix(in srgb, var(--surface-2) 72%, transparent);
          }

          .activities-table-wrap :global(tbody tr:hover td) {
            background: color-mix(in srgb, var(--secondary) 10%, var(--surface));
          }

          .activities-file-input {
            display: none;
          }

          .activities-link-sm {
            color: color-mix(in srgb, var(--secondary) 72%, var(--foreground));
            font-weight: 600;
            text-decoration: none;
          }

          .activities-link-sm:hover {
            color: var(--primary);
          }

          .activities-location-stack,
          .activities-mobile-locations {
            display: grid;
            gap: 6px;
          }

          .activities-mobile-location-item {
            color: var(--text-secondary);
            font-size: 13px;
            line-height: 1.45;
          }

          .activities-location-text {
            color: var(--foreground);
            font-size: 12px;
            word-break: break-word;
          }

          .activities-detail-btn {
            min-height: 34px;
            padding: 0 12px;
            border-radius: 10px;
          }

          .activities-detail-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.58);
            backdrop-filter: blur(2px);
            z-index: 10001;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 16px;
          }

          .activities-detail-card {
            width: min(1040px, 96vw);
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border-radius: 16px;
            border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
            background: color-mix(in srgb, var(--surface) 98%, transparent);
            box-shadow: 0 22px 56px rgba(2, 8, 23, 0.34);
          }

          .activities-detail-head {
            position: sticky;
            top: 0;
            z-index: 1;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
            background: color-mix(in srgb, var(--surface) 94%, var(--surface-2));
          }

          .activities-detail-title,
          .activities-detail-section-title {
            margin: 0;
            color: var(--foreground);
            font-weight: 800;
          }

          .activities-detail-body {
            overflow: auto;
            padding: 16px;
            display: grid;
            gap: 14px;
            background: color-mix(in srgb, var(--surface-2) 60%, transparent);
          }

          .activities-detail-section {
            display: grid;
            gap: 12px;
            padding: 14px;
            border-radius: 14px;
            border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
            background: color-mix(in srgb, var(--surface) 99%, transparent);
          }

          .activities-detail-grid,
          .activities-detail-form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px 14px;
          }

          .activities-detail-link {
            margin-left: 8px;
          }

          .activities-detail-files {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }

          .activities-detail-file {
            display: inline-flex;
            align-items: center;
            min-height: 36px;
            padding: 0 12px;
            border-radius: 999px;
            border: 1px solid color-mix(in srgb, var(--primary) 32%, var(--border));
            color: var(--foreground);
            text-decoration: none;
            background: color-mix(in srgb, var(--primary) 8%, var(--surface));
          }

          .activities-detail-field-card {
            display: grid;
            gap: 8px;
            padding: 10px;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
            background: var(--surface);
          }

          .activities-detail-field-label {
            font-size: 12px;
            font-weight: 800;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .activities-detail-field-value {
            color: var(--foreground);
            font-size: 14px;
            line-height: 1.45;
            word-break: break-word;
          }

          .activities-detail-field-image {
            width: 100%;
            max-width: 260px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--surface-2);
          }

          .activities-thumb {
            width: 58px;
            height: 58px;
            object-fit: cover;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: var(--surface-2);
          }

          .activities-data-table .activities-link-row {
            margin: 4px 0;
          }

          .activities-data-table .activities-evidence-pill {
            margin-bottom: 6px;
          }

          .activities-thumb-mobile {
            width: 88px;
            height: 88px;
          }

          .activities-mobile-evidence-wrap,
          .activities-mobile-title-wrap {
            display: grid;
            gap: 8px;
          }

          .activities-mobile-badge,
          .activities-mobile-evidence {
            justify-self: start;
          }

          .activities-pagination {
            align-items: center;
            padding-top: 4px;
          }

          .activities-shell :global(.input) {
            min-height: 40px;
            border-radius: 10px;
            border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
            background: color-mix(in srgb, var(--surface) 97%, transparent);
            transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
          }

          .activities-shell :global(.input:focus) {
            border-color: color-mix(in srgb, var(--primary) 46%, var(--border));
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent);
          }

          .activities-shell :global(.button-primary),
          .activities-shell :global(.button-secondary) {
            min-height: 38px;
            border-radius: 9px;
            padding: 8px 12px;
            font-size: 0.82rem;
            font-weight: 600;
            transition: transform 0.16s ease, filter 0.16s ease;
          }

          .activities-shell :global(.button-primary:hover),
          .activities-shell :global(.button-secondary:hover) {
            transform: translateY(-1px);
          }

          .activities-shell :global(.button-primary) {
            background: color-mix(in srgb, var(--primary) 86%, white 14%);
            border: 1px solid color-mix(in srgb, var(--primary) 42%, transparent);
            color: #fff;
          }

          .activities-shell :global(.button-secondary) {
            background: color-mix(in srgb, var(--surface) 96%, transparent);
            border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
            color: var(--foreground);
          }

          .activities-shell :global(.badge) {
            border-radius: 999px;
            font-size: 0.74rem;
            font-weight: 700;
          }

          .activities-pagination-btn.is-mobile {
            flex: 1 1 0;
            justify-content: center;
          }

          @media (max-width: 1180px) {
            .activities-main {
              grid-template-columns: 1fr;
            }

            .activities-requests-card,
            .activities-form-card,
            .activities-toolbar,
            .activities-table-wrap,
            .activities-pagination {
              grid-column: 1;
            }
          }

          @media (max-width: 900px) {
            .activities-filters-row,
            .activities-form-grid,
            .activities-mobile-meta-grid {
              grid-template-columns: 1fr;
            }

            .activities-main {
              padding: 12px;
              border-radius: 14px;
            }

            .activities-requests-card,
            .activities-form-card,
            .activities-mobile-card {
              padding: 12px;
              border-radius: 12px;
            }

            .activities-requests-card {
              min-height: 320px;
            }

            .activities-empty-state {
              min-height: 160px;
            }

            .activities-detail-card {
              width: calc(100vw - 16px);
              max-height: 92vh;
              border-radius: 12px;
            }

            .activities-detail-body,
            .activities-detail-head {
              padding: 10px;
            }

            .activities-detail-grid,
            .activities-detail-form-grid {
              grid-template-columns: 1fr;
            }

            .activities-detail-field-image {
              max-width: 100%;
            }
          }

          @media (max-width: 640px) {
            .activities-main {
              padding: 10px;
              gap: 12px;
            }

            .activities-toolbar-meta {
              width: 100%;
              justify-content: flex-start;
              margin-bottom: 10px;
            }

            .activities-toolbar,
            .activities-actions-row,
            .activities-export-actions,
            .activities-request-actions,
            .activities-row-actions,
            .activities-mobile-actions,
            .activities-pagination-buttons {
              width: 100%;
            }

            .activities-actions-row,
            .activities-export-actions,
            .activities-request-actions,
            .activities-row-actions,
            .activities-mobile-actions,
            .activities-pagination-buttons,
            .activities-thumb-row {
              gap: 8px;
            }

            .activities-actions-row > *,
            .activities-export-actions > *,
            .activities-request-actions > *,
            .activities-row-actions > *,
            .activities-mobile-actions > * {
              flex: 1 1 100%;
            }

            .activities-request-actions .button-primary,
            .activities-request-actions .button-secondary,
            .activities-row-actions .button-primary,
            .activities-row-actions .button-secondary,
            .activities-mobile-actions .button-primary,
            .activities-mobile-actions .button-secondary,
            .activities-export-actions .button-secondary,
            .activities-form-footer .button-primary,
            .activities-pagination-buttons .button-secondary {
              width: 100%;
              justify-content: center;
            }

            .activities-request-item,
            .activities-mobile-card,
            .activities-requests-card,
            .activities-form-card {
              padding: 11px;
              border-radius: 14px;
            }

            .activities-filters-row,
            .activities-form-grid,
            .activities-form-primary-grid,
            .activities-form-context-grid,
            .activities-mobile-meta-grid {
              grid-template-columns: 1fr;
              gap: 9px;
            }

            .activities-top-chip {
              width: 100%;
              justify-content: center;
              padding: 8px 12px;
            }

            .activities-mobile-meta-item,
            .activities-mobile-location-item,
            .activities-mobile-notes,
            .activities-mobile-evidence-wrap {
              padding: 10px;
              border-radius: 12px;
              border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
              background: color-mix(in srgb, var(--surface) 92%, transparent);
            }

            .activities-thumb-row {
              overflow-x: auto;
              flex-wrap: nowrap;
              padding-bottom: 2px;
              -webkit-overflow-scrolling: touch;
            }

            .activities-thumb,
            .activities-thumb-mobile {
              width: 84px;
              height: 84px;
              border-radius: 12px;
              flex: 0 0 auto;
            }

            .activities-map-iframe {
              min-height: 180px;
            }

            .activities-detail-overlay {
              padding: 8px;
            }

            .activities-detail-card {
              width: calc(100vw - 12px);
              max-height: 94vh;
            }

            .activities-detail-body,
            .activities-detail-head {
              padding: 10px;
            }

            .activities-detail-section {
              padding: 10px;
            }
          }

          @media (max-width: 420px) {
            .activities-main {
              padding: 8px;
              border-radius: 12px;
            }

            .activities-table-wrap {
              border-radius: 12px;
            }

            .activities-title {
              font-size: 1.24rem;
            }

            .activities-subtitle {
              font-size: 0.92rem;
            }

            .activities-helper,
            .activities-mobile-meta-item,
            .activities-mobile-location-item,
            .activities-mobile-notes,
            .activities-detail-field-value {
              font-size: 12px;
            }

            .activities-mobile-head,
            .activities-request-top {
              flex-direction: column;
              align-items: flex-start;
            }

            .activities-mobile-badge {
              align-self: flex-start;
            }

            .activities-thumb,
            .activities-thumb-mobile {
              width: 72px;
              height: 72px;
            }

            .activities-map-iframe {
              min-height: 160px;
            }

            .activities-detail-file {
              width: 100%;
              justify-content: center;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default ActivitiesTable;
    

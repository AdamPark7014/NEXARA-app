"use client";
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import ExcelDownloadModal from './ExcelDownloadModal';

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
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);

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
      entryPhotoUrl?: string;
      entryLatitude?: number;
      entryLongitude?: number;
      evidencePhotos: string[];
      serviceSheetPdfUrl?: string;
      exitPhotoUrl?: string;
      exitLatitude?: number;
      exitLongitude?: number;
      completedAt?: string;
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
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

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
  const [newActivity, setNewActivity] = useState({
    titulo: '',
    descripcion: '',
    indicaciones: '',
    prioridad: 'Media',
    estatus: 'Pendiente',
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
      .then((data) => setClients(Array.isArray(data) ? data : []))
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

  const getMapsUrl = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return '';
    return `https://www.google.com/maps?q=${lat},${lng}`;
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
      estatus: newActivity.estatus,
      activityType: newActivity.activityType,
      ticketType: newActivity.activityType === 'CLIENT' ? newActivity.ticketType : 'OTRO',
      workType: newActivity.workType,
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
      estatus: 'Pendiente',
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
      <div className="card activities-hero">
        <h2 className="activities-title">Actividades</h2>
        <div className="activities-helper">Cargando actividades...</div>
      </div>
    );
  }

  return (
    <div className="activities-shell">
      <div className="card activities-hero">
        <div className="activities-hero-head">
          <div>
            <h2 className="activities-title">Actividades</h2>
            <div className="activities-helper">Gestiona actividades, prioridades y asignaciones del equipo.</div>
          </div>
          <div className="activities-total-pill">Total visibles: {filtered.length}</div>
        </div>
      </div>

      <div className="card activities-main">
        {hasPermission(user, PERMISSIONS.CONSOLE_ADMIN) && (
          <div className="card activities-requests-card">
            <div className="activities-requests-head">
              <div>
                <h3 className="activities-subtitle">Tickets levantados por clientes</h3>
                <div className="activities-helper">Solicitudes nuevas para asignar al equipo.</div>
              </div>
              <div className="activities-helper">Pendientes: {ticketRequests.filter((req) => req.status === 'NEW').length}</div>
            </div>
            {ticketRequests.length === 0 && (
              <div className="activities-helper">No hay solicitudes por el momento.</div>
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
                  {request.latitud && request.longitud && (
                    <div className="activities-map-preview-placeholder">
                      Vista previa de mapa no disponible en esta vista. Usa "Ver mapa" para abrir la ubicacion.
                    </div>
                  )}
                  <div className="activities-request-actions">
                    {request.latitud && request.longitud && (
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
          <div className="activities-form-card">
            <div className="activities-form-head">
              <div>
                <h3 className="activities-subtitle">Asignar actividad</h3>
                <div className="activities-helper">Solo llena lo esencial y crea rápido. Puedes abrir opciones avanzadas cuando lo necesites.</div>
              </div>
              <div className="activities-helper">AN sugerido: {nextAn || 'Calculando...'}</div>
            </div>

            <div className={`activities-form-primary-grid ${isMobile ? 'is-mobile' : ''}`}>
              <input className="input" placeholder="AN (auto)" value={nextAn || 'Calculando...'} disabled />
              <input className="input" placeholder="Título *" value={newActivity.titulo} onChange={(e) => setNewActivity({ ...newActivity, titulo: e.target.value })} />
              <select className="input" value={newActivity.activityType} onChange={(e) => setNewActivity({ ...newActivity, activityType: e.target.value as 'CLIENT' | 'INTERNAL' })}>
                <option value="CLIENT">Actividad para Cliente</option>
                <option value="INTERNAL">Actividad Interna (Proyecto)</option>
              </select>
              <select className="input" value={newActivity.responsableId} onChange={(e) => setNewActivity({ ...newActivity, responsableId: e.target.value })}>
                <option value="">Responsable *</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} {u.role?.nombre ? `(${u.role?.nombre})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className={`activities-form-context-grid ${isMobile ? 'is-mobile' : ''}`}>
              {newActivity.activityType === 'CLIENT' ? (
                <>
                  <select className="input" value={newActivity.ticketType} onChange={(e) => setNewActivity({ ...newActivity, ticketType: e.target.value })}>
                    <option value="PREVENTIVO">Tipo: Preventivo</option>
                    <option value="CORRECTIVO">Tipo: Correctivo</option>
                    <option value="EMERGENCIA">Tipo: Emergencia</option>
                    <option value="INSTALACION">Tipo: Instalacion</option>
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
                    {operationalProjects.filter((p) => p.status === 'ACTIVE').map((project) => (
                      <option key={project.id} value={project.id}>{project.title} ({project.client.name})</option>
                    ))}
                  </select>
                  <select className="input" value={newActivity.workType} onChange={(e) => setNewActivity({ ...newActivity, workType: e.target.value })}>
                    <option value="ISSUE">Flujo: Tickets de problemas</option>
                    <option value="PREVENTIVE_INVENTORY">Flujo: Mantenimiento e inventario</option>
                  </select>
                </>
              )}
              <select className="input" value={newActivity.prioridad} onChange={(e) => setNewActivity({ ...newActivity, prioridad: e.target.value })}>
                {prioridadList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <button
              type="button"
              className="activities-form-advanced-toggle"
              onClick={() => setShowAdvancedForm((prev) => !prev)}
            >
              {showAdvancedForm ? 'Ocultar opciones avanzadas' : 'Mostrar opciones avanzadas'}
            </button>

            {showAdvancedForm && (
              <div className={`activities-form-grid activities-form-advanced ${isMobile ? 'is-mobile' : ''}`}>
              <select className="input" value={newActivity.estatus} onChange={(e) => setNewActivity({ ...newActivity, estatus: e.target.value })}>
                {estatusList.map((s) => <option key={s} value={s}>{s}</option>)}
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
              <textarea className="input activities-textarea" placeholder="Descripción" value={newActivity.descripcion} onChange={(e) => setNewActivity({ ...newActivity, descripcion: e.target.value })} />
              <textarea className="input activities-textarea" placeholder="Indicaciones" value={newActivity.indicaciones} onChange={(e) => setNewActivity({ ...newActivity, indicaciones: e.target.value })} />
            </div>
            )}
            <div className="activities-form-footer">
              <button className="button-primary" onClick={handleAssign}>Asignar</button>
              {formError && <span className="activities-feedback-error">{formError}</span>}
              {formSuccess && <span className="activities-feedback-success">{formSuccess}</span>}
            </div>
          </div>
        )}

        <div className="activities-toolbar">
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
            <table className="table">
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
                    const status = activity.activityEvidence.status;
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
                      <td>{a.ticketType || '-'}</td>
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
                              src={a.activityEvidence.entryPhotoUrl}
                              alt="entrada"
                              className="activities-thumb"
                            />
                          )}
                          {a.activityEvidence?.exitPhotoUrl && (
                            <img
                              src={a.activityEvidence.exitPhotoUrl}
                              alt="salida"
                              className="activities-thumb"
                            />
                          )}
                        </div>
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
                  const status = activity.activityEvidence.status;
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
                      <div className="activities-mobile-meta-item"><strong>Tipo:</strong> {a.ticketType || '-'}</div>
                      <div className="activities-mobile-meta-item"><strong>Flujo:</strong> {a.workType === 'PREVENTIVE_INVENTORY' ? 'Inventario/Mantenimiento' : 'Problema'}</div>
                      <div className="activities-mobile-meta-item"><strong>Prioridad:</strong> {a.prioridad}</div>
                      <div className="activities-mobile-meta-item"><strong>Responsable:</strong> {a.responsable?.nombre || '-'}</div>
                      <div className="activities-mobile-meta-item"><strong>Estimado/Max:</strong> {a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0} min</div>
                      <div className="activities-mobile-meta-item"><strong>Inicio:</strong> {formatDateTime(a.fechaInicio)}</div>
                      <div className="activities-mobile-meta-item"><strong>Entrega:</strong> {formatDateTime(a.fechaEntregaEsperada)}</div>
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
                            src={a.activityEvidence.entryPhotoUrl}
                            alt="entrada"
                            className="activities-thumb activities-thumb-mobile"
                          />
                        )}
                        {a.activityEvidence?.exitPhotoUrl && (
                          <img
                            src={a.activityEvidence.exitPhotoUrl}
                            alt="salida"
                            className="activities-thumb activities-thumb-mobile"
                          />
                        )}
                      </div>
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

        <style jsx>{`
          .activities-shell {
            display: grid;
            gap: 16px;
          }

          .activities-hero,
          .activities-main,
          .activities-requests-card,
          .activities-form-card,
          .activities-mobile-card {
            border: 1px solid var(--border);
            background: linear-gradient(165deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 90%, transparent));
            box-shadow: 0 14px 30px -22px color-mix(in srgb, var(--foreground) 34%, transparent), 0 1px 0 color-mix(in srgb, var(--surface) 90%, transparent) inset;
          }

          .activities-hero {
            padding: clamp(16px, 2.2vw, 22px);
            border-radius: 20px;
            position: relative;
            overflow: hidden;
            border-color: color-mix(in srgb, var(--primary) 22%, var(--border));
            background:
              radial-gradient(circle at 94% -10%, color-mix(in srgb, var(--secondary) 14%, transparent), transparent 42%),
              linear-gradient(165deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 91%, transparent));
          }

          .activities-hero::before {
            content: "";
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
            opacity: 0.85;
          }

          .activities-hero-head,
          .activities-requests-head,
          .activities-form-head,
          .activities-actions-row,
          .activities-request-top,
          .activities-mobile-head,
          .activities-pagination {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }

          .activities-title,
          .activities-subtitle {
            margin: 0;
            color: var(--foreground);
            font-family: var(--font-heading);
            letter-spacing: var(--panel-title-tracking);
          }

          .activities-title {
            font-size: clamp(24px, 2.3vw, 31px);
            line-height: 1.15;
            font-weight: 750;
          }

          .activities-subtitle {
            font-size: clamp(17px, 1.15vw, 20px);
            line-height: 1.2;
          }

          .activities-helper,
          .activities-input-label,
          .activities-mobile-meta-item,
          .activities-mobile-notes {
            color: color-mix(in srgb, var(--text-secondary) 96%, var(--foreground));
            font-size: 14px;
            line-height: 1.5;
          }

          .activities-total-pill {
            display: inline-flex;
            align-items: center;
            min-height: 32px;
            padding: 0 13px;
            border-radius: 999px;
            border: 1px solid color-mix(in srgb, var(--primary) 38%, var(--border));
            background: linear-gradient(145deg, color-mix(in srgb, var(--primary) 12%, var(--surface)), color-mix(in srgb, var(--surface-2) 86%, transparent));
            color: var(--foreground);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.01em;
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
            border-radius: 20px;
            border-color: color-mix(in srgb, var(--primary) 18%, var(--border));
            background:
              radial-gradient(circle at -4% 104%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 36%),
              linear-gradient(168deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 90%, transparent));
          }

          .activities-requests-card,
          .activities-form-card {
            display: grid;
            gap: 12px;
            padding: 15px;
            border-radius: 17px;
            min-width: 0;
            position: relative;
            overflow: hidden;
          }

          .activities-requests-card::before,
          .activities-form-card::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            opacity: 0.82;
          }

          .activities-requests-card::before {
            background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 88%, var(--secondary)), color-mix(in srgb, var(--secondary) 76%, var(--primary)));
          }

          .activities-form-card {
            border-color: color-mix(in srgb, var(--primary) 18%, var(--border));
            background:
              radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 44%),
              linear-gradient(165deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--primary) 6%, var(--surface-2)));
          }

          .activities-form-card::before {
            background: linear-gradient(90deg, color-mix(in srgb, var(--secondary) 88%, var(--primary)), color-mix(in srgb, var(--primary) 72%, var(--secondary)));
          }

          .activities-form-head {
            padding-bottom: 10px;
            border-bottom: 1px dashed color-mix(in srgb, var(--border) 74%, transparent);
          }

          .activities-requests-card {
            grid-column: 1;
            align-content: start;
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

          .activities-request-item,
          .activities-mobile-card {
            display: grid;
            gap: 10px;
            padding: 13px;
            border-radius: 14px;
            border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
            background: linear-gradient(150deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-light) 72%, transparent));
            box-shadow: 0 10px 24px -20px color-mix(in srgb, var(--foreground) 34%, transparent);
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

          .activities-map-preview-placeholder {
            border: 1px dashed var(--border);
            border-radius: 16px;
            background: var(--surface-2);
            color: var(--text-secondary);
            font-size: 12px;
            line-height: 1.4;
            padding: 14px;
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
          .activities-form-primary-grid,
          .activities-form-context-grid,
          .activities-filters-row,
          .activities-mobile-meta-grid {
            display: grid;
            gap: 12px;
          }

          .activities-form-primary-grid,
          .activities-form-context-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .activities-form-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .activities-form-grid > * {
            min-width: 0;
          }

          .activities-form-grid > div {
            display: grid;
            gap: 6px;
          }

          .activities-form-primary-grid,
          .activities-form-context-grid {
            padding: 10px;
            border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
            border-radius: 12px;
            background: linear-gradient(160deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 82%, transparent));
          }

          .activities-form-advanced-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 40px;
            padding: 0 14px;
            border-radius: 12px;
            border: 1px dashed color-mix(in srgb, var(--border) 82%, transparent);
            background: color-mix(in srgb, var(--surface-2) 70%, transparent);
            color: var(--text-secondary);
            font-size: 13px;
            font-weight: 700;
          }

          .activities-form-advanced {
            padding: 10px;
            border: 1px dashed color-mix(in srgb, var(--border) 64%, transparent);
            border-radius: 12px;
            background: linear-gradient(160deg, color-mix(in srgb, var(--surface-2) 70%, transparent), color-mix(in srgb, var(--surface) 94%, transparent));
          }

          .activities-textarea {
            min-height: 76px;
            resize: vertical;
            grid-column: span 2;
          }

          .activities-form-grid .input,
          .activities-filters-row .input {
            min-height: 42px;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
            background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 86%, transparent));
            padding: 10px 12px;
            font-size: 14px;
            color: var(--foreground);
            transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
            box-shadow: 0 1px 0 color-mix(in srgb, var(--surface) 92%, transparent) inset;
          }

          .activities-form-grid .input:focus,
          .activities-filters-row .input:focus {
            outline: none;
            border-color: color-mix(in srgb, var(--primary) 58%, var(--border));
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent), 0 8px 14px -12px color-mix(in srgb, var(--primary) 45%, transparent);
            background: color-mix(in srgb, var(--surface) 99%, transparent);
            transform: translateY(-1px);
          }

          .activities-form-grid .input::placeholder {
            color: color-mix(in srgb, var(--text-tertiary) 88%, transparent);
          }

          .activities-form-grid.is-mobile,
          .activities-form-primary-grid.is-mobile,
          .activities-form-context-grid.is-mobile,
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
            justify-content: space-between;
            padding-top: 10px;
            border-top: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
          }

          .activities-form-footer .button-primary {
            min-height: 42px;
            padding: 0 18px;
            border-radius: 12px;
            font-weight: 700;
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
            border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
            border-radius: 16px;
            background: linear-gradient(160deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
            box-shadow: 0 16px 26px -24px color-mix(in srgb, var(--foreground) 44%, transparent);
            -webkit-overflow-scrolling: touch;
          }

          .activities-table-wrap :global(.table) {
            margin: 0;
            min-width: 1200px;
          }

          .activities-table-wrap :global(thead th) {
            background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 16%, var(--surface)), color-mix(in srgb, var(--secondary) 14%, var(--surface-2)));
            color: var(--foreground);
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

          .activities-thumb {
            width: 64px;
            height: 64px;
            object-fit: cover;
            border-radius: 14px;
            border: 1px solid var(--border);
            background: var(--surface-2);
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
            .activities-title {
              font-size: 1.55rem;
            }

            .activities-filters-row,
            .activities-form-grid,
            .activities-form-primary-grid,
            .activities-form-context-grid,
            .activities-mobile-meta-grid {
              grid-template-columns: 1fr;
            }

            .activities-main {
              padding: 14px;
              border-radius: 18px;
            }

            .activities-requests-card,
            .activities-form-card,
            .activities-mobile-card {
              padding: 14px;
              border-radius: 16px;
            }

            .activities-form-head {
              padding-bottom: 8px;
            }

            .activities-form-grid .input,
            .activities-filters-row .input {
              min-height: 44px;
              font-size: 15px;
            }

            .activities-textarea {
              grid-column: span 1;
              min-height: 86px;
            }
          }

          @media (max-width: 560px) {
            .activities-title {
              font-size: 1.4rem;
            }

            .activities-subtitle {
              font-size: 0.98rem;
            }

            .activities-helper,
            .activities-mobile-meta-item,
            .activities-mobile-notes {
              font-size: 13px;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default ActivitiesTable;
    

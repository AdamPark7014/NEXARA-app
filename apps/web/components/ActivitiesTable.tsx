"use client";
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

const ActivitiesTable: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);

  // Filtros y paginación
  const [estatus, setEstatus] = useState<string>('');
  const [responsable, setResponsable] = useState<string>('');
  const [prioridad, setPrioridad] = useState<string>('');
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
    client?: { id: number; name: string; logoUrl?: string | null } | null;
    branchName?: string;
    branchNumber?: string;
    branchCity?: string;
    branchState?: string;
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
      evidencePhotos: string[];
      serviceSheetPdfUrl?: string;
      exitPhotoUrl?: string;
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
  }
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ticketRequests, setTicketRequests] = useState<ClientTicketRequest[]>([]);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

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
    clientId: '',
    ticketType: 'PREVENTIVO',
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

  // Filtrado
  const filtered = activities.filter(a =>
    (estatus ? a.estatus === estatus : true) &&
    (responsable ? a.responsable?.nombre?.toLowerCase().includes(responsable.toLowerCase()) : true) &&
    (prioridad ? a.prioridad === prioridad : true)
  );
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);


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
    fetchTicketRequests();
  }, [user?.token]);

  useEffect(() => {
    fetchAssignableUsers();
    fetchNextAn();
    fetchClients();
    fetchTicketRequests();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

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
    setPendingRequestId(request.id);
    setNewActivity((prev) => ({
      ...prev,
      titulo: request.branchName ? `Ticket ${request.branchName}` : 'Ticket cliente',
      descripcion: request.description || prev.descripcion,
      prioridad: request.urgency === 'HIGH' ? 'Alta' : request.urgency === 'LOW' ? 'Baja' : 'Media',
      clientId: request.client?.id ? String(request.client.id) : prev.clientId,
      branchName: request.branchName || prev.branchName,
      branchNumber: request.branchNumber || prev.branchNumber,
      branchCity: request.city || prev.branchCity,
      branchState: request.state || prev.branchState,
      branchAddress: request.address || prev.branchAddress,
      ticketType: 'CORRECTIVO',
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
      ticketType: newActivity.ticketType,
      clientId: newActivity.clientId ? Number(newActivity.clientId) : undefined,
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
      clientId: '',
      ticketType: 'PREVENTIVO',
      branchName: '',
      branchNumber: '',
      branchCity: '',
      branchState: '',
      branchAddress: '',
    });
    fetchActivities();
    fetchNextAn();
  };

  const shellStyle: React.CSSProperties = {
    display: 'grid',
    gap: 16,
  };

  const heroStyle: React.CSSProperties = {
    display: 'grid',
    gap: 8,
    background: 'linear-gradient(135deg, rgba(15,106,214,0.12) 0%, rgba(22,169,110,0.1) 100%)',
    border: '1px solid rgba(15,106,214,0.18)',
    boxShadow: '0 12px 26px rgba(15,106,214,0.12)',
  };

  const mainCardStyle: React.CSSProperties = {
    display: 'grid',
    gap: 16,
  };

  const formCardStyle: React.CSSProperties = {
    background: 'linear-gradient(140deg, rgba(31,137,252,0.22), rgba(20,162,133,0.18)), var(--surface)',
    border: '1px solid rgba(31,137,252,0.22)',
    borderRadius: 16,
    padding: 18,
    display: 'grid',
    gap: 12,
    boxShadow: '0 14px 24px rgba(15,106,214,0.16)',
  };

  const helperTextStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: 12,
  };

  const formGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  };

  const formFooterStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  };

  const toolbarStyle: React.CSSProperties = {
    display: 'grid',
    gap: 12,
  };

  const filtersRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 12,
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const tableWrapStyle: React.CSSProperties = {
    borderRadius: 16,
    border: '1px solid var(--muted)',
    overflow: 'auto',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    background: 'var(--surface)',
  };

  const paginationStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  };

  const mobileCardListStyle: React.CSSProperties = {
    display: 'grid',
    gap: 14,
    padding: '16px 12px',
    boxSizing: 'border-box',
  };

  const mobileCardStyle: React.CSSProperties = {
    border: '1px solid rgba(31,137,252,0.18)',
    borderRadius: 14,
    padding: '14px 12px',
    background: 'linear-gradient(140deg, rgba(31,137,252,0.06), rgba(20,162,133,0.05)), var(--surface)',
    boxShadow: '0 8px 18px rgba(15,106,214,0.1)',
    display: 'grid',
    gap: 10,
    boxSizing: 'border-box',
    width: '100%',
    minWidth: 0,
  };

  const mobileMetaGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isSmallMobile ? '1fr' : '1fr 1fr',
    gap: 8,
    width: '100%',
    minWidth: 0,
  };

  const mobileMetaItemStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 10,
    background: 'rgba(31,137,252,0.08)',
    border: '1px solid rgba(31,137,252,0.12)',
    fontSize: 12,
    minWidth: 0,
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  };

  const mobileActionGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
  };

  if (loading) {
    return (
      <div className="card" style={heroStyle}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 4 }}>Actividades</h2>
        <div style={helperTextStyle}>Cargando actividades...</div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div className="card" style={heroStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: 'var(--primary)', marginBottom: 4 }}>Actividades</h2>
            <div style={helperTextStyle}>Gestiona actividades, prioridades y asignaciones del equipo.</div>
          </div>
          <div style={helperTextStyle}>Total visibles: {filtered.length}</div>
        </div>
      </div>

      <div className="card" style={mainCardStyle}>
        {hasPermission(user, PERMISSIONS.CONSOLE_ADMIN) && (
          <div className="card" style={{ display: 'grid', gap: 12, border: '1px solid rgba(31,107,186,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h3 style={{ marginBottom: 4 }}>Tickets levantados por clientes</h3>
                <div style={helperTextStyle}>Solicitudes nuevas para asignar al equipo.</div>
              </div>
              <div style={helperTextStyle}>Pendientes: {ticketRequests.filter((req) => req.status === 'NEW').length}</div>
            </div>
            {ticketRequests.length === 0 && (
              <div style={helperTextStyle}>No hay solicitudes por el momento.</div>
            )}
            <div style={{ display: 'grid', gap: 10 }}>
              {ticketRequests.map((request) => (
                <div key={request.id} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1px solid rgba(15,106,214,0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>
                      {request.client?.name || 'Cliente'} · {request.branchName || 'Sucursal'}
                    </div>
                    <span className="badge">{request.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{request.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Urgencia: {request.urgency} · Limite: {formatDateTime(request.dueAt || undefined)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {request.address || '-'} {request.city || ''} {request.state || ''}
                  </div>
                  {request.latitud && request.longitud && (
                    <iframe
                      title={`map-${request.id}`}
                      src={`https://maps.google.com/maps?q=${request.latitud},${request.longitud}&z=15&output=embed`}
                      width="100%"
                      height="160"
                      style={{ border: 0, borderRadius: 12 }}
                      loading="lazy"
                    />
                  )}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <div style={formCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h3 style={{ marginBottom: 4 }}>Asignar actividad</h3>
                <div style={helperTextStyle}>Completa los campos clave para crear la actividad.</div>
              </div>
              <div style={helperTextStyle}>AN sugerido: {nextAn || 'Calculando...'}</div>
            </div>
            <div style={formGridStyle}>
              <input className="input" placeholder="AN (auto)" value={nextAn || 'Calculando...'} disabled />
              <input className="input" placeholder="Titulo" value={newActivity.titulo} onChange={(e) => setNewActivity({ ...newActivity, titulo: e.target.value })} />
              <select className="input" value={newActivity.ticketType} onChange={(e) => setNewActivity({ ...newActivity, ticketType: e.target.value })}>
                <option value="PREVENTIVO">Preventivo</option>
                <option value="CORRECTIVO">Correctivo</option>
                <option value="EMERGENCIA">Emergencia</option>
                <option value="INSTALACION">Instalacion</option>
                <option value="OTRO">Otro</option>
              </select>
              <select className="input" value={newActivity.responsableId} onChange={(e) => setNewActivity({ ...newActivity, responsableId: e.target.value })}>
                <option value="">Responsable</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} {u.role?.nombre ? `(${u.role?.nombre})` : ''}
                  </option>
                ))}
              </select>
              <select className="input" value={newActivity.clientId} onChange={(e) => setNewActivity({ ...newActivity, clientId: e.target.value })}>
                <option value="">Actividad interna (sin cliente)</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
              <select className="input" value={newActivity.prioridad} onChange={(e) => setNewActivity({ ...newActivity, prioridad: e.target.value })}>
                {prioridadList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="input" value={newActivity.estatus} onChange={(e) => setNewActivity({ ...newActivity, estatus: e.target.value })}>
                {estatusList.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className="input" placeholder="Sucursal" value={newActivity.branchName} onChange={(e) => setNewActivity({ ...newActivity, branchName: e.target.value })} />
              <input className="input" placeholder="Numero sucursal" value={newActivity.branchNumber} onChange={(e) => setNewActivity({ ...newActivity, branchNumber: e.target.value })} />
              <input className="input" placeholder="Ciudad" value={newActivity.branchCity} onChange={(e) => setNewActivity({ ...newActivity, branchCity: e.target.value })} />
              <input className="input" placeholder="Estado" value={newActivity.branchState} onChange={(e) => setNewActivity({ ...newActivity, branchState: e.target.value })} />
              <input className="input" placeholder="Direccion sucursal" value={newActivity.branchAddress} onChange={(e) => setNewActivity({ ...newActivity, branchAddress: e.target.value })} />
              <input className="input" type="number" placeholder="Tiempo estimado (min)" value={newActivity.tiempoEstimadoMin} onChange={(e) => setNewActivity({ ...newActivity, tiempoEstimadoMin: e.target.value })} />
              <input className="input" type="number" placeholder="Tiempo maximo (min)" value={newActivity.tiempoMaximoMin} onChange={(e) => setNewActivity({ ...newActivity, tiempoMaximoMin: e.target.value })} />
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>Fecha inicio</label>
                <input className="input" type="datetime-local" value={newActivity.fechaInicio} onChange={(e) => setNewActivity({ ...newActivity, fechaInicio: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>Fecha maxima</label>
                <input className="input" type="datetime-local" value={newActivity.fechaMaxima} onChange={(e) => setNewActivity({ ...newActivity, fechaMaxima: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>Entrega esperada</label>
                <input className="input" type="datetime-local" value={newActivity.fechaEntregaEsperada} onChange={(e) => setNewActivity({ ...newActivity, fechaEntregaEsperada: e.target.value })} />
              </div>
              <input className="input" placeholder="Descripcion" value={newActivity.descripcion} onChange={(e) => setNewActivity({ ...newActivity, descripcion: e.target.value })} />
              <input className="input" placeholder="Indicaciones" value={newActivity.indicaciones} onChange={(e) => setNewActivity({ ...newActivity, indicaciones: e.target.value })} />
            </div>
            <div style={formFooterStyle}>
              <button className="button-primary" onClick={handleAssign}>Asignar</button>
              {formError && <span style={{ color: 'var(--danger)' }}>{formError}</span>}
              {formSuccess && <span style={{ color: 'var(--accent)' }}>{formSuccess}</span>}
            </div>
          </div>
        )}

        <div style={toolbarStyle}>
          <div style={filtersRowStyle}>
            <select className="input" value={estatus} onChange={e => setEstatus(e.target.value)}>
              <option value="">Todos los estatus</option>
              {estatusList.map((e: string) => <option key={e} value={e}>{e}</option>)}
            </select>
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
          <div style={actionRowStyle}>
            <div style={helperTextStyle}>{importMsg && <span style={{ color: importMsg.startsWith('Error') ? 'var(--danger)' : 'var(--accent)' }}>{importMsg}</span>}</div>
            {hasPermission(user, PERMISSIONS.ACTIVITIES_EXPORT) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="button-secondary"
                  onClick={async () => {
                    const res = await fetch(buildApiUrl('export/activity'));
                    if (!res.ok) return alert('Error al exportar');
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'actividades.xlsx';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                  }}
                >
                  Exportar Excel
                </button>
                <button className="button-primary" onClick={() => fileInputRef.current?.click()}>Importar Excel</button>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleImport}
                />
              </div>
            )}
          </div>
        </div>

        <div style={tableWrapStyle}>
          {!isMobile && (
            <table className="table">
              <thead>
                <tr>
                  <th>AN</th>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Sucursal</th>
                  <th>Tipo</th>
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
                      <td><span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>{a.estatus}</span></td>
                      <td>{a.responsable?.nombre}</td>
                      <td>{a.prioridad}</td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: 4,
                          backgroundColor: a.activityEvidence?.status === 'COMPLETED' ? '#efe' : '#fef',
                          color: a.activityEvidence?.status === 'COMPLETED' ? '#060' : '#f90',
                          fontSize: 12,
                          fontWeight: 500,
                        }}>
                          {getEvidenceStatus(a)}
                        </span>
                      </td>
                      <td>{formatDateTime(a.fechaInicio)}</td>
                      <td>{formatDateTime(a.fechaEntregaEsperada)}</td>
                      <td>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0}</td>
                      <td>{a.indicaciones || '-'}</td>
                      {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            <div style={mobileCardListStyle}>
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
                  <article key={a.id} style={mobileCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
                      <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-word' }}>AN {a.anNumber}</div>
                        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{a.titulo}</div>
                      </div>
                      <span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`} style={{ flexShrink: 0 }}>{a.estatus}</span>
                    </div>

                    <div style={mobileMetaGridStyle}>
                      <div style={mobileMetaItemStyle}><strong>Cliente:</strong> {a.client?.name || 'Interna'}</div>
                      <div style={mobileMetaItemStyle}><strong>Sucursal:</strong> {a.branchName || '-'}</div>
                      <div style={mobileMetaItemStyle}><strong>Tipo:</strong> {a.ticketType || '-'}</div>
                      <div style={mobileMetaItemStyle}><strong>Prioridad:</strong> {a.prioridad}</div>
                      <div style={mobileMetaItemStyle}><strong>Responsable:</strong> {a.responsable?.nombre || '-'}</div>
                      <div style={mobileMetaItemStyle}><strong>Estimado/Max:</strong> {a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0} min</div>
                      <div style={mobileMetaItemStyle}><strong>Inicio:</strong> {formatDateTime(a.fechaInicio)}</div>
                      <div style={mobileMetaItemStyle}><strong>Entrega:</strong> {formatDateTime(a.fechaEntregaEsperada)}</div>
                    </div>

                    <div style={{ fontSize: 12 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '6px 10px',
                        borderRadius: 8,
                        backgroundColor: a.activityEvidence?.status === 'COMPLETED' ? '#efe' : '#fef',
                        color: a.activityEvidence?.status === 'COMPLETED' ? '#060' : '#f90',
                        fontWeight: 600,
                      }}>
                        Evidencias: {getEvidenceStatus(a)}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>
                      <strong>Indicaciones:</strong> {a.indicaciones || '-'}
                    </div>

                    {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
                      <div style={mobileActionGridStyle}>
                        <button className="button-secondary" style={{ minHeight: 46, borderRadius: 10, fontWeight: 700 }}>Editar</button>
                        <button className="button-primary" style={{ minHeight: 46, borderRadius: 10, fontWeight: 700 }}>Borrar</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div style={paginationStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'auto auto', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <button className="button-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ minHeight: isMobile ? 46 : undefined, fontWeight: 700 }}>Anterior</button>
            <button className="button-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} style={{ minHeight: isMobile ? 46 : undefined, fontWeight: 700 }}>Siguiente</button>
          </div>
          <span style={helperTextStyle}>Página {page} de {totalPages || 1}</span>
        </div>
      </div>
    </div>
  );
};

export default ActivitiesTable;
    
"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { RoleGuard } from '@/components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';
import { useUser } from '@/components/UserContext';

type Client = {
  id: number;
  name: string;
  logoUrl?: string | null;
  contactName?: string | null;
  reportUrl?: string | null;
  reportGeneratedAt?: string | null;
};

type Evidence = {
  id: number;
  archivoUrl: string;
  tipoEvidencia: string;
  calificacionEficiencia?: string | null;
  latitud?: number | null;
  longitud?: number | null;
};

type Activity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  prioridad?: string | null;
  ticketType?: string | null;
  fechaAsignacion?: string | null;
  fechaInicio?: string | null;
  fechaFinalizacion?: string | null;
  branchName?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  client?: { id: number; name: string; logoUrl?: string | null } | null;
  responsable?: { nombre: string } | null;
  evidencias?: Evidence[];
  serviceSheet?: { pdfUrl?: string | null } | null;
  clientFeedback?: {
    rating?: number | null;
    wasOnTime?: boolean | null;
    wasFriendly?: boolean | null;
    wasSolved?: boolean | null;
    comments?: string | null;
    createdAt?: string | null;
  } | null;
};

const formatDateTime = (value?: string | null) => {
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

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start || !end) return '-';
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '-';
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours} h ${mins} min`;
};

const getEfficiency = (evidences?: Evidence[]) => {
  if (!evidences || evidences.length === 0) return '-';
  const scored = evidences
    .map((evidence) => evidence.calificacionEficiencia)
    .filter((value): value is string => Boolean(value));
  return scored.length ? scored[scored.length - 1] : '-';
};

const formatAnswer = (value?: boolean | null) => {
  if (value === true) return 'Si';
  if (value === false) return 'No';
  return '-';
};

const getMapsUrl = (lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return '';
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

export default function ClientTicketsPage() {
  const { user } = useUser();
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [expandedEvidences, setExpandedEvidences] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'with' | 'without'>('all');

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = API_URL.replace(/\/+api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const fetchData = async () => {
    if (!user?.token) return;
    setLoading(true);
    const [clientsRes, activitiesRes] = await Promise.all([
      fetch(buildApiUrl('service-clients'), { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(buildApiUrl('activities/detailed'), { headers: { Authorization: `Bearer ${user.token}` } }),
    ]);

    const clientsData = clientsRes.ok ? await clientsRes.json() : [];
    const activitiesData = activitiesRes.ok ? await activitiesRes.json() : [];

    setClients(Array.isArray(clientsData) ? clientsData : []);
    setActivities(Array.isArray(activitiesData) ? activitiesData : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user?.token]);

  const grouped = useMemo(() => {
    const map = new Map<number, Activity[]>();
    activities.forEach((activity) => {
      const clientId = activity.client?.id;
      if (!clientId) return;
      if (!map.has(clientId)) map.set(clientId, []);
      map.get(clientId)?.push(activity);
    });
    return map;
  }, [activities]);

  const handleReportDownload = async (clientId: number) => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl(`service-clients/${clientId}/report`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-cliente-${clientId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTicketReportDownload = async (activityId: number) => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl(`activities/${activityId}/report`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-ticket-${activityId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
        <div className="card">Cargando tickets por cliente...</div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--primary)' }}>Gestión de tickets por cliente</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Visualiza estatus, evidencias y tiempos de atención por cuenta.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Filtro encuesta</label>
            <select className="input" value={feedbackFilter} onChange={(e) => setFeedbackFilter(e.target.value as typeof feedbackFilter)}>
              <option value="all">Todas</option>
              <option value="with">Con encuesta</option>
              <option value="without">Sin encuesta</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {clients.map((client) => {
            const clientActivities = grouped.get(client.id) || [];
            const filteredActivities = clientActivities.filter((activity) => {
              if (feedbackFilter === 'with') return Boolean(activity.clientFeedback);
              if (feedbackFilter === 'without') return !activity.clientFeedback;
              return true;
            });
            const closed = clientActivities.filter((activity) => activity.estatus === 'Finalizada');
            const avgDuration = closed.length
              ? Math.round(
                  closed.reduce((acc, activity) => {
                    const start = activity.fechaInicio || activity.fechaAsignacion;
                    const end = activity.fechaFinalizacion;
                    if (!start || !end) return acc;
                    return acc + (new Date(end).getTime() - new Date(start).getTime()) / 60000;
                  }, 0) / closed.length,
                )
              : 0;
            const ratingValues = clientActivities
              .map((activity) => activity.clientFeedback?.rating)
              .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
            const avgRating = ratingValues.length
              ? Math.round((ratingValues.reduce((acc, value) => acc + value, 0) / ratingValues.length) * 10) / 10
              : null;

            return (
              <div key={client.id} className="card" style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {client.logoUrl && (
                      <img src={getAssetUrl(client.logoUrl)} alt={client.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 700 }}>{client.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{client.contactName || 'Sin contacto'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="badge">Tickets: {clientActivities.length}</span>
                    <span className="badge">Mostrando: {filteredActivities.length}</span>
                    <span className="badge">Finalizados: {closed.length}</span>
                    <span className="badge">Promedio: {avgDuration ? `${avgDuration} min` : '-'}</span>
                    <span className="badge">Calificación prom: {avgRating ?? '-'}</span>
                    <button className="button-secondary" onClick={() => handleReportDownload(client.id)}>Generar reporte PDF</button>
                    <button className="button-primary" onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}>
                      {expandedClient === client.id ? 'Ocultar' : 'Ver tickets'}
                    </button>
                  </div>
                </div>

                {expandedClient === client.id && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {filteredActivities.length === 0 && (
                      <div style={{ color: 'var(--text-secondary)' }}>No hay tickets registrados.</div>
                    )}
                    {filteredActivities.map((activity) => (
                      <div key={activity.id} style={{ border: '1px solid rgba(15,106,214,0.18)', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{activity.anNumber} · {activity.titulo}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {activity.branchName || '-'} · {activity.branchCity || '-'} {activity.branchState || ''}
                            </div>
                          </div>
                          <span className="badge">{activity.estatus}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                          <div>Tipo: {activity.ticketType || '-'}</div>
                          <div>Prioridad: {activity.prioridad || '-'}</div>
                          <div>Eficiencia: {getEfficiency(activity.evidencias)}</div>
                          <div>Atendio: {activity.responsable?.nombre || '-'}</div>
                          <div>Inicio: {formatDateTime(activity.fechaInicio)}</div>
                          <div>Cierre: {formatDateTime(activity.fechaFinalizacion)}</div>
                          <div>Duración: {formatDuration(activity.fechaInicio || activity.fechaAsignacion, activity.fechaFinalizacion)}</div>
                        </div>
                        {activity.clientFeedback && (
                          <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 12, border: '1px solid rgba(15,106,214,0.14)', background: 'rgba(15,106,214,0.05)' }}>
                            <div style={{ fontWeight: 600 }}>Encuesta del cliente</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              Calificación: {activity.clientFeedback.rating ?? '-'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              Llego a tiempo: {formatAnswer(activity.clientFeedback.wasOnTime)} · Atención amable: {formatAnswer(activity.clientFeedback.wasFriendly)} · Problema resuelto: {formatAnswer(activity.clientFeedback.wasSolved)}
                            </div>
                            {activity.clientFeedback.comments && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Comentarios: {activity.clientFeedback.comments}</div>
                            )}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {activity.serviceSheet?.pdfUrl && (
                            <a className="button-secondary" href={getAssetUrl(activity.serviceSheet.pdfUrl)} target="_blank" rel="noreferrer">
                              Ver hoja de servicio
                            </a>
                          )}
                          <button className="button-secondary" type="button" onClick={() => handleTicketReportDownload(activity.id)}>
                            Reporte del ticket
                          </button>
                          <button
                            className="button-primary"
                            type="button"
                            onClick={() =>
                              setExpandedEvidences((prev) => ({
                                ...prev,
                                [activity.id]: !prev[activity.id],
                              }))
                            }
                          >
                            {expandedEvidences[activity.id] ? 'Ocultar evidencias' : 'Ver evidencias'}
                          </button>
                        </div>
                        {expandedEvidences[activity.id] && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                            {(activity.evidencias || []).map((evidence) => (
                              <div key={evidence.id} style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden', background: '#fff' }}>
                                {evidence.archivoUrl.toLowerCase().endsWith('.pdf') ? (
                                  <object data={getAssetUrl(evidence.archivoUrl)} type="application/pdf" width="100%" height="160">
                                    <embed src={getAssetUrl(evidence.archivoUrl)} type="application/pdf" />
                                  </object>
                                ) : (
                                  <img src={getAssetUrl(evidence.archivoUrl)} alt={evidence.tipoEvidencia} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                                )}
                                <div style={{ padding: 8, fontSize: 12 }}>{evidence.tipoEvidencia}</div>
                                {evidence.latitud && evidence.longitud && (
                                  <div style={{ padding: '0 8px 8px', fontSize: 12 }}>
                                    <a href={getMapsUrl(evidence.latitud, evidence.longitud)} target="_blank" rel="noreferrer">Ver ubicación</a>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </RoleGuard>
  );
}



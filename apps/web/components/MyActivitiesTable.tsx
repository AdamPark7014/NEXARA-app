"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import EvidenceReviewModal from './EvidenceReviewModal';

interface Activity {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  prioridad: string;
  ticketType?: string;
  client?: { id: number; name: string } | null;
  branchName?: string;
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
  creador?: { nombre: string };
  activityEvidence?: {
    id: number;
    status: string;
    reviewStatus?: string;  // PENDING, APPROVED, REJECTED
    rejectedStep?: string;
    reviewNotes?: string;
    entryPhotoUrl?: string;
    evidencePhotos: string[];
    serviceSheetPdfUrl?: string;
    exitPhotoUrl?: string;
    completedAt?: string;
  } | null;
}

const MyActivitiesTable: React.FC = () => {
  const { user } = useUser();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{ activityId: number; activityNumber: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const isAdmin = user?.permissions?.includes('CONSOLE_ADMIN') || false;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

  const fetchActivities = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchActivities();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'Activity') {
        fetchActivities();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

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

  const getMapsUrl = (activity: Activity) => {
    const query = [activity.branchAddress, activity.branchCity, activity.branchState].filter(Boolean).join(', ');
    if (!query) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
  };

  const getEvidenceStatus = (activity: Activity) => {
    if (!activity.activityEvidence) return 'Sin iniciar';
    
    const evidence = activity.activityEvidence;
    const status = evidence.status;
    
    // Si está rechazado, mostrar el paso rechazado
    if (evidence.reviewStatus === 'REJECTED' && evidence.rejectedStep) {
      const stepNames: Record<string, string> = {
        'ENTRY_PHOTO': '❌ Rechazado: Foto Entrada',
        'EVIDENCE_PHOTOS': '❌ Rechazado: Evidencias',
        'SERVICE_SHEET_PDF': '❌ Rechazado: PDF',
        'SERVICE_SHEET_DATA': '❌ Rechazado: Plantilla',
        'EXIT_PHOTO': '❌ Rechazado: Foto Salida',
      };
      return stepNames[evidence.rejectedStep] || '❌ Rechazado';
    }
    
    // Si está aprobado
    if (evidence.reviewStatus === 'APPROVED') {
      return '✅ Aprobado';
    }
    
    // Estados normales del flujo
    const statusMap: Record<string, string> = {
      'ENTRY_PHOTO': '📸 Entrada',
      'EVIDENCE_PHOTOS': '📷 Evidencias',
      'SERVICE_SHEET_PDF': '📄 PDF',
      'SERVICE_SHEET_DATA': '📝 Plantilla',
      'EXIT_PHOTO': '🚪 Salida',
      'COMPLETED': '✅ Completado - En revisión',
    };
    return statusMap[status] || status;
  };

  const getReviewStatusColor = (evidence: Activity['activityEvidence']) => {
    if (!evidence) return { bg: '#fef', color: '#f90' };
    
    if (evidence.reviewStatus === 'APPROVED') {
      return { bg: '#d1fae5', color: '#047857' };
    }
    
    if (evidence.reviewStatus === 'REJECTED') {
      return { bg: '#fee2e2', color: '#dc2626' };
    }
    
    if (evidence.status === 'COMPLETED') {
      return { bg: '#fef3c7', color: '#d97706' }; // Amarillo para "en revisión"
    }
    
    return { bg: '#e0f2fe', color: '#0369a1' }; // Azul para en progreso
  };

  if (loading) return <div>Cargando actividades...</div>;

  return (
    <>
      <div className="card">
        <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis Actividades</h2>
        
        {/* Vista Desktop - Tabla */}
        {!isMobile && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>AN</th>
                  <th>Titulo</th>
                  <th>Cliente</th>
                  <th>Sucursal</th>
                  <th>Tipo</th>
                  <th>Estatus</th>
                  <th>Prioridad</th>
                  <th>Evidencias</th>
                  {isAdmin && <th>Acciones</th>}
                  {!isAdmin && <th>Corrección</th>}
                  <th>Inicio</th>
                  <th>Entrega</th>
                  <th>Estimado/Max</th>
                  <th>Indicaciones</th>
                  <th>Mapa</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => {
                  const colors = getReviewStatusColor(a.activityEvidence);
                  const canReview = isAdmin && a.activityEvidence?.status === 'COMPLETED' && a.activityEvidence?.reviewStatus === 'PENDING';
                  const needsCorrection = !isAdmin && a.activityEvidence?.reviewStatus === 'REJECTED';

                  return (
                    <tr key={a.id}>
                      <td>{a.anNumber}</td>
                      <td>{a.titulo}</td>
                      <td>{a.client?.name || 'Interna'}</td>
                      <td>{[a.branchName, a.branchCity, a.branchState].filter(Boolean).join(', ') || '-'}</td>
                      <td>{a.ticketType || '-'}</td>
                      <td><span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>{a.estatus}</span></td>
                      <td>{a.prioridad}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: 4,
                            backgroundColor: colors.bg,
                            color: colors.color,
                            fontSize: 12,
                            fontWeight: 500,
                          }}>
                            {getEvidenceStatus(a)}
                          </span>
                          {a.activityEvidence?.reviewNotes && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              {a.activityEvidence.reviewNotes.substring(0, 50)}{a.activityEvidence.reviewNotes.length > 50 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {isAdmin && (
                        <td>
                          {canReview ? (
                            <button
                              className="button-primary"
                              onClick={() => setReviewModal({ activityId: a.id, activityNumber: a.anNumber })}
                              style={{
                                padding: '6px 12px',
                                fontSize: 13,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              📋 Revisar
                            </button>
                          ) : a.activityEvidence?.reviewStatus === 'APPROVED' ? (
                            <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>✅ Aprobada</span>
                          ) : a.activityEvidence?.reviewStatus === 'REJECTED' ? (
                            <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>❌ Rechazada</span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>-</span>
                          )}
                        </td>
                      )}
                      
                      {!isAdmin && (
                        <td>
                          {needsCorrection ? (
                            <a
                              href="/my-evidences"
                              className="button-primary"
                              style={{
                                padding: '6px 12px',
                                fontSize: 13,
                                backgroundColor: '#ef4444',
                                textDecoration: 'none',
                                display: 'inline-block',
                              }}
                            >
                              🔧 Corregir
                            </a>
                          ) : a.activityEvidence?.reviewStatus === 'APPROVED' ? (
                            <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>✅ Aprobada</span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>-</span>
                          )}
                        </td>
                      )}
                      
                      <td>{formatDateTime(a.fechaInicio)}</td>
                      <td>{formatDateTime(a.fechaEntregaEsperada)}</td>
                      <td>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0}</td>
                      <td>{a.indicaciones || '-'}</td>
                      <td>
                        {getMapsUrl(a) ? (
                          <a href={getMapsUrl(a)} target="_blank" rel="noreferrer">Como llegar</a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Vista Móvil - Cards */}
        {isMobile && (
          <div style={{ display: 'grid', gap: 16 }}>
            {activities.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No tienes actividades asignadas
              </div>
            ) : (
              activities.map((a) => {
                const colors = getReviewStatusColor(a.activityEvidence);
                const canReview = isAdmin && a.activityEvidence?.status === 'COMPLETED' && a.activityEvidence?.reviewStatus === 'PENDING';
                const needsCorrection = !isAdmin && a.activityEvidence?.reviewStatus === 'REJECTED';

                return (
                  <div 
                    key={a.id} 
                    style={{ 
                      padding: 16, 
                      borderRadius: 12, 
                      background: 'var(--surface-light)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      gap: 12
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--primary)', marginBottom: 4 }}>
                          {a.anNumber}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          {a.titulo}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {a.client?.name || 'Interna'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        <span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>
                          {a.estatus}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Prioridad: {a.prioridad}
                        </span>
                      </div>
                    </div>

                    {/* Evidencias Status */}
                    <div style={{ 
                      padding: 10, 
                      borderRadius: 8, 
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.color}30`
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: colors.color, marginBottom: 4 }}>
                        {getEvidenceStatus(a)}
                      </div>
                      {a.activityEvidence?.reviewNotes && (
                        <div style={{ fontSize: 11, color: colors.color, fontStyle: 'italic', opacity: 0.8 }}>
                          {a.activityEvidence.reviewNotes}
                        </div>
                      )}
                    </div>

                    {/* Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Sucursal</div>
                        <div style={{ fontWeight: 500 }}>{[a.branchName, a.branchCity].filter(Boolean).join(', ') || '-'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Tipo</div>
                        <div style={{ fontWeight: 500 }}>{a.ticketType || '-'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Inicio</div>
                        <div style={{ fontWeight: 500 }}>{formatDateTime(a.fechaInicio)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Entrega</div>
                        <div style={{ fontWeight: 500 }}>{formatDateTime(a.fechaEntregaEsperada)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>Tiempo Est/Max</div>
                        <div style={{ fontWeight: 500 }}>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0} min</div>
                      </div>
                    </div>

                    {/* Indicaciones */}
                    {a.indicaciones && (
                      <div style={{ 
                        padding: 10, 
                        borderRadius: 8, 
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        fontSize: 12
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Indicaciones</div>
                        <div>{a.indicaciones}</div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {getMapsUrl(a) && (
                        <a 
                          href={getMapsUrl(a)} 
                          target="_blank" 
                          rel="noreferrer"
                          className="button-secondary"
                          style={{ 
                            flex: 1,
                            minWidth: 140,
                            padding: '10px 16px',
                            textDecoration: 'none',
                            textAlign: 'center',
                            fontSize: 13
                          }}
                        >
                          📍 Cómo llegar
                        </a>
                      )}
                      
                      {isAdmin && canReview && (
                        <button
                          className="button-primary"
                          onClick={() => setReviewModal({ activityId: a.id, activityNumber: a.anNumber })}
                          style={{
                            flex: 1,
                            minWidth: 140,
                            padding: '10px 16px',
                            fontSize: 13
                          }}
                        >
                          📋 Revisar
                        </button>
                      )}
                      
                      {!isAdmin && needsCorrection && (
                        <a
                          href="/my-evidences"
                          className="button-primary"
                          style={{
                            flex: 1,
                            minWidth: 140,
                            padding: '10px 16px',
                            backgroundColor: '#ef4444',
                            textDecoration: 'none',
                            textAlign: 'center',
                            fontSize: 13
                          }}
                        >
                          🔧 Corregir
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modal de Revisión */}
      {reviewModal && (
        <EvidenceReviewModal
          activityId={reviewModal.activityId}
          activityNumber={reviewModal.activityNumber}
          onClose={() => setReviewModal(null)}
          onSuccess={() => {
            setReviewModal(null);
            fetchActivities();
          }}
        />
      )}
    </>
  );
};

export default MyActivitiesTable;

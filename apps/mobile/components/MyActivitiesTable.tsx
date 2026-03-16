"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import EvidenceReviewModal from './EvidenceReviewModal';
import styles from './MyActivitiesTable.module.css';

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
  const MOBILE_BREAKPOINT = 1024;

  const isAdmin = user?.permissions?.includes('CONSOLE_ADMIN') || false;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [MOBILE_BREAKPOINT]);

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
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });

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

  const getEvidenceClassName = (evidence: Activity['activityEvidence']) => {
    if (!evidence) return styles.evidenceProgress;
    if (evidence.reviewStatus === 'APPROVED') return styles.evidenceApproved;
    if (evidence.reviewStatus === 'REJECTED') return styles.evidenceRejected;
    if (evidence.status === 'COMPLETED') return styles.evidenceCompleted;
    return styles.evidenceProgress;
  };

  const getMobileEvidenceClassName = (evidence: Activity['activityEvidence']) => {
    if (!evidence) return styles.mobileEvidenceProgress;
    if (evidence.reviewStatus === 'APPROVED') return styles.mobileEvidenceApproved;
    if (evidence.reviewStatus === 'REJECTED') return styles.mobileEvidenceRejected;
    if (evidence.status === 'COMPLETED') return styles.mobileEvidenceCompleted;
    return styles.mobileEvidenceProgress;
  };

  const getMobileEvidenceTitleClassName = (evidence: Activity['activityEvidence']) => {
    if (!evidence) return styles.mobileEvidenceTitleProgress;
    if (evidence.reviewStatus === 'APPROVED') return styles.mobileEvidenceTitleApproved;
    if (evidence.reviewStatus === 'REJECTED') return styles.mobileEvidenceTitleRejected;
    if (evidence.status === 'COMPLETED') return styles.mobileEvidenceTitleCompleted;
    return styles.mobileEvidenceTitleProgress;
  };

  if (loading) return <div>Cargando actividades...</div>;

  return (
    <>
      <div className="card">
        <h2 className={styles.title}>Mis Actividades</h2>
        
        {/* Vista Desktop - Tabla */}
        {!isMobile && (
          <div className={styles.tableWrap}>
            <table className={`table ${styles.tableMin}`}>
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
                        <div className={styles.evidenceCol}>
                          <span className={`${styles.evidenceBadge} ${getEvidenceClassName(a.activityEvidence)}`}>
                            {getEvidenceStatus(a)}
                          </span>
                          {a.activityEvidence?.reviewNotes && (
                            <span className={styles.reviewNotePreview}>
                              {a.activityEvidence.reviewNotes.substring(0, 50)}{a.activityEvidence.reviewNotes.length > 50 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {isAdmin && (
                        <td>
                          {canReview ? (
                            <button
                              onClick={() => setReviewModal({ activityId: a.id, activityNumber: a.anNumber })}
                              className={`button-primary ${styles.smallActionBtn}`}
                            >
                              📋 Revisar
                            </button>
                          ) : a.activityEvidence?.reviewStatus === 'APPROVED' ? (
                            <span className={styles.approvedText}>✅ Aprobada</span>
                          ) : a.activityEvidence?.reviewStatus === 'REJECTED' ? (
                            <span className={styles.rejectedText}>❌ Rechazada</span>
                          ) : (
                            <span className={styles.mutedSmall}>-</span>
                          )}
                        </td>
                      )}
                      
                      {!isAdmin && (
                        <td>
                          {needsCorrection ? (
                            <a
                              href="/my-evidences"
                              className={`button-primary ${styles.smallActionBtn}`}
                            >
                              🔧 Corregir
                            </a>
                          ) : a.activityEvidence?.reviewStatus === 'APPROVED' ? (
                            <span className={styles.approvedText}>✅ Aprobada</span>
                          ) : (
                            <span className={styles.mutedSmall}>-</span>
                          )}
                        </td>
                      )}
                      
                      <td>{formatDateTime(a.fechaInicio)}</td>
                      <td>{formatDateTime(a.fechaEntregaEsperada)}</td>
                      <td>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0}</td>
                      <td>{a.indicaciones || '-'}</td>
                      <td>
                        {getMapsUrl(a) ? (
                          <a href={getMapsUrl(a)} target="_blank" rel="noreferrer">Cómo llegar</a>
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
          <div className={styles.mobileList}>
            {activities.length === 0 ? (
              <div className={styles.mobileEmpty}>
                No tienes actividades asignadas
              </div>
            ) : (
              activities.map((a) => {
                const colors = getReviewStatusColor(a.activityEvidence);
                const canReview = isAdmin && a.activityEvidence?.status === 'COMPLETED' && a.activityEvidence?.reviewStatus === 'PENDING';
                const needsCorrection = !isAdmin && a.activityEvidence?.reviewStatus === 'REJECTED';

                return (
                  <div key={a.id} className={styles.mobileCard}>
                    {/* Header */}
                    <div className={styles.mobileHeader}>
                      <div className={styles.mobileHeaderMain}>
                        <div className={styles.mobileAn}>
                          {a.anNumber}
                        </div>
                        <div className={styles.mobileTitle}>
                          {a.titulo}
                        </div>
                        <div className={styles.mobileClient}>
                          {a.client?.name || 'Interna'}
                        </div>
                      </div>
                      <div className={styles.mobileHeaderAside}>
                        <span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>
                          {a.estatus}
                        </span>
                        <span className={styles.mobilePriority}>
                          Prioridad: {a.prioridad}
                        </span>
                      </div>
                    </div>

                    {/* Evidencias Status */}
                    <div className={`${styles.mobileEvidenceBox} ${getMobileEvidenceClassName(a.activityEvidence)}`}>
                      <div className={`${styles.mobileEvidenceTitle} ${getMobileEvidenceTitleClassName(a.activityEvidence)}`}>
                        {getEvidenceStatus(a)}
                      </div>
                      {a.activityEvidence?.reviewNotes && (
                        <div className={styles.mobileEvidenceNote}>
                          {a.activityEvidence.reviewNotes}
                        </div>
                      )}
                    </div>

                    {/* Info Grid */}
                    <div className={styles.mobileInfoGrid}>
                      <div>
                        <div className={styles.mobileInfoLabel}>Sucursal</div>
                        <div className={styles.mobileInfoValue}>{[a.branchName, a.branchCity].filter(Boolean).join(', ') || '-'}</div>
                      </div>
                      <div>
                        <div className={styles.mobileInfoLabel}>Tipo</div>
                        <div className={styles.mobileInfoValue}>{a.ticketType || '-'}</div>
                      </div>
                      <div>
                        <div className={styles.mobileInfoLabel}>Inicio</div>
                        <div className={styles.mobileInfoValue}>{formatDateTime(a.fechaInicio)}</div>
                      </div>
                      <div>
                        <div className={styles.mobileInfoLabel}>Entrega</div>
                        <div className={styles.mobileInfoValue}>{formatDateTime(a.fechaEntregaEsperada)}</div>
                      </div>
                      <div>
                        <div className={styles.mobileInfoLabel}>Tiempo Est/Max</div>
                        <div className={styles.mobileInfoValue}>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0} min</div>
                      </div>
                    </div>

                    {/* Indicaciones */}
                    {a.indicaciones && (
                      <div className={styles.mobileIndications}>
                        <div className={styles.mobileIndicationsLabel}>Indicaciones</div>
                        <div>{a.indicaciones}</div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className={styles.mobileActions}>
                      {getMapsUrl(a) && (
                        <a 
                          href={getMapsUrl(a)} 
                          target="_blank" 
                          rel="noreferrer"
                          className={`button-secondary ${styles.mobileActionLink}`}
                        >
                          📍 Cómo llegar
                        </a>
                      )}
                      
                      {isAdmin && canReview && (
                        <button
                          className={`button-primary ${styles.mobileActionBtn}`}
                          onClick={() => setReviewModal({ activityId: a.id, activityNumber: a.anNumber })}
                        >
                          📋 Revisar
                        </button>
                      )}
                      
                      {!isAdmin && needsCorrection && (
                        <a
                          href="/my-evidences"
                          className={`button-primary ${styles.mobileDangerLink}`}
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

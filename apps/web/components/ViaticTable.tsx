"use client";
import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import ExcelDownloadModal from './ExcelDownloadModal';
import styles from './ViaticTable.module.css';

interface Viatic {
  id: number;
  actividad?: { anNumber: string };
  montoSolicitado: number;
  razonGasto: string;
  ticketEvidenciaUrl: string;
  estatusPago: string;
  usuario?: { nombre: string };
}

const ViaticTable = () => {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [viatics, setViatics] = useState<Viatic[]>([]);
  const [filtered, setFiltered] = useState<Viatic[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');
  const [filterRazon, setFilterRazon] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
  const [excelPreparing, setExcelPreparing] = useState(false);
  const MOBILE_BREAKPOINT = 1024;

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
      const res = await fetch(buildApiUrl('export/viatic'));
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
    a.download = 'viáticos.xlsx';
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

  // Fetch viatics
  useEffect(() => {
    if (!user) return;
    fetch(buildApiUrl('viatics'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setViatics(data) : setViatics([]));
  }, [user]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'Viatico') {
        fetch(buildApiUrl('viatics'), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
          .then(res => res.json())
          .then(data => Array.isArray(data) ? setViatics(data) : setViatics([]));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [MOBILE_BREAKPOINT]);

  // Filtering
  useEffect(() => {
    let data = viatics;
    if (filterStatus) data = data.filter((v: Viatic) => v.estatusPago === filterStatus);
    if (filterUsuario) data = data.filter((v: Viatic) => v.usuario?.nombre?.toLowerCase().includes(filterUsuario.toLowerCase()));
    if (filterRazon) data = data.filter((v: Viatic) => v.razonGasto?.toLowerCase().includes(filterRazon.toLowerCase()));
    setFiltered(data);
    setPage(1);
  }, [viatics, filterStatus, filterUsuario, filterRazon]);


  // Importar viáticos
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(buildApiUrl('viatics/import'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      setImportMsg('Error al importar viáticos');
      return;
    }
    const data = await res.json();
    setImportMsg(data.message + (data.count ? ` (${data.count})` : ''));
    // Opcional: recargar viáticos
    fetch(buildApiUrl('viatics'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(res => res.json())
      .then(setViatics);
  };

  // Aprobar/Rechazar viático
  const handleApprove = async (id: number, value: 'Aprobado' | 'Rechazado') => {
    if (!user) return;
    setActionLoading(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(buildApiUrl(`viatics/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ estatusPago: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al actualizar viático');
      }
      setSuccess('Viático actualizado');
      // Refrescar viáticos
      if (!user) return;
      const updated = await fetch(buildApiUrl('viatics'), {
        headers: { Authorization: `Bearer ${user.token}` },
      }).then(r => r.json());
      setViatics(updated);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('Error desconocido');
    } finally {
      setActionLoading(null);
    }
  };

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (!user) return null;

  return (
    <div className="card">
      <h2 className={styles.title}>Viáticos</h2>
      <div className={`${styles.filtersGrid} ${isMobile ? styles.filtersGridMobile : ''}`}>
        <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Aprobado">Aprobado</option>
          <option value="Rechazado">Rechazado</option>
        </select>
        <input
          className="input"
          placeholder="Filtrar por usuario"
          value={filterUsuario}
          onChange={e => setFilterUsuario(e.target.value)}
        />
        <input
          className="input"
          placeholder="Filtrar por razón"
          value={filterRazon}
          onChange={e => setFilterRazon(e.target.value)}
        />
        <select className="input" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
          {[10, 20, 50].map(size => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
      </div>
      {hasPermission(user, PERMISSIONS.VIATICS_EXPORT) && (
        <div className={`${styles.importActions} ${isMobile ? styles.importActionsMobile : ''}`}>
          <button
            onClick={handlePrepareExcelExport}
            className={`button-primary ${isMobile ? styles.fullWidthBtn : ''}`}
            disabled={excelPreparing}
          >
            {excelPreparing ? 'Preparando...' : 'Exportar Excel'}
          </button>
        </div>
      )}
      <ExcelDownloadModal
        isOpen={Boolean(excelUrl)}
        fileName="viáticos.xlsx"
        excelBlob={excelBlob}
        isPreparing={excelPreparing}
        onClose={closeExcelModal}
        onDownload={handleDownloadExcel}
      />
      {importMsg && (
        <div className={importMsg.startsWith('Error') ? styles.importError : styles.importSuccess}>{importMsg}</div>
      )}
      {!isMobile && (
        <div className={styles.tableWrap}>
          <table className={`table ${styles.tableMin}`}>
            <thead>
              <tr>
                <th>Actividad</th>
                <th>Monto</th>
                <th>Razón</th>
                <th>Ticket</th>
                <th>Estatus</th>
                <th>Usuario</th>
                {hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map((v: Viatic) => (
                <tr key={v.id}>
                  <td>{v.actividad?.anNumber}</td>
                  <td>${v.montoSolicitado}</td>
                  <td>{v.razonGasto}</td>
                  <td>{v.ticketEvidenciaUrl ? <a className="link" href={v.ticketEvidenciaUrl} target="_blank" rel="noopener noreferrer">Ver</a> : '-'}</td>
                  <td>
                    <span className={`badge ${v.estatusPago === 'Aprobado' ? 'approved' : v.estatusPago === 'Pendiente' ? 'pending' : v.estatusPago === 'Rechazado' ? 'rejected' : ''}`}>{v.estatusPago}</span>
                  </td>
                  <td>{v.usuario?.nombre}</td>
                  {hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && (
                    <td>
                      {v.estatusPago === 'Pendiente' && (
                        <>
                          <button className="button-primary" onClick={() => handleApprove(v.id, 'Aprobado')} disabled={actionLoading === v.id}>
                            {actionLoading === v.id ? 'Aprobando...' : 'Aprobar'}
                          </button>
                          <button className="button-secondary" onClick={() => handleApprove(v.id, 'Rechazado')} disabled={actionLoading === v.id}>
                            {actionLoading === v.id ? 'Rechazando...' : 'Rechazar'}
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isMobile && (
        <div className={styles.mobileList}>
          {paginated.map((v: Viatic) => (
            <div key={v.id} className={`card ${styles.mobileCard}`}>
              <div className={styles.mobileHeader}>
                <div className={styles.mobileHeaderMain}>
                  <div className={styles.mobileActivity}>Actividad: {v.actividad?.anNumber || '-'}</div>
                  <div className={styles.mobileUser}>Usuario: {v.usuario?.nombre || '-'}</div>
                </div>
                <span className={`badge ${v.estatusPago === 'Aprobado' ? 'approved' : v.estatusPago === 'Pendiente' ? 'pending' : v.estatusPago === 'Rechazado' ? 'rejected' : ''}`}>{v.estatusPago}</span>
              </div>

              <div className={styles.mobileText}>
                <strong>Monto:</strong> ${v.montoSolicitado}
              </div>

              <div className={styles.mobileReason}>
                <strong>Razón:</strong> {v.razonGasto}
              </div>

              <div className={hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && v.estatusPago === 'Pendiente' ? styles.mobileActionsTriple : styles.mobileActionsSingle}>
                <a className={`button-secondary ${styles.ticketLink} ${v.ticketEvidenciaUrl ? '' : styles.ticketLinkDisabled}`} href={v.ticketEvidenciaUrl || '#'} target="_blank" rel="noopener noreferrer">
                  Ver ticket
                </a>

                {hasPermission(user, PERMISSIONS.VIATICS_MANAGE) && v.estatusPago === 'Pendiente' && (
                  <>
                    <button className={`button-primary ${styles.actionBtn}`} onClick={() => handleApprove(v.id, 'Aprobado')} disabled={actionLoading === v.id}>
                      {actionLoading === v.id ? 'Aprobando...' : 'Aprobar'}
                    </button>
                    <button className={`button-secondary ${styles.actionBtn}`} onClick={() => handleApprove(v.id, 'Rechazado')} disabled={actionLoading === v.id}>
                      {actionLoading === v.id ? 'Rechazando...' : 'Rechazar'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        <button className="button-secondary" onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span>Página {page} de {totalPages || 1}</span>
        <button className="button-secondary" onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
      {success && <p className={styles.successText}>{success}</p>}
    </div>
  );
};

export default ViaticTable;


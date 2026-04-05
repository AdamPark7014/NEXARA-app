"use client";
import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { triggerFileDownload } from '@/lib/file-download';
import ExcelDownloadModal from './ExcelDownloadModal';
import styles from './VehicleTable.module.css';

interface Vehicle {
  id: number;
  nombreVehiculo?: string;
  placasVehiculo?: string | null;
  estatusAprobacion: string;
  fechaSolicitud?: string;
  fechaInicioSolicitada?: string;
  fechaFinSolicitada?: string;
  fechaInicioAprobada?: string;
  fechaFinAprobada?: string;
  solicitante?: { nombre: string };
  evidenciaEntregaUrl: string;
  evidenciaDevolucionUrl: string;
  entregaFotos?: string[] | null;
  entregaEstatus?: string;
  entregaObservaciones?: string | null;
  entregaAprobada?: boolean;
  renovacionEstatus?: string | null;
  renovacionSolicitadaInicio?: string | null;
  renovacionSolicitadaFin?: string | null;
  penalizacionMonto?: number | null;
  penalizacionNotas?: string | null;
  vehiculo?: { nombre: string; placas?: string | null } | null;
  fechaInicio: string;
  fechaFin: string;
}

const VehicleTable = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { user } = useUser();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filtered, setFiltered] = useState<Vehicle[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterResponsable, setFilterResponsable] = useState<string>('');
  const [filterPlacas, setFilterPlacas] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isMobile, setIsMobile] = useState(false);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
  const [excelPreparing, setExcelPreparing] = useState(false);
  const MOBILE_BREAKPOINT = 1024;

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');
  const extractList = <T,>(payload: unknown): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)) {
      return (payload as { data: T[] }).data;
    }
    return [];
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
      const res = await fetch(buildApiUrl('export/vehicle'));
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
    triggerFileDownload(excelUrl, 'vehiculos.xlsx', { preferOpenOnMobile: true });
    closeExcelModal();
  };

  useEffect(() => {
    return () => {
      if (excelUrl) {
        window.URL.revokeObjectURL(excelUrl);
      }
    };
  }, [excelUrl]);


  // Importar vehículos
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(buildApiUrl('vehicles/import'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      setImportMsg('Error al importar vehículos');
      return;
    }
    const data = await res.json();
    setImportMsg(data.message + (data.count ? ` (${data.count})` : ''));
    // Opcional: recargar vehículos aquí si es necesario
  };

  const fetchVehicles = () => {
    if (!user?.token) return;
    fetch(buildApiUrl('vehicles'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.json())
      .then((data) => setVehicles(extractList<Vehicle>(data)))
      .catch(() => setVehicles([]));
  };

  const fetchInventory = () => {
    if (!user?.token || !hasPermission(user, PERMISSIONS.VEHICLES_INVENTORY)) return;
    fetch(buildApiUrl('vehicles/inventory'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setInventory(extractList<{ id: number; nombre: string; placas?: string | null; estatus?: string; activo?: boolean }>(data)))
      .catch(() => setInventory([]));
  };

  useEffect(() => {
    fetchVehicles();
    fetchInventory();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, {
      transports: ['polling'],
      upgrade: false,
      timeout: 20000,
      reconnectionAttempts: 8,
    });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'VehicleControl') {
        fetchVehicles();
      }
      if (payload?.model === 'VehicleAsset') {
        fetchInventory();
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

  useEffect(() => {
    let data = vehicles;
    if (filterStatus)
      data = data.filter(v => v.estatusAprobacion === filterStatus);
    if (filterResponsable)
      data = data.filter(v => v.solicitante?.nombre?.toLowerCase().includes(filterResponsable.toLowerCase()));
    if (filterPlacas)
      data = data.filter(v => (v.placasVehiculo || '').toLowerCase().includes(filterPlacas.toLowerCase()));
    setFiltered(data);
    setPage(1); // Reset page on filter change
  }, [vehicles, filterStatus, filterResponsable, filterPlacas]);

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inventory, setInventory] = useState<{ id: number; nombre: string; placas?: string | null; estatus?: string; activo?: boolean }[]>([]);
  const [inventoryDraft, setInventoryDraft] = useState({ nombre: '', placas: '' });
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<number, string>>({});
  const [approvalDrafts, setApprovalDrafts] = useState<Record<number, { inicio: string; fin: string }>>({});
  const [penaltyDrafts, setPenaltyDrafts] = useState<Record<number, { monto: string; notas: string }>>({});

  if (!user) return null;

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

  const getRenewBadgeClass = (status?: string | null) => {
    if (status === 'Aprobada') return 'approved';
    if (status === 'Pendiente') return 'pending';
    return 'rejected';
  };

  const totalCount = filtered.length;
  const pendingCount = filtered.filter((v) => v.estatusAprobacion === 'Pendiente').length;
  const approvedCount = filtered.filter((v) => v.estatusAprobacion === 'Aprobado').length;
  const rejectedCount = filtered.filter((v) => v.estatusAprobacion === 'Rechazado').length;

  const handleApprove = async (id: number, value: 'Aprobado' | 'Rechazado') => {
    setActionLoading(id);
    setError(null);
    setSuccess(null);
    try {
      const approval = approvalDrafts[id];
      const res = await fetch(buildApiUrl(`vehicles/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          estatusAprobacion: value,
          fechaInicioAprobada: approval?.inicio || null,
          fechaFinAprobada: approval?.fin || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al actualizar vehículo');
      }
      setSuccess('Vehículo actualizado');
      // Refrescar vehículos
      const updated = await fetch(buildApiUrl('vehicles'), {
        headers: { Authorization: `Bearer ${user.token}` },
      }).then(r => r.json());
      setVehicles(extractList<Vehicle>(updated));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error desconocido');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeliveryReview = async (id: number, approved: boolean) => {
    if (!user?.token) return;
    setActionLoading(id);
    setError(null);
    setSuccess(null);
    const res = await fetch(buildApiUrl(`vehicles/${id}/delivery-review`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        entregaAprobada: approved,
        entregaObservaciones: deliveryDrafts[id] || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al revisar entrega');
    } else {
      setSuccess('Entrega revisada');
      fetchVehicles();
    }
    setActionLoading(null);
  };

  const handleRenewalReview = async (id: number, approved: boolean, endDate?: string | null) => {
    if (!user?.token) return;
    setActionLoading(id);
    setError(null);
    setSuccess(null);
    const res = await fetch(buildApiUrl(`vehicles/${id}/renewal-review`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        renovacionAprobada: approved,
        fechaFinAprobada: endDate || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al revisar renovacion');
    } else {
      setSuccess('Renovacion revisada');
      fetchVehicles();
    }
    setActionLoading(null);
  };

  const handleInventoryCreate = async () => {
    if (!user?.token) return;
    if (!inventoryDraft.nombre.trim()) {
      setError('Nombre requerido');
      return;
    }
    setError(null);
    const payload = {
      nombre: inventoryDraft.nombre.trim(),
      placas: inventoryDraft.placas.trim(),
    };
    const res = await fetch(buildApiUrl('vehicles/inventory'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al crear vehiculo');
      return;
    }
    setInventoryDraft({ nombre: '', placas: '' });
    setSuccess('Vehículo agregado al inventario');
    fetchInventory();
  };

  const handleInventoryDelete = async (id: number) => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl(`vehicles/inventory/${id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (res.ok) fetchInventory();
  };

  const handlePenaltySave = async (id: number) => {
    if (!user?.token) return;
    const draft = penaltyDrafts[id];
    setActionLoading(id);
    setError(null);
    const res = await fetch(buildApiUrl(`vehicles/${id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        penalizacionMonto: draft?.monto ? Number(draft.monto) : null,
        penalizacionNotas: draft?.notas || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al guardar penalizacion');
    } else {
      setSuccess('Penalizacion actualizada');
      fetchVehicles();
    }
    setActionLoading(null);
  };

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="card">
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Vehículos</h2>
        <span className={styles.subtitle}>Gestión y seguimiento de solicitudes</span>
      </div>

      <div className={styles.statsGrid}>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statLabel}>Total</div>
          <div className={styles.statValue}>{totalCount}</div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statLabel}>Pendientes</div>
          <div className={styles.statValue}>{pendingCount}</div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statLabel}>Aprobados</div>
          <div className={styles.statValue}>{approvedCount}</div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statLabel}>Rechazados</div>
          <div className={styles.statValue}>{rejectedCount}</div>
        </div>
      </div>

      <div className={`${styles.filtersGrid} ${isMobile ? styles.filtersGridMobile : ''}`}>
        <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Aprobado">Aprobado</option>
          <option value="Rechazado">Rechazado</option>
        </select>
        <input
          className="input"
          placeholder="Responsable"
          value={filterResponsable}
          onChange={e => setFilterResponsable(e.target.value)}
        />
        <input
          className="input"
          placeholder="Placas"
          value={filterPlacas}
          onChange={e => setFilterPlacas(e.target.value)}
        />
        <select className="input" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
          {[10, 20, 50].map(size => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
      </div>

      <div className={styles.actionsRow}>
        {hasPermission(user, PERMISSIONS.VEHICLES_EXPORT) && (
          <>
            <button
              className="button-primary"
              onClick={handlePrepareExcelExport}
              disabled={excelPreparing}
            >
              {excelPreparing ? 'Preparando...' : 'Exportar Excel'}
            </button>
          </>
        )}
      </div>
      <ExcelDownloadModal
        isOpen={Boolean(excelUrl)}
        fileName="vehiculos.xlsx"
        excelBlob={excelBlob}
        isPreparing={excelPreparing}
        onClose={closeExcelModal}
        onDownload={handleDownloadExcel}
      />
      {importMsg && (
        <div className={importMsg.startsWith('Error') ? styles.importError : styles.importOk}>{importMsg}</div>
      )}
      {!isMobile && (
        <div className={styles.tableWrap}>
          <table className={`table ${styles.tableMin}`}>
            <thead>
              <tr>
                <th>Vehiculo</th>
                <th>Estatus</th>
                <th>Responsable</th>
                <th>Periodo</th>
                <th>Evidencias</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(vehicle => (
                <tr key={vehicle.id}>
                  <td>
                    <div className={styles.vehicleName}>{vehicle.vehiculo?.nombre || vehicle.nombreVehiculo || 'Vehiculo'}</div>
                    <div className={styles.plate}>{vehicle.placasVehiculo || vehicle.vehiculo?.placas || '-'}</div>
                  </td>
                  <td>
                    <span className={`badge ${vehicle.estatusAprobacion === 'Aprobado' ? 'approved' : vehicle.estatusAprobacion === 'Pendiente' ? 'pending' : vehicle.estatusAprobacion === 'Rechazado' ? 'rejected' : ''}`}>{vehicle.estatusAprobacion}</span>
                    {vehicle.renovacionEstatus && (
                      <div className={styles.statusRenewBlock}>
                        <span className={`badge ${getRenewBadgeClass(vehicle.renovacionEstatus)}`}>
                          Renovacion {vehicle.renovacionEstatus}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{vehicle.solicitante?.nombre || '-'}</td>
                  <td>
                    <div>{formatDateTime(vehicle.fechaInicioSolicitada || vehicle.fechaInicio)}</div>
                    <div className={styles.periodSub}>{formatDateTime(vehicle.fechaFinSolicitada || vehicle.fechaFin)}</div>
                    <div className={styles.periodApproved}>
                      Aprobado: {formatDateTime(vehicle.fechaInicioAprobada)} - {formatDateTime(vehicle.fechaFinAprobada)}
                    </div>
                  </td>
                  <td>
                    <div>
                      {vehicle.evidenciaEntregaUrl ? (
                        <a className="link" href={vehicle.evidenciaEntregaUrl} target="_blank" rel="noopener noreferrer">Entrega</a>
                      ) : (
                        <span className={styles.muted}>Entrega: -</span>
                      )}
                    </div>
                    <div>
                      {vehicle.evidenciaDevolucionUrl ? (
                        <a className="link" href={vehicle.evidenciaDevolucionUrl} target="_blank" rel="noopener noreferrer">Devolucion</a>
                      ) : (
                        <span className={styles.muted}>Devolucion: -</span>
                      )}
                    </div>
                    <div className={styles.evidenceMuted}>
                      Entrega fotos: {Array.isArray(vehicle.entregaFotos) ? vehicle.entregaFotos.length : 0}
                    </div>
                    <div className={styles.evidenceMuted}>
                      Entrega estatus: {vehicle.entregaEstatus || 'Pendiente'}
                    </div>
                    {Array.isArray(vehicle.entregaFotos) && vehicle.entregaFotos.length > 0 && (
                      <div className={styles.evidenceThumbs}>
                        {vehicle.entregaFotos.slice(0, 6).map((foto, index) => (
                          <img
                            key={`${vehicle.id}-thumb-${index}`}
                            src={foto}
                            alt={`Entrega ${index + 1}`}
                            className={styles.thumb}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {vehicle.estatusAprobacion === 'Pendiente' && hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                      <>
                        <div className={styles.fieldGrid}>
                          <input
                            className="input"
                            type="datetime-local"
                            value={approvalDrafts[vehicle.id]?.inicio || ''}
                            onChange={(event) => setApprovalDrafts((prev) => ({
                              ...prev,
                              [vehicle.id]: { ...prev[vehicle.id], inicio: event.target.value },
                            }))}
                          />
                          <input
                            className="input"
                            type="datetime-local"
                            value={approvalDrafts[vehicle.id]?.fin || ''}
                            onChange={(event) => setApprovalDrafts((prev) => ({
                              ...prev,
                              [vehicle.id]: { ...prev[vehicle.id], fin: event.target.value },
                            }))}
                          />
                        </div>
                        <button
                          className="button-primary"
                          disabled={actionLoading === vehicle.id}
                          onClick={() => handleApprove(vehicle.id, 'Aprobado')}
                        >{actionLoading === vehicle.id ? 'Aprobando...' : 'Aprobar'}</button>
                        <button
                          className="button-secondary"
                          disabled={actionLoading === vehicle.id}
                          onClick={() => handleApprove(vehicle.id, 'Rechazado')}
                        >{actionLoading === vehicle.id ? 'Rechazando...' : 'Rechazar'}</button>
                      </>
                    )}
                    {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && vehicle.entregaEstatus === 'En revision' && (
                      <div className={styles.sectionBlock}>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Observaciones de entrega"
                          value={deliveryDrafts[vehicle.id] || ''}
                          onChange={(event) => setDeliveryDrafts((prev) => ({ ...prev, [vehicle.id]: event.target.value }))}
                        />
                        <div className={styles.inlineActions}>
                          <button className="button-primary" onClick={() => handleDeliveryReview(vehicle.id, true)}>
                            Aprobar entrega
                          </button>
                          <button className="button-secondary" onClick={() => handleDeliveryReview(vehicle.id, false)}>
                            Rechazar entrega
                          </button>
                        </div>
                      </div>
                    )}
                    {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && vehicle.renovacionEstatus === 'Pendiente' && (
                      <div className={styles.renewActions}>
                        <button
                          className="button-primary"
                          onClick={() => handleRenewalReview(vehicle.id, true, vehicle.renovacionSolicitadaFin || null)}
                        >
                          Aprobar renovacion
                        </button>
                        <button
                          className="button-secondary"
                          onClick={() => handleRenewalReview(vehicle.id, false)}
                        >
                          Rechazar renovacion
                        </button>
                      </div>
                    )}
                    {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                      <div className={styles.penaltyBlock}>
                        <div className={styles.penaltyLabel}>Penalizacion</div>
                        <input
                          className="input"
                          type="number"
                          placeholder="Monto"
                          value={penaltyDrafts[vehicle.id]?.monto ?? (vehicle.penalizacionMonto ? String(vehicle.penalizacionMonto) : '')}
                          onChange={(event) => setPenaltyDrafts((prev) => ({
                            ...prev,
                            [vehicle.id]: { ...prev[vehicle.id], monto: event.target.value },
                          }))}
                        />
                        <textarea
                          rows={2}
                          placeholder="Notas"
                          value={penaltyDrafts[vehicle.id]?.notas ?? (vehicle.penalizacionNotas || '')}
                          onChange={(event) => setPenaltyDrafts((prev) => ({
                            ...prev,
                            [vehicle.id]: { ...prev[vehicle.id], notas: event.target.value },
                          }))}
                          className={`input ${styles.marginTop6}`}
                        />
                        <button
                          className={`button-secondary ${styles.marginTop6}`}
                          onClick={() => handlePenaltySave(vehicle.id)}
                        >
                          Guardar penalizacion
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isMobile && (
        <div className={styles.mobileList}>
          {paginated.map((vehicle) => (
            <div key={vehicle.id} className={`card ${styles.mobileCard}`}>
              <div className={styles.mobileHeader}>
                <div>
                  <div className={styles.mobileVehicleName}>{vehicle.vehiculo?.nombre || vehicle.nombreVehiculo || 'Vehiculo'}</div>
                  <div className={styles.mobileTextSmall}>{vehicle.placasVehiculo || vehicle.vehiculo?.placas || '-'}</div>
                  <div className={styles.mobileTextSmall}>Responsable: {vehicle.solicitante?.nombre || '-'}</div>
                </div>
                <div className={styles.mobileHeaderMeta}>
                  <span className={`badge ${vehicle.estatusAprobacion === 'Aprobado' ? 'approved' : vehicle.estatusAprobacion === 'Pendiente' ? 'pending' : vehicle.estatusAprobacion === 'Rechazado' ? 'rejected' : ''}`}>{vehicle.estatusAprobacion}</span>
                  {vehicle.renovacionEstatus && (
                    <span className={`badge ${getRenewBadgeClass(vehicle.renovacionEstatus)}`}>
                      Renovacion {vehicle.renovacionEstatus}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.mobilePeriod}>
                <div><strong>Solicitado:</strong> {formatDateTime(vehicle.fechaInicioSolicitada || vehicle.fechaInicio)} - {formatDateTime(vehicle.fechaFinSolicitada || vehicle.fechaFin)}</div>
                <div className={styles.muted}><strong>Aprobado:</strong> {formatDateTime(vehicle.fechaInicioAprobada)} - {formatDateTime(vehicle.fechaFinAprobada)}</div>
              </div>

              <div className={styles.mobileList}>
                <div className={styles.mobileEvidenceLinks}>
                  {vehicle.evidenciaEntregaUrl ? <a className="link" href={vehicle.evidenciaEntregaUrl} target="_blank" rel="noopener noreferrer">Entrega</a> : <span className={styles.muted}>Entrega: -</span>}
                  {vehicle.evidenciaDevolucionUrl ? <a className="link" href={vehicle.evidenciaDevolucionUrl} target="_blank" rel="noopener noreferrer">Devolucion</a> : <span className={styles.muted}>Devolucion: -</span>}
                </div>
                <div className={styles.smallMuted}>Entrega fotos: {Array.isArray(vehicle.entregaFotos) ? vehicle.entregaFotos.length : 0} · Estatus: {vehicle.entregaEstatus || 'Pendiente'}</div>
              </div>

              {Array.isArray(vehicle.entregaFotos) && vehicle.entregaFotos.length > 0 && (
                <div className={styles.mobileThumbGrid}>
                  {vehicle.entregaFotos.slice(0, 8).map((foto, index) => (
                    <img
                      key={`${vehicle.id}-thumb-m-${index}`}
                      src={foto}
                      alt={`Entrega ${index + 1}`}
                      className={styles.mobileThumb}
                    />
                  ))}
                </div>
              )}

              {vehicle.estatusAprobacion === 'Pendiente' && hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                <div className={styles.mobileActionSection}>
                  <input
                    className="input"
                    type="datetime-local"
                    value={approvalDrafts[vehicle.id]?.inicio || ''}
                    onChange={(event) => setApprovalDrafts((prev) => ({ ...prev, [vehicle.id]: { ...prev[vehicle.id], inicio: event.target.value } }))}
                  />
                  <input
                    className="input"
                    type="datetime-local"
                    value={approvalDrafts[vehicle.id]?.fin || ''}
                    onChange={(event) => setApprovalDrafts((prev) => ({ ...prev, [vehicle.id]: { ...prev[vehicle.id], fin: event.target.value } }))}
                  />
                  <div className={styles.twoColActions}>
                    <button className={`button-primary ${styles.minHeightBtn}`} disabled={actionLoading === vehicle.id} onClick={() => handleApprove(vehicle.id, 'Aprobado')}>{actionLoading === vehicle.id ? 'Aprobando...' : 'Aprobar'}</button>
                    <button className={`button-secondary ${styles.minHeightBtn}`} disabled={actionLoading === vehicle.id} onClick={() => handleApprove(vehicle.id, 'Rechazado')}>{actionLoading === vehicle.id ? 'Rechazando...' : 'Rechazar'}</button>
                  </div>
                </div>
              )}

              {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && vehicle.entregaEstatus === 'En revision' && (
                <div className={styles.mobileActionSection}>
                  <textarea className="input" rows={2} placeholder="Observaciones de entrega" value={deliveryDrafts[vehicle.id] || ''} onChange={(event) => setDeliveryDrafts((prev) => ({ ...prev, [vehicle.id]: event.target.value }))} />
                  <div className={styles.twoColActions}>
                    <button className={`button-primary ${styles.minHeightBtn}`} onClick={() => handleDeliveryReview(vehicle.id, true)}>Aprobar entrega</button>
                    <button className={`button-secondary ${styles.minHeightBtn}`} onClick={() => handleDeliveryReview(vehicle.id, false)}>Rechazar entrega</button>
                  </div>
                </div>
              )}

              {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && vehicle.renovacionEstatus === 'Pendiente' && (
                <div className={`${styles.twoColActions} ${styles.mobileActionSection}`}>
                  <button className={`button-primary ${styles.minHeightBtn}`} onClick={() => handleRenewalReview(vehicle.id, true, vehicle.renovacionSolicitadaFin || null)}>Aprobar renovacion</button>
                  <button className={`button-secondary ${styles.minHeightBtn}`} onClick={() => handleRenewalReview(vehicle.id, false)}>Rechazar renovacion</button>
                </div>
              )}

              {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                <div className={styles.mobileActionSection}>
                  <div className={styles.smallMuted}>Penalizacion</div>
                  <input className="input" type="number" placeholder="Monto" value={penaltyDrafts[vehicle.id]?.monto ?? (vehicle.penalizacionMonto ? String(vehicle.penalizacionMonto) : '')} onChange={(event) => setPenaltyDrafts((prev) => ({ ...prev, [vehicle.id]: { ...prev[vehicle.id], monto: event.target.value } }))} />
                  <textarea className="input" rows={2} placeholder="Notas" value={penaltyDrafts[vehicle.id]?.notas ?? (vehicle.penalizacionNotas || '')} onChange={(event) => setPenaltyDrafts((prev) => ({ ...prev, [vehicle.id]: { ...prev[vehicle.id], notas: event.target.value } }))} />
                  <button className={`button-secondary ${styles.minHeightBtn}`} onClick={() => handlePenaltySave(vehicle.id)}>Guardar penalizacion</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        <button className="button-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span className={styles.paginationInfo}>Página {page} de {totalPages || 1}</span>
        <button className="button-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
      </div>
      {error && <div className={styles.errorText}>{error}</div>}
      {success && <div className={styles.successText}>{success}</div>}
      {hasPermission(user, PERMISSIONS.VEHICLES_INVENTORY) && (
        <div className={`card ${styles.inventoryCard}`}>
          <h3 className={styles.inventoryTitle}>Inventario de vehículos</h3>
          <div className={styles.inventoryForm}>
            <input
              className="input"
              placeholder="Nombre del vehiculo"
              value={inventoryDraft.nombre}
              onChange={(event) => setInventoryDraft((prev) => ({ ...prev, nombre: event.target.value }))}
            />
            <input
              className="input"
              placeholder="Placas"
              value={inventoryDraft.placas}
              onChange={(event) => setInventoryDraft((prev) => ({ ...prev, placas: event.target.value }))}
            />
            <button className="button-primary" onClick={handleInventoryCreate}>Agregar</button>
          </div>
          <div className={styles.inventoryList}>
            {inventory.map((vehiculo) => (
              <div key={vehiculo.id} className={styles.inventoryItem}>
                <div>
                  <strong className={styles.inventoryName}>{vehiculo.nombre}</strong>
                  <div className={styles.inventoryPlate}>{vehiculo.placas || '-'}</div>
                </div>
                <button className="button-secondary" onClick={() => handleInventoryDelete(vehiculo.id)}>Eliminar</button>
              </div>
            ))}
            {inventory.length === 0 && (
              <div className={styles.inventoryEmpty}>Aún no hay vehículos registrados.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleTable;


"use client";
import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

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

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');


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
      .then(data => Array.isArray(data) ? setVehicles(data) : setVehicles([]));
  };

  const fetchInventory = () => {
    if (!user?.token || !hasPermission(user, PERMISSIONS.VEHICLES_INVENTORY)) return;
    fetch(buildApiUrl('vehicles/inventory'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setInventory(Array.isArray(data) ? data : []))
      .catch(() => setInventory([]));
  };

  useEffect(() => {
    fetchVehicles();
    fetchInventory();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

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
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
      setVehicles(updated);
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
    const res = await fetch(buildApiUrl('vehicles/inventory'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ nombre: inventoryDraft.nombre, placas: inventoryDraft.placas }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Error al crear vehiculo');
      return;
    }
    setInventoryDraft({ nombre: '', placas: '' });
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 0 }}>Vehículos</h2>
        <span style={{ color: 'var(--text-secondary)' }}>Gestión y seguimiento de solicitudes</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{totalCount}</div>
        </div>
        <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Pendientes</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Aprobados</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{approvedCount}</div>
        </div>
        <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Rechazados</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{rejectedCount}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
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
            <option key={size} value={size}>{size} por pagina</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {hasPermission(user, PERMISSIONS.VEHICLES_EXPORT) && (
          <>
            <button
              className="button-primary"
              onClick={async () => {
                const res = await fetch(buildApiUrl('export/vehicle'));
                if (!res.ok) return alert('Error al exportar');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'vehiculos.xlsx';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
              }}
            >
              Exportar Excel
            </button>
            <button className="button-secondary" onClick={() => fileInputRef.current?.click()}>Importar Excel</button>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </>
        )}
      </div>
      {importMsg && (
        <div style={{ color: importMsg.startsWith('Error') ? 'var(--danger)' : 'var(--accent)' }}>{importMsg}</div>
      )}
      {!isMobile && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 12, border: '1px solid var(--muted)' }}>
          <table className="table" style={{ minWidth: 980 }}>
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
                    <div>{vehicle.vehiculo?.nombre || vehicle.nombreVehiculo || 'Vehiculo'}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{vehicle.placasVehiculo || vehicle.vehiculo?.placas || '-'}</div>
                  </td>
                  <td>
                    <span className={`badge ${vehicle.estatusAprobacion === 'Aprobado' ? 'approved' : vehicle.estatusAprobacion === 'Pendiente' ? 'pending' : vehicle.estatusAprobacion === 'Rechazado' ? 'rejected' : ''}`}>{vehicle.estatusAprobacion}</span>
                    {vehicle.renovacionEstatus && (
                      <div style={{ marginTop: 6 }}>
                        <span className={`badge ${vehicle.renovacionEstatus === 'Aprobada' ? 'approved' : vehicle.renovacionEstatus === 'Pendiente' ? 'pending' : 'rejected'}`}>
                          Renovacion {vehicle.renovacionEstatus}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{vehicle.solicitante?.nombre || '-'}</td>
                  <td>
                    <div>{formatDateTime(vehicle.fechaInicioSolicitada || vehicle.fechaInicio)}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{formatDateTime(vehicle.fechaFinSolicitada || vehicle.fechaFin)}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      Aprobado: {formatDateTime(vehicle.fechaInicioAprobada)} - {formatDateTime(vehicle.fechaFinAprobada)}
                    </div>
                  </td>
                  <td>
                    <div>
                      {vehicle.evidenciaEntregaUrl ? (
                        <a className="link" href={vehicle.evidenciaEntregaUrl} target="_blank" rel="noopener noreferrer">Entrega</a>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>Entrega: -</span>
                      )}
                    </div>
                    <div>
                      {vehicle.evidenciaDevolucionUrl ? (
                        <a className="link" href={vehicle.evidenciaDevolucionUrl} target="_blank" rel="noopener noreferrer">Devolucion</a>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>Devolucion: -</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      Entrega fotos: {Array.isArray(vehicle.entregaFotos) ? vehicle.entregaFotos.length : 0}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      Entrega estatus: {vehicle.entregaEstatus || 'Pendiente'}
                    </div>
                    {Array.isArray(vehicle.entregaFotos) && vehicle.entregaFotos.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {vehicle.entregaFotos.slice(0, 6).map((foto, index) => (
                          <img
                            key={`${vehicle.id}-thumb-${index}`}
                            src={foto}
                            alt={`Entrega ${index + 1}`}
                            style={{
                              width: 48,
                              height: 48,
                              objectFit: 'cover',
                              borderRadius: 8,
                              border: '1px solid var(--muted)',
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {vehicle.estatusAprobacion === 'Pendiente' && hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                      <>
                        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
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
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Observaciones de entrega"
                          value={deliveryDrafts[vehicle.id] || ''}
                          onChange={(event) => setDeliveryDrafts((prev) => ({ ...prev, [vehicle.id]: event.target.value }))}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
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
                      <div style={{ marginTop: 8 }}>
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
                      <div style={{ marginTop: 10 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>Penalizacion</div>
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
                          className="input"
                          rows={2}
                          placeholder="Notas"
                          value={penaltyDrafts[vehicle.id]?.notas ?? (vehicle.penalizacionNotas || '')}
                          onChange={(event) => setPenaltyDrafts((prev) => ({
                            ...prev,
                            [vehicle.id]: { ...prev[vehicle.id], notas: event.target.value },
                          }))}
                          style={{ marginTop: 6 }}
                        />
                        <button
                          className="button-secondary"
                          style={{ marginTop: 6 }}
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
        <div style={{ display: 'grid', gap: 12 }}>
          {paginated.map((vehicle) => (
            <div key={vehicle.id} className="card" style={{ border: '1px solid var(--muted)', padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{vehicle.vehiculo?.nombre || vehicle.nombreVehiculo || 'Vehiculo'}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{vehicle.placasVehiculo || vehicle.vehiculo?.placas || '-'}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Responsable: {vehicle.solicitante?.nombre || '-'}</div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span className={`badge ${vehicle.estatusAprobacion === 'Aprobado' ? 'approved' : vehicle.estatusAprobacion === 'Pendiente' ? 'pending' : vehicle.estatusAprobacion === 'Rechazado' ? 'rejected' : ''}`}>{vehicle.estatusAprobacion}</span>
                  {vehicle.renovacionEstatus && (
                    <span className={`badge ${vehicle.renovacionEstatus === 'Aprobada' ? 'approved' : vehicle.renovacionEstatus === 'Pendiente' ? 'pending' : 'rejected'}`}>
                      Renovacion {vehicle.renovacionEstatus}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <div><strong>Solicitado:</strong> {formatDateTime(vehicle.fechaInicioSolicitada || vehicle.fechaInicio)} - {formatDateTime(vehicle.fechaFinSolicitada || vehicle.fechaFin)}</div>
                <div style={{ color: 'var(--text-secondary)' }}><strong>Aprobado:</strong> {formatDateTime(vehicle.fechaInicioAprobada)} - {formatDateTime(vehicle.fechaFinAprobada)}</div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {vehicle.evidenciaEntregaUrl ? <a className="link" href={vehicle.evidenciaEntregaUrl} target="_blank" rel="noopener noreferrer">Entrega</a> : <span style={{ color: 'var(--text-secondary)' }}>Entrega: -</span>}
                  {vehicle.evidenciaDevolucionUrl ? <a className="link" href={vehicle.evidenciaDevolucionUrl} target="_blank" rel="noopener noreferrer">Devolucion</a> : <span style={{ color: 'var(--text-secondary)' }}>Devolucion: -</span>}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Entrega fotos: {Array.isArray(vehicle.entregaFotos) ? vehicle.entregaFotos.length : 0} · Estatus: {vehicle.entregaEstatus || 'Pendiente'}</div>
              </div>

              {Array.isArray(vehicle.entregaFotos) && vehicle.entregaFotos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 6 }}>
                  {vehicle.entregaFotos.slice(0, 8).map((foto, index) => (
                    <img
                      key={`${vehicle.id}-thumb-m-${index}`}
                      src={foto}
                      alt={`Entrega ${index + 1}`}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--muted)' }}
                    />
                  ))}
                </div>
              )}

              {vehicle.estatusAprobacion === 'Pendiente' && hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--muted)', paddingTop: 8 }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="button-primary" style={{ minHeight: 44 }} disabled={actionLoading === vehicle.id} onClick={() => handleApprove(vehicle.id, 'Aprobado')}>{actionLoading === vehicle.id ? 'Aprobando...' : 'Aprobar'}</button>
                    <button className="button-secondary" style={{ minHeight: 44 }} disabled={actionLoading === vehicle.id} onClick={() => handleApprove(vehicle.id, 'Rechazado')}>{actionLoading === vehicle.id ? 'Rechazando...' : 'Rechazar'}</button>
                  </div>
                </div>
              )}

              {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && vehicle.entregaEstatus === 'En revision' && (
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--muted)', paddingTop: 8 }}>
                  <textarea className="input" rows={2} placeholder="Observaciones de entrega" value={deliveryDrafts[vehicle.id] || ''} onChange={(event) => setDeliveryDrafts((prev) => ({ ...prev, [vehicle.id]: event.target.value }))} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="button-primary" style={{ minHeight: 44 }} onClick={() => handleDeliveryReview(vehicle.id, true)}>Aprobar entrega</button>
                    <button className="button-secondary" style={{ minHeight: 44 }} onClick={() => handleDeliveryReview(vehicle.id, false)}>Rechazar entrega</button>
                  </div>
                </div>
              )}

              {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && vehicle.renovacionEstatus === 'Pendiente' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: '1px solid var(--muted)', paddingTop: 8 }}>
                  <button className="button-primary" style={{ minHeight: 44 }} onClick={() => handleRenewalReview(vehicle.id, true, vehicle.renovacionSolicitadaFin || null)}>Aprobar renovacion</button>
                  <button className="button-secondary" style={{ minHeight: 44 }} onClick={() => handleRenewalReview(vehicle.id, false)}>Rechazar renovacion</button>
                </div>
              )}

              {hasPermission(user, PERMISSIONS.VEHICLES_REVIEW) && (
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--muted)', paddingTop: 8 }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Penalizacion</div>
                  <input className="input" type="number" placeholder="Monto" value={penaltyDrafts[vehicle.id]?.monto ?? (vehicle.penalizacionMonto ? String(vehicle.penalizacionMonto) : '')} onChange={(event) => setPenaltyDrafts((prev) => ({ ...prev, [vehicle.id]: { ...prev[vehicle.id], monto: event.target.value } }))} />
                  <textarea className="input" rows={2} placeholder="Notas" value={penaltyDrafts[vehicle.id]?.notas ?? (vehicle.penalizacionNotas || '')} onChange={(event) => setPenaltyDrafts((prev) => ({ ...prev, [vehicle.id]: { ...prev[vehicle.id], notas: event.target.value } }))} />
                  <button className="button-secondary" style={{ minHeight: 44 }} onClick={() => handlePenaltySave(vehicle.id)}>Guardar penalizacion</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <button className="button-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span>Página {page} de {totalPages || 1}</span>
        <button className="button-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {success && <div style={{ color: 'var(--accent)' }}>{success}</div>}
      {hasPermission(user, PERMISSIONS.VEHICLES_INVENTORY) && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Inventario de vehiculos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
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
          <div style={{ display: 'grid', gap: 8 }}>
            {inventory.map((vehiculo) => (
              <div key={vehiculo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <strong>{vehiculo.nombre}</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{vehiculo.placas || '-'}</div>
                </div>
                <button className="button-secondary" onClick={() => handleInventoryDelete(vehiculo.id)}>Eliminar</button>
              </div>
            ))}
            {inventory.length === 0 && (
              <div style={{ color: 'var(--text-secondary)' }}>Aun no hay vehiculos registrados.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleTable;

"use client";
import React, { useEffect, useState, useRef } from 'react';
import { useUser } from './UserContext';

interface Vehicle {
  id: number;
  placasVehiculo: string;
  estatusAprobacion: string;
  responsable: { nombre: string };
  evidenciaEntregaUrl: string;
  evidenciaDevolucionUrl: string;
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


  // Importar vehículos
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/vehicles/import', {
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

  useEffect(() => {
    if (!user) return;
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/vehicles', {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.json())
      .then(data => Array.isArray(data) ? setVehicles(data) : setVehicles([]));
  }, [user]);

  useEffect(() => {
    let data = vehicles;
    if (filterStatus)
      data = data.filter(v => v.estatusAprobacion === filterStatus);
    if (filterResponsable)
      data = data.filter(v => v.responsable?.nombre?.toLowerCase().includes(filterResponsable.toLowerCase()));
    if (filterPlacas)
      data = data.filter(v => v.placasVehiculo?.toLowerCase().includes(filterPlacas.toLowerCase()));
    setFiltered(data);
    setPage(1); // Reset page on filter change
  }, [vehicles, filterStatus, filterResponsable, filterPlacas]);

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user) return null;

  const handleApprove = async (id: number, value: 'Aprobado' | 'Rechazado') => {
    setActionLoading(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + `/api/vehicles/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ estatusAprobacion: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al actualizar vehículo');
      }
      setSuccess('Vehículo actualizado');
      // Refrescar vehículos
      const updated = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/vehicles', {
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

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="page" style={{ background: 'var(--surface)', color: 'var(--foreground)' }}>
      <h2 style={{ color: 'var(--primary)', marginBottom: 20 }}>Vehículos</h2>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="select" style={{ background: 'var(--surface-light)', color: 'var(--foreground)', border: '1px solid var(--muted)' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos los estatus</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <input
            className="input"
            style={{ background: 'var(--surface-light)', color: 'var(--foreground)', border: '1px solid var(--muted)' }}
            placeholder="Filtrar por responsable"
            value={filterResponsable}
            onChange={e => setFilterResponsable(e.target.value)}
          />
          <input
            className="input"
            style={{ background: 'var(--surface-light)', color: 'var(--foreground)', border: '1px solid var(--muted)' }}
            placeholder="Filtrar por placas"
            value={filterPlacas}
            onChange={e => setFilterPlacas(e.target.value)}
          />
          <select className="select" style={{ background: 'var(--surface-light)', color: 'var(--foreground)', border: '1px solid var(--muted)' }} value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
            {[10, 20, 50].map(size => (
              <option key={size} value={size}>{size} por página</option>
            ))}
          </select>
          {/* Botones de exportar/importar solo para supervisor o CEO */}
          {user.nivelAutoridad >= 50 && (
            <>
              <button
                className="buyBtn"
                style={{ background: 'var(--primary)', color: '#fff', border: 'none' }}
                onClick={async () => {
                  const res = await fetch('/api/export/vehicle');
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
              <button className="buyBtn" style={{ background: 'var(--primary)', color: '#fff', border: 'none' }} onClick={() => fileInputRef.current?.click()}>Importar Excel</button>
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
      </div>
      {importMsg && (
        <div style={{ color: importMsg.startsWith('Error') ? 'var(--danger)' : 'var(--secondary)', marginBottom: 8 }}>
          {importMsg}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Placas</th>
            <th>Estatus</th>
            <th>Responsable</th>
            <th>Entrega</th>
            <th>Devolución</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map(vehicle => (
            <tr key={vehicle.id}>
              <td>{vehicle.placasVehiculo}</td>
              <td>{vehicle.estatusAprobacion}</td>
              <td>{vehicle.responsable?.nombre || '-'}</td>
              <td>
                {vehicle.evidenciaEntregaUrl ? (
                  <a href={vehicle.evidenciaEntregaUrl} target="_blank" rel="noopener noreferrer">Ver evidencia</a>
                ) : (
                  'Sin evidencia'
                )}
              </td>
              <td>
                {vehicle.evidenciaDevolucionUrl ? (
                  <a href={vehicle.evidenciaDevolucionUrl} target="_blank" rel="noopener noreferrer">Ver evidencia</a>
                ) : (
                  'Sin evidencia'
                )}
              </td>
              <td>
                {vehicle.estatusAprobacion === 'Pendiente' && user.nivelAutoridad >= 50 && (
                  <>
                    <button
                      disabled={actionLoading === vehicle.id}
                      onClick={() => handleApprove(vehicle.id, 'Aprobado')}
                    >Aprobar</button>
                    <button
                      disabled={actionLoading === vehicle.id}
                      onClick={() => handleApprove(vehicle.id, 'Rechazado')}
                    >Rechazar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span>Página {page} de {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</button>
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {success && <div style={{ color: 'green' }}>{success}</div>}
    </div>
  );
};

export default VehicleTable;

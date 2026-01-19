"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useUser } from './UserContext';

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

  // Fetch viatics
  useEffect(() => {
    if (!user) return;
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/viatics', {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setViatics(data) : setViatics([]));
  }, [user]);

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
    const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/viatics/import', {
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
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/viatics', {
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
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + `/api/viatics/${id}`, {
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
      const updated = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/viatics', {
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
    <div className="page" style={{ background: 'var(--surface)', color: 'var(--foreground)' }}>
      <h2 style={{ color: 'var(--primary)', marginBottom: 20 }}>Viáticos</h2>
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
            placeholder="Filtrar por usuario"
            value={filterUsuario}
            onChange={e => setFilterUsuario(e.target.value)}
          />
          <input
            className="input"
            style={{ background: 'var(--surface-light)', color: 'var(--foreground)', border: '1px solid var(--muted)' }}
            placeholder="Filtrar por razón"
            value={filterRazon}
            onChange={e => setFilterRazon(e.target.value)}
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
                  const res = await fetch('/api/export/viatic');
                  if (!res.ok) return alert('Error al exportar');
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'viaticos.xlsx';
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
            <th>Actividad</th>
            <th>Monto</th>
            <th>Razón</th>
            <th>Ticket</th>
            <th>Estatus</th>
            <th>Usuario</th>
            {user.nivelAutoridad >= 50 && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {paginated.map((v: Viatic) => (
            <tr key={v.id}>
              <td>{v.actividad?.anNumber}</td>
              <td>${v.montoSolicitado}</td>
              <td>{v.razonGasto}</td>
              <td><a href={v.ticketEvidenciaUrl} target="_blank" rel="noopener noreferrer">Ver</a></td>
              <td>{v.estatusPago}</td>
              <td>{v.usuario?.nombre}</td>
              {user.nivelAutoridad >= 50 && (
                <td>
                  {v.estatusPago === 'Pendiente' && (
                    <>
                      <button onClick={() => handleApprove(v.id, 'Aprobado')} disabled={actionLoading === v.id}>
                        {actionLoading === v.id ? 'Aprobando...' : 'Aprobar'}
                      </button>
                      <button onClick={() => handleApprove(v.id, 'Rechazado')} disabled={actionLoading === v.id}>
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
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span>Página {page} de {totalPages || 1}</span>
        <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
};

export default ViaticTable;

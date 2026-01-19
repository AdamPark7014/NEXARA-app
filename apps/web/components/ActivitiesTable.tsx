"use client";
import React, { useState, useRef } from 'react';
import { useUser } from './UserContext';

const ActivitiesTable: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { user } = useUser();

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
    responsable?: { nombre: string };
    // Agrega más campos según tu modelo real
  }
  const [activities] = useState<Activity[]>([]);

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
    const res = await fetch('/api/activities/import', {
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
    // Opcional: recargar actividades aquí si es necesario
  };

  return (
    <div className="card">
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Actividades</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
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
        {user && user.nivelAutoridad >= 50 && (
          <>
            <button
              className="button-primary"
              onClick={async () => {
                const res = await fetch('/api/export/activity');
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
          </>
        )}
      </div>
      {importMsg && <div style={{ color: importMsg.startsWith('Error') ? 'var(--danger)' : 'var(--accent)' }}>{importMsg}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>AN</th>
            <th>Título</th>
            <th>Estatus</th>
            <th>Responsable</th>
            <th>Prioridad</th>
            {user && user.nivelAutoridad >= 50 && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {paginated.map((a: Activity) => (
            <tr key={a.id}>
              <td>{a.anNumber}</td>
              <td>{a.titulo}</td>
              <td><span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>{a.estatus}</span></td>
              <td>{a.responsable?.nombre}</td>
              <td>{a.prioridad}</td>
              {user && user.nivelAutoridad >= 50 && (
                <td>
                  <button className="button-secondary">Editar</button>
                  <button className="button-primary">Borrar</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="button-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        <span>Página {page} de {totalPages || 1}</span>
        <button className="button-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}>Siguiente</button>
      </div>
    </div>
  );
};

export default ActivitiesTable;
    
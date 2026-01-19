"use client";
import React, { useState, useRef } from 'react';
import { useUser } from './UserContext';

interface Evidence {
  id: number;
  tipoEvidencia: string;
  archivoUrl: string;
  aprobada: boolean;
  actividad: { anNumber: string; titulo?: string };
  responsable?: { nombre: string };
  estatus?: string;
  archivo?: string;
  usuario?: { nombre: string };
}

const EvidenceTable: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const { user } = useUser();

  // Filtros y paginación
  const [estatus, setEstatus] = useState<string>('');
  const [actividad, setActividad] = useState<string>('');
  const [responsable, setResponsable] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const estatusList = ['Pendiente', 'Aprobada'];

  // Simulación de datos de evidencias (reemplazar con fetch real)
  const [evidences] = useState<Evidence[]>([]);

  // Filtrado
  const filtered = evidences.filter(evi =>
    (estatus ? evi.estatus === estatus : true) &&
    (actividad ? evi.actividad?.anNumber?.toLowerCase().includes(actividad.toLowerCase()) : true) &&
    (responsable ? evi.responsable?.nombre?.toLowerCase().includes(responsable.toLowerCase()) : true)
  );
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);


  // Importar evidencias
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/evidences/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    if (!res.ok) {
      setImportMsg('Error al importar evidencias');
      return;
    }
    const data = await res.json();
    setImportMsg(data.message + (data.count ? ` (${data.count})` : ''));
    // Opcional: recargar evidencias aquí si es necesario
  };

  return (
    <div className="card">
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Evidencias</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <select className="input" value={estatus} onChange={e => setEstatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          {estatusList.map((e: string) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input
          className="input"
          placeholder="Actividad"
          value={actividad}
          onChange={e => setActividad(e.target.value)}
        />
        <input
          className="input"
          placeholder="Responsable"
          value={responsable}
          onChange={e => setResponsable(e.target.value)}
        />
        {user && user.nivelAutoridad >= 50 && (
          <>
            <button
              className="button-primary"
              onClick={async () => {
                const res = await fetch('/api/export/evidence');
                if (!res.ok) return alert('Error al exportar');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'evidencias.xlsx';
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
            <th>ID</th>
            <th>Actividad</th>
            <th>Estatus</th>
            <th>Responsable</th>
            <th>Archivo</th>
            {user && user.nivelAutoridad >= 50 && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {paginated.map((evi: Evidence) => (
            <tr key={evi.id}>
              <td>{evi.id}</td>
              <td>{evi.actividad?.titulo || evi.actividad?.anNumber}</td>
              <td><span className={`badge ${evi.estatus === 'Aprobada' ? 'approved' : evi.estatus === 'Pendiente' ? 'pending' : ''}`}>{evi.estatus}</span></td>
              <td>{evi.responsable?.nombre}</td>
              <td>{evi.archivo ? <a className="link" href={evi.archivo} target="_blank" rel="noopener noreferrer">Ver archivo</a> : '-'}</td>
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

  // Pagination
export default EvidenceTable;

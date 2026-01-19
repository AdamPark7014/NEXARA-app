"use client";
import React, { useState } from 'react';
import { useUser } from './UserContext';

const EvidenceUploader = ({ actividadId }: { actividadId: number }) => {
  const { user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState('Hoja de Servicio');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tipoEvidencia', tipo);
    formData.append('actividadId', String(actividadId));
    formData.append('usuarioId', String(user.id));
    await fetch('/api/evidences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData,
    });
    setLoading(false);
    setFile(null);
  };

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
      <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
        Tipo de evidencia:
        <select className="input" value={tipo} onChange={e => setTipo(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="Hoja de Servicio">Hoja de Servicio</option>
          <option value="Foto llegada">Foto llegada</option>
          <option value="Foto salida">Foto salida</option>
        </select>
      </label>
      <input className="input" type="file" onChange={e => setFile(e.target.files?.[0] || null)} required style={{ marginBottom: 12 }} />
      <button className="button-primary" type="submit" disabled={loading}>Subir</button>
    </form>
  );
};

export default EvidenceUploader;

"use client";
import React, { useState } from 'react';
import { useUser } from './UserContext';


const ViaticRequestForm = ({ actividadId }: { actividadId: number }) => {
  const { user } = useUser();
  const [monto, setMonto] = useState('');
  const [razon, setRazon] = useState('');
  const [ticket, setTicket] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validate = () => {
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
      setError('El monto debe ser mayor a 0');
      return false;
    }
    if (!razon || razon.length < 3) {
      setError('La razón debe tener al menos 3 caracteres');
      return false;
    }
    if (!ticket) {
      setError('Debes adjuntar el ticket');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    if (!user) {
      setError('Usuario no autenticado');
      return;
    }
    if (!validate()) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('montoSolicitado', monto);
      formData.append('razonGasto', razon);
      formData.append('ticket', ticket!);
      formData.append('actividadId', String(actividadId));
      formData.append('usuarioId', String(user.id));
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/viatics', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al solicitar viático');
      }
      setSuccess('Solicitud enviada correctamente');
      setMonto('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 400 }}>
      <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
        Monto solicitado:
        <input
          className="input"
          type="number"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          min="1"
          step="0.01"
          style={{ marginLeft: 8 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
        Razón del gasto:
        <input
          className="input"
          type="text"
          value={razon}
          onChange={e => setRazon(e.target.value)}
          style={{ marginLeft: 8 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12, color: 'var(--text-secondary)' }}>
        Adjuntar ticket:
        <input
          className="input"
          type="file"
          accept="image/*,application/pdf"
          onChange={e => setTicket(e.target.files?.[0] || null)}
          style={{ marginLeft: 8 }}
        />
      </label>
      <button className="button-primary" type="submit" disabled={loading}>Solicitar Viático</button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {success && <p style={{ color: 'var(--accent)' }}>{success}</p>}
    </form>
  );
};

export default ViaticRequestForm;

"use client";
import React, { useState } from 'react';
import { useUser } from './UserContext';


const AttendanceForm = () => {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (tipo: 'entrada' | 'salida') => {
    setStatus(null);
    setError(null);
    if (!user) {
      setError('Usuario no autenticado');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ tipo, usuarioId: user.id, timestamp: new Date().toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al registrar asistencia');
      }
      setStatus(`Registro de ${tipo} exitoso`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error desconocido');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 400 }}>
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Registro de Entrada/Salida</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <button className="button-secondary" onClick={() => handleRegister('entrada')} disabled={loading}>Registrar Entrada</button>
        <button className="button-primary" onClick={() => handleRegister('salida')} disabled={loading}>Registrar Salida</button>
      </div>
      {status && <p style={{ color: 'var(--accent)' }}>{status}</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
};

export default AttendanceForm;

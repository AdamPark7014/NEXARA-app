"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';

const FINE_TYPES = {
  actividad: {
    label: 'Actividades',
    reasons: [
      'Incumplimiento de actividades',
      'Actividad no completada',
      'Calidad deficiente',
      'Entrega fuera de plazo',
    ],
  },
  vehiculo: {
    label: 'Vehículos',
    reasons: [
      'Daño a vehículo de la empresa',
      'Mantenimiento incompleto',
      'Uso no autorizado',
      'Combustible no justificado',
    ],
  },
  asistencia: {
    label: 'Asistencia',
    reasons: [
      'No llegar a laborar',
      'Llegada tardía a laborar',
      'Salida temprana sin autorización',
      'Ausencia injustificada',
    ],
  },
  herramienta: {
    label: 'Herramientas',
    reasons: [
      'Daño de herramienta',
      'Herramienta no devuelta',
      'Pérdida de herramienta',
      'Herramienta extraviada',
    ],
  },
};

interface User {
  id: number;
  nombre: string;
  email: string;
}

interface FineFormProps {
  onFineCreated?: () => void;
}

const FinesForm: React.FC<FineFormProps> = ({ onFineCreated }) => {
  const { user } = useUser();
  const [tipo, setTipo] = useState<keyof typeof FINE_TYPES>('actividad');
  const [razon, setRazon] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState('');
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  // Cargar lista de usuarios para asignar multas
  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl('users'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setUsuarios([]));
  }, [user?.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!usuarioSeleccionado) {
        setError('Selecciona un usuario');
        return;
      }
      if (!razon) {
        setError('Selecciona una razón');
        return;
      }
      if (!monto || Number(monto) <= 0) {
        setError('Ingresa un monto válido');
        return;
      }

      const payload = {
        usuarioId: Number(usuarioSeleccionado),
        tipo,
        razon,
        descripcion,
        monto: Number(monto),
      };

      const res = await fetch(buildApiUrl('fines'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}` || '',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al crear la multa');
      }

      setSuccess('Multa registrada correctamente');
      setRazon('');
      setDescripcion('');
      setMonto('');
      setUsuarioSeleccionado('');
      
      // Callback para recargar tabla
      if (onFineCreated) {
        onFineCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la multa');
    } finally {
      setLoading(false);
    }
  };

  const currentReasons = FINE_TYPES[tipo].reasons;

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 600, marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16, color: 'var(--primary)' }}>Nueva Multa</h3>
      
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Usuario */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Usuario
          <select
            className="input"
            value={usuarioSeleccionado}
            onChange={(e) => setUsuarioSeleccionado(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Selecciona usuario</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>

        {/* Tipo de Multa */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Tipo de Multa
          <select
            className="input"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as keyof typeof FINE_TYPES);
              setRazon(''); // Reset razón cuando cambia tipo
            }}
            disabled={loading}
          >
            {Object.entries(FINE_TYPES).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>

        {/* Razón (Dinámico basado en tipo) */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Razón
          <select
            className="input"
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Selecciona una razón</option>
            {currentReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>

        {/* Descripción */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Descripción (Opcional)
          <textarea
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalles adicionales..."
            disabled={loading}
            style={{ minHeight: 80, fontFamily: 'inherit' }}
          />
        </label>

        {/* Monto */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Monto ($)
          <input
            className="input"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            disabled={loading}
          />
        </label>

        {/* Botón */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? 'Registrando...' : 'Registrar Multa'}
          </button>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
      {success && <p style={{ color: 'var(--accent)', marginTop: 12 }}>{success}</p>}
    </form>
  );
};

export default FinesForm;

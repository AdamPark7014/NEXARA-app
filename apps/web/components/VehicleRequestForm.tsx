"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';



interface VehicleRequestFormProps {
  actividadId?: number;
}

interface ActivityOption {
  id: number;
  anNumber: string;
  titulo?: string;
}

const VehicleRequestForm: React.FC<VehicleRequestFormProps> = ({ actividadId }) => {
  const { user } = useUser();
  const [actividadSeleccionada, setActividadSeleccionada] = useState<number | ''>(actividadId || '');
  const [actividades, setActividades] = useState<ActivityOption[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [vehicles, setVehicles] = useState<{ id: number; nombre: string; placas?: string | null; estatus?: string }[]>([]);
  const [placas, setPlacas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  useEffect(() => {
    if (!user?.token) return;
    fetch(buildApiUrl('vehicles/inventory'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setVehicles(Array.isArray(data) ? data : []))
      .catch(() => setVehicles([]));
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token || actividadId) return;
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActividades(Array.isArray(data) ? data : []))
      .catch(() => setActividades([]));
  }, [user?.token, actividadId]);

  const validate = () => {
    const actividadFinal = actividadId || actividadSeleccionada;
    if (!actividadFinal) {
      setError('Selecciona una actividad');
      return false;
    }
    if (!vehicleId) {
      setError('Selecciona un vehiculo');
      return false;
    }
    if (!placas || placas.length < 3) {
      setError('Las placas deben tener al menos 3 caracteres');
      return false;
    }
    if (!motivo || motivo.length < 3) {
      setError('El motivo debe tener al menos 3 caracteres');
      return false;
    }
    if (!fechaInicio || !fechaFin) {
      setError('Selecciona un periodo de uso');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setLoading(true);
    try {
      if (!validate()) return;
      if (!user?.token) {
        setError('No hay sesion activa');
        return;
      }

      const actividadFinal = actividadId || actividadSeleccionada;
      if (!actividadFinal) {
        setError('Selecciona una actividad');
        return;
      }

      const payload = {
        actividadId: actividadFinal,
        vehicleId: Number(vehicleId),
        placasVehiculo: placas,
        motivoUso: motivo,
        fechaInicioSolicitada: fechaInicio,
        fechaFinSolicitada: fechaFin,
      };

      const res = await fetch(buildApiUrl('vehicles'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al enviar la solicitud');
      }

      setSuccess('Solicitud enviada correctamente');
      setPlacas('');
      setMotivo('');
      setFechaInicio('');
      setFechaFin('');
    } catch {
      setError('Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 560 }}>
      {actividadId && <input type="hidden" name="actividadId" value={actividadId} />}
      <h3 style={{ marginBottom: 8 }}>Solicitud de vehiculo</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        Completa los datos para solicitar un vehiculo. La evidencia de entrega se sube al finalizar el uso.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {!actividadId && (
          <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
            Actividad
            <select
              className="input"
              value={actividadSeleccionada}
              onChange={(event) => {
                const value = event.target.value;
                setActividadSeleccionada(value ? Number(value) : '');
              }}
              required
              disabled={loading}
            >
              <option value="">Selecciona actividad</option>
              {actividades.map((actividad) => (
                <option key={actividad.id} value={actividad.id}>
                  {actividad.anNumber} - {actividad.titulo || 'Sin titulo'}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Vehiculo
          <select
            className="input"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            required
            disabled={loading}
          >
            <option value="">Selecciona vehiculo</option>
            {vehicles.map((vehiculo) => (
              <option key={vehiculo.id} value={vehiculo.id}>
                {vehiculo.nombre}{vehiculo.placas ? ` (${vehiculo.placas})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Placas del vehiculo
          <input className="input" type="text" value={placas} onChange={e => setPlacas(e.target.value)} required disabled={loading} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Motivo de uso
          <input className="input" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} required disabled={loading} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Fecha inicio de uso
          <input className="input" type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required disabled={loading} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Fecha fin de uso
          <input className="input" type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} required disabled={loading} />
        </label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Solicitar vehiculo'}
          </button>
        </div>
      </div>
      {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
      {success && <p style={{ color: 'var(--accent)', marginTop: 12 }}>{success}</p>}
    </form>
  );
};

export default VehicleRequestForm;

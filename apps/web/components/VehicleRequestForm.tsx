"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './VehicleRequestForm.module.css';
import { Socket } from 'socket.io-client';
import { createRealtimeSocket } from '@/lib/realtime-socket';



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
  const [motivo, setMotivo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const extractList = <T,>(payload: unknown): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)) {
      return (payload as { data: T[] }).data;
    }
    return [];
  };

  const fetchVehicles = useCallback(async () => {
    if (!user?.token) return;
    try {
      const res = await fetch(buildApiUrl('vehicles/inventory'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = res.ok ? await res.json() : [];
      setVehicles(extractList<{ id: number; nombre: string; placas?: string | null; estatus?: string }>(data));
    } catch {
      setVehicles([]);
    }
  }, [user?.token]);

  const fetchActivities = useCallback(async () => {
    if (!user?.token || actividadId) return;
    try {
      const res = await fetch(buildApiUrl('activities'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = res.ok ? await res.json() : [];
      setActividades(extractList<ActivityOption>(data));
    } catch {
      setActividades([]);
    }
  }, [user?.token, actividadId]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchVehicles();
        fetchActivities();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Vehiculo', 'Vehicle', 'Actividad', 'Activity'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, fetchVehicles, fetchActivities]);

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
        setError('No hay sesión activa');
        return;
      }

      const actividadFinal = actividadId || actividadSeleccionada;
      if (!actividadFinal) {
        setError('Selecciona una actividad');
        return;
      }

      const selectedVehicle = vehicles.find(v => v.id === Number(vehicleId));
      const payload = {
        actividadId: actividadFinal,
        vehicleId: Number(vehicleId),
        placasVehiculo: selectedVehicle?.placas || '',
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
    <form onSubmit={handleSubmit} className={`card ${styles.form}`}>
      {actividadId && <input type="hidden" name="actividadId" value={actividadId} />}
      <h3 className={styles.title}>Solicitud de vehiculo</h3>
      <p className={styles.subtitle}>
        Completa los datos para solicitar un vehiculo. La evidencia de entrega se sube al finalizar el uso.
      </p>
      <div className={styles.fieldGrid}>
        {!actividadId && (
          <label className={styles.fieldLabel}>
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
        <label className={styles.fieldLabel}>
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
        <label className={styles.fieldLabel}>
          Motivo de uso
          <input className="input" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} required disabled={loading} />
        </label>
        <label className={styles.fieldLabel}>
          Fecha inicio de uso
          <input className="input" type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required disabled={loading} />
        </label>
        <label className={styles.fieldLabel}>
          Fecha fin de uso
          <input className="input" type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} required disabled={loading} />
        </label>
        <div className={styles.actions}>
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Solicitar vehiculo'}
          </button>
        </div>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
      {success && <p className={styles.successText}>{success}</p>}
    </form>
  );
};

export default VehicleRequestForm;


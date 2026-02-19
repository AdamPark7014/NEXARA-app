"use client";
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';

interface Activity {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  prioridad: string;
    ticketType?: string;
    client?: { id: number; name: string } | null;
    branchName?: string;
    branchCity?: string;
    branchState?: string;
    branchAddress?: string;
  descripcion?: string;
  indicaciones?: string;
  tiempoEstimadoMin?: number;
  tiempoMaximoMin?: number;
  fechaAsignacion?: string;
  fechaInicio?: string;
  fechaMaxima?: string;
  fechaEntregaEsperada?: string;
  creador?: { nombre: string };
}

const MyActivitiesTable: React.FC = () => {
  const { user } = useUser();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

  const fetchActivities = () => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('activities'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchActivities();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (payload?.model === 'Activity') {
        fetchActivities();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.token]);

  const formatDateTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMapsUrl = (activity: Activity) => {
    const query = [activity.branchAddress, activity.branchCity, activity.branchState].filter(Boolean).join(', ');
    if (!query) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
  };

  if (loading) return <div>Cargando actividades...</div>;

  return (
    <div className="card">
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis Actividades</h2>
      <table className="table">
        <thead>
          <tr>
            <th>AN</th>
            <th>Titulo</th>
            <th>Cliente</th>
            <th>Sucursal</th>
            <th>Tipo</th>
            <th>Estatus</th>
            <th>Prioridad</th>
            <th>Asignado Por</th>
            <th>Inicio</th>
            <th>Entrega</th>
            <th>Estimado/Max</th>
            <th>Indicaciones</th>
            <th>Mapa</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.id}>
              <td>{a.anNumber}</td>
              <td>{a.titulo}</td>
              <td>{a.client?.name || 'Interna'}</td>
              <td>{[a.branchName, a.branchCity, a.branchState].filter(Boolean).join(', ') || '-'}</td>
              <td>{a.ticketType || '-'}</td>
              <td><span className={`badge ${a.estatus === 'Aprobada' ? 'approved' : a.estatus === 'Pendiente' ? 'pending' : ''}`}>{a.estatus}</span></td>
              <td>{a.prioridad}</td>
              <td>{a.creador?.nombre || '-'}</td>
              <td>{formatDateTime(a.fechaInicio)}</td>
              <td>{formatDateTime(a.fechaEntregaEsperada)}</td>
              <td>{a.tiempoEstimadoMin || 0}/{a.tiempoMaximoMin || 0}</td>
              <td>{a.indicaciones || '-'}</td>
              <td>
                {getMapsUrl(a) ? (
                  <a href={getMapsUrl(a)} target="_blank" rel="noreferrer">Como llegar</a>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MyActivitiesTable;

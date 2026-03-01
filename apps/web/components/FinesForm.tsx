"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

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
  role?: {
    id: number;
    nombre: string;
  };
}

const toLocalDateInput = (date: Date) => date.toLocaleDateString('sv-SE');

const getWeekRange = (anchor: Date) => {
  const dayOfWeek = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    from: toLocalDateInput(start),
    to: toLocalDateInput(end),
  };
};

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
  const [permisoSi, setPermisoSi] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  // Verificar permisos - Admin y SuperAdmin pueden crear multas
  useEffect(() => {
    if (user) {
      const tienePermiso = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN) || !!user?.isSuperAdmin;
      setPermisoSi(tienePermiso);
    }
  }, [user]);

  // Cargar lista de usuarios asignables según jerarquía
  useEffect(() => {
    if (!user?.token) return;

    const headers = { Authorization: `Bearer ${user.token}` };

    const loadUsers = async () => {
      try {
        const assignableRes = await fetch(buildApiUrl('users/assignable'), { headers });
        const assignableData = assignableRes.ok ? await assignableRes.json() : [];
        const assignableUsers = Array.isArray(assignableData) ? assignableData : [];

        if (assignableUsers.length > 0) {
          setUsuarios(assignableUsers);
          return;
        }

        const week = getWeekRange(new Date());
        const params = new URLSearchParams({ from: week.from, to: week.to });
        const hierarchyRes = await fetch(buildApiUrl(`attendance/hierarchy/range?${params.toString()}`), { headers });
        const hierarchyData = hierarchyRes.ok ? await hierarchyRes.json() : null;
        const fallbackUsers = Array.isArray(hierarchyData?.users)
          ? hierarchyData.users
              .map((item: any) => ({
                id: Number(item.userId),
                nombre: item.userName || `Usuario ${item.userId}`,
                email: item.email || '',
                role: item.role,
              }))
              .filter((item: User) => Number.isFinite(item.id) && item.id !== user.id)
          : [];

        setUsuarios(fallbackUsers);
      } catch {
        setUsuarios([]);
      }
    };

    loadUsers();
  }, [user?.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!permisoSi) {
        setError('No tienes permisos para crear multas');
        setLoading(false);
        return;
      }

      if (!usuarioSeleccionado) {
        setError('Selecciona un usuario');
        setLoading(false);
        return;
      }
      if (!razon) {
        setError('Selecciona una razón');
        setLoading(false);
        return;
      }
      if (!monto || Number(monto) <= 0) {
        setError('Ingresa un monto válido');
        setLoading(false);
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
  const usuarioElegido = usuarios.find((u) => u.id === Number(usuarioSeleccionado));

  if (!permisoSi) {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 'min(760px, 100%)', marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--primary)' }}>Gestión de Multas</h3>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)' }}>
          ⛔ No tienes permisos para crear multas
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 'min(760px, 100%)', marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16, color: 'var(--primary)' }}>Nueva Multa</h3>
      
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Usuario - Selector Directo */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          👤 Usuario
          <select
            className="input"
            value={usuarioSeleccionado}
            onChange={(e) => setUsuarioSeleccionado(e.target.value)}
            disabled={loading || usuarios.length === 0}
            required
          >
            <option value="">Selecciona un usuario</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} {u.role ? `(${u.role.nombre})` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* Información de usuario seleccionado */}
        {usuarioElegido && (
          <div style={{
            padding: 10,
            backgroundColor: 'var(--primary)20',
            borderRadius: 4,
            fontSize: 12,
            borderLeft: '3px solid var(--primary)',
          }}>
            <div style={{ fontWeight: 500 }}>✓ {usuarioElegido.nombre}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
              {usuarioElegido.email}
            </div>
          </div>
        )}

        {/* Tipo de Multa */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          📋 Tipo de Multa
          <select
            className="input"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as keyof typeof FINE_TYPES);
              setRazon('');
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

        {/* Razón */}
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

        {/* Descripción */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          Descripción (Opcional)
          <textarea
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalles adicionales..."
            disabled={loading}
            style={{ minHeight: 70, fontFamily: 'inherit' }}
          />
        </label>

        {/* Botón */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button 
            className="button-primary" 
            type="submit" 
            disabled={loading || !usuarioSeleccionado || usuarios.length === 0}
          >
            {loading ? 'Registrando...' : '✓ Crear Multa'}
          </button>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', marginTop: 12, fontSize: 13 }}>⚠️ {error}</p>}
      {success && <p style={{ color: 'var(--accent)', marginTop: 12, fontSize: 13 }}>✓ {success}</p>}

      {/* Usuarios disponibles */}
      {usuarios.length > 0 && (
        <div style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: '#0f6ad620',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--text-secondary)',
          borderLeft: '2px solid #0f6ad6',
        }}>
          <strong style={{ color: 'var(--primary)' }}>👥 Usuarios disponibles:</strong> {usuarios.length}
        </div>
      )}

      {usuarios.length === 0 && (
        <div style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: '#ef444420',
          borderRadius: 4,
          fontSize: 12,
          color: '#ef4444',
          borderLeft: '2px solid #ef4444',
        }}>
          <strong>⚠️ Sin usuarios disponibles</strong> según tu nivel jerárquico
        </div>
      )}
    </form>
  );
};

export default FinesForm;

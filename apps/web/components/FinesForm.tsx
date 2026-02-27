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
  const [usuariosFiltrados, setUsuariosFiltrados] = useState<User[]>([]);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [permisoSi, setPermisoSi] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  // Verificar permisos
  useEffect(() => {
    if (user) {
      const tienePermiso = hasPermission(user, PERMISSIONS.FINES_MANAGE);
      setPermisoSi(tienePermiso);
    }
  }, [user]);

  // Cargar lista de usuarios asignables según jerarquía
  useEffect(() => {
    if (!user?.token) return;
    
    fetch(buildApiUrl('users/assignable'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setUsuarios([]));
  }, [user?.token]);

  // Filtrar usuarios según búsqueda
  useEffect(() => {
    if (!busquedaUsuario.trim()) {
      setUsuariosFiltrados(usuarios);
    } else {
      const termino = busquedaUsuario.toLowerCase();
      setUsuariosFiltrados(
        usuarios.filter(
          (u) =>
            u.nombre.toLowerCase().includes(termino) ||
            u.email.toLowerCase().includes(termino)
        )
      );
    }
  }, [busquedaUsuario, usuarios]);

  const handleSelectUsuario = (usuarioId: number) => {
    setUsuarioSeleccionado(String(usuarioId));
    const usuarioSel = usuarios.find((u) => u.id === usuarioId);
    setBusquedaUsuario(usuarioSel?.nombre || '');
    setMostrarDropdown(false);
  };

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
      setBusquedaUsuario('');
      
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
      <div className="card" style={{ maxWidth: 600, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, color: 'var(--primary)' }}>Gestión de Multas</h3>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)' }}>
          ⛔ No tienes permisos para crear multas
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 600, marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16, color: 'var(--primary)' }}>Nueva Multa</h3>
      
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Usuario con búsqueda jerárquica */}
        <div style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          <label htmlFor="usuario-search" style={{ fontWeight: 500 }}>
            👤 Seleccionar Usuario
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
              (Según tu nivel jerárquico)
            </span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="usuario-search"
              className="input"
              type="text"
              placeholder="Buscar usuario por nombre o email..."
              value={busquedaUsuario}
              onChange={(e) => {
                setBusquedaUsuario(e.target.value);
                setMostrarDropdown(true);
              }}
              onFocus={() => setMostrarDropdown(true)}
              disabled={loading || usuarios.length === 0}
              style={{
                width: '100%',
              }}
            />
            
            {/* Información de usuarios disponibles */}
            {usuarios.length === 0 && !loading && (
              <div style={{
                marginTop: 4,
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
              }}>
                No hay usuarios disponibles según tu nivel
              </div>
            )}

            {/* Dropdown de usuarios */}
            {mostrarDropdown && usuarios.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  maxHeight: 240,
                  overflowY: 'auto',
                  zIndex: 10,
                  marginTop: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                {usuariosFiltrados.length > 0 ? (
                  usuariosFiltrados.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => handleSelectUsuario(u.id)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        backgroundColor:
                          usuarioSeleccionado === String(u.id)
                            ? 'var(--primary)20'
                            : 'transparent',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (usuarioSeleccionado !== String(u.id)) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (usuarioSeleccionado !== String(u.id)) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {u.nombre}
                        {u.role && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8, fontWeight: 'normal' }}>
                            ({u.role.nombre})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {u.email}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                    No se encontraron usuarios
                  </div>
                )}
              </div>
            )}

            {/* Usuario seleccionado */}
            {usuarioElegido && (
              <div style={{
                marginTop: 8,
                padding: 10,
                backgroundColor: 'var(--primary)20',
                borderRadius: 4,
                fontSize: 12,
                borderLeft: '3px solid var(--primary)',
              }}>
                <div style={{ fontWeight: 500 }}>✓ Seleccionado: {usuarioElegido.nombre}</div>
                {usuarioElegido.role && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                    Rol: {usuarioElegido.role.nombre}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tipo de Multa */}
        <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)' }}>
          📋 Tipo de Multa
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

      {/* Información sobre permisos */}
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
          <strong style={{ color: 'var(--primary)' }}>Usuarios disponibles:</strong> {usuarios.length}
        </div>
      )}
    </form>
  );
};

export default FinesForm;

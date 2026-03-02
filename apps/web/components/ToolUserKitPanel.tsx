"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from './UserContext';

interface AssignableUser {
  id: number;
  nombre: string;
  email: string;
}

interface InventoryOption {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
}

interface UserKitRow {
  id: number;
  assignmentType: 'KIT' | 'LOAN';
  isActive: boolean;
  assignedAt: string;
  dueReturnDate?: string | null;
  replacementCount: number;
  user: { id: number; nombre: string; email: string; role?: { nombre?: string } };
  inventoryItem: { toolName: string; model: string; serialNumber: string; status: string };
  events?: {
    id: number;
    description: string;
    resolution: 'PENDING' | 'USER_MISUSE' | 'EQUIPMENT_FAILURE';
    reportedAt: string;
  }[];
}

const ToolUserKitPanel: React.FC = () => {
  const { user } = useUser();
  const [rows, setRows] = useState<UserKitRow[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);
  const [selectedInventory, setSelectedInventory] = useState<InventoryOption | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignmentType, setAssignmentType] = useState<'KIT' | 'LOAN'>('KIT');
  const [filterUserId, setFilterUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const fetchRows = async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl('tool-requests/kits/users'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) throw new Error('No se pudo cargar la gestión de kits');
      const payload = await response.json();
      setRows(Array.isArray(payload) ? payload : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignableUsers = async () => {
    if (!user?.token) return;
    try {
      const response = await fetch(buildApiUrl('users/assignable'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) return;
      const payload = await response.json();
      setUsers(Array.isArray(payload) ? payload : []);
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    fetchRows();
    fetchAssignableUsers();
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token || inventoryQuery.trim().length < 2) {
      setInventoryOptions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: inventoryQuery.trim() });
        const response = await fetch(buildApiUrl(`tool-requests/inventory/search?${params.toString()}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!response.ok) return;
        const payload = await response.json();
        setInventoryOptions(Array.isArray(payload) ? payload : []);
      } catch {
        setInventoryOptions([]);
      }
    }, 260);

    return () => clearTimeout(timeout);
  }, [inventoryQuery, user?.token]);

  const groupedByUser = useMemo(() => {
    const map = new Map<number, { user: UserKitRow['user']; rows: UserKitRow[] }>();

    rows.forEach((row) => {
      if (!map.has(row.user.id)) {
        map.set(row.user.id, { user: row.user, rows: [] });
      }
      map.get(row.user.id)!.rows.push(row);
    });

    const grouped = Array.from(map.values()).sort((a, b) => a.user.nombre.localeCompare(b.user.nombre));
    if (!filterUserId) return grouped;
    return grouped.filter((group) => group.user.id === Number(filterUserId));
  }, [rows, filterUserId]);

  const resolveEvent = async (eventId: number) => {
    if (!user?.token) return;

    const misuse = window.confirm('Resolver como MAL USO del usuario? (Aceptar = Sí / Cancelar = Falla de equipo)');
    const resolution = misuse ? 'USER_MISUSE' : 'EQUIPMENT_FAILURE';
    const notes = window.prompt('Notas de resolución (opcional)') || undefined;

    let fineAmount: number | undefined;
    if (resolution === 'USER_MISUSE') {
      const amountInput = window.prompt('Monto de multa (MXN)', '500');
      fineAmount = Number(amountInput);
      if (!fineAmount || fineAmount <= 0) {
        setError('Debes indicar un monto válido para multa por mal uso');
        return;
      }
    }

    try {
      const response = await fetch(buildApiUrl(`tool-requests/kits/events/${eventId}/resolve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ resolution, notes, fineAmount }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo resolver el incidente');
      }

      await fetchRows();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !selectedInventory || !selectedUserId) return;

    try {
      const response = await fetch(buildApiUrl('tool-requests/kits/assign'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          inventoryItemId: selectedInventory.id,
          userId: Number(selectedUserId),
          assignmentType,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo asignar herramienta');
      }

      setSelectedInventory(null);
      setInventoryQuery('');
      setInventoryOptions([]);
      setSelectedUserId('');
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={assign}>
        <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>👥 Gestión de Herramientas por Usuario</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 8 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <input
              className="input"
              value={inventoryQuery}
              onChange={(e) => {
                setInventoryQuery(e.target.value);
                if (selectedInventory) setSelectedInventory(null);
              }}
              placeholder="Buscar herramienta de inventario"
            />
            {!selectedInventory && inventoryOptions.length > 0 && (
              <div style={{ border: '1px solid var(--muted)', borderRadius: 8, maxHeight: 160, overflow: 'auto' }}>
                {inventoryOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSelectedInventory(option);
                      setInventoryQuery(`${option.toolName} · ${option.model} · ${option.serialNumber}`);
                      setInventoryOptions([]);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid var(--muted)',
                      background: 'transparent',
                      padding: '8px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {option.toolName} · {option.model} · {option.serialNumber}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">Selecciona usuario</option>
            {users.map((target) => (
              <option key={target.id} value={target.id}>{target.nombre} · {target.email}</option>
            ))}
          </select>

          <select className="input" value={assignmentType} onChange={(e) => setAssignmentType(e.target.value as 'KIT' | 'LOAN')}>
            <option value="KIT">Kit Base</option>
            <option value="LOAN">Préstamo</option>
          </select>

          <button className="button-primary" type="submit">Asignar</button>
        </div>
      </form>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
            <option value="">Filtrar: todos los usuarios</option>
            {users.map((target) => (
              <option key={target.id} value={target.id}>{target.nombre}</option>
            ))}
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16 }}>Cargando asignaciones...</div>
        ) : groupedByUser.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>
            No hay asignaciones registradas
          </div>
        ) : (
          groupedByUser.map((group) => (
            <div key={group.user.id} style={{ border: '1px solid var(--muted)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{group.user.nombre}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{group.user.email}</div>

              <div style={{ display: 'grid', gap: 6 }}>
                {group.rows.map((row) => (
                  <div key={row.id} style={{ background: 'var(--surface-light)', border: '1px solid var(--muted)', borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      {row.inventoryItem.toolName} · {row.inventoryItem.model} · {row.inventoryItem.serialNumber}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {row.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'} · Reemplazos: {row.replacementCount} · {row.isActive ? 'Activa' : 'Cerrada'}
                    </div>

                    {row.events && row.events.length > 0 && (
                      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                        {row.events.slice(0, 3).map((event) => (
                          <div key={event.id} style={{ border: '1px solid var(--muted)', borderRadius: 6, padding: 6, background: 'var(--surface)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {new Date(event.reportedAt).toLocaleDateString('es-MX')} · {event.resolution}
                            </div>
                            <div style={{ fontSize: 12 }}>{event.description}</div>
                            {event.resolution === 'PENDING' && (
                              <button
                                className="button-secondary"
                                style={{ marginTop: 6, padding: '4px 8px', fontSize: 11 }}
                                onClick={() => resolveEvent(event.id)}
                              >
                                Resolver incidente
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ToolUserKitPanel;

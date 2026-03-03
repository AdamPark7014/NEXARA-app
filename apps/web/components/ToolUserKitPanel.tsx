"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from './UserContext';
import styles from './ToolUserKitPanel.module.css';

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
  const [isMobile, setIsMobile] = useState(false);
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
  const [resolvingEventId, setResolvingEventId] = useState<number | null>(null);
  const [resolutionType, setResolutionType] = useState<'USER_MISUSE' | 'EQUIPMENT_FAILURE'>('EQUIPMENT_FAILURE');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionFineAmount, setResolutionFineAmount] = useState<string>('500');
  const [resolvingSubmit, setResolvingSubmit] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

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
      if (!response.ok) {
        setUsers(user?.id ? [{ id: user.id, nombre: user.nombre || 'Mi usuario', email: user.email || '' }] : []);
        return;
      }
      const payload = await response.json();
      const parsed = Array.isArray(payload) ? payload : [];
      if (user?.id && !parsed.some((target) => target.id === user.id)) {
        parsed.push({ id: user.id, nombre: user.nombre || 'Mi usuario', email: user.email || '' });
      }
      setUsers(parsed);
    } catch {
      setUsers(user?.id ? [{ id: user.id, nombre: user.nombre || 'Mi usuario', email: user.email || '' }] : []);
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

  const openResolveForm = (eventId: number) => {
    setResolvingEventId(eventId);
    setResolutionType('EQUIPMENT_FAILURE');
    setResolutionNotes('');
    setResolutionFineAmount('500');
    setError(null);
  };

  const cancelResolveForm = () => {
    setResolvingEventId(null);
    setResolutionNotes('');
    setResolutionFineAmount('500');
    setResolvingSubmit(false);
  };

  const resolveEvent = async (eventId: number) => {
    if (!user?.token) return;

    let fineAmount: number | undefined = undefined;
    if (resolutionType === 'USER_MISUSE') {
      fineAmount = Number(resolutionFineAmount);
      if (!fineAmount || fineAmount <= 0 || Number.isNaN(fineAmount)) {
        setError('Debes indicar un monto válido para multa por mal uso');
        return;
      }
    }

    setResolvingSubmit(true);
    try {
      const response = await fetch(buildApiUrl(`tool-requests/kits/events/${eventId}/resolve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          resolution: resolutionType,
          notes: resolutionNotes.trim() || undefined,
          fineAmount,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo resolver el incidente');
      }

      await fetchRows();
      setError(null);
      cancelResolveForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setResolvingSubmit(false);
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
    <div className={styles.root}>
      <form className={`card ${styles.formCard}`} onSubmit={assign}>
        <h3 className={styles.title}>👥 Gestión de Herramientas por Usuario</h3>

        <div className={`${styles.formGrid} ${isMobile ? styles.formGridMobile : ''}`}>
          <div className={styles.searchWrap}>
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
              <div className={styles.suggestionBox}>
                {inventoryOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSelectedInventory(option);
                      setInventoryQuery(`${option.toolName} · ${option.model} · ${option.serialNumber}`);
                      setInventoryOptions([]);
                    }}
                    className={styles.suggestionItem}
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

      <div className={`card ${styles.listCard}`}>
        <div className={styles.filterRow}>
          <select className="input" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
            <option value="">Filtrar: todos los usuarios</option>
            {users.map((target) => (
              <option key={target.id} value={target.id}>{target.nombre}</option>
            ))}
          </select>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {loading ? (
          <div className={styles.loading}>Cargando asignaciones...</div>
        ) : groupedByUser.length === 0 ? (
          <div className={styles.empty}>
            No hay asignaciones registradas
          </div>
        ) : (
          groupedByUser.map((group) => (
            <div key={group.user.id} className={styles.userGroup}>
              <div className={styles.userName}>{group.user.nombre}</div>
              <div className={styles.userEmail}>{group.user.email}</div>

              <div className={styles.rowsList}>
                {group.rows.map((row) => (
                  <div key={row.id} className={styles.rowCard}>
                    <div className={styles.rowTitle}>
                      {row.inventoryItem.toolName} · {row.inventoryItem.model} · {row.inventoryItem.serialNumber}
                    </div>
                    <div className={styles.rowMeta}>
                      {row.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'} · Reemplazos: {row.replacementCount} · {row.isActive ? 'Activa' : 'Cerrada'}
                    </div>

                    {row.events && row.events.length > 0 && (
                      <div className={styles.eventsList}>
                        {row.events.slice(0, 3).map((event) => (
                          <div key={event.id} className={styles.eventCard}>
                            <div className={styles.eventMeta}>
                              {new Date(event.reportedAt).toLocaleDateString('es-MX')} · {event.resolution}
                            </div>
                            <div className={styles.eventDesc}>{event.description}</div>
                            {event.resolution === 'PENDING' && (
                              <div className={styles.resolveWrap}>
                                {resolvingEventId !== event.id ? (
                                  <button
                                    className={`button-secondary ${styles.smallBtn}`}
                                    onClick={() => openResolveForm(event.id)}
                                  >
                                    Resolver incidente
                                  </button>
                                ) : (
                                  <div className={styles.resolveForm}>
                                    <select
                                      className="input"
                                      value={resolutionType}
                                      onChange={(e) => setResolutionType(e.target.value as 'USER_MISUSE' | 'EQUIPMENT_FAILURE')}
                                    >
                                      <option value="EQUIPMENT_FAILURE">Falla de equipo (reemplazo / reparación)</option>
                                      <option value="USER_MISUSE">Mal uso del usuario (genera multa)</option>
                                    </select>

                                    {resolutionType === 'USER_MISUSE' && (
                                      <input
                                        className="input"
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        value={resolutionFineAmount}
                                        onChange={(e) => setResolutionFineAmount(e.target.value)}
                                        placeholder="Monto de multa"
                                      />
                                    )}

                                    <textarea
                                      className={`input ${styles.notes}`}
                                      value={resolutionNotes}
                                      onChange={(e) => setResolutionNotes(e.target.value)}
                                      placeholder="Notas de resolución (opcional)"
                                    />

                                    <div className={styles.resolveActions}>
                                      <button
                                        className={`button-primary ${styles.smallBtnSecondary}`}
                                        onClick={() => resolveEvent(event.id)}
                                        disabled={resolvingSubmit}
                                      >
                                        {resolvingSubmit ? 'Resolviendo...' : 'Guardar resolución'}
                                      </button>
                                      <button
                                        className={`button-secondary ${styles.smallBtnSecondary}`}
                                        onClick={cancelResolveForm}
                                        disabled={resolvingSubmit}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
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

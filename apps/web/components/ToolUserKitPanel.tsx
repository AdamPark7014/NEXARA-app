"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import KpiCard from './ui/KpiCard';
import styles from './ToolUserKitPanel.module.css';
import { io, Socket } from 'socket.io-client';

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
  panoramicPhotoUrl?: string | null;
  serialPhotoUrl?: string | null;
}

interface UserKitRow {
  id: number;
  assignmentType: 'KIT' | 'LOAN';
  isActive: boolean;
  assignedAt: string;
  dueReturnDate?: string | null;
  replacementCount: number;
  user: { id: number; nombre: string; email: string; role?: { nombre?: string } };
  inventoryItem: {
    toolName: string;
    model: string;
    serialNumber: string;
    status: string;
    panoramicPhotoUrl?: string | null;
    serialPhotoUrl?: string | null;
  };
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


  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  const fetchRows = useCallback(async () => {
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
  }, [user?.token]);

  const fetchAssignableUsers = useCallback(async () => {
    if (!user?.token) return;
    try {
      const response = await fetch(buildApiUrl('users/assignable'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) {
        setUsers([]);
        return;
      }
      const payload = await response.json();
      setUsers(Array.isArray(payload) ? payload : []);
    } catch {
      setUsers([]);
    }
  }, [user?.token, user?.id, user?.nombre, user?.email]);

  const searchInventory = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!user?.token || query.length < 2) {
      setInventoryOptions([]);
      return;
    }
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(buildApiUrl(`tool-requests/inventory/search?${params.toString()}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) {
        setInventoryOptions([]);
        return;
      }
      const payload = await response.json();
      setInventoryOptions(Array.isArray(payload) ? payload : []);
    } catch {
      setInventoryOptions([]);
    }
  }, [user?.token]);

  useEffect(() => {
    fetchRows();
    fetchAssignableUsers();
  }, [fetchRows, fetchAssignableUsers]);

  useEffect(() => {
    if (inventoryQuery.trim().length < 2) {
      setInventoryOptions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      searchInventory(inventoryQuery);
    }, 260);

    return () => clearTimeout(timeout);
  }, [inventoryQuery, searchInventory]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchRows();
        fetchAssignableUsers();
        if (inventoryQuery.trim().length >= 2) {
          searchInventory(inventoryQuery);
        }
      }, 280);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolAssignment', 'ToolKitEvent', 'ToolInventoryItem', 'User'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, inventoryQuery, fetchRows, fetchAssignableUsers, searchInventory]);

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

  const pendingEvents = rows.reduce(
    (acc, row) => acc + (row.events?.filter((e) => e.resolution === 'PENDING').length ?? 0),
    0,
  );
  const kitCounts = {
    activeAssignments: rows.filter((r) => r.isActive).length,
    usersWithKit: groupedByUser.length,
    loans: rows.filter((r) => r.isActive && r.assignmentType === 'LOAN').length,
    pendingEvents,
  };

  return (
    <div className={styles.root}>
      {!loading && rows.length > 0 && (() => {
        const kits = rows.filter(r => r.isActive && r.assignmentType === 'KIT').length;
        const loans = rows.filter(r => r.isActive && r.assignmentType === 'LOAN').length;
        const inactive = rows.filter(r => !r.isActive).length;
        const total = rows.length;
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 }}>
              <KpiCard label="Asignaciones activas" value={kitCounts.activeAssignments} icon="🧰" />
              <KpiCard label="Usuarios con kit" value={kitCounts.usersWithKit} icon="👥" variant="accent" />
              <KpiCard label="Préstamos activos" value={kitCounts.loans} icon="🔁" />
              <KpiCard label="Incidentes pendientes" value={kitCounts.pendingEvents} icon="⚠️" variant={kitCounts.pendingEvents > 0 ? "danger" : "positive"} />
            </div>
            <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por tipo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {([
                  { label: "Kit base", count: kits, color: "var(--primary)" },
                  { label: "Préstamos", count: loans, color: "var(--warning)" },
                  { label: "Cerradas", count: inactive, color: "var(--text-tertiary)" },
                ] as { label: string; count: number; color: string }[]).filter(r => r.count > 0).map(r => (
                  <div key={r.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

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
            <option value="">Selecciona ingeniero</option>
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
                {group.rows.map((row) => {
                  const panoramicSrc = row.inventoryItem.panoramicPhotoUrl
                    ? resolveAssetUrl(row.inventoryItem.panoramicPhotoUrl)
                    : '';
                  const serialSrc = row.inventoryItem.serialPhotoUrl
                    ? resolveAssetUrl(row.inventoryItem.serialPhotoUrl)
                    : '';

                  return (
                  <div key={row.id} className={styles.rowCard}>
                    <div className={styles.rowTitle}>
                      {row.inventoryItem.toolName} · {row.inventoryItem.model} · {row.inventoryItem.serialNumber}
                    </div>
                    <div className={styles.rowMeta}>
                      {row.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'} · Reemplazos: {row.replacementCount} · {row.isActive ? 'Activa' : 'Cerrada'}
                    </div>

                    {(panoramicSrc || serialSrc) && (
                      <div className={styles.photoGrid}>
                        {panoramicSrc && (
                          <div className={styles.photoBlock}>
                            <div className={styles.photoLabel}>Panorámica</div>
                            <img src={panoramicSrc} alt="" className={styles.photoImage} />
                          </div>
                        )}
                        {serialSrc && (
                          <div className={styles.photoBlock}>
                            <div className={styles.photoLabel}>Serie</div>
                            <img src={serialSrc} alt="" className={styles.photoImage} />
                          </div>
                        )}
                      </div>
                    )}

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
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ToolUserKitPanel;

"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import BackpackOutlined from '@mui/icons-material/BackpackOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import AutorenewOutlined from '@mui/icons-material/AutorenewOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import QrCodeScannerOutlined from '@mui/icons-material/QrCodeScannerOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import { useUser } from './UserContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  FieldGrid,
  FormSection,
  Input,
  PersonCell,
  Segmented,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  Textarea,
  type StatMeterSegment,
  type Tone,
} from './base';
import { FotoAlmacen, claseMono } from './almacen/PiezasAlmacen';
import styles from './ToolUserKitPanel.module.css';
import { Socket } from 'socket.io-client';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import { buscarHerramientaPorCodigo } from '@/lib/almacen-api';
import { ATRIBUTO_CAMPO_LECTOR, useLectorDeCodigos } from '@/lib/lector-codigos';
import EtiquetasHerramientaDialog from '@/components/almacen/EtiquetasHerramientaDialog';
import type { HerramientaEtiquetable } from '@/lib/etiquetas-herramienta';

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
    id: number;
    toolName: string;
    model: string;
    serialNumber: string;
    codigoInterno?: string | null;
    barcode?: string | null;
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

/** Cómo se resolvió un incidente del kit: los mismos textos de las opciones. */
const RESOLUCION: Record<string, { etiqueta: string; tono: Tone }> = {
  PENDING: { etiqueta: 'Pendiente', tono: 'warning' },
  USER_MISUSE: { etiqueta: 'Mal uso del usuario', tono: 'danger' },
  EQUIPMENT_FAILURE: { etiqueta: 'Falla de equipo', tono: 'info' },
};

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
  const [resolvingEventId, setResolvingEventId] = useState<number | null>(null);
  const [resolutionType, setResolutionType] = useState<'USER_MISUSE' | 'EQUIPMENT_FAILURE'>('EQUIPMENT_FAILURE');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionFineAmount, setResolutionFineAmount] = useState<string>('500');
  const [resolvingSubmit, setResolvingSubmit] = useState(false);
  // Etiquetas del kit de una persona: las herramientas y a quién pertenecen.
  const [etiquetas, setEtiquetas] = useState<{ de: string; herramientas: HerramientaEtiquetable[] } | null>(null);
  const [avisoLector, setAvisoLector] = useState<string | null>(null);


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
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
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

  /**
   * Armar un kit con el lector: se escanea la etiqueta de cada herramienta y queda
   * elegida, sin buscarla por nombre. Solo se elige si está en almacén; si la tiene
   * alguien, se dice quién, que es justo lo que hay que saber antes de reasignarla.
   */
  const elegirPorEtiqueta = useCallback(
    async (codigo: string) => {
      if (!user?.token) return;
      setAvisoLector(null);
      try {
        const hallazgo = await buscarHerramientaPorCodigo(user.token, codigo);
        if (!hallazgo) {
          setAvisoLector(`Ninguna herramienta tiene la etiqueta «${codigo.trim().toUpperCase()}».`);
          return;
        }
        const { item, kit, prestamo } = hallazgo;
        if (item.status !== 'AVAILABLE') {
          const quien = kit?.user?.nombre ?? prestamo?.usuario?.nombre;
          setAvisoLector(
            quien
              ? `${item.toolName} (${hallazgo.codigo}) la tiene ${quien}: no está en almacén para asignarla.`
              : `${item.toolName} (${hallazgo.codigo}) no está disponible para asignar.`,
          );
          return;
        }
        setSelectedInventory(item);
        setInventoryQuery(`${item.toolName} · ${item.model} · ${item.serialNumber}`);
        setInventoryOptions([]);
      } catch (err) {
        setAvisoLector(err instanceof Error ? err.message : 'No se pudo leer la etiqueta');
      }
    },
    [user?.token],
  );

  // Apagado mientras el diálogo de etiquetas está abierto: ahí no se asigna nada.
  useLectorDeCodigos({ onEscaneo: (codigo) => void elegirPorEtiqueta(codigo), activo: !etiquetas });

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
  const kitsActivos = rows.filter((r) => r.isActive && r.assignmentType === 'KIT').length;
  const cerradas = rows.filter((r) => !r.isActive).length;

  return (
    <div className={styles.root}>
      {!loading && rows.length > 0 && (
        <StatRow ariaLabel="Resumen de kits" cols={4}>
          <Stat
            label="Asignaciones activas"
            value={kitCounts.activeAssignments}
            icon={<BackpackOutlined />}
            meter={[
              { value: kitsActivos, tone: 'brand', label: 'Kit base' },
              { value: kitCounts.loans, tone: 'warning', label: 'Préstamos' },
              { value: cerradas, tone: 'neutral', label: 'Cerradas' },
            ].filter((m) => m.value > 0) as StatMeterSegment[]}
            meterMax={rows.length}
          />
          <Stat label="Usuarios con kit" value={kitCounts.usersWithKit} icon={<GroupsOutlined />} iconTone="info" />
          <Stat label="Préstamos activos" value={kitCounts.loans} icon={<AutorenewOutlined />} iconTone="warning" />
          <Stat
            label="Incidentes pendientes"
            value={kitCounts.pendingEvents}
            tone={kitCounts.pendingEvents > 0 ? 'danger' : 'success'}
            icon={<ReportProblemOutlined />}
            iconTone={kitCounts.pendingEvents > 0 ? 'danger' : 'success'}
            semaforo={kitCounts.pendingEvents > 0 ? 'rojo' : 'verde'}
          />
        </StatRow>
      )}

      <form onSubmit={assign}>
        <FormSection
          title="Gestión de herramientas por usuario"
          description="Escanea la etiqueta (o busca la herramienta), elige a la persona y si es su kit base o un préstamo."
        >
          <div className={styles.formGrid}>
            <Field label="Herramienta" required>
              <div className={styles.searchWrap}>
                <Input
                  // Campo del lector: escanear la etiqueta con el foco aquí elige la
                  // herramienta, en vez de enviar el formulario con el Enter del lector.
                  {...{ [ATRIBUTO_CAMPO_LECTOR]: '' }}
                  iconStart={<QrCodeScannerOutlined fontSize="small" />}
                  value={inventoryQuery}
                  onChange={(e) => {
                    setInventoryQuery(e.target.value);
                    if (selectedInventory) setSelectedInventory(null);
                  }}
                  placeholder="Escanea la etiqueta o busca la herramienta"
                  aria-label="Escanea la etiqueta o busca la herramienta"
                  valid={Boolean(selectedInventory)}
                />
                {!selectedInventory && inventoryOptions.length > 0 && (
                  <ul className={styles.suggestionBox} aria-label="Herramientas que coinciden">
                    {inventoryOptions.map((option) => (
                      <li key={option.id}>
                        <Button
                          variant="ghost"
                          fullWidth
                          className={styles.suggestionItem}
                          iconStart={<FotoAlmacen src={option.panoramicPhotoUrl} tipo="herramienta" size={28} />}
                          onClick={() => {
                            setSelectedInventory(option);
                            setInventoryQuery(`${option.toolName} · ${option.model} · ${option.serialNumber}`);
                            setInventoryOptions([]);
                          }}
                        >
                          {option.toolName} · {option.model} · {option.serialNumber}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            <Field label="Persona" required>
              <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">Selecciona ingeniero</option>
                {users.map((target) => (
                  <option key={target.id} value={target.id}>{target.nombre} · {target.email}</option>
                ))}
              </Select>
            </Field>

            <Field label="Tipo">
              <Segmented
                ariaLabel="Tipo de asignación"
                value={assignmentType}
                onChange={setAssignmentType}
                items={[
                  { id: 'KIT', label: 'Kit Base' },
                  { id: 'LOAN', label: 'Préstamo' },
                ]}
              />
            </Field>

            <div className={styles.asignar}>
              <Button type="submit" variant="primary" disabled={!selectedInventory || !selectedUserId}>
                Asignar
              </Button>
            </div>
          </div>
          {avisoLector && (
            <Alert tone="warning" role="alert" onDismiss={() => setAvisoLector(null)} className={styles.avisoLector}>
              {avisoLector}
            </Alert>
          )}
        </FormSection>
      </form>

      <Card aria-label="Kits por persona">
        <CardHead
          title="Kits por persona"
          subtitle="Lo que tiene asignado cada quien, sus fotos y los incidentes por resolver."
          actions={
            <Select
              controlSize="sm"
              wrapperClassName={styles.filtroUsuario}
              aria-label="Filtrar por usuario"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
            >
              <option value="">Filtrar: todos los usuarios</option>
              {users.map((target) => (
                <option key={target.id} value={target.id}>{target.nombre}</option>
              ))}
            </Select>
          }
        />

        {error && (
          <div className={styles.aviso}>
            <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}
        {loading ? (
          <div className={styles.cuerpo}>
            <SkeletonRows rows={4} label="Cargando asignaciones" />
          </div>
        ) : groupedByUser.length === 0 ? (
          <EmptyState size="compact" icon={<BackpackOutlined />} title="No hay asignaciones registradas" />
        ) : (
          <div className={styles.cuerpo}>
            {groupedByUser.map((group) => {
              const activas = group.rows.filter((row) => row.isActive);
              return (
                <section key={group.user.id} className={styles.userGroup} aria-label={`Kit de ${group.user.nombre}`}>
                  <header className={styles.userHead}>
                    <PersonCell name={group.user.nombre} subtitle={group.user.email} size={36} />
                    <span className={styles.userHeadEnd}>
                      <Badge tone="neutral" size="sm">
                        {activas.length} activa{activas.length === 1 ? '' : 's'}
                      </Badge>
                      {activas.length > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          iconStart={<PrintOutlined fontSize="small" />}
                          onClick={() =>
                            setEtiquetas({
                              de: group.user.nombre,
                              herramientas: activas.map((row) => row.inventoryItem),
                            })
                          }
                        >
                          Imprimir etiquetas del kit
                        </Button>
                      )}
                    </span>
                  </header>

                  <ul className={styles.rowsList}>
                    {group.rows.map((row) => {
                      const panoramicSrc = row.inventoryItem.panoramicPhotoUrl
                        ? resolveAssetUrl(row.inventoryItem.panoramicPhotoUrl)
                        : '';
                      const serialSrc = row.inventoryItem.serialPhotoUrl
                        ? resolveAssetUrl(row.inventoryItem.serialPhotoUrl)
                        : '';

                      return (
                        <li key={row.id} className={styles.rowCard} data-cerrada={row.isActive ? undefined : 'true'}>
                          <div className={styles.rowTop}>
                            <FotoAlmacen
                              src={row.inventoryItem.panoramicPhotoUrl}
                              tipo="herramienta"
                              size={48}
                              href={panoramicSrc || null}
                              alt={`${row.inventoryItem.toolName}, panorámica`}
                            />
                            <div className={styles.rowTexto}>
                              <div className={styles.rowTitle}>
                                {row.inventoryItem.toolName} · {row.inventoryItem.model} · {row.inventoryItem.serialNumber}
                              </div>
                              <div className={styles.rowMeta}>
                                <Badge tone={row.assignmentType === 'KIT' ? 'brand' : 'warning'} size="sm">
                                  {row.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'}
                                </Badge>
                                <StatusBadge label={row.isActive ? 'Activa' : 'Cerrada'} tone={row.isActive ? 'success' : 'neutral'} size="sm" dot />
                                <span>Reemplazos: {row.replacementCount}</span>
                                {row.inventoryItem.codigoInterno ? <code className={claseMono}>{row.inventoryItem.codigoInterno}</code> : null}
                              </div>
                            </div>
                            {serialSrc ? (
                              <FotoAlmacen
                                src={row.inventoryItem.serialPhotoUrl}
                                tipo="herramienta"
                                size={48}
                                href={serialSrc}
                                alt={`${row.inventoryItem.toolName}, serie`}
                                className={styles.fotoSerie}
                              />
                            ) : null}
                          </div>

                          {row.events && row.events.length > 0 && (
                            <ul className={styles.eventsList}>
                              {row.events.slice(0, 3).map((event) => {
                                const res = RESOLUCION[event.resolution] ?? { etiqueta: event.resolution, tono: 'neutral' as Tone };
                                return (
                                  <li key={event.id} className={styles.eventCard} data-pendiente={event.resolution === 'PENDING' ? 'true' : undefined}>
                                    <div className={styles.eventMeta}>
                                      <span>{new Date(event.reportedAt).toLocaleDateString('es-MX')}</span>
                                      <StatusBadge label={res.etiqueta} tone={res.tono} size="sm" />
                                    </div>
                                    <div className={styles.eventDesc}>{event.description}</div>
                                    {event.resolution === 'PENDING' && (
                                      <div className={styles.resolveWrap}>
                                        {resolvingEventId !== event.id ? (
                                          <Button size="sm" variant="tonal" onClick={() => openResolveForm(event.id)}>
                                            Resolver incidente
                                          </Button>
                                        ) : (
                                          <div className={styles.resolveForm}>
                                            <FieldGrid>
                                              <Field label="Qué pasó" fullWidth={resolutionType !== 'USER_MISUSE'}>
                                                <Select
                                                  value={resolutionType}
                                                  onChange={(e) => setResolutionType(e.target.value as 'USER_MISUSE' | 'EQUIPMENT_FAILURE')}
                                                >
                                                  <option value="EQUIPMENT_FAILURE">Falla de equipo (reemplazo / reparación)</option>
                                                  <option value="USER_MISUSE">Mal uso del usuario (genera multa)</option>
                                                </Select>
                                              </Field>

                                              {resolutionType === 'USER_MISUSE' && (
                                                <Field label="Monto de multa" required>
                                                  <Input
                                                    type="number"
                                                    min="1"
                                                    step="0.01"
                                                    inputMode="decimal"
                                                    value={resolutionFineAmount}
                                                    onChange={(e) => setResolutionFineAmount(e.target.value)}
                                                    placeholder="Monto de multa"
                                                  />
                                                </Field>
                                              )}

                                              <Field label="Notas de resolución" optional fullWidth>
                                                <Textarea
                                                  rows={3}
                                                  value={resolutionNotes}
                                                  onChange={(e) => setResolutionNotes(e.target.value)}
                                                  placeholder="Notas de resolución (opcional)"
                                                />
                                              </Field>
                                            </FieldGrid>

                                            <div className={styles.resolveActions}>
                                              <Button size="sm" variant="ghost" onClick={cancelResolveForm} disabled={resolvingSubmit}>
                                                Cancelar
                                              </Button>
                                              <Button size="sm" variant="primary" onClick={() => resolveEvent(event.id)} loading={resolvingSubmit}>
                                                Guardar resolución
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      <EtiquetasHerramientaDialog
        herramientas={etiquetas?.herramientas ?? null}
        titulo={etiquetas ? `Kit de ${etiquetas.de}: una etiqueta por herramienta.` : undefined}
        onClose={() => setEtiquetas(null)}
      />
    </div>
  );
};

export default ToolUserKitPanel;

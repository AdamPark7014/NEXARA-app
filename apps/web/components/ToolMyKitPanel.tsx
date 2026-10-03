"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useState, useCallback } from 'react';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { useUser } from './UserContext';
import styles from './ToolMyKitPanel.module.css';
import { Socket } from 'socket.io-client';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  type Tone,
} from '@/components/base';

interface KitEvent {
  id: number;
  description: string;
  resolution: 'PENDING' | 'USER_MISUSE' | 'EQUIPMENT_FAILURE';
  reportedAt: string;
}

interface KitAssignment {
  id: number;
  assignmentType: 'KIT' | 'LOAN';
  assignedAt: string;
  dueReturnDate?: string | null;
  replacementCount: number;
  inventoryItem: {
    id: number;
    toolName: string;
    model: string;
    serialNumber: string;
    status: string;
    panoramicPhotoUrl?: string | null;
    serialPhotoUrl?: string | null;
  };
  events: KitEvent[];
}

/** Estado del inventario, con las mismas etiquetas que el panel de inventario. */
const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponible',
  ASSIGNED: 'Asignada',
  IN_REPAIR: 'En reparación',
  RETIRED: 'Retirada',
};
const STATUS_TONE: Record<string, Tone> = {
  AVAILABLE: 'neutral',
  ASSIGNED: 'success',
  IN_REPAIR: 'warning',
  RETIRED: 'neutral',
};

const TITLE = 'Mi Kit / Quid';
const SUBTITLE = 'Herramientas a tu cargo. Si alguna se daña, repórtala desde su tarjeta.';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX');

const ToolMyKitPanel: React.FC = () => {
  const { user } = useUser();
  const [items, setItems] = useState<KitAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchKit = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl('tool-requests/kits/my'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (!response.ok) throw new Error('No se pudo cargar tu kit');
      const payload = await response.json();
      setItems(Array.isArray(payload) ? payload : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    fetchKit();
  }, [fetchKit]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchKit();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolAssignment', 'ToolKitEvent', 'ToolInventoryItem'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, fetchKit]);

  const reportIncident = async (assignmentId: number) => {
    if (!user?.token) return;

    const description = window.prompt('Describe el daño o incidente de esta herramienta');
    if (!description || description.trim().length < 5) return;

    try {
      const response = await fetch(buildApiUrl(`tool-requests/kits/${assignmentId}/report`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo reportar el incidente');
      }

      await fetchKit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  // Solo la primera carga muestra el esqueleto; los refrescos por socket no vacían la lista.
  if (loading && items.length === 0) {
    return (
      <Card>
        <CardHead title={TITLE} subtitle={SUBTITLE} />
        <div className={styles.body}>
          <SkeletonRows rows={3} label="Cargando mi kit..." />
        </div>
      </Card>
    );
  }

  const kitCount = items.filter(i => i.assignmentType === 'KIT').length;
  const loanCount = items.filter(i => i.assignmentType === 'LOAN').length;
  const incidentCount = items.reduce((acc, i) => acc + (i.events?.filter(e => e.resolution === 'PENDING').length ?? 0), 0);

  return (
    <Card>
      <CardHead title={TITLE} subtitle={SUBTITLE} />
      <div className={styles.body}>
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}

        {items.length > 0 && (
          <StatRow ariaLabel="Resumen de mi kit" className={styles.stats}>
            <Stat label="Herramientas" value={items.length} icon={<HandymanOutlinedIcon fontSize="inherit" />} />
            <Stat label="Kit base" value={kitCount} icon={<Inventory2OutlinedIcon fontSize="inherit" />} />
            <Stat
              label="Préstamos"
              value={loanCount}
              icon={<SwapHorizOutlinedIcon fontSize="inherit" />}
              iconTone="info"
            />
            <Stat
              label="Incidentes"
              value={incidentCount}
              tone={incidentCount > 0 ? 'danger' : 'success'}
              icon={<ReportProblemOutlinedIcon fontSize="inherit" />}
              hint={incidentCount > 0 ? "Pendientes de resolución" : "Sin incidentes activos"}
            />
          </StatRow>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={<HandymanOutlinedIcon fontSize="inherit" />}
            title="No tienes herramientas de kit asignadas."
            description="Cuando almacén te asigne una herramienta aparecerá aquí con su foto."
            tone="neutral"
          />
        ) : (
          <ul className={styles.list} aria-label="Herramientas de mi kit">
            {items.map((item) => {
              const panoramicSrc = item.inventoryItem.panoramicPhotoUrl
                ? resolveAssetUrl(item.inventoryItem.panoramicPhotoUrl)
                : '';
              const serialSrc = item.inventoryItem.serialPhotoUrl
                ? resolveAssetUrl(item.inventoryItem.serialPhotoUrl)
                : '';
              const pendientes = item.events?.filter((e) => e.resolution === 'PENDING').length ?? 0;
              const estado = item.inventoryItem.status;

              return (
                <li key={item.id} className={styles.item}>
                  <div className={styles.photo}>
                    {panoramicSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={panoramicSrc}
                        alt={`${item.inventoryItem.toolName} panorámica`}
                        className={styles.photoImage}
                      />
                    ) : (
                      <span className={styles.photoEmpty} aria-hidden="true">
                        <HandymanOutlinedIcon fontSize="inherit" />
                      </span>
                    )}
                    {serialSrc && (
                      <span className={styles.serialThumb} title="Serie / modelo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={serialSrc} alt={`${item.inventoryItem.toolName} serie`} />
                      </span>
                    )}
                  </div>

                  <div className={styles.itemBody}>
                    <div className={styles.itemHeader}>
                      <div className={styles.itemTitle}>
                        <h3 className={styles.itemName}>{item.inventoryItem.toolName}</h3>
                        <p className={styles.itemModel}>{item.inventoryItem.model}</p>
                      </div>
                      <Badge tone={item.assignmentType === 'KIT' ? 'brand' : 'info'} size="sm">
                        {item.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'}
                      </Badge>
                    </div>

                    <div className={styles.badges}>
                      <StatusBadge
                        status={estado}
                        label={STATUS_LABEL[estado]}
                        tone={STATUS_TONE[estado]}
                        size="sm"
                      />
                      {pendientes > 0 && (
                        <StatusBadge
                          tone="warning"
                          size="sm"
                          label={pendientes === 1 ? '1 incidente pendiente' : `${pendientes} incidentes pendientes`}
                        />
                      )}
                    </div>

                    <dl className={styles.facts}>
                      <div>
                        <dt>Serie</dt>
                        <dd>{item.inventoryItem.serialNumber}</dd>
                      </div>
                      <div>
                        <dt>Reemplazos</dt>
                        <dd>{item.replacementCount}</dd>
                      </div>
                      <div>
                        <dt>Asignada</dt>
                        <dd>{fecha(item.assignedAt)}</dd>
                      </div>
                      {item.dueReturnDate ? (
                        <div>
                          <dt>Devolver</dt>
                          <dd>{fecha(item.dueReturnDate)}</dd>
                        </div>
                      ) : null}
                    </dl>

                    {item.events?.length > 0 && (
                      <p className={styles.lastIncident}>
                        <span className={styles.lastIncidentLabel}>Último incidente:</span> {item.events[0].description}
                      </p>
                    )}

                    <div className={styles.itemActions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        iconStart={<ReportProblemOutlinedIcon fontSize="inherit" />}
                        onClick={() => reportIncident(item.id)}
                      >
                        Reportar daño / reemplazo
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default ToolMyKitPanel;

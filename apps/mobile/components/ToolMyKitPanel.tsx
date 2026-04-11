"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './ToolMyKitPanel.module.css';
import { io, Socket } from 'socket.io-client';

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
  };
  events: KitEvent[];
}

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
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
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

  if (loading) return <div className={styles.loading}>Cargando mi kit...</div>;

  return (
    <div className={`card ${styles.panel}`}>
      <h3 className={styles.title}>🧰 Mi Kit / Quid</h3>
      {error && <div className={styles.errorText}>{error}</div>}

      {items.length === 0 ? (
        <div className={styles.empty}>
          No tienes herramientas de kit asignadas.
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <div key={item.id} className={styles.itemCard}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>
                  {item.inventoryItem.toolName} · {item.inventoryItem.model}
                </div>
                <div className={styles.mutedSmall}>
                  {item.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'}
                </div>
              </div>

              <div className={styles.mutedSmall}>
                Serie: {item.inventoryItem.serialNumber} · Reemplazos: {item.replacementCount}
              </div>

              <div className={styles.mutedSmall}>
                Asignada: {new Date(item.assignedAt).toLocaleDateString('es-MX')}
                {item.dueReturnDate ? ` · Devolver: ${new Date(item.dueReturnDate).toLocaleDateString('es-MX')}` : ''}
              </div>

              {item.events?.length > 0 && (
                <div className={styles.mutedSmall}>
                  Último incidente: {item.events[0].description}
                </div>
              )}

              <div>
                <button className="button-secondary" onClick={() => reportIncident(item.id)}>
                  Reportar daño / reemplazo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolMyKitPanel;

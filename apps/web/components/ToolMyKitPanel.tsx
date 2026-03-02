"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from './UserContext';

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

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

  const fetchKit = async () => {
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
  };

  useEffect(() => {
    fetchKit();
  }, [user?.token]);

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

  if (loading) return <div style={{ textAlign: 'center', padding: 20 }}>Cargando mi kit...</div>;

  return (
    <div className="card" style={{ display: 'grid', gap: 16 }}>
      <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>🧰 Mi Kit / Quid</h3>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

      {items.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>
          No tienes herramientas de kit asignadas.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid var(--muted)',
                borderRadius: 10,
                padding: 12,
                display: 'grid',
                gap: 8,
                background: 'var(--surface-light)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600 }}>
                  {item.inventoryItem.toolName} · {item.inventoryItem.model}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {item.assignmentType === 'KIT' ? 'Kit base' : 'Préstamo'}
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Serie: {item.inventoryItem.serialNumber} · Reemplazos: {item.replacementCount}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Asignada: {new Date(item.assignedAt).toLocaleDateString('es-MX')}
                {item.dueReturnDate ? ` · Devolver: ${new Date(item.dueReturnDate).toLocaleDateString('es-MX')}` : ''}
              </div>

              {item.events?.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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

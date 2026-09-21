"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './ToolRequestForm.module.css';
import { Socket } from 'socket.io-client';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import {
  listarMisActividadesParaHerramienta,
  type ActividadSolicitable,
} from '@/lib/almacen-api';
import { FormField, FormGrid } from '@/components/ui/FormField';

interface ToolRequestFormProps {
  onSuccess?: () => void;
}

interface InventoryOption {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED';
  panoramicPhotoUrl?: string | null;
  serialPhotoUrl?: string | null;
}

const ToolRequestForm: React.FC<ToolRequestFormProps> = ({ onSuccess }) => {
  const { user } = useUser();
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryOption | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [reason, setReason] = useState('');
  // «Con base en las instalaciones/servicios asignados»: la solicitud puede colgarse de
  // una OT propia. Vacío = préstamo suelto, que sigue siendo válido.
  const [actividades, setActividades] = useState<ActividadSolicitable[]>([]);
  const [activityId, setActivityId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const searchInventory = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!user?.token || query.length < 2) {
      setInventoryOptions([]);
      return;
    }

    try {
      setInventoryLoading(true);
      const params = new URLSearchParams({ q: query });
      const response = await fetch(buildApiUrl(`tool-requests/inventory/search?${params.toString()}`), {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      if (!response.ok) {
        setInventoryOptions([]);
        return;
      }

      const payload = await response.json();
      setInventoryOptions(Array.isArray(payload) ? payload : []);
    } finally {
      setInventoryLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    if (inventoryQuery.trim().length < 2) {
      setInventoryOptions([]);
      return;
    }

    const timeout = setTimeout(() => {
      searchInventory(inventoryQuery);
    }, 280);

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
        if (inventoryQuery.trim().length >= 2) {
          searchInventory(inventoryQuery);
        }
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolInventoryItem', 'Inventory', 'Herramienta'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, inventoryQuery, searchInventory]);

  // Sus actividades abiertas: la API solo acepta una OT que de verdad tenga asignada.
  useEffect(() => {
    if (!user?.token) {
      setActividades([]);
      return;
    }
    let vigente = true;
    void listarMisActividadesParaHerramienta(user.token)
      .then((res) => { if (vigente) setActividades(res); })
      .catch(() => { if (vigente) setActividades([]); });
    return () => { vigente = false; };
  }, [user?.token]);

  const inventoryHasPhotos = (item: InventoryOption) =>
    Boolean(item.panoramicPhotoUrl?.trim() && item.serialPhotoUrl?.trim());

  const validate = () => {
    if (!selectedInventoryItem) {
      setError('Selecciona una herramienta del inventario');
      return false;
    }
    if (!inventoryHasPhotos(selectedInventoryItem)) {
      setError(
        'La herramienta seleccionada no tiene fotos en inventario. Pide a operaciones que las registre antes de solicitarla.',
      );
      return false;
    }
    if (!reason || reason.length < 10) {
      setError('La razón debe tener al menos 10 caracteres');
      return false;
    }
    if (!startDate) {
      setError('La fecha de inicio es requerida');
      return false;
    }
    if (!expectedReturnDate) {
      setError('La fecha de devolución esperada es requerida');
      return false;
    }
    if (new Date(expectedReturnDate) <= new Date(startDate)) {
      setError('La fecha de devolución debe ser posterior a la fecha de inicio');
      return false;
    }
    setError(null);
    return true;
  };

  const clearSelection = () => {
    setSelectedInventoryItem(null);
    setInventoryQuery('');
    setInventoryOptions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);

    if (!user) {
      setError('Usuario no autenticado');
      return;
    }

    if (!validate() || !selectedInventoryItem) return;
    setLoading(true);

    try {
      const res = await fetch(buildApiUrl('tool-requests'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usuarioId: user.id,
          inventoryItemId: selectedInventoryItem.id,
          activityId: activityId ? Number(activityId) : undefined,
          reason,
          startDate: new Date(startDate).toISOString(),
          expectedReturnDate: new Date(expectedReturnDate).toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al solicitar herramienta');
      }

      setSuccess('Solicitud de herramienta realizada correctamente');
      clearSelection();
      setActivityId('');
      setReason('');
      setStartDate('');
      setExpectedReturnDate('');

      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const panoramicSrc = selectedInventoryItem?.panoramicPhotoUrl
    ? resolveAssetUrl(selectedInventoryItem.panoramicPhotoUrl)
    : '';
  const serialSrc = selectedInventoryItem?.serialPhotoUrl
    ? resolveAssetUrl(selectedInventoryItem.serialPhotoUrl)
    : '';

  return (
    <form className={`card ${styles.form}`} onSubmit={handleSubmit}>
      <div>
        <h3 className={styles.headerTitle}>Solicitar herramienta</h3>
        <div className={styles.headerText}>
          Busca y elige una herramienta disponible. Las fotos salen del catálogo.
        </div>
      </div>

      <FormField
        label="Herramienta"
        fullWidth
        hint={
          selectedInventoryItem
            ? `Seleccionada: ${selectedInventoryItem.toolName} · ${selectedInventoryItem.model} · ${selectedInventoryItem.serialNumber}`
            : 'Escribe al menos 2 letras: nombre, modelo o serie.'
        }
      >
        <input
          className="input"
          type="text"
          value={inventoryQuery}
          onChange={(e) => {
            setInventoryQuery(e.target.value);
            if (selectedInventoryItem) {
              setSelectedInventoryItem(null);
            }
          }}
          placeholder="Busca por nombre, modelo o serie"
        />
        {inventoryLoading && (
          <div className={styles.inventoryLoading}>Buscando herramientas…</div>
        )}
        {!selectedInventoryItem && inventoryOptions.length > 0 && (
          <div className={styles.inventoryOptions}>
            {inventoryOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedInventoryItem(option);
                  setInventoryQuery(`${option.toolName} · ${option.model} · ${option.serialNumber}`);
                  setInventoryOptions([]);
                  setError(null);
                }}
                className={styles.inventoryOptionButton}
              >
                <span className={styles.inventoryOptionText}>
                  {option.toolName} · {option.model} · {option.serialNumber}
                </span>
                {!inventoryHasPhotos(option) && (
                  <span className={styles.inventoryOptionWarning}>Sin fotos en inventario</span>
                )}
              </button>
            ))}
          </div>
        )}
      </FormField>

      {selectedInventoryItem && (
        <div className={styles.selectedCard}>
          <div className={styles.selectedHeader}>
            <div>
              <div className={styles.selectedTitle}>{selectedInventoryItem.toolName}</div>
              <div className={styles.selectedMeta}>
                {selectedInventoryItem.model} · Serie {selectedInventoryItem.serialNumber}
              </div>
            </div>
            <button type="button" className="button-secondary" onClick={clearSelection}>
              Cambiar
            </button>
          </div>

          {inventoryHasPhotos(selectedInventoryItem) ? (
            <div className={styles.photoGrid}>
              <div className={styles.photoCard}>
                <div className={styles.photoTitle}>Foto panorámica (inventario)</div>
                <div className={styles.previewBox}>
                  <img
                    src={panoramicSrc}
                    alt={`Vista panorámica de ${selectedInventoryItem.toolName}`}
                    className={styles.previewImage}
                  />
                </div>
              </div>
              <div className={styles.photoCard}>
                <div className={styles.photoTitle}>Foto de serie / modelo (inventario)</div>
                <div className={styles.previewBox}>
                  <img
                    src={serialSrc}
                    alt={`Serie de ${selectedInventoryItem.toolName}`}
                    className={styles.previewImage}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.missingPhotos}>
              Esta herramienta no tiene fotos registradas en inventario. Contacta a operaciones para completar el catálogo.
            </div>
          )}
        </div>
      )}

      <FormGrid>
        <FormField
          label="Actividad"
          optional
          hint="Vacío = préstamo suelto, sin OT."
        >
          <select
            className="input"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
          >
            <option value="">Sin actividad (préstamo suelto)</option>
            {actividades.map((a) => (
              <option key={a.id} value={a.id}>
                {a.anNumber} — {a.titulo}
                {a.client ? ` · ${a.client.name}` : ''}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Motivo del uso" hint="Para qué la necesitas en el periodo.">
          <textarea
            className={`input ${styles.reasonInput}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe el motivo…"
          />
        </FormField>
        <FormField label="Inicio" hint="Día en que la recoges.">
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>
        <FormField label="Devolución esperada" hint="Debe ser después del inicio.">
          <input
            className="input"
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
          />
        </FormField>
      </FormGrid>

      <div className={styles.actionsRow}>
        <button className="button-primary" type="submit" disabled={loading}>
          {loading ? 'Enviando…' : 'Solicitar herramienta'}
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            clearSelection();
            setActivityId('');
            setReason('');
            setStartDate('');
            setExpectedReturnDate('');
            setError(null);
            setSuccess(null);
          }}
        >
          Limpiar
        </button>
        {error && <span className={styles.feedbackError}>{error}</span>}
        {success && <span className={styles.feedbackSuccess}>{success}</span>}
      </div>
    </form>
  );
};

export default ToolRequestForm;

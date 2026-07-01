"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from './UserContext';
import styles from './ToolRequestForm.module.css';
import { io, Socket } from 'socket.io-client';

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
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
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
        <h3 className={styles.headerTitle}>Solicitar Herramienta</h3>
        <div className={styles.headerText}>
          Busca y selecciona una herramienta disponible del inventario. Las fotos se toman del catálogo.
        </div>
      </div>

      <label className={styles.fieldLabel}>
        Herramienta del inventario *
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
        <div className={styles.inventoryHint}>
          {selectedInventoryItem
            ? `Seleccionada: ${selectedInventoryItem.toolName} · ${selectedInventoryItem.model} · ${selectedInventoryItem.serialNumber}`
            : 'Empieza a escribir para filtrar herramientas disponibles'}
        </div>
        {inventoryLoading && (
          <div className={styles.inventoryLoading}>Buscando herramientas...</div>
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
      </label>

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

      <label className={styles.fieldLabel}>
        Motivo del uso *
        <textarea
          className={`input ${styles.reasonInput}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe el motivo por el cual solicitas esta herramienta..."
        />
      </label>

      <div className={styles.dateGrid}>
        <label className={styles.fieldLabel}>
          Fecha de inicio *
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className={styles.fieldLabel}>
          Fecha de devolución esperada *
          <input
            className="input"
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.actionsRow}>
        <button className="button-primary" type="submit" disabled={loading}>
          {loading ? 'Enviando...' : '✓ Solicitar Herramienta'}
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            clearSelection();
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

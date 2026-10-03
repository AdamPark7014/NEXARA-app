"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useId, useState, useCallback } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import { useUser } from './UserContext';
import styles from './ToolRequestForm.module.css';
import { Socket } from 'socket.io-client';
import { createRealtimeSocket } from '@/lib/realtime-socket';
import {
  listarMisActividadesParaHerramienta,
  type ActividadSolicitable,
} from '@/lib/almacen-api';
import {
  Alert,
  Badge,
  Button,
  DateInput,
  Field,
  FormFooter,
  FormSection,
  Input,
  RequiredMark,
  Select,
  Textarea,
  focusField,
} from '@/components/base';

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

/** Campo al que pertenece el error de validación: ahí se pinta, en lugar de la ayuda. */
type CampoConError = 'tool' | 'reason' | 'startDate' | 'expectedReturnDate';

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
  const [errorField, setErrorField] = useState<CampoConError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uid = useId();
  const ids = {
    titulo: `${uid}-titulo`,
    tool: `${uid}-herramienta`,
    activity: `${uid}-actividad`,
    reason: `${uid}-motivo`,
    startDate: `${uid}-inicio`,
    expectedReturnDate: `${uid}-devolucion`,
  };

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

  /** Marca el error en su campo y lleva el foco ahí. */
  const fail = (field: CampoConError, message: string) => {
    setError(message);
    setErrorField(field);
    focusField(ids[field]);
    return false;
  };

  const validate = () => {
    if (!selectedInventoryItem) {
      return fail('tool', 'Selecciona una herramienta del inventario');
    }
    if (!inventoryHasPhotos(selectedInventoryItem)) {
      return fail(
        'tool',
        'La herramienta seleccionada no tiene fotos en inventario. Pide a operaciones que las registre antes de solicitarla.',
      );
    }
    if (!reason || reason.length < 10) {
      return fail('reason', 'La razón debe tener al menos 10 caracteres');
    }
    if (!startDate) {
      return fail('startDate', 'La fecha de inicio es requerida');
    }
    if (!expectedReturnDate) {
      return fail('expectedReturnDate', 'La fecha de devolución esperada es requerida');
    }
    if (new Date(expectedReturnDate) <= new Date(startDate)) {
      return fail('expectedReturnDate', 'La fecha de devolución debe ser posterior a la fecha de inicio');
    }
    setError(null);
    setErrorField(null);
    return true;
  };

  /** Al corregir el campo marcado, vuelve su ayuda. */
  const clearFieldError = (field: CampoConError) => {
    if (errorField === field) {
      setError(null);
      setErrorField(null);
    }
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
      setErrorField(null);
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
      setErrorField(null);
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

  const errorDe = (field: CampoConError) => (errorField === field ? error : null);
  // Errores que no son de un campo (sesión, respuesta de la API) van en el aviso del pie.
  const generalError = error && !errorField ? error : null;
  const toolReady = Boolean(selectedInventoryItem && inventoryHasPhotos(selectedInventoryItem));
  const periodReady = reason.length >= 10 && Boolean(startDate) && Boolean(expectedReturnDate);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-labelledby={ids.titulo}>
      <header className={styles.head}>
        <h2 id={ids.titulo} className={styles.title}>Solicitar herramienta</h2>
        <p className={styles.lead}>
          Busca y elige una herramienta disponible. Las fotos salen del catálogo. Los campos con <RequiredMark /> son
          obligatorios.
        </p>
      </header>

      <div className={styles.sections}>
        <FormSection
          step={1}
          done={toolReady}
          title="Herramienta"
          description="Elige la pieza del inventario que vas a usar."
        >
          <div className={styles.toolSearch}>
            <Field
              label="Herramienta"
              required
              fullWidth
              error={errorDe('tool')}
              hint={
                selectedInventoryItem
                  ? `Seleccionada: ${selectedInventoryItem.toolName} · ${selectedInventoryItem.model} · ${selectedInventoryItem.serialNumber}`
                  : 'Escribe al menos 2 letras: nombre, modelo o serie.'
              }
            >
              <Input
                id={ids.tool}
                type="text"
                autoComplete="off"
                iconStart={<SearchIcon fontSize="inherit" />}
                valid={toolReady}
                value={inventoryQuery}
                onChange={(e) => {
                  setInventoryQuery(e.target.value);
                  if (selectedInventoryItem) {
                    setSelectedInventoryItem(null);
                  }
                  clearFieldError('tool');
                }}
                placeholder="Busca por nombre, modelo o serie"
              />
            </Field>

            {inventoryLoading && (
              <p className={styles.searching} role="status">Buscando herramientas…</p>
            )}

            {!selectedInventoryItem && inventoryOptions.length > 0 && (
              <ul className={styles.options} aria-label="Herramientas encontradas">
                {inventoryOptions.map((option) => {
                  const thumb = option.panoramicPhotoUrl ? resolveAssetUrl(option.panoramicPhotoUrl) : '';
                  return (
                    <li key={option.id}>
                      <Button
                        variant="ghost"
                        fullWidth
                        className={styles.option}
                        onClick={() => {
                          setSelectedInventoryItem(option);
                          setInventoryQuery(`${option.toolName} · ${option.model} · ${option.serialNumber}`);
                          setInventoryOptions([]);
                          setError(null);
                          setErrorField(null);
                        }}
                      >
                        <span className={styles.optionThumb} aria-hidden="true">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" />
                          ) : (
                            <HandymanOutlinedIcon fontSize="inherit" />
                          )}
                        </span>
                        <span className={styles.optionText}>
                          <span className={styles.optionName}>{option.toolName}</span>
                          <span className={styles.optionMeta}>
                            {option.model} · {option.serialNumber}
                          </span>
                        </span>
                        {!inventoryHasPhotos(option) && (
                          <Badge tone="danger" size="sm">Sin fotos en inventario</Badge>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selectedInventoryItem && (
            <div className={styles.selected}>
              <div className={styles.selectedHeader}>
                <div className={styles.selectedText}>
                  <p className={styles.selectedTitle}>{selectedInventoryItem.toolName}</p>
                  <p className={styles.selectedMeta}>
                    {selectedInventoryItem.model} · Serie {selectedInventoryItem.serialNumber}
                  </p>
                </div>
                <Button variant="tertiary" size="sm" onClick={clearSelection}>
                  Cambiar
                </Button>
              </div>

              {inventoryHasPhotos(selectedInventoryItem) ? (
                <div className={styles.photoGrid}>
                  <figure className={styles.photoCard}>
                    <div className={styles.previewBox}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={panoramicSrc}
                        alt={`Vista panorámica de ${selectedInventoryItem.toolName}`}
                        className={styles.previewImage}
                      />
                    </div>
                    <figcaption className={styles.photoTitle}>Foto panorámica (inventario)</figcaption>
                  </figure>
                  <figure className={styles.photoCard}>
                    <div className={styles.previewBox}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={serialSrc}
                        alt={`Serie de ${selectedInventoryItem.toolName}`}
                        className={styles.previewImage}
                      />
                    </div>
                    <figcaption className={styles.photoTitle}>Foto de serie / modelo (inventario)</figcaption>
                  </figure>
                </div>
              ) : (
                <Alert tone="danger">
                  Esta herramienta no tiene fotos registradas en inventario. Contacta a operaciones para completar el catálogo.
                </Alert>
              )}
            </div>
          )}
        </FormSection>

        <FormSection
          step={2}
          done={periodReady}
          title="Uso y periodo"
          description="Para qué la necesitas y cuándo la devuelves."
          columns={2}
        >
          <Field
            label="Actividad"
            optional
            fullWidth
            hint="Déjala vacía si es un préstamo suelto, sin orden de trabajo."
          >
            <Select
              id={ids.activity}
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
            </Select>
          </Field>
          <Field
            label="Motivo del uso"
            required
            fullWidth
            error={errorDe('reason')}
            hint="Para qué la necesitas en el periodo. Mínimo 10 caracteres."
          >
            <Textarea
              id={ids.reason}
              className={styles.reasonInput}
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                clearFieldError('reason');
              }}
              placeholder="Describe el motivo…"
            />
          </Field>
          <Field label="Inicio" required error={errorDe('startDate')} hint="Día en que la recoges.">
            <DateInput
              id={ids.startDate}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                clearFieldError('startDate');
              }}
            />
          </Field>
          <Field
            label="Devolución esperada"
            required
            error={errorDe('expectedReturnDate')}
            hint="Debe ser después del inicio."
          >
            <DateInput
              id={ids.expectedReturnDate}
              min={startDate || undefined}
              value={expectedReturnDate}
              onChange={(e) => {
                setExpectedReturnDate(e.target.value);
                clearFieldError('expectedReturnDate');
              }}
            />
          </Field>
        </FormSection>
      </div>

      {generalError && (
        <Alert tone="danger" role="alert">
          {generalError}
        </Alert>
      )}
      {success && (
        <Alert tone="success" role="status">
          {success}
        </Alert>
      )}

      <FormFooter className={styles.footer}>
        <Button
          variant="tertiary"
          onClick={() => {
            clearSelection();
            setActivityId('');
            setReason('');
            setStartDate('');
            setExpectedReturnDate('');
            setError(null);
            setErrorField(null);
            setSuccess(null);
          }}
        >
          Limpiar
        </Button>
        <Button variant="primary" type="submit" loading={loading}>
          {loading ? 'Enviando…' : 'Solicitar herramienta'}
        </Button>
      </FormFooter>
    </form>
  );
};

export default ToolRequestForm;

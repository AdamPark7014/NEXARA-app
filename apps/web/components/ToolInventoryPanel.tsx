"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import MetricStrip, { type Metric } from '@/components/ui/MetricStrip';
import Section from '@/components/ui/Section';
import Button from '@/components/ui/Button';
import StatusDot, { type StatusTone } from '@/components/ui/StatusDot';
import InlineAlert from '@/components/ui/InlineAlert';
import EmptyState from '@/components/ui/EmptyState';
import { FinanceField, FinanceFormGrid } from '@/components/finance/FinanceModuleShell';
import styles from './ToolInventoryPanel.module.css';
import { createRealtimeSocket } from '@/lib/realtime-socket';

interface InventoryItem {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  codigoInterno?: string | null;
  barcode?: string | null;
  panoramicPhotoUrl: string;
  serialPhotoUrl: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED';
  replacements?: { id: number; serialNumber: string; status: string; createdAt: string }[];
}

const STATUS_LABEL: Record<InventoryItem["status"], string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignada",
  IN_REPAIR: "En reparación",
  RETIRED: "Retirada",
};

/**
 * Color solo donde pide acción: una herramienta en reparación es la que
 * alguien tiene que ir a recuperar. Disponible y asignada son el día normal.
 */
const STATUS_TONE: Record<InventoryItem["status"], StatusTone> = {
  AVAILABLE: "neutral",
  ASSIGNED: "neutral",
  IN_REPAIR: "warning",
  RETIRED: "neutral",
};

const ToolInventoryPanel: React.FC = () => {
  const { user } = useUser();
  const [isMobile, setIsMobile] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [includeRetired, setIncludeRetired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toolName, setToolName] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [panoramicPhotoUrl, setPanoramicPhotoUrl] = useState('');
  const [serialPhotoUrl, setSerialPhotoUrl] = useState('');
  const [panoramicPhotoFile, setPanoramicPhotoFile] = useState<File | null>(null);
  const [serialPhotoFile, setSerialPhotoFile] = useState<File | null>(null);
  const [panoramicPhotoPreview, setPanoramicPhotoPreview] = useState<string | null>(null);
  const [serialPhotoPreview, setSerialPhotoPreview] = useState<string | null>(null);
  const [dragOverCreate, setDragOverCreate] = useState<'panoramic' | 'serial' | null>(null);
  const [dragOverReplace, setDragOverReplace] = useState<'panoramic' | 'serial' | null>(null);
  const createPanoramicInputRef = useRef<HTMLInputElement>(null);
  const createSerialInputRef = useRef<HTMLInputElement>(null);
  const replacePanoramicInputRef = useRef<HTMLInputElement>(null);
  const replaceSerialInputRef = useRef<HTMLInputElement>(null);

  const [replacementTarget, setReplacementTarget] = useState<InventoryItem | null>(null);
  const [replacementModel, setReplacementModel] = useState('');
  const [replacementSerialNumber, setReplacementSerialNumber] = useState('');
  const [replacementRetiredReason, setReplacementRetiredReason] = useState('Equipo dañado o no funcional');
  const [replacementPanoramicPhotoUrl, setReplacementPanoramicPhotoUrl] = useState('');
  const [replacementSerialPhotoUrl, setReplacementSerialPhotoUrl] = useState('');
  const [replacementPanoramicPhotoFile, setReplacementPanoramicPhotoFile] = useState<File | null>(null);
  const [replacementSerialPhotoFile, setReplacementSerialPhotoFile] = useState<File | null>(null);
  const [replacementPanoramicPhotoPreview, setReplacementPanoramicPhotoPreview] = useState<string | null>(null);
  const [replacementSerialPhotoPreview, setReplacementSerialPhotoPreview] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editModel, setEditModel] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editStatus, setEditStatus] = useState<InventoryItem["status"]>("AVAILABLE");
  const [editSaving, setEditSaving] = useState(false);


  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    return () => {
      if (panoramicPhotoPreview) URL.revokeObjectURL(panoramicPhotoPreview);
      if (serialPhotoPreview) URL.revokeObjectURL(serialPhotoPreview);
      if (replacementPanoramicPhotoPreview) URL.revokeObjectURL(replacementPanoramicPhotoPreview);
      if (replacementSerialPhotoPreview) URL.revokeObjectURL(replacementSerialPhotoPreview);
    };
  }, [
    panoramicPhotoPreview,
    serialPhotoPreview,
    replacementPanoramicPhotoPreview,
    replacementSerialPhotoPreview,
  ]);

  const setCreateFile = (type: 'panoramic' | 'serial', file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (type === 'panoramic') {
      if (panoramicPhotoPreview) URL.revokeObjectURL(panoramicPhotoPreview);
      setPanoramicPhotoFile(file);
      setPanoramicPhotoPreview(preview);
    } else {
      if (serialPhotoPreview) URL.revokeObjectURL(serialPhotoPreview);
      setSerialPhotoFile(file);
      setSerialPhotoPreview(preview);
    }

    setError(null);
  };

  const setReplacementFile = (type: 'panoramic' | 'serial', file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (type === 'panoramic') {
      if (replacementPanoramicPhotoPreview) URL.revokeObjectURL(replacementPanoramicPhotoPreview);
      setReplacementPanoramicPhotoFile(file);
      setReplacementPanoramicPhotoPreview(preview);
    } else {
      if (replacementSerialPhotoPreview) URL.revokeObjectURL(replacementSerialPhotoPreview);
      setReplacementSerialPhotoFile(file);
      setReplacementSerialPhotoPreview(preview);
    }

    setError(null);
  };

  const fetchItems = async (opts?: { background?: boolean }) => {
    if (!user?.token) return;
    if (!opts?.background) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (includeRetired) params.set('includeRetired', 'true');

      const response = await fetch(buildApiUrl(`tool-requests/inventory?${params.toString()}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (!response.ok) throw new Error('No se pudo cargar inventario');
      const payload = await response.json();
      setItems(Array.isArray(payload) ? payload : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if (!opts?.background) setLoading(false);
    }
  };

  useEffect(() => {
    const background = items.length > 0;
    void fetchItems(background ? { background: true } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch al cambiar filtros; background si ya hay filas
  }, [user?.token, query, includeRetired]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void fetchItems({ background: true });
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['ToolInventoryItem', 'ToolRequest'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, query, includeRetired]);

  const printLabel = async (item: InventoryItem, format: 'pdf' | 'zpl' = 'pdf') => {
    if (!user?.token) return;
    try {
      const res = await fetch(
        buildApiUrl(`tool-requests/inventory/${item.id}/label?format=${format}`),
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (format === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiqueta-${item.codigoInterno || item.serialNumber}.zpl`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la etiqueta');
    }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;

    try {
      const formData = new FormData();
      formData.append('toolName', toolName);
      formData.append('model', model);
      formData.append('serialNumber', serialNumber);
      if (panoramicPhotoUrl) formData.append('panoramicPhotoUrl', panoramicPhotoUrl);
      if (serialPhotoUrl) formData.append('serialPhotoUrl', serialPhotoUrl);
      if (panoramicPhotoFile) formData.append('panoramicPhoto', panoramicPhotoFile);
      if (serialPhotoFile) formData.append('serialPhoto', serialPhotoFile);

      const response = await fetch(buildApiUrl('tool-requests/inventory'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo guardar la herramienta');
      }

      setToolName('');
      setModel('');
      setSerialNumber('');
      setPanoramicPhotoUrl('');
      setSerialPhotoUrl('');
      setPanoramicPhotoFile(null);
      setSerialPhotoFile(null);
      if (panoramicPhotoPreview) URL.revokeObjectURL(panoramicPhotoPreview);
      if (serialPhotoPreview) URL.revokeObjectURL(serialPhotoPreview);
      setPanoramicPhotoPreview(null);
      setSerialPhotoPreview(null);
      if (createPanoramicInputRef.current) createPanoramicInputRef.current.value = '';
      if (createSerialInputRef.current) createSerialInputRef.current.value = '';
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const startEdit = (item: InventoryItem) => {
    setEditTarget(item);
    setEditModel(item.model);
    setEditSerial(item.serialNumber);
    setEditStatus(item.status);
    setError(null);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(buildApiUrl(`tool-requests/inventory/${editTarget.id}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: editModel.trim() || editTarget.model,
          serialNumber: editSerial.trim() || editTarget.serialNumber,
          status: editStatus,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setEditTarget(null);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al editar");
    } finally {
      setEditSaving(false);
    }
  };

  const startReplacement = (item: InventoryItem) => {
    setReplacementTarget(item);
    setReplacementModel(item.model);
    setReplacementSerialNumber('');
    setReplacementRetiredReason('Equipo dañado o no funcional');
    setReplacementPanoramicPhotoUrl(item.panoramicPhotoUrl || '');
    setReplacementSerialPhotoUrl(item.serialPhotoUrl || '');
    if (replacementPanoramicPhotoPreview) URL.revokeObjectURL(replacementPanoramicPhotoPreview);
    if (replacementSerialPhotoPreview) URL.revokeObjectURL(replacementSerialPhotoPreview);
    setReplacementPanoramicPhotoFile(null);
    setReplacementSerialPhotoFile(null);
    setReplacementPanoramicPhotoPreview(null);
    setReplacementSerialPhotoPreview(null);
    if (replacePanoramicInputRef.current) replacePanoramicInputRef.current.value = '';
    if (replaceSerialInputRef.current) replaceSerialInputRef.current.value = '';
    setError(null);
  };

  const submitReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !replacementTarget) return;
    if (!replacementSerialNumber.trim()) {
      setError('Debes indicar el número de serie del reemplazo');
      return;
    }

    setReplacing(true);
    try {
      const formData = new FormData();
      formData.append('toolName', replacementTarget.toolName);
      formData.append('model', replacementModel.trim() || replacementTarget.model);
      formData.append('serialNumber', replacementSerialNumber.trim());
      if (replacementPanoramicPhotoUrl.trim()) formData.append('panoramicPhotoUrl', replacementPanoramicPhotoUrl.trim());
      if (replacementSerialPhotoUrl.trim()) formData.append('serialPhotoUrl', replacementSerialPhotoUrl.trim());
      if (replacementPanoramicPhotoFile) formData.append('panoramicPhoto', replacementPanoramicPhotoFile);
      if (replacementSerialPhotoFile) formData.append('serialPhoto', replacementSerialPhotoFile);
      if (replacementRetiredReason.trim()) formData.append('retiredReason', replacementRetiredReason.trim());

      const response = await fetch(buildApiUrl(`tool-requests/inventory/${replacementTarget.id}/replace`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo reemplazar la herramienta');
      }

      setReplacementTarget(null);
      await fetchItems();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setReplacing(false);
    }
  };

  const counts = {
    total: items.length,
    available: items.filter((i) => i.status === 'AVAILABLE').length,
    assigned: items.filter((i) => i.status === 'ASSIGNED').length,
    inRepair: items.filter((i) => i.status === 'IN_REPAIR').length,
    retired: items.filter((i) => i.status === 'RETIRED').length,
  };

  const inventoryMetrics: Metric[] = [
    { label: 'herramientas', value: counts.total, hint: 'dadas de alta' },
    { label: 'disponibles', value: counts.available, hint: 'se pueden prestar' },
    { label: 'asignadas', value: counts.assigned, hint: 'en manos de alguien' },
    {
      label: 'en reparación',
      value: counts.inRepair,
      hint: 'fuera de servicio',
      tone: counts.inRepair > 0 ? 'warning' : 'default',
    },
    { label: 'retiradas', value: counts.retired, hint: 'ya no vuelven' },
  ];

  /**
   * Una zona de soltar tiene que ser un botón de verdad: el `div` con
   * `onClick` que había antes no llegaba con el tabulador ni se anunciaba.
   * De paso desaparece el botón «Elegir» que vivía dentro: toda la zona lo es.
   */
  const zonaFoto = (opciones: {
    etiqueta: string;
    activa: boolean;
    inputRef: React.RefObject<HTMLInputElement>;
    archivo: File | null;
    preview: string | null;
    onDragOver: () => void;
    onDragLeave: () => void;
    onFile: (file: File) => void;
  }) => (
    <div>
      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault();
          opciones.onDragOver();
        }}
        onDragLeave={opciones.onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          opciones.onDragLeave();
          const file = e.dataTransfer.files?.[0];
          if (file) opciones.onFile(file);
        }}
        onClick={() => opciones.inputRef.current?.click()}
        className={`${styles.dropzone} ${opciones.activa ? styles.dropzoneActive : ''}`}
      >
        <span className={styles.dropzoneLabel}>{opciones.etiqueta}</span>
        <span className={styles.dropzoneHint}>
          {opciones.archivo ? opciones.archivo.name : 'Arrastra una imagen o haz clic'}
        </span>
        {opciones.preview && (
          <img src={opciones.preview} alt="" className={styles.previewImage} />
        )}
      </button>
      <input
        ref={opciones.inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) opciones.onFile(file);
        }}
      />
    </div>
  );

  const editandoAlgo = Boolean(editTarget || replacementTarget);
  const buscando = query.trim().length > 0;

  return (
    <div className={styles.wrapper}>
      {!loading && items.length > 0 && (
        <MetricStrip ariaLabel="Resumen de inventario" metrics={inventoryMetrics} />
      )}

      <Section title="Dar de alta una herramienta" tone="muted">
        <form onSubmit={createItem} style={{ display: 'grid', gap: 12 }}>
          <FinanceFormGrid>
            <FinanceField label="Herramienta">
              <input className="input" value={toolName} onChange={(e) => setToolName(e.target.value)} />
            </FinanceField>
            <FinanceField label="Modelo">
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
            </FinanceField>
            <FinanceField label="Número de serie" hint="El que trae grabado el equipo">
              <input className="input" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </FinanceField>
          </FinanceFormGrid>

          <div className={`${styles.fieldsGrid} ${isMobile ? styles.fieldsGridMobile : ''}`}>
            {zonaFoto({
              etiqueta: 'Foto del equipo completo',
              activa: dragOverCreate === 'panoramic',
              inputRef: createPanoramicInputRef,
              archivo: panoramicPhotoFile,
              preview: panoramicPhotoPreview,
              onDragOver: () => setDragOverCreate('panoramic'),
              onDragLeave: () =>
                setDragOverCreate((current) => (current === 'panoramic' ? null : current)),
              onFile: (file) => setCreateFile('panoramic', file),
            })}
            {zonaFoto({
              etiqueta: 'Foto del número de serie',
              activa: dragOverCreate === 'serial',
              inputRef: createSerialInputRef,
              archivo: serialPhotoFile,
              preview: serialPhotoPreview,
              onDragOver: () => setDragOverCreate('serial'),
              onDragLeave: () =>
                setDragOverCreate((current) => (current === 'serial' ? null : current)),
              onFile: (file) => setCreateFile('serial', file),
            })}
          </div>

          <details className={styles.urlDetails}>
            <summary className={styles.urlSummary}>Las fotos ya están en la web</summary>
            <FinanceFormGrid>
              <FinanceField label="Dirección de la foto del equipo" optional>
                <input
                  className="input"
                  value={panoramicPhotoUrl}
                  onChange={(e) => setPanoramicPhotoUrl(e.target.value)}
                />
              </FinanceField>
              <FinanceField label="Dirección de la foto de la serie" optional>
                <input
                  className="input"
                  value={serialPhotoUrl}
                  onChange={(e) => setSerialPhotoUrl(e.target.value)}
                />
              </FinanceField>
            </FinanceFormGrid>
          </details>

          <div className={styles.formActions} style={{ justifyContent: 'flex-end' }}>
            {/* Mientras hay una edición o un reemplazo abiertos, el primario es
                el de esa tarea; este baja a gris para no competir. */}
            <Button type="submit" variant={editandoAlgo ? 'secondary' : 'primary'}>
              Agregar herramienta
            </Button>
          </div>
        </form>
      </Section>

      {editTarget && (
        <Section title={`Editar ${editTarget.toolName}`} tone="muted">
          <form onSubmit={submitEdit} style={{ display: 'grid', gap: 12 }}>
            <FinanceFormGrid>
              <FinanceField label="Modelo">
                <input className="input" value={editModel} onChange={(e) => setEditModel(e.target.value)} />
              </FinanceField>
              <FinanceField label="Número de serie">
                <input className="input" value={editSerial} onChange={(e) => setEditSerial(e.target.value)} />
              </FinanceField>
              <FinanceField label="Dónde está" hint="«Retirada» la saca del inventario activo">
                <select
                  className="input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as InventoryItem["status"])}
                >
                  {(Object.keys(STATUS_LABEL) as InventoryItem["status"][]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </FinanceField>
            </FinanceFormGrid>
            <div
              className={styles.formActions}
              style={{
                justifyContent: 'flex-end',
                paddingTop: 12,
                borderTop: '1px solid var(--nx-panel-hairline, var(--border))',
              }}
            >
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={editSaving}>
                Guardar cambios
              </Button>
            </div>
          </form>
        </Section>
      )}

      {replacementTarget && (
        <Section
          title={`Reemplazar ${replacementTarget.toolName}`}
          subtitle={`Se retira la serie ${replacementTarget.serialNumber} y entra una nueva en su lugar.`}
          tone="muted"
        >
          <form onSubmit={submitReplacement} style={{ display: 'grid', gap: 12 }}>
            <FinanceFormGrid>
              <FinanceField label="Modelo que entra">
                <input
                  className="input"
                  value={replacementModel}
                  onChange={(e) => setReplacementModel(e.target.value)}
                />
              </FinanceField>
              <FinanceField label="Serie que entra">
                <input
                  className="input"
                  value={replacementSerialNumber}
                  onChange={(e) => setReplacementSerialNumber(e.target.value)}
                />
              </FinanceField>
              <FinanceField
                label="Por qué se retira la anterior"
                fullWidth
                hint="Queda en el historial de la herramienta"
              >
                <input
                  className="input"
                  value={replacementRetiredReason}
                  onChange={(e) => setReplacementRetiredReason(e.target.value)}
                />
              </FinanceField>
            </FinanceFormGrid>

            <div className={`${styles.fieldsGrid} ${isMobile ? styles.fieldsGridMobile : ''}`}>
              {zonaFoto({
                etiqueta: 'Foto del equipo que entra',
                activa: dragOverReplace === 'panoramic',
                inputRef: replacePanoramicInputRef,
                archivo: replacementPanoramicPhotoFile,
                preview: replacementPanoramicPhotoPreview,
                onDragOver: () => setDragOverReplace('panoramic'),
                onDragLeave: () =>
                  setDragOverReplace((current) => (current === 'panoramic' ? null : current)),
                onFile: (file) => setReplacementFile('panoramic', file),
              })}
              {zonaFoto({
                etiqueta: 'Foto de la serie que entra',
                activa: dragOverReplace === 'serial',
                inputRef: replaceSerialInputRef,
                archivo: replacementSerialPhotoFile,
                preview: replacementSerialPhotoPreview,
                onDragOver: () => setDragOverReplace('serial'),
                onDragLeave: () =>
                  setDragOverReplace((current) => (current === 'serial' ? null : current)),
                onFile: (file) => setReplacementFile('serial', file),
              })}
            </div>

            <details className={styles.urlDetails}>
              <summary className={styles.urlSummary}>Las fotos ya están en la web</summary>
              <FinanceFormGrid>
                <FinanceField label="Dirección de la foto del equipo" optional>
                  <input
                    className="input"
                    value={replacementPanoramicPhotoUrl}
                    onChange={(e) => setReplacementPanoramicPhotoUrl(e.target.value)}
                  />
                </FinanceField>
                <FinanceField label="Dirección de la foto de la serie" optional>
                  <input
                    className="input"
                    value={replacementSerialPhotoUrl}
                    onChange={(e) => setReplacementSerialPhotoUrl(e.target.value)}
                  />
                </FinanceField>
              </FinanceFormGrid>
            </details>

            <div
              className={styles.formActions}
              style={{
                justifyContent: 'flex-end',
                paddingTop: 12,
                borderTop: '1px solid var(--nx-panel-hairline, var(--border))',
              }}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => setReplacementTarget(null)}
                disabled={replacing}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={replacing}>
                Guardar reemplazo
              </Button>
            </div>
          </form>
        </Section>
      )}

      <Section
        title="Herramientas dadas de alta"
        actions={
          <div className={styles.topBar}>
            <input
              className={`input ${styles.searchInput} ${isMobile ? styles.searchInputMobile : ''}`}
              placeholder="Buscar por herramienta, modelo o serie"
              aria-label="Buscar por herramienta, modelo o serie"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />
              Ver retiradas
            </label>
          </div>
        }
      >
        {error && (
          <div style={{ marginBottom: 12 }}>
            <InlineAlert
              variant="danger"
              message={error}
              action={
                <Button size="sm" variant="secondary" onClick={() => void fetchItems()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        )}
        {loading && items.length === 0 ? (
          <p role="status" className={styles.centerLoading}>Cargando…</p>
        ) : items.length === 0 ? (
          // «No hay nada» y «el filtro no encuentra nada» no son lo mismo:
          // el primero pide dar de alta, el segundo pide cambiar la búsqueda.
          buscando ? (
            <EmptyState
              variant="compact"
              title={`Ninguna herramienta coincide con «${query.trim()}»`}
              description="Se busca por nombre, modelo y número de serie. Prueba con una parte del texto."
              action={
                <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                  Quitar la búsqueda
                </Button>
              }
            />
          ) : includeRetired ? (
            <EmptyState
              variant="compact"
              title="Todavía no hay ninguna herramienta"
              description="Da de alta la primera arriba: nombre, modelo, serie y las dos fotos."
            />
          ) : (
            <EmptyState
              variant="compact"
              title="Ninguna herramienta activa"
              description="Puede que todas estén retiradas. Marca «Ver retiradas» para comprobarlo, o da una de alta arriba."
            />
          )
        ) : (
          <div className={styles.gallery}>
            {items.map((item) => {
              const panoramicSrc = resolveAssetUrl(item.panoramicPhotoUrl);
              const serialSrc = resolveAssetUrl(item.serialPhotoUrl);
              return (
              <article key={item.id} className={styles.galleryCard}>
                <div className={styles.photoRow}>
                  <a href={panoramicSrc || undefined} target="_blank" rel="noreferrer" className={styles.photoLink}>
                    {panoramicSrc ? (
                      <img src={panoramicSrc} alt={`${item.toolName}, equipo completo`} className={styles.galleryPhoto} />
                    ) : (
                      <div className={styles.photoPlaceholder}>Sin foto del equipo</div>
                    )}
                  </a>
                  <a href={serialSrc || undefined} target="_blank" rel="noreferrer" className={styles.photoLink}>
                    {serialSrc ? (
                      <img src={serialSrc} alt={`${item.toolName}, número de serie`} className={styles.galleryPhoto} />
                    ) : (
                      <div className={styles.photoPlaceholder}>Sin foto de la serie</div>
                    )}
                  </a>
                </div>
                <div className={styles.galleryBody}>
                  <div className={styles.galleryTitle}>{item.toolName}</div>
                  <div className={styles.galleryMeta}>
                    {item.model} · Serie {item.serialNumber}
                    {item.codigoInterno ? ` · Código ${item.codigoInterno}` : ''}
                  </div>
                  <div className={styles.statusRow}>
                    <StatusDot tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
                    {(item.replacements?.length ?? 0) > 0 && (
                      <span className={styles.galleryMeta}>
                        {item.replacements?.length} reemplazo
                        {item.replacements?.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className={styles.galleryActions}>
                    <Button size="sm" variant="secondary" fullWidth onClick={() => void printLabel(item, 'pdf')}>
                      Imprimir etiqueta
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      fullWidth
                      title="Descarga el archivo que entiende una impresora Zebra"
                      onClick={() => void printLabel(item, 'zpl')}
                    >
                      Etiqueta Zebra
                    </Button>
                    <Button size="sm" variant="secondary" fullWidth onClick={() => startEdit(item)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="secondary" fullWidth onClick={() => startReplacement(item)}>
                      Reemplazar
                    </Button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
};

export default ToolInventoryPanel;

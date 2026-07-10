"use client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import KpiCard from './ui/KpiCard';
import styles from './ToolInventoryPanel.module.css';

interface InventoryItem {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  panoramicPhotoUrl: string;
  serialPhotoUrl: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED';
  replacements?: { id: number; serialNumber: string; status: string; createdAt: string }[];
}

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
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
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

  return (
    <div className={styles.wrapper}>
      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <KpiCard label="Total" value={counts.total} icon="🧰" />
          <KpiCard label="Disponibles" value={counts.available} icon="✅" variant="positive" />
          <KpiCard label="Asignadas" value={counts.assigned} icon="👤" variant="accent" />
          <KpiCard label="En reparación" value={counts.inRepair} icon="🔧" variant={counts.inRepair > 0 ? "warning" : "default"} />
          <KpiCard label="Retiradas" value={counts.retired} icon="🗑️" />
        </div>
      )}

      <form className={`card ${styles.formCard}`} onSubmit={createItem}>
        <h3 className={styles.title}>🏭 Inventario de Herramientas</h3>
        <div className={`${styles.fieldsGrid} ${isMobile ? styles.fieldsGridMobile : ''}`}>
          <input className="input" placeholder="Herramienta" value={toolName} onChange={(e) => setToolName(e.target.value)} />
          <input className="input" placeholder="Modelo" value={model} onChange={(e) => setModel(e.target.value)} />
          <input className="input" placeholder="Serie" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          <input className="input" placeholder="URL foto panorámica (opcional)" value={panoramicPhotoUrl} onChange={(e) => setPanoramicPhotoUrl(e.target.value)} />
          <input className="input" placeholder="URL foto serie (opcional)" value={serialPhotoUrl} onChange={(e) => setSerialPhotoUrl(e.target.value)} />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCreate('panoramic');
            }}
            onDragLeave={() => setDragOverCreate((current) => (current === 'panoramic' ? null : current))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCreate(null);
              const file = e.dataTransfer.files?.[0];
              if (file) setCreateFile('panoramic', file);
            }}
            onClick={() => createPanoramicInputRef.current?.click()}
            className={`${styles.dropzone} ${dragOverCreate === 'panoramic' ? styles.dropzoneActive : ''}`}
          >
            <div className={styles.dropzoneLabel}>📸 Foto panorámica</div>
            <div className={styles.dropzoneHint}>Arrastra una imagen o haz click para seleccionarla</div>
            <input
              ref={createPanoramicInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCreateFile('panoramic', file);
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                createPanoramicInputRef.current?.click();
              }}
              className={`button-secondary ${styles.selectImageBtn}`}
            >
              Seleccionar imagen
            </button>
            {panoramicPhotoFile && (
              <div className={styles.fileName}>
                Archivo: {panoramicPhotoFile.name}
              </div>
            )}
            {panoramicPhotoPreview && (
              <img
                src={panoramicPhotoPreview}
                alt="Preview panorámica"
                className={styles.previewImage}
              />
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCreate('serial');
            }}
            onDragLeave={() => setDragOverCreate((current) => (current === 'serial' ? null : current))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCreate(null);
              const file = e.dataTransfer.files?.[0];
              if (file) setCreateFile('serial', file);
            }}
            onClick={() => createSerialInputRef.current?.click()}
            className={`${styles.dropzone} ${dragOverCreate === 'serial' ? styles.dropzoneActive : ''}`}
          >
            <div className={styles.dropzoneLabel}>🔎 Foto de serie</div>
            <div className={styles.dropzoneHint}>Arrastra una imagen o haz click para seleccionarla</div>
            <input
              ref={createSerialInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCreateFile('serial', file);
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                createSerialInputRef.current?.click();
              }}
              className={`button-secondary ${styles.selectImageBtn}`}
            >
              Seleccionar imagen
            </button>
            {serialPhotoFile && (
              <div className={styles.fileName}>
                Archivo: {serialPhotoFile.name}
              </div>
            )}
            {serialPhotoPreview && (
              <img
                src={serialPhotoPreview}
                alt="Preview serie"
                className={styles.previewImage}
              />
            )}
          </div>
        </div>
        <div>
          <button className="button-primary" type="submit">Agregar herramienta</button>
        </div>
      </form>

      {editTarget && (
        <form onSubmit={submitEdit} className={`card ${styles.formCard}`}>
          <h3 className={styles.title}>✎ Editar: {editTarget.toolName}</h3>
          <input className="input" value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="Modelo" />
          <input className="input" value={editSerial} onChange={(e) => setEditSerial(e.target.value)} placeholder="Serie" />
          <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value as InventoryItem["status"])}>
            <option value="AVAILABLE">Disponible</option>
            <option value="ASSIGNED">Asignada</option>
            <option value="IN_REPAIR">En reparación</option>
            <option value="RETIRED">Retirada</option>
          </select>
          <div className={styles.formActions}>
            <button type="button" className="button-secondary" onClick={() => setEditTarget(null)}>Cancelar</button>
            <button type="submit" className="button-primary" disabled={editSaving}>{editSaving ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      )}

      {replacementTarget && (
        <form className={`card ${styles.formCard}`} onSubmit={submitReplacement}>
          <h3 className={styles.title}>
            🔁 Reemplazar: {replacementTarget.toolName} · {replacementTarget.serialNumber}
          </h3>

          <div className={`${styles.fieldsGrid} ${isMobile ? styles.fieldsGridMobile : ''}`}>
            <input className="input" value={replacementModel} onChange={(e) => setReplacementModel(e.target.value)} placeholder="Nuevo modelo" />
            <input className="input" value={replacementSerialNumber} onChange={(e) => setReplacementSerialNumber(e.target.value)} placeholder="Nueva serie" />
            <input className="input" value={replacementRetiredReason} onChange={(e) => setReplacementRetiredReason(e.target.value)} placeholder="Motivo de retiro" />
            <input className="input" value={replacementPanoramicPhotoUrl} onChange={(e) => setReplacementPanoramicPhotoUrl(e.target.value)} placeholder="URL foto panorámica (opcional)" />
            <input className="input" value={replacementSerialPhotoUrl} onChange={(e) => setReplacementSerialPhotoUrl(e.target.value)} placeholder="URL foto serie (opcional)" />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverReplace('panoramic');
              }}
              onDragLeave={() => setDragOverReplace((current) => (current === 'panoramic' ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverReplace(null);
                const file = e.dataTransfer.files?.[0];
                if (file) setReplacementFile('panoramic', file);
              }}
              onClick={() => replacePanoramicInputRef.current?.click()}
              className={`${styles.dropzone} ${dragOverReplace === 'panoramic' ? styles.dropzoneActive : ''}`}
            >
              <div className={styles.dropzoneLabel}>📸 Foto panorámica reemplazo</div>
              <div className={styles.dropzoneHint}>Arrastra una imagen o haz click para seleccionarla</div>
              <input
                ref={replacePanoramicInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setReplacementFile('panoramic', file);
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  replacePanoramicInputRef.current?.click();
                }}
                className={`button-secondary ${styles.selectImageBtn}`}
              >
                Seleccionar imagen
              </button>
              {replacementPanoramicPhotoFile && (
                <div className={styles.fileName}>
                  Archivo: {replacementPanoramicPhotoFile.name}
                </div>
              )}
              {replacementPanoramicPhotoPreview && (
                <img
                  src={replacementPanoramicPhotoPreview}
                  alt="Preview panorámica reemplazo"
                  className={styles.previewImage}
                />
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverReplace('serial');
              }}
              onDragLeave={() => setDragOverReplace((current) => (current === 'serial' ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverReplace(null);
                const file = e.dataTransfer.files?.[0];
                if (file) setReplacementFile('serial', file);
              }}
              onClick={() => replaceSerialInputRef.current?.click()}
              className={`${styles.dropzone} ${dragOverReplace === 'serial' ? styles.dropzoneActive : ''}`}
            >
              <div className={styles.dropzoneLabel}>🔎 Foto de serie reemplazo</div>
              <div className={styles.dropzoneHint}>Arrastra una imagen o haz click para seleccionarla</div>
              <input
                ref={replaceSerialInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setReplacementFile('serial', file);
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  replaceSerialInputRef.current?.click();
                }}
                className={`button-secondary ${styles.selectImageBtn}`}
              >
                Seleccionar imagen
              </button>
              {replacementSerialPhotoFile && (
                <div className={styles.fileName}>
                  Archivo: {replacementSerialPhotoFile.name}
                </div>
              )}
              {replacementSerialPhotoPreview && (
                <img
                  src={replacementSerialPhotoPreview}
                  alt="Preview serie reemplazo"
                  className={styles.previewImage}
                />
              )}
            </div>
          </div>

          <div className={styles.formActions}>
            <button className="button-primary" type="submit" disabled={replacing}>
              {replacing ? 'Reemplazando...' : 'Guardar reemplazo'}
            </button>
            <button className="button-secondary" type="button" onClick={() => setReplacementTarget(null)} disabled={replacing}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className={`card ${styles.listCard}`}>
        <div className={styles.topBar}>
          <input
            className={`input ${styles.searchInput} ${isMobile ? styles.searchInputMobile : ''}`}
            placeholder="Buscar por herramienta, modelo o serie"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />
            Ver retiradas
          </label>
        </div>

        {error && <div className={styles.errorText}>{error}</div>}
        {loading && items.length === 0 ? (
          <div className={styles.centerLoading}>Cargando inventario...</div>
        ) : items.length === 0 ? (
          <div className={styles.centerEmpty}>
            {includeRetired
              ? 'No hay herramientas retiradas en inventario'
              : 'No hay herramientas en inventario'}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHeadRow}>
                  <th className={styles.thLeft}>Herramienta</th>
                  <th className={styles.thLeft}>Modelo</th>
                  <th className={styles.thLeft}>Serie</th>
                  <th className={styles.thLeft}>Estado</th>
                  <th className={styles.thLeft}>Reemplazos</th>
                  <th className={styles.thCenter}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={styles.tableRow}>
                    <td className={styles.td}>{item.toolName}</td>
                    <td className={styles.td}>{item.model}</td>
                    <td className={styles.td}>{item.serialNumber}</td>
                    <td className={styles.td}>{item.status}</td>
                    <td className={styles.td}>{item.replacements?.length || 0}</td>
                    <td className={styles.tdCenter}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button type="button" className="button-secondary" onClick={() => startEdit(item)}>Editar</button>
                        <button type="button" className="button-secondary" onClick={() => startReplacement(item)}>Reemplazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolInventoryPanel;

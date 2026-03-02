"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';

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

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

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

  const fetchItems = async () => {
    if (!user?.token) return;
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={createItem}>
        <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>🏭 Inventario de Herramientas</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
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
            style={{
              border: `1px dashed ${dragOverCreate === 'panoramic' ? 'var(--primary)' : 'var(--muted)'}`,
              borderRadius: 8,
              padding: 8,
              display: 'grid',
              gap: 6,
              alignContent: 'start',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Foto panorámica (drag & drop)</div>
            <input
              ref={createPanoramicInputRef}
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCreateFile('panoramic', file);
              }}
            />
            {panoramicPhotoPreview && (
              <img
                src={panoramicPhotoPreview}
                alt="Preview panorámica"
                style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6 }}
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
            style={{
              border: `1px dashed ${dragOverCreate === 'serial' ? 'var(--primary)' : 'var(--muted)'}`,
              borderRadius: 8,
              padding: 8,
              display: 'grid',
              gap: 6,
              alignContent: 'start',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Foto serie (drag & drop)</div>
            <input
              ref={createSerialInputRef}
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCreateFile('serial', file);
              }}
            />
            {serialPhotoPreview && (
              <img
                src={serialPhotoPreview}
                alt="Preview serie"
                style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6 }}
              />
            )}
          </div>
        </div>
        <div>
          <button className="button-primary" type="submit">Agregar herramienta</button>
        </div>
      </form>

      {replacementTarget && (
        <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={submitReplacement}>
          <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>
            🔁 Reemplazar: {replacementTarget.toolName} · {replacementTarget.serialNumber}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
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
              style={{
                border: `1px dashed ${dragOverReplace === 'panoramic' ? 'var(--primary)' : 'var(--muted)'}`,
                borderRadius: 8,
                padding: 8,
                display: 'grid',
                gap: 6,
                alignContent: 'start',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Foto panorámica reemplazo</div>
              <input
                ref={replacePanoramicInputRef}
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setReplacementFile('panoramic', file);
                }}
              />
              {replacementPanoramicPhotoPreview && (
                <img
                  src={replacementPanoramicPhotoPreview}
                  alt="Preview panorámica reemplazo"
                  style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6 }}
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
              style={{
                border: `1px dashed ${dragOverReplace === 'serial' ? 'var(--primary)' : 'var(--muted)'}`,
                borderRadius: 8,
                padding: 8,
                display: 'grid',
                gap: 6,
                alignContent: 'start',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Foto serie reemplazo</div>
              <input
                ref={replaceSerialInputRef}
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setReplacementFile('serial', file);
                }}
              />
              {replacementSerialPhotoPreview && (
                <img
                  src={replacementSerialPhotoPreview}
                  alt="Preview serie reemplazo"
                  style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6 }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button-primary" type="submit" disabled={replacing}>
              {replacing ? 'Reemplazando...' : 'Guardar reemplazo'}
            </button>
            <button className="button-secondary" type="button" onClick={() => setReplacementTarget(null)} disabled={replacing}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Buscar por herramienta, modelo o serie"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
            <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />
            Ver retiradas
          </label>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16 }}>Cargando inventario...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>No hay herramientas en inventario</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: 10 }}>Herramienta</th>
                  <th style={{ textAlign: 'left', padding: 10 }}>Modelo</th>
                  <th style={{ textAlign: 'left', padding: 10 }}>Serie</th>
                  <th style={{ textAlign: 'left', padding: 10 }}>Estado</th>
                  <th style={{ textAlign: 'left', padding: 10 }}>Reemplazos</th>
                  <th style={{ textAlign: 'center', padding: 10 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--muted)' }}>
                    <td style={{ padding: 10 }}>{item.toolName}</td>
                    <td style={{ padding: 10 }}>{item.model}</td>
                    <td style={{ padding: 10 }}>{item.serialNumber}</td>
                    <td style={{ padding: 10 }}>{item.status}</td>
                    <td style={{ padding: 10 }}>{item.replacements?.length || 0}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <button className="button-secondary" onClick={() => startReplacement(item)}>
                        Reemplazar
                      </button>
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

"use client";
import React, { useEffect, useState } from 'react';
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

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

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
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const replaceItem = async (item: InventoryItem) => {
    if (!user?.token) return;

    const newSerial = window.prompt('Nuevo número de serie para el reemplazo');
    if (!newSerial) return;

    const newModel = window.prompt('Nuevo modelo (deja vacío para usar el mismo)', item.model) || item.model;
    const retiredReason = window.prompt('Motivo de reemplazo/retiro', 'Equipo dañado o no funcional') || undefined;
    const newPanoramicPhotoUrl = window.prompt('URL foto panorámica del reemplazo (opcional)', item.panoramicPhotoUrl) || item.panoramicPhotoUrl;
    const newSerialPhotoUrl = window.prompt('URL foto de serie del reemplazo (opcional)', item.serialPhotoUrl) || item.serialPhotoUrl;

    try {
      const formData = new FormData();
      formData.append('toolName', item.toolName);
      formData.append('model', newModel);
      formData.append('serialNumber', newSerial);
      formData.append('panoramicPhotoUrl', newPanoramicPhotoUrl);
      formData.append('serialPhotoUrl', newSerialPhotoUrl);
      if (retiredReason) formData.append('retiredReason', retiredReason);

      const response = await fetch(buildApiUrl(`tool-requests/inventory/${item.id}/replace`), {
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

      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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
          <input className="input" type="file" accept="image/*" onChange={(e) => setPanoramicPhotoFile(e.target.files?.[0] || null)} />
          <input className="input" type="file" accept="image/*" onChange={(e) => setSerialPhotoFile(e.target.files?.[0] || null)} />
        </div>
        <div>
          <button className="button-primary" type="submit">Agregar herramienta</button>
        </div>
      </form>

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
                      <button className="button-secondary" onClick={() => replaceItem(item)}>
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

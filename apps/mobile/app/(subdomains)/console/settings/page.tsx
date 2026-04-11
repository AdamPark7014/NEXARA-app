"use client";
import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

interface SystemSetting {
  id: number;
  key: string;
  value: string;
  category: string;
  label?: string;
  createdAt: string;
  updatedAt: string;
}

type GroupedSettings = Record<string, SystemSetting[]>;

const DEFAULT_CATEGORIES = [
  { key: 'general', label: 'General', icon: '⚙️' },
  { key: 'empresa', label: 'Empresa', icon: '🏢' },
  { key: 'fiscal', label: 'Fiscal', icon: '🧾' },
  { key: 'notificaciones', label: 'Notificaciones', icon: '🔔' },
  { key: 'seguridad', label: 'Seguridad', icon: '🔒' },
];

export default function SettingsPage() {
  const { user } = useUser();
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState('general');
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('settings'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(Array.isArray(data) ? data : []);
        const vals: Record<string, string> = {};
        (Array.isArray(data) ? data : []).forEach((s: SystemSetting) => { vals[s.key] = s.value; });
        setEditValues(vals);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadSettings();
  }, [user?.token]);

  const grouped: GroupedSettings = settings.reduce((acc, s) => {
    const cat = s.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as GroupedSettings);

  const allCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES.map(c => c.key),
    ...Object.keys(grouped),
  ]));

  const getCategoryLabel = (key: string) => {
    const found = DEFAULT_CATEGORIES.find(c => c.key === key);
    return found ? `${found.icon} ${found.label}` : key.charAt(0).toUpperCase() + key.slice(1);
  };

  const handleSave = async (key: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(buildApiUrl('settings'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ key, value: editValues[key] || '', category: activeCategory }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `"${key}" guardado correctamente` });
        loadSettings();
      } else {
        setMessage({ type: 'error', text: 'Error al guardar configuración' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(buildApiUrl('settings'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue,
          category: activeCategory,
          label: newLabel || undefined,
        }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `"${newKey}" creado correctamente` });
        setNewKey('');
        setNewValue('');
        setNewLabel('');
        loadSettings();
      } else {
        setMessage({ type: 'error', text: 'Error al crear configuración' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`¿Eliminar la configuración "${key}"?`)) return;
    try {
      const res = await fetch(buildApiUrl(`settings/${encodeURIComponent(key)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `"${key}" eliminado` });
        loadSettings();
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar' });
    }
  };

  const categorySettings = grouped[activeCategory] || [];

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <HelpTab module="settings" user={user} />
      <div style={{ display: 'grid', gap: 24 }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{settings.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total configuraciones</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>{Object.keys(grouped).length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Categorías</div>
          </div>
        </div>

        {message && (
          <div style={{
            padding: '10px 16px',
            borderRadius: 8,
            background: message.type === 'success' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
            color: message.type === 'success' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
            fontWeight: 600,
            fontSize: 14,
          }}>
            {message.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          {/* Category tabs */}
          <div className="card" style={{ padding: 8 }}>
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: activeCategory === cat ? 700 : 400,
                  background: activeCategory === cat ? 'var(--primary)' : 'transparent',
                  color: activeCategory === cat ? '#fff' : 'var(--text-primary)',
                  marginBottom: 2,
                }}
              >
                {getCategoryLabel(cat)}
              </button>
            ))}
          </div>

          {/* Settings panel */}
          <div className="card" style={{ padding: 16 }}>
            <h2 style={{ marginBottom: 16, color: 'var(--primary)' }}>
              {getCategoryLabel(activeCategory)}
            </h2>

            {loading ? (
              <p>Cargando configuraciones...</p>
            ) : categorySettings.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No hay configuraciones en esta categoría.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {categorySettings.map(s => (
                  <div key={s.key} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label || s.key}</div>
                      {s.label && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.key}</div>}
                    </div>
                    <input
                      value={editValues[s.key] || ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [s.key]: e.target.value }))}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        fontSize: 14,
                        background: 'var(--bg-secondary, #f9fafb)',
                      }}
                    />
                    <button
                      onClick={() => handleSave(s.key)}
                      disabled={saving}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'var(--primary)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => handleDelete(s.key)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--error, #ef4444)',
                        background: 'transparent',
                        color: 'var(--error, #ef4444)',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new setting */}
            <div style={{ marginTop: 24, padding: 16, borderRadius: 8, background: 'var(--bg-secondary, #f9fafb)' }}>
              <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>Agregar configuración</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Clave</label>
                  <input
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                    placeholder="ej: empresa.nombre"
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Etiqueta</label>
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="ej: Nombre de empresa"
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Valor</label>
                  <input
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder="Valor de la configuración"
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <button
                  onClick={handleAdd}
                  disabled={saving || !newKey.trim()}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--success, #22c55e)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    opacity: !newKey.trim() ? 0.5 : 1,
                  }}
                >
                  + Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

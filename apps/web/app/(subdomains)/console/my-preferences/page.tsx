"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from '../../../../components/UserContext';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;

interface UserPreference {
  id: number;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

const PREFERENCE_DEFS = [
  { key: 'theme', label: 'Tema visual', type: 'select', options: ['auto', 'light', 'dark'], default: 'auto' },
  { key: 'language', label: 'Idioma preferido', type: 'select', options: ['es', 'en'], default: 'es' },
  { key: 'timezone', label: 'Zona horaria', type: 'select', options: ['America/Mexico_City', 'America/Monterrey', 'America/Cancun', 'America/Tijuana', 'UTC'], default: 'America/Mexico_City' },
  { key: 'notifications_email', label: 'Notificaciones por email', type: 'toggle', default: 'true' },
  { key: 'notifications_push', label: 'Notificaciones push', type: 'toggle', default: 'true' },
  { key: 'notifications_sound', label: 'Sonido de notificaciones', type: 'toggle', default: 'true' },
  { key: 'dashboard_layout', label: 'Layout del dashboard', type: 'select', options: ['compact', 'detailed', 'minimal'], default: 'compact' },
  { key: 'items_per_page', label: 'Registros por página', type: 'select', options: ['10', '25', '50', '100'], default: '25' },
  { key: 'date_format', label: 'Formato de fecha', type: 'select', options: ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'], default: 'dd/MM/yyyy' },
];

const OPTION_LABELS: Record<string, string> = {
  auto: 'Automático',
  light: 'Claro',
  dark: 'Oscuro',
  es: 'Español',
  en: 'English',
  'America/Mexico_City': 'Ciudad de México (CST)',
  'America/Monterrey': 'Monterrey (CST)',
  'America/Cancun': 'Cancún (EST)',
  'America/Tijuana': 'Tijuana (PST)',
  UTC: 'UTC',
  compact: 'Compacto',
  detailed: 'Detallado',
  minimal: 'Mínimo',
  'dd/MM/yyyy': 'DD/MM/AAAA',
  'MM/dd/yyyy': 'MM/DD/AAAA',
  'yyyy-MM-dd': 'AAAA-MM-DD',
};

export default function MyPreferencesPage() {
  const { user } = useUser();
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPreferences = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('user-preferences'), {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        (Array.isArray(data) ? data : []).forEach((p: UserPreference) => { map[p.key] = p.value; });
        setPrefs(map);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) loadPreferences();
  }, [user?.token]);

  const getValue = (key: string): string => {
    return prefs[key] || PREFERENCE_DEFS.find(d => d.key === key)?.default || '';
  };

  const handleChange = (key: string, value: string) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const items = PREFERENCE_DEFS.map(d => ({
        key: d.key,
        value: getValue(d.key),
      }));
      const res = await fetch(buildApiUrl('user-preferences/batch'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Preferencias guardadas correctamente' });
      } else {
        setMessage({ type: 'error', text: 'Error al guardar preferencias' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 700 }}>
      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ marginBottom: 4, color: 'var(--primary)' }}>⚙️ Mis Preferencias</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
          Personaliza tu experiencia en la plataforma NEXARA.
        </p>

        {message && (
          <div style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            background: message.type === 'success' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
            color: message.type === 'success' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
            fontWeight: 600,
            fontSize: 14,
          }}>
            {message.text}
          </div>
        )}

        {loading ? (
          <p>Cargando preferencias...</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {PREFERENCE_DEFS.map(def => (
              <div key={def.key} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{def.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{def.key}</div>
                </div>

                {def.type === 'select' && (
                  <select
                    value={getValue(def.key)}
                    onChange={e => handleChange(def.key, e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      fontSize: 14,
                      minWidth: 160,
                      background: 'var(--bg-secondary, #f9fafb)',
                    }}
                  >
                    {def.options?.map(opt => (
                      <option key={opt} value={opt}>
                        {OPTION_LABELS[opt] || opt}
                      </option>
                    ))}
                  </select>
                )}

                {def.type === 'toggle' && (
                  <button
                    onClick={() => handleChange(def.key, getValue(def.key) === 'true' ? 'false' : 'true')}
                    style={{
                      width: 48,
                      height: 26,
                      borderRadius: 13,
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      background: getValue(def.key) === 'true' ? 'var(--primary)' : 'var(--border)',
                      transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      top: 3,
                      left: getValue(def.key) === 'true' ? 25 : 3,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={{
                marginTop: 8,
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 700,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : '💾 Guardar preferencias'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

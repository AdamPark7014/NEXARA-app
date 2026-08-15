'use client';

import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/components/UserContext';
import styles from './OrderTemplatesManager.module.css';
import { Socket } from 'socket.io-client';
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { createRealtimeSocket } from '@/lib/realtime-socket';

type TemplateSections = {
  showClientInfo: boolean;
  showProjectScope: boolean;
  showItemsTable: boolean;
  showTotals: boolean;
  showTerms: boolean;
  showNotes: boolean;
  showPreparedBy: boolean;
  showValidity: boolean;
  showPaymentTerms: boolean;
  showFooterBrand: boolean;
};

type OrderTemplate = {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  headerLogo?: string | null;
  headerText?: string | null;
  companyName?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  footerText?: string | null;
  footerAlignment?: 'left' | 'center' | 'right';
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  sections?: Partial<TemplateSections> | null;
  customCss?: string | null;
};

type TemplateForm = {
  name: string;
  description: string;
  headerLogo: string;
  headerText: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  footerText: string;
  footerAlignment: 'left' | 'center' | 'right';
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  customCss: string;
  sections: TemplateSections;
};

const defaultSections = (): TemplateSections => ({
  showClientInfo: true,
  showProjectScope: true,
  showItemsTable: true,
  showTotals: true,
  showTerms: true,
  showNotes: true,
  showPreparedBy: true,
  showValidity: true,
  showPaymentTerms: true,
  showFooterBrand: true,
});

const defaultForm = (): TemplateForm => ({
  name: '',
  description: '',
  headerLogo: '',
  headerText: 'Propuesta Comercial',
  companyName: 'NEXARA',
  companyEmail: 'info@nexara.com.mx',
  companyPhone: '+52 55 0000 0000',
  footerText: 'Documento comercial confidencial. Válido según condiciones indicadas.',
  footerAlignment: 'center',
  primaryColor: '#0f6ad6',
  secondaryColor: '#f5f7fb',
  textColor: '#1e293b',
  customCss: '',
  sections: defaultSections(),
});

const professionalPresets: Array<{ id: string; label: string; payload: Partial<TemplateForm> }> = [
  {
    id: 'corporate-blue',
    label: 'Corporate Blue',
    payload: {
      name: 'Corporate Blue',
      description: 'Diseño ejecutivo para propuestas enterprise con énfasis en claridad financiera.',
      headerText: 'Propuesta Ejecutiva de Servicios',
      footerText: 'NEXARA · Propuesta ejecutiva confidencial · Uso exclusivo del cliente.',
      primaryColor: '#0f6ad6',
      secondaryColor: '#eef5ff',
      textColor: '#0b1f3a',
    },
  },
  {
    id: 'premium-dark',
    label: 'Premium Dark',
    payload: {
      name: 'Premium Dark',
      description: 'Formato premium para tickets altos y negociaciones de dirección.',
      headerText: 'Propuesta Estratégica',
      footerText: 'Documento preparado para decisión ejecutiva. NEXARA 2026.',
      primaryColor: '#1f2937',
      secondaryColor: '#f3f4f6',
      textColor: '#111827',
    },
  },
  {
    id: 'clean-minimal',
    label: 'Clean Minimal',
    payload: {
      name: 'Clean Minimal',
      description: 'Plantilla limpia para ciclos comerciales rápidos y aprobaciones ágiles.',
      headerText: 'Cotización Comercial',
      footerText: 'Gracias por su confianza. Documento generado por NEXARA.',
      primaryColor: '#0b8f6a',
      secondaryColor: '#f3faf7',
      textColor: '#1f2937',
    },
  },
];

const mergeSections = (incoming?: Partial<TemplateSections> | null): TemplateSections => ({
  ...defaultSections(),
  ...(incoming || {}),
});

export default function OrderTemplatesManager() {
  const { user } = useUser();

  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(defaultForm());

  const fetchTemplates = useCallback(async () => {
    if (!user?.token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(buildApiUrl("ventas/order-templates"), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message || 'No se pudieron cargar las plantillas');
      setTemplates(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando plantillas');
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    fetchTemplates();
  }, [user?.token, fetchTemplates]);

  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = createRealtimeSocket(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchTemplates();
      }, 250);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['OrderTemplate', 'CotizacionVenta'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [user?.token, fetchTemplates]);

  const onFormChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSectionToggle = (key: keyof TemplateSections) => {
    setForm((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [key]: !prev.sections[key],
      },
    }));
  };

  const applyPreset = (presetId: string) => {
    const preset = professionalPresets.find((entry) => entry.id === presetId);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      ...preset.payload,
    }));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(defaultForm());
    setShowModal(true);
  };

  const openEditModal = (template: OrderTemplate) => {
    setEditingId(template.id);
    setForm({
      name: template.name || '',
      description: template.description || '',
      headerLogo: template.headerLogo || '',
      headerText: template.headerText || '',
      companyName: template.companyName || '',
      companyEmail: template.companyEmail || '',
      companyPhone: template.companyPhone || '',
      footerText: template.footerText || '',
      footerAlignment: (template.footerAlignment as 'left' | 'center' | 'right') || 'center',
      primaryColor: template.primaryColor || '#0f6ad6',
      secondaryColor: template.secondaryColor || '#f5f7fb',
      textColor: template.textColor || '#1e293b',
      customCss: template.customCss || '',
      sections: mergeSections(template.sections),
    });
    setShowModal(true);
  };

  const saveTemplate = async () => {
    if (!user?.token) return;
    if (!form.name.trim()) {
      setError('El nombre de la plantilla es obligatorio.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId
        ? buildApiUrl(`ventas/order-templates/${editingId}`)
        : buildApiUrl("ventas/order-templates");

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'No se pudo guardar la plantilla');

      setShowModal(false);
      setEditingId(null);
      setForm(defaultForm());
      setInfo(editingId ? 'Plantilla actualizada correctamente.' : 'Plantilla creada correctamente.');
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando plantilla');
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = (id: number) => {
    if (!user?.token) return;
    setConfirmState({ message: '¿Eliminar esta plantilla?', fn: async () => {
      try {
        const res = await fetch(buildApiUrl(`ventas/order-templates/${id}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.message || 'No se pudo eliminar la plantilla');
        setInfo('Plantilla eliminada.');
        await fetchTemplates();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error eliminando plantilla');
      }
    } });
  };

  const setAsDefault = async (id: number) => {
    if (!user?.token) return;
    try {
      const res = await fetch(buildApiUrl(`ventas/order-templates/${id}/set-default`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'No se pudo establecer plantilla predeterminada');
      setInfo('Plantilla predeterminada actualizada.');
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cambiando predeterminada');
    }
  };

  const duplicateTemplate = (template: OrderTemplate) => {
    setEditingId(null);
    setForm({
      name: `${template.name} (Copia)`,
      description: template.description || '',
      headerLogo: template.headerLogo || '',
      headerText: template.headerText || '',
      companyName: template.companyName || '',
      companyEmail: template.companyEmail || '',
      companyPhone: template.companyPhone || '',
      footerText: template.footerText || '',
      footerAlignment: (template.footerAlignment as 'left' | 'center' | 'right') || 'center',
      primaryColor: template.primaryColor || '#0f6ad6',
      secondaryColor: template.secondaryColor || '#f5f7fb',
      textColor: template.textColor || '#1e293b',
      customCss: template.customCss || '',
      sections: mergeSections(template.sections),
    });
    setShowModal(true);
  };

  if (loading) return <div className={styles.loading}>Cargando plantillas de cotización...</div>;

  return (
    <>
    <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>Plantillas Profesionales de Cotización</h1>
          <p className={styles.subtitle}>Estandariza propuestas con diseño enterprise, secciones configurables y branding corporativo.</p>
        </div>
        <div className={styles.actionsRow}>
          <button className={styles.secondaryBtn} onClick={fetchTemplates}>Actualizar</button>
          <button className={styles.primaryBtn} onClick={openCreateModal}>+ Nueva plantilla</button>
        </div>
      </div>

      {info && <div className={styles.infoBanner}>{info}</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.grid}>
        {templates.map((template) => {
          const sections = mergeSections(template.sections);
          return (
            <article key={template.id} className={`${styles.card} ${template.isDefault ? styles.default : ''}`}>
              <header className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{template.name}</h3>
                {template.isDefault && <span className={styles.badge}>Predeterminada</span>}
              </header>

              <p className={styles.meta}>{template.description || 'Sin descripción'}</p>

              <div className={styles.preview}>
                <div className={styles.previewHeader}>
                  <h4>{template.headerText || 'Propuesta Comercial'}</h4>
                  <div className={styles.previewMuted}>{template.companyName || 'Empresa'}</div>
                </div>
                <div className={styles.previewBody}>
                  {sections.showClientInfo && <div>• Datos del cliente</div>}
                  {sections.showItemsTable && <div>• Tabla de partidas</div>}
                  {sections.showTotals && <div>• Resumen financiero</div>}
                  {sections.showTerms && <div>• Términos comerciales</div>}
                </div>
                <div className={styles.previewFooter}>{template.footerText || 'Footer corporativo'}</div>
              </div>

              <div className={styles.inlineActions}>
                <button className={styles.smallBtn} onClick={() => openEditModal(template)}>Editar</button>
                <button className={styles.smallBtn} onClick={() => duplicateTemplate(template)}>Duplicar</button>
                {!template.isDefault && (
                  <button className={styles.smallBtn} onClick={() => setAsDefault(template.id)}>Predeterminada</button>
                )}
                <button className={styles.dangerBtn} onClick={() => removeTemplate(template.id)}>Eliminar</button>
              </div>
            </article>
          );
        })}
      </div>

      {showModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Editar plantilla' : 'Nueva plantilla profesional'}</h2>
              <button className={styles.secondaryBtn} onClick={() => setShowModal(false)}>Cerrar</button>
            </div>

            <div className={styles.presets}>
              {professionalPresets.map((preset) => (
                <button key={preset.id} className={styles.presetBtn} onClick={() => applyPreset(preset.id)}>
                  Aplicar {preset.label}
                </button>
              ))}
            </div>

            <div className={styles.formGrid}>
              <div className={styles.section}>
                <h3>Identidad y branding</h3>
                <div className={styles.field}>
                  <label>Nombre</label>
                  <input name="name" value={form.name} onChange={onFormChange} placeholder="Plantilla enterprise" />
                </div>
                <div className={styles.field}>
                  <label>Descripción</label>
                  <textarea name="description" rows={2} value={form.description} onChange={onFormChange} />
                </div>
                <div className={styles.field}>
                  <label>Encabezado</label>
                  <input name="headerText" value={form.headerText} onChange={onFormChange} />
                </div>
                <div className={styles.field}>
                  <label>Logo (ruta URL o path servidor)</label>
                  <input name="headerLogo" value={form.headerLogo} onChange={onFormChange} />
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Empresa</label>
                    <input name="companyName" value={form.companyName} onChange={onFormChange} />
                  </div>
                  <div className={styles.field}>
                    <label>Email</label>
                    <input name="companyEmail" value={form.companyEmail} onChange={onFormChange} />
                  </div>
                  <div className={styles.field}>
                    <label>Teléfono</label>
                    <input name="companyPhone" value={form.companyPhone} onChange={onFormChange} />
                  </div>
                </div>

                <div className={styles.colorRow}>
                  <div className={styles.field}>
                    <label>Color primario</label>
                    <input type="color" name="primaryColor" value={form.primaryColor} onChange={onFormChange} />
                  </div>
                  <div className={styles.field}>
                    <label>Color secundario</label>
                    <input type="color" name="secondaryColor" value={form.secondaryColor} onChange={onFormChange} />
                  </div>
                  <div className={styles.field}>
                    <label>Color texto</label>
                    <input type="color" name="textColor" value={form.textColor} onChange={onFormChange} />
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <h3>Composición del documento</h3>
                <div className={styles.field}>
                  <label>Footer</label>
                  <textarea name="footerText" rows={2} value={form.footerText} onChange={onFormChange} />
                </div>
                <div className={styles.field}>
                  <label>Alineación de footer</label>
                  <select name="footerAlignment" value={form.footerAlignment} onChange={onFormChange}>
                    <option value="left">Izquierda</option>
                    <option value="center">Centro</option>
                    <option value="right">Derecha</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>CSS personalizado (opcional)</label>
                  <textarea
                    name="customCss"
                    rows={3}
                    value={form.customCss}
                    onChange={onFormChange}
                    placeholder="Ejemplo: .totals { font-weight: 700; }"
                  />
                </div>

                <div className={styles.toggleGrid}>
                  {(Object.keys(form.sections) as Array<keyof TemplateSections>).map((key) => (
                    <label key={key} className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={form.sections[key]}
                        onChange={() => onSectionToggle(key)}
                      />
                      <span>{key}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.footerActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.primaryBtn} disabled={saving} onClick={saveTemplate}>
                {saving ? 'Guardando...' : editingId ? 'Actualizar plantilla' : 'Crear plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
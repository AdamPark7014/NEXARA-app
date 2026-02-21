'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/components/UserContext';
import styles from './page.module.css';

interface OrderTemplate {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  headerText?: string;
  companyName?: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
}

interface TemplateForm {
  name: string;
  description: string;
  headerText: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  footerText: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
}

export default function OrderTemplatesPage() {
  const { user } = useUser();

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    return base.replace(/[/.]+$/, '');
  }, []);

  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>({
    name: '',
    description: '',
    headerText: 'Nexara Software',
    companyName: 'Nexara',
    companyEmail: 'info@nexara.mx',
    companyPhone: '+52 (123) 456-7890',
    footerText: 'Gracias por tu confianza',
    primaryColor: '#0f6ad6',
    secondaryColor: '#f5f5f5',
    textColor: '#000000',
  });

  useEffect(() => {
    if (!user?.token) return;
    fetchTemplates();
  }, [user?.token]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/ventas/order-templates`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('El nombre es requerido');
      return;
    }

    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId
        ? `${apiUrl}/ventas/order-templates/${editingId}`
        : `${apiUrl}/ventas/order-templates`;

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingId(null);
        resetForm();
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      headerText: 'Nexara Software',
      companyName: 'Nexara',
      companyEmail: 'info@nexara.mx',
      companyPhone: '+52 (123) 456-7890',
      footerText: 'Gracias por tu confianza',
      primaryColor: '#0f6ad6',
      secondaryColor: '#f5f5f5',
      textColor: '#000000',
    });
  };

  const handleEdit = (template: OrderTemplate) => {
    setForm({
      name: template.name,
      description: template.description || '',
      headerText: template.headerText || '',
      companyName: template.companyName || '',
      companyEmail: '',
      companyPhone: '',
      footerText: '',
      primaryColor: template.primaryColor,
      secondaryColor: template.secondaryColor,
      textColor: template.textColor,
    });
    setEditingId(template.id);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de que desea eliminar esta plantilla?')) return;

    try {
      const res = await fetch(`${apiUrl}/ventas/order-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      if (res.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      const res = await fetch(`${apiUrl}/ventas/order-templates/${id}/set-default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      if (res.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error setting default template:', error);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Cargando plantillas...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Plantillas de Órdenes</h1>
        <button
          className={styles.primaryBtn}
          onClick={() => {
            resetForm();
            setEditingId(null);
            setShowModal(true);
          }}
        >
          + Nueva Plantilla
        </button>
      </div>

      {templates.length === 0 ? (
        <div className={styles.empty}>
          <p>No hay plantillas creadas. Crea la primera plantilla para personalizar tus órdenes.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {templates.map(template => (
            <div key={template.id} className={styles.card + (template.isDefault ? ' ' + styles.default : '')}>
              <div className={styles.cardHeader}>
                <h3>{template.name}</h3>
                {template.isDefault && <span className={styles.badge}>Predeterminada</span>}
              </div>

              {template.description && <p className={styles.description}>{template.description}</p>}

              <div className={styles.preview}>
                <div
                  className={styles.previewArea}
                  style={{
                    borderColor: template.primaryColor,
                    backgroundColor: template.secondaryColor,
                  }}
                >
                  <div style={{ color: template.textColor }}>
                    {template.headerText && <h4>{template.headerText}</h4>}
                    {template.companyName && <p>{template.companyName}</p>}
                  </div>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.editBtn}
                  onClick={() => handleEdit(template)}
                >
                  ✎ Editar
                </button>
                {!template.isDefault && (
                  <button
                    className={styles.defaultBtn}
                    onClick={() => handleSetDefault(template.id)}
                  >
                    ★ Predeterminada
                  </button>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(template.id)}
                >
                  🗑 Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}</h2>
              <button
                className={styles.closeBtn}
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formSection}>
                <h3>Información Básica</h3>
                <div className={styles.formGroup}>
                  <label>Nombre de la Plantilla *</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleInputChange}
                    placeholder="Ej: Plantilla Estándar"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Descripción</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleInputChange}
                    placeholder="Describe el propósito de esta plantilla"
                    rows={2}
                  />
                </div>
              </div>

              <div className={styles.formSection}>
                <h3>Encabezado y Pie</h3>
                <div className={styles.formGroup}>
                  <label>Texto del Encabezado</label>
                  <input
                    type="text"
                    name="headerText"
                    value={form.headerText}
                    onChange={handleInputChange}
                    placeholder="Nexara Software"
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Nombre de Empresa</label>
                    <input
                      type="text"
                      name="companyName"
                      value={form.companyName}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Email</label>
                    <input
                      type="email"
                      name="companyEmail"
                      value={form.companyEmail}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Teléfono</label>
                    <input
                      type="tel"
                      name="companyPhone"
                      value={form.companyPhone}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Texto del Pie</label>
                  <textarea
                    name="footerText"
                    value={form.footerText}
                    onChange={handleInputChange}
                    placeholder="Ej: Gracias por tu confianza"
                    rows={2}
                  />
                </div>
              </div>

              <div className={styles.formSection}>
                <h3>Colores y Estilos</h3>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Color Primario</label>
                    <div className={styles.colorInput}>
                      <input
                        type="color"
                        name="primaryColor"
                        value={form.primaryColor}
                        onChange={handleInputChange}
                      />
                      <input
                        type="text"
                        value={form.primaryColor}
                        onChange={handleInputChange}
                        disabled
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Color Secundario</label>
                    <div className={styles.colorInput}>
                      <input
                        type="color"
                        name="secondaryColor"
                        value={form.secondaryColor}
                        onChange={handleInputChange}
                      />
                      <input
                        type="text"
                        value={form.secondaryColor}
                        onChange={handleInputChange}
                        disabled
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Color de Texto</label>
                    <div className={styles.colorInput}>
                      <input
                        type="color"
                        name="textColor"
                        value={form.textColor}
                        onChange={handleInputChange}
                      />
                      <input
                        type="text"
                        value={form.textColor}
                        onChange={handleInputChange}
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.preview}>
                <h3>Vista Previa</h3>
                <div
                  className={styles.previewBox}
                  style={{
                    borderColor: form.primaryColor,
                    backgroundColor: form.secondaryColor,
                  }}
                >
                  <div style={{ color: form.textColor }}>
                    <h4>{form.headerText || 'Encabezado'}</h4>
                    <p>{form.companyName || 'Nombre de la Empresa'}</p>
                    <hr />
                    <p style={{ fontSize: '0.9em' }}>
                      Email: {form.companyEmail || 'email@ejemplo.com'}
                    </p>
                    <p style={{ fontSize: '0.9em' }}>
                      Tel: {form.companyPhone || '+52 123456'}
                    </p>
                    <hr />
                    <em>{form.footerText || 'Pie de página'}</em>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </button>
              <button className={styles.saveBtn} onClick={handleSave}>
                {editingId ? 'Actualizar' : 'Crear'} Plantilla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

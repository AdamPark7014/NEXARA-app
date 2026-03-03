"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';
import styles from './ViaticRequestForm.module.css';


const ViaticRequestForm = ({ actividadId }: { actividadId: number }) => {
  const { user } = useUser();
  const [monto, setMonto] = useState('');
  const [razon, setRazon] = useState('');
  const [ticket, setTicket] = useState<File | null>(null);
  const [ticketPreview, setTicketPreview] = useState<{ url: string; kind: 'image' | 'pdf' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (ticketPreview) URL.revokeObjectURL(ticketPreview.url);
  }, [ticketPreview]);

  const formatBytes = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validate = () => {
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
      setError('El monto debe ser mayor a 0');
      return false;
    }
    if (!razon || razon.length < 3) {
      setError('La razón debe tener al menos 3 caracteres');
      return false;
    }
    if (!ticket) {
      setError('Debes adjuntar el ticket');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    if (!user) {
      setError('Usuario no autenticado');
      return;
    }
    if (!validate()) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('montoSolicitado', monto);
      formData.append('razonGasto', razon);
      formData.append('ticket', ticket!);
      formData.append('actividadId', String(actividadId));
      formData.append('usuarioId', String(user.id));
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/viatics', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al solicitar viático');
      }
      setSuccess('Solicitud enviada correctamente');
      setMonto('');
      setRazon('');
      if (ticketPreview) URL.revokeObjectURL(ticketPreview.url);
      setTicket(null);
      setTicketPreview(null);
    } finally {
      setLoading(false);
    }
  }

  const isSupportedFile = (file: File) => file.type.startsWith('image/') || file.type === 'application/pdf';

  const clearTicket = () => {
    if (ticketPreview) URL.revokeObjectURL(ticketPreview.url);
    setTicket(null);
    setTicketPreview(null);
  };

  const handleSelectFile = (file: File | null) => {
    if (!file) return;
    if (!isSupportedFile(file)) {
      setError('Solo se permiten imagenes o PDF.');
      return;
    }
    if (ticketPreview) URL.revokeObjectURL(ticketPreview.url);
    const previewUrl = URL.createObjectURL(file);
    setTicket(file);
    setTicketPreview({
      url: previewUrl,
      kind: file.type === 'application/pdf' ? 'pdf' : 'image',
    });
    setError(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0] || null;
    handleSelectFile(file);
  };

  return (
    <form className={`card ${styles.form}`} onSubmit={handleSubmit}>
      <div>
        <h3 className={styles.title}>Solicitar viatico</h3>
        <div className={styles.subtitle}>
          Completa los datos y adjunta el ticket en imagen o PDF.
        </div>
      </div>

      <div className={styles.fieldsGrid}>
        <label className={styles.fieldLabel}>
          Monto solicitado
          <input
            className="input"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            min="1"
            step="0.01"
            placeholder="0.00"
          />
        </label>
        <label className={styles.fieldLabel}>
          Razon del gasto
          <input
            className="input"
            type="text"
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            placeholder="Ej. Combustible, hospedaje, alimentos"
          />
        </label>
      </div>

      <div className={styles.uploadSection}>
        <div className={styles.uploadTitle}>Adjuntar ticket</div>
        <div
          onDragEnter={() => setDragActive(true)}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
        >
          <div className={styles.dropTitle}>Arrastra y suelta tu ticket aqui</div>
          <div className={styles.dropHint}>
            Acepta imagenes o PDF.
          </div>
          <button
            className={`button-secondary ${styles.fileBtn}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Seleccionar archivo
          </button>
          <input
            ref={fileInputRef}
            className={`input ${styles.hiddenInput}`}
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => handleSelectFile(e.target.files?.[0] || null)}
          />
        </div>
        {ticketPreview ? (
          <div className={styles.previewWrap}>
            <div className={styles.previewRow}>
              {ticketPreview.kind === 'image' ? (
                <div className={styles.imageFrame}>
                  <img
                    src={ticketPreview.url}
                    alt="Preview"
                    className={styles.previewImage}
                  />
                </div>
              ) : (
                <div className={styles.pdfFrame}>
                  <object
                    data={ticketPreview.url}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    aria-label="Vista previa PDF"
                  >
                    <embed src={ticketPreview.url} type="application/pdf" />
                    <a href={ticketPreview.url} target="_blank" rel="noreferrer">Abrir PDF</a>
                  </object>
                </div>
              )}
              <div className={styles.fileInfo}>
                <div className={styles.fileMeta}>
                  {ticket ? `Archivo: ${ticket.name} (${formatBytes(ticket.size)})` : ''}
                </div>
                <button className="button-secondary" type="button" onClick={clearTicket}>
                  Quitar archivo
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyFile}>No hay archivo seleccionado</div>
        )}
      </div>

      <div className={styles.actions}>
        <button className="button-primary" type="submit" disabled={loading}>
          {loading ? 'Enviando...' : 'Solicitar viatico'}
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            setMonto('');
            setRazon('');
            clearTicket();
            setError(null);
            setSuccess(null);
          }}
        >
          Limpiar
        </button>
        {error && <span className={styles.errorText}>{error}</span>}
        {success && <span className={styles.successText}>{success}</span>}
      </div>
    </form>
  );
};

export default ViaticRequestForm;

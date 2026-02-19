"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from './UserContext';

const requiredDocuments = [
  {
    key: 'INE',
    label: 'INE vigente (frontal y reverso en un solo PDF)',
    description: 'Documento oficial de identidad con fotografia.'
  },
  {
    key: 'CURP',
    label: 'CURP en PDF',
    description: 'Formato oficial emitido por gobierno.'
  },
  {
    key: 'RFC',
    label: 'RFC en PDF',
    description: 'Constancia de RFC o formato oficial.'
  },
  {
    key: 'Constancia de situacion fiscal',
    label: 'Constancia de situacion fiscal (PDF)',
    description: 'Emitida por el SAT.'
  },
  {
    key: 'Comprobante de domicilio',
    label: 'Comprobante de domicilio (PDF)',
    description: 'No mayor a 3 meses.'
  },
  {
    key: 'NSS',
    label: 'NSS (PDF)',
    description: 'Documento del IMSS o constancia equivalente.'
  },
  {
    key: 'Acta de nacimiento',
    label: 'Acta de nacimiento (PDF)',
    description: 'Documento oficial completo.'
  },
  {
    key: 'Comprobante de estudios',
    label: 'Comprobante de estudios (PDF)',
    description: 'Ultimo grado academico.'
  },
  {
    key: 'Licencia de conducir',
    label: 'Licencia de conducir (PDF)',
    description: 'Solo si aplica al puesto.'
  },
  {
    key: 'Contrato o alta',
    label: 'Contrato o alta interna (PDF)',
    description: 'Documento emitido por la empresa.'
  },
  {
    key: 'Carta de antecedentes no penales',
    label: 'Carta de antecedentes no penales (PDF)',
    description: 'Vigente y legible.'
  },
];

type ProfileForm = {
  telefono: string;
  fechaNacimiento: string;
  direccion: string;
  colonia: string;
  ciudad: string;
  estado: string;
  codigoPostal: string;
  pais: string;
  curp: string;
  rfc: string;
  ineNumero: string;
  nss: string;
  contactoEmergenciaNombre: string;
  contactoEmergenciaTelefono: string;
};

type DocumentItem = { id: number; tipo: string; archivoUrl: string; estatus?: string };

const MyProfileForm: React.FC = () => {
  const { user } = useUser();
  const [form, setForm] = useState<ProfileForm>({
    telefono: '',
    fechaNacimiento: '',
    direccion: '',
    colonia: '',
    ciudad: '',
    estado: '',
    codigoPostal: '',
    pais: '',
    curp: '',
    rfc: '',
    ineNumero: '',
    nss: '',
    contactoEmergenciaNombre: '',
    contactoEmergenciaTelefono: '',
  });
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [docType, setDocType] = useState<string>('INE');
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docPreviews, setDocPreviews] = useState<{ file: File; url: string; kind: 'image' | 'pdf' }[]>([]);
  const [profileStatus, setProfileStatus] = useState<string>('Pendiente');
  const [profileNotes, setProfileNotes] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = API_URL.replace(/\/+api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const normalizedDocs = useMemo(() => {
    const map = new Map<string, DocumentItem>();
    documents.forEach((doc) => {
      const baseKey = doc.tipo.toLowerCase().trim();
      map.set(baseKey, doc);
      if (baseKey === 'constancia situacion fiscal') {
        map.set('constancia de situacion fiscal', doc);
      }
      if (baseKey === 'comprobante domicilio') {
        map.set('comprobante de domicilio', doc);
      }
      if (baseKey === 'licencia') {
        map.set('licencia de conducir', doc);
      }
      if (baseKey === 'contrato') {
        map.set('contrato o alta', doc);
      }
    });
    return map;
  }, [documents]);

  const getDocExtension = (url: string) => {
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const isPdf = (url: string) => getDocExtension(url) === 'pdf';
  const isImage = (url: string) => ['png', 'jpg', 'jpeg', 'webp'].includes(getDocExtension(url));
  const isSupportedFile = (file: File) => file.type.startsWith('image/') || file.type === 'application/pdf';

  useEffect(() => {
    if (!user?.token) return;
    setLoading(true);
    fetch(buildApiUrl('users/profile/me'), {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const perfil = data?.perfil || {};
        setForm({
          telefono: perfil.telefono || '',
          fechaNacimiento: perfil.fechaNacimiento ? String(perfil.fechaNacimiento).slice(0, 10) : '',
          direccion: perfil.direccion || '',
          colonia: perfil.colonia || '',
          ciudad: perfil.ciudad || '',
          estado: perfil.estado || '',
          codigoPostal: perfil.codigoPostal || '',
          pais: perfil.pais || '',
          curp: perfil.curp || '',
          rfc: perfil.rfc || '',
          ineNumero: perfil.ineNumero || '',
          nss: perfil.nss || '',
          contactoEmergenciaNombre: perfil.contactoEmergenciaNombre || '',
          contactoEmergenciaTelefono: perfil.contactoEmergenciaTelefono || '',
        });
        setProfileStatus(perfil.estatus || 'Pendiente');
        setProfileNotes(perfil.observaciones || '');
        setDocuments(Array.isArray(data?.documentos) ? data.documentos : []);
      })
      .catch(() => {
        setDocuments([]);
      })
      .finally(() => setLoading(false));
  }, [user?.token]);

  const handleChange = (field: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearDocSelection = () => {
    docPreviews.forEach((entry) => URL.revokeObjectURL(entry.url));
    setDocFiles([]);
    setDocPreviews([]);
  };

  const handleSelectFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const valid = list.filter(isSupportedFile);
    clearDocSelection();
    setDocFiles(valid);
    setDocPreviews(
      valid.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        kind: file.type === 'application/pdf' ? 'pdf' : 'image',
      })),
    );
    if (valid.length !== list.length) {
      setError('Solo se permiten archivos PDF o imagen.');
    }
  };

  useEffect(() => () => {
    docPreviews.forEach((entry) => URL.revokeObjectURL(entry.url));
  }, [docPreviews]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer?.files?.length) {
      handleSelectFiles(event.dataTransfer.files);
    }
  };

  const handleSave = async () => {
    if (!user?.token) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(buildApiUrl('users/profile/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al guardar perfil');
      }
      setSuccess('Perfil actualizado');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocs = async () => {
    if (!user?.token || docFiles.length === 0) return;
    const invalid = docFiles.find((file) => !isSupportedFile(file));
    if (invalid) {
      setError('Solo se permiten archivos PDF o imagen.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      docFiles.forEach((file) => formData.append('files', file));
      formData.append('tipo', docType);
      const res = await fetch(buildApiUrl('users/profile/me/documents'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al subir documentos');
      }
      const updated = await fetch(buildApiUrl('users/profile/me'), {
        headers: { Authorization: `Bearer ${user.token}` },
      }).then((r) => r.ok ? r.json() : null);
      setDocuments(Array.isArray(updated?.documentos) ? updated.documentos : []);
      setProfileStatus(updated?.perfil?.estatus || 'Pendiente');
      setProfileNotes(updated?.perfil?.observaciones || '');
      setDocFiles([]);
      docPreviews.forEach((entry) => URL.revokeObjectURL(entry.url));
      setDocPreviews([]);
      setSuccess('Documentos cargados');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir documentos');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Cargando perfil...</div>;

  return (
    <div className="card" style={{ display: 'grid', gap: 16 }}>
      <h2 style={{ color: 'var(--primary)' }}>Mi perfil profesional</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`badge ${profileStatus === 'Aprobado' ? 'approved' : profileStatus === 'Rechazado' ? 'rejected' : 'pending'}`}>
          {profileStatus}
        </span>
        {profileNotes && <span style={{ color: 'var(--text-secondary)' }}>{profileNotes}</span>}
      </div>
      <div className="card" style={{ background: 'var(--surface-light)', padding: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Datos personales</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Telefono</label>
            <input className="input" value={form.telefono} onChange={(e) => handleChange('telefono', e.target.value)} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Fecha nacimiento</label>
            <input className="input" type="date" value={form.fechaNacimiento} onChange={(e) => handleChange('fechaNacimiento', e.target.value)} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>CURP</label>
            <input className="input" value={form.curp} onChange={(e) => handleChange('curp', e.target.value)} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>RFC</label>
            <input className="input" value={form.rfc} onChange={(e) => handleChange('rfc', e.target.value)} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>INE (numero)</label>
            <input className="input" value={form.ineNumero} onChange={(e) => handleChange('ineNumero', e.target.value)} />
          </div>
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>NSS</label>
            <input className="input" value={form.nss} onChange={(e) => handleChange('nss', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--surface-light)', padding: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Direccion</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <input className="input" placeholder="Direccion" value={form.direccion} onChange={(e) => handleChange('direccion', e.target.value)} />
          <input className="input" placeholder="Colonia" value={form.colonia} onChange={(e) => handleChange('colonia', e.target.value)} />
          <input className="input" placeholder="Ciudad" value={form.ciudad} onChange={(e) => handleChange('ciudad', e.target.value)} />
          <input className="input" placeholder="Estado" value={form.estado} onChange={(e) => handleChange('estado', e.target.value)} />
          <input className="input" placeholder="Codigo postal" value={form.codigoPostal} onChange={(e) => handleChange('codigoPostal', e.target.value)} />
          <input className="input" placeholder="Pais" value={form.pais} onChange={(e) => handleChange('pais', e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ background: 'var(--surface-light)', padding: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Contacto de emergencia</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <input className="input" placeholder="Nombre" value={form.contactoEmergenciaNombre} onChange={(e) => handleChange('contactoEmergenciaNombre', e.target.value)} />
          <input className="input" placeholder="Telefono" value={form.contactoEmergenciaTelefono} onChange={(e) => handleChange('contactoEmergenciaTelefono', e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ background: 'var(--surface-light)', padding: 12 }}>
          <h3 style={{ marginBottom: 4 }}>Documentos obligatorios (PDF)</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
            Todos los documentos deben cargarse en PDF. Elige el tipo y sube el archivo correspondiente.
          </p>
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {requiredDocuments.map((doc) => (
                  <option key={doc.key} value={doc.key}>{doc.key}</option>
                ))}
              </select>
              <div
                onDragEnter={() => setDragActive(true)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                style={{
                  border: `1px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: 12,
                  background: dragActive ? 'rgba(0,0,0,0.02)' : 'transparent',
                  display: 'grid',
                  gap: 6,
                  alignContent: 'center'
                }}
              >
                <div style={{ fontWeight: 600 }}>Arrastra y suelta el PDF aqui</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  O selecciona el archivo manualmente. Solo PDF.
                </div>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Seleccionar archivo
                </button>
                <input
                  ref={fileInputRef}
                  className="input"
                  type="file"
                  accept="application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleSelectFiles(e.target.files || [])}
                />
              </div>
              <button className="button-primary" type="button" onClick={handleUploadDocs} disabled={saving || docFiles.length === 0}>
                Subir documentos
              </button>
            </div>
            {docPreviews.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Archivos listos para subir</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {docPreviews.map((entry) => (
                    <div key={entry.file.name} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)', position: 'relative' }}>
                      <button
                        type="button"
                        onClick={clearDocSelection}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          cursor: 'pointer',
                          zIndex: 1,
                        }}
                      >
                        x
                      </button>
                      {entry.kind === 'pdf' ? (
                        <object data={entry.url} type="application/pdf" width="100%" height="180" aria-label="Vista previa PDF">
                          <embed src={entry.url} type="application/pdf" />
                        </object>
                      ) : (
                        <img src={entry.url} alt={entry.file.name} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                      )}
                      <div style={{ padding: 8, fontSize: 12 }}>{entry.file.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {requiredDocuments.map((doc) => {
              const current = normalizedDocs.get(doc.key.toLowerCase().trim());
              const status = current?.estatus || 'Pendiente';
              return (
                <div key={doc.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{doc.label}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{doc.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className={`badge ${status === 'Aprobado' ? 'approved' : status === 'Rechazado' ? 'rejected' : 'pending'}`}>
                      {status}
                    </span>
                    {current?.archivoUrl && (
                      <a className="link" href={current.archivoUrl} target="_blank" rel="noopener noreferrer">Ver</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      {isSuperAdmin && (
        <div className="card" style={{ background: 'var(--surface-light)', padding: 12 }}>
          <h3 style={{ marginBottom: 4 }}>Documentos rapidos</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
            Acceso directo a tus documentos con vista previa y descarga.
          </p>
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {requiredDocuments.map((doc) => (
                  <option key={doc.key} value={doc.key}>{doc.key}</option>
                ))}
              </select>
              <div
                onDragEnter={() => setDragActive(true)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                style={{
                  border: `1px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: 12,
                  background: dragActive ? 'rgba(0,0,0,0.02)' : 'transparent',
                  display: 'grid',
                  gap: 6,
                  alignContent: 'center'
                }}
              >
                <div style={{ fontWeight: 600 }}>Arrastra y suelta el PDF aqui</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  O selecciona el archivo manualmente. Solo PDF.
                </div>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Seleccionar archivo
                </button>
                <input
                  ref={fileInputRef}
                  className="input"
                  type="file"
                  accept="application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleSelectFiles(e.target.files || [])}
                />
              </div>
              <button className="button-primary" type="button" onClick={handleUploadDocs} disabled={saving || docFiles.length === 0}>
                Subir documentos
              </button>
            </div>
            {docPreviews.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Archivos listos para subir</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {docPreviews.map((entry) => (
                    <div key={entry.file.name} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)', position: 'relative' }}>
                      <button
                        type="button"
                        onClick={clearDocSelection}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          cursor: 'pointer',
                          zIndex: 1,
                        }}
                      >
                        x
                      </button>
                      {entry.kind === 'pdf' ? (
                        <object data={entry.url} type="application/pdf" width="100%" height="180" aria-label="Vista previa PDF">
                          <embed src={entry.url} type="application/pdf" />
                        </object>
                      ) : (
                        <img src={entry.url} alt={entry.file.name} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                      )}
                      <div style={{ padding: 8, fontSize: 12 }}>{entry.file.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {documents.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)' }}>No hay documentos cargados.</p>
          )}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {documents.map((doc) => (
              <div key={doc.id} className="card" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{doc.tipo}</div>
                {doc.archivoUrl ? (
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--muted)', background: 'var(--surface)' }}>
                    {isPdf(doc.archivoUrl) ? (
                      <object data={getAssetUrl(doc.archivoUrl)} type="application/pdf" width="100%" height="180" aria-label="Vista previa PDF">
                        <embed src={getAssetUrl(doc.archivoUrl)} type="application/pdf" />
                      </object>
                    ) : isImage(doc.archivoUrl) ? (
                      <img src={getAssetUrl(doc.archivoUrl)} alt={doc.tipo} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>Formato no soportado</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-tertiary)' }}>Sin archivo</div>
                )}
                {doc.archivoUrl && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="button-secondary" href={getAssetUrl(doc.archivoUrl)} target="_blank" rel="noopener noreferrer">
                      Ver
                    </a>
                    <a className="button-primary" href={getAssetUrl(doc.archivoUrl)} download>
                      Descargar
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="button-primary" type="button" onClick={handleSave} disabled={saving}>Guardar perfil</button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        {success && <span style={{ color: 'var(--accent)' }}>{success}</span>}
      </div>
    </div>
  );
};

export default MyProfileForm;
